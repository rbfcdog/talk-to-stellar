/**
 * PagFinance USDC credit leg.
 *
 * After a CASHIN_COMPLETED webhook (or a poll-detected completion) OUR
 * treasury pays the user's Stellar wallet in USDC. Same code path on both
 * networks — `STELLAR_NETWORK` decides the Horizon server, USDC issuer,
 * trustline strategy, and destination resolution.
 *
 * PagFinance never custodies or credits crypto; this module is where the
 * money actually moves, so every failure is explicit and nothing is retried
 * implicitly (the webhook/poll claim machinery owns retry semantics).
 */

import { Asset, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { supabase } from '../../config/supabase';
import { server, stellarConfig } from '../../config/stellar';
import { getStellarNetworkName, resolveConfiguredAsset } from '../../config/assets';
import { StellarService } from '../../api/services/stellar.service';
import { TrustlineService } from '../../api/services/trustline.service';
import { VaultService } from '../../api/services/core/vault.service';
import { PlatformFeeService } from '../../api/services/fees/platform-fee.service';
import { loadPagfinanceConfig } from './config';
import { logger } from '../../utils/logger';

type StellarNetwork = 'PUBLIC' | 'TESTNET';

export interface CreditDestination {
  publicKey: string;
  source: 'session_wallet' | 'mainnet_wallet' | 'bridge_wallet';
}

export type CreditDestinationResult =
  | { success: true; destination: CreditDestination }
  | { success: false; error: string };

export interface CreditResult {
  success: boolean;
  hash?: string;
  error?: string;
}

/**
 * Treasury paying USDC credits: PAGFINANCE_USDC_TREASURY_SECRET →
 * STELLAR_SECRET_KEY → (mainnet only) the sponsor-key chain that may hold
 * funds on a given deployment. Null when nothing is configured.
 */
export function resolveTreasurySecret(network: StellarNetwork): string | null {
  const config = loadPagfinanceConfig();
  if (config.usdcTreasurySecret) return config.usdcTreasurySecret;

  const globalSecret = String(process.env.STELLAR_SECRET_KEY || '').trim();
  if (globalSecret) return globalSecret;

  if (network === 'PUBLIC') {
    const sponsor = resolveSponsorSecret();
    if (sponsor) return sponsor;
  }
  return null;
}

/** Same fallback chain the Bridge mainnet flow uses for sponsored reserves. */
function resolveSponsorSecret(): string {
  return (
    process.env.STELLAR_SPONSOR_SECRET ||
    process.env.STELLAR_WALLET_SPONSOR_SECRET ||
    process.env.STELLAR_MAINNET_SPONSOR_SECRET ||
    process.env.TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY ||
    ''
  ).trim();
}

/**
 * Where the USDC lands. Testnet: the session wallet that created the intent.
 * Mainnet: the source key if the account actually exists on Horizon, else the
 * primary stellar_mainnet_wallets row for the session, else the bridge wallet
 * for the user's email. Explicit failure when none exists — never guess.
 */
export async function resolveCreditDestination(input: {
  network: StellarNetwork;
  sourcePublicKey: string;
  sessionId?: string;
  userId?: string;
  email?: string;
}): Promise<CreditDestinationResult> {
  if (input.network === 'TESTNET') {
    if (!input.sourcePublicKey) {
      return { success: false, error: 'Operation has no source public key to credit.' };
    }
    return { success: true, destination: { publicKey: input.sourcePublicKey, source: 'session_wallet' } };
  }

  if (input.sourcePublicKey && (await accountExists(input.sourcePublicKey))) {
    return { success: true, destination: { publicKey: input.sourcePublicKey, source: 'session_wallet' } };
  }

  if (input.sessionId) {
    const mainnetKey = await lookupMainnetWallet(input.sessionId, input.userId);
    if (mainnetKey) {
      return { success: true, destination: { publicKey: mainnetKey, source: 'mainnet_wallet' } };
    }
  }

  if (input.email) {
    const bridgeKey = await lookupBridgeWallet(input.email);
    if (bridgeKey) {
      return { success: true, destination: { publicKey: bridgeKey, source: 'bridge_wallet' } };
    }
  }

  return {
    success: false,
    error:
      `No mainnet destination for credit: source account ${input.sourcePublicKey || '(none)'} does not exist ` +
      'on Horizon and no stellar_mainnet_wallets/bridge_stellar_wallets row matched.',
  };
}

async function accountExists(publicKey: string): Promise<boolean> {
  try {
    await server.loadAccount(publicKey);
    return true;
  } catch {
    return false;
  }
}

async function lookupMainnetWallet(sessionId: string, userId?: string): Promise<string | null> {
  let query = supabase
    .from('stellar_mainnet_wallets')
    .select('public_key')
    .eq('session_id', sessionId);
  if (userId) query = query.eq('user_id', userId);
  const { data: primary } = await query.eq('is_primary', true).maybeSingle();
  if (primary?.public_key) return String(primary.public_key);

  const { data: rows } = await supabase
    .from('stellar_mainnet_wallets')
    .select('public_key')
    .eq('session_id', sessionId)
    .limit(1);
  return rows?.[0]?.public_key ? String(rows[0].public_key) : null;
}

async function lookupBridgeWallet(email: string): Promise<string | null> {
  const { data: primary } = await supabase
    .from('bridge_stellar_wallets')
    .select('public_key')
    .eq('email', email)
    .eq('is_primary', true)
    .maybeSingle();
  if (primary?.public_key) return String(primary.public_key);

  const { data: rows } = await supabase
    .from('bridge_stellar_wallets')
    .select('public_key')
    .eq('email', email)
    .limit(1);
  return rows?.[0]?.public_key ? String(rows[0].public_key) : null;
}

/**
 * Ensure the destination trusts the network's USDC before paying it.
 * Testnet delegates to TrustlineService (friendbot/top-up built in); mainnet
 * uses a sponsored changeTrust so the wallet needs no XLM of its own.
 */
export async function ensureUsdcTrustlineForCredit(input: {
  network: StellarNetwork;
  publicKey: string;
  userId: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const asset = resolveConfiguredAsset('USDC');

  let account: any = null;
  try {
    account = await server.loadAccount(input.publicKey);
  } catch {
    account = null;
  }
  if (account && hasTrustline(account, asset.code, asset.issuer)) return { ok: true };

  const walletSecret = await loadWalletSecret(input.publicKey);
  if (!walletSecret) {
    return {
      ok: false,
      reason: `Wallet ${input.publicKey} needs a ${asset.code} trustline but its signing key is not available.`,
    };
  }

  if (input.network === 'TESTNET') {
    const result = await TrustlineService.ensureTrustline(input.publicKey, walletSecret, input.userId, {
      code: asset.code,
      issuer: asset.issuer || '',
    });
    return result.success ? { ok: true } : { ok: false, reason: result.error || 'trustline creation failed' };
  }

  return submitSponsoredTrustline(input.publicKey, walletSecret, asset, account);
}

function hasTrustline(account: { balances: any[] }, code: string, issuer?: string): boolean {
  return (account.balances || []).some(
    (b: any) =>
      (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') &&
      b.asset_code === code &&
      (!issuer || b.asset_issuer === issuer),
  );
}

async function loadWalletSecret(publicKey: string): Promise<string | null> {
  let vaultSecretId: string | null = null;

  const { data: walletRow } = await supabase
    .from('wallets')
    .select('vault_secret_id')
    .eq('public_key', publicKey)
    .maybeSingle();
  vaultSecretId = walletRow?.vault_secret_id ?? null;

  if (!vaultSecretId) {
    const { data: bridgeRow } = await supabase
      .from('bridge_stellar_wallets')
      .select('vault_secret_id')
      .eq('public_key', publicKey)
      .maybeSingle();
    vaultSecretId = bridgeRow?.vault_secret_id ?? null;
  }
  if (!vaultSecretId) return null;

  try {
    const secret = await new VaultService(supabase).getSecret(String(vaultSecretId));
    return secret || null;
  } catch (e: any) {
    logger.warn(`[pagfinance-credit] could not load signing key for ${publicKey}: ${e?.message || e}`);
    return null;
  }
}

async function submitSponsoredTrustline(
  publicKey: string,
  walletSecret: string,
  asset: { code: string; issuer?: string },
  existingAccount: any,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const walletKeypair = Keypair.fromSecret(walletSecret);
    const stellarAsset = new Asset(asset.code, asset.issuer);
    const sponsorSecret = resolveSponsorSecret();
    let trustTx;

    if (sponsorSecret) {
      const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
      const sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
      trustTx = new TransactionBuilder(sponsorAccount, {
        fee: '1000',
        networkPassphrase: stellarConfig.network,
      })
        .addOperation(
          Operation.beginSponsoringFutureReserves({ sponsoredId: publicKey, source: sponsorKeypair.publicKey() }),
        )
        .addOperation(Operation.changeTrust({ asset: stellarAsset, source: publicKey }))
        .addOperation(Operation.endSponsoringFutureReserves({ source: publicKey }))
        .setTimeout(120)
        .build();
      trustTx.sign(sponsorKeypair, walletKeypair);
    } else {
      const account = existingAccount ?? (await server.loadAccount(publicKey));
      trustTx = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: stellarConfig.network,
      })
        .addOperation(Operation.changeTrust({ asset: stellarAsset }))
        .setTimeout(60)
        .build();
      trustTx.sign(walletKeypair);
    }

    await server.submitTransaction(trustTx);
    logger.info(`[pagfinance-credit] added ${asset.code} trustline to ${publicKey}`);
    return { ok: true };
  } catch (e: any) {
    const msg = e?.response?.data?.extras?.result_codes
      ? JSON.stringify(e.response.data.extras.result_codes)
      : String(e?.message || e);
    return { ok: false, reason: `Failed to add ${asset.code} trustline to ${publicKey}: ${msg}` };
  }
}

/**
 * Pay the user's USDC credit (and the platform fee, atomically in the same
 * transaction) from the treasury. Fee amounts were locked at intent time.
 */
export async function creditUsdcToUser(input: {
  destinationPublicKey: string;
  usdcNet: string;
  usdcFee: string;
  userId: string;
  memoText?: string;
}): Promise<CreditResult> {
  const network = getStellarNetworkName();

  const treasurySecret = resolveTreasurySecret(network);
  if (!treasurySecret) {
    return {
      success: false,
      error: `No USDC treasury configured for ${network} — set PAGFINANCE_USDC_TREASURY_SECRET.`,
    };
  }

  const asset = resolveConfiguredAsset('USDC');

  const trustline = await ensureUsdcTrustlineForCredit({
    network,
    publicKey: input.destinationPublicKey,
    userId: input.userId,
  });
  if (!trustline.ok) return { success: false, error: trustline.reason };

  const payments: Array<{ destination: string; amount: string; assetCode: string; assetIssuer?: string }> = [
    {
      destination: input.destinationPublicKey,
      amount: input.usdcNet,
      assetCode: asset.code,
      assetIssuer: asset.issuer,
    },
  ];

  const feeTreasury = PlatformFeeService.getTreasuryPublicKey();
  if (Number(input.usdcFee) > 0 && feeTreasury && feeTreasury !== input.destinationPublicKey) {
    payments.push({
      destination: feeTreasury,
      amount: input.usdcFee,
      assetCode: asset.code,
      assetIssuer: asset.issuer,
    });
  }

  return StellarService.submitAssetPaymentsFromSecret({
    sourceSecret: treasurySecret,
    payments,
    memoText: input.memoText ?? 'PIX PAGFINANCE',
  });
}

/**
 * Startup check: an enabled integration with no treasury on the active
 * network will fail every credit — say so loudly at boot, not at webhook time.
 */
export function validateCreditReadiness(): { ok: boolean; warnings: string[] } {
  const config = loadPagfinanceConfig();
  const warnings: string[] = [];
  if (config.enabled) {
    const network = getStellarNetworkName();
    if (!resolveTreasurySecret(network)) {
      warnings.push(
        `PagFinance is enabled on ${network} but no USDC treasury secret is configured ` +
          '(PAGFINANCE_USDC_TREASURY_SECRET) — cash-in credits will fail.',
      );
    }
  }
  for (const warning of warnings) logger.warn(`[pagfinance-credit] ${warning}`);
  return { ok: warnings.length === 0, warnings };
}
