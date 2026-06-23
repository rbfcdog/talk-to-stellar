import { supabase } from '../../config/supabase';
import { WalletRepository, WalletInfo } from '../../api/repository/core/wallet.repository';
import { DefindexYieldService } from '../../api/services/defindex-yield.service';
import { VaultService } from '../../api/services/core/vault.service';
import { StellarService } from '../../api/services/stellar.service';
import { stellarConfig } from '../../config/stellar';
import { PUBLIC_USDC_ISSUER, TESTNET_USDC_ISSUER } from '../../config/assets';
import { logger } from '../../utils/logger';

const MINIMUM_USDC_TO_DEPOSIT = Number(process.env.AUTO_YIELD_MIN_USDC || '2.0');
const LIQUID_RESERVE_USDC = Number(process.env.AUTO_YIELD_LIQUID_RESERVE_USDC || '0.5');

const walletRepo = new WalletRepository(supabase);
const vaultService = new VaultService(supabase);

const isMainnet = () => stellarConfig.networkName === 'PUBLIC';
const usdcIssuer = () => (isMainnet() ? PUBLIC_USDC_ISSUER : TESTNET_USDC_ISSUER);

function isEnabled(): boolean {
  return String(process.env.AUTO_YIELD_ENABLED || '').toLowerCase() === 'true';
}

function isDryRun(): boolean {
  const flag = String(process.env.AUTO_YIELD_DRY_RUN || '').toLowerCase();
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return !isMainnet();
}

async function getLiveUsdcBalance(publicKey: string): Promise<number> {
  const r = await fetch(`${stellarConfig.horizonUrl}/accounts/${publicKey}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) {
    if (r.status === 404) return 0;
    throw new Error(`Horizon account fetch failed: ${r.status}`);
  }
  const data: any = await r.json();
  const balances: any[] = data.balances || [];
  const entry = balances.find((b) => b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer());
  return entry ? parseFloat(entry.balance) : 0;
}

function hasEnoughUsdcInDb(wallet: WalletInfo): boolean {
  const entry = (wallet.balance || []).find((b) => b.asset_code === 'USDC');
  return entry ? parseFloat(entry.balance) >= MINIMUM_USDC_TO_DEPOSIT : false;
}

export interface AutoYieldResult {
  wallet: string;
  deposited_usdc: number;
  hash?: string;
  dry_run: boolean;
  skipped?: boolean;
  skip_reason?: string;
  error?: string;
}

export interface AutoYieldRunSummary {
  dry_run: boolean;
  wallets_checked: number;
  wallets_eligible: number;
  wallets_processed: number;
  wallets_skipped: number;
  wallets_failed: number;
  total_usdc_deposited: number;
  results: AutoYieldResult[];
}

async function processWallet(wallet: WalletInfo, dryRun: boolean): Promise<AutoYieldResult> {
  const pk = wallet.public_key;
  const base: AutoYieldResult = { wallet: pk, deposited_usdc: 0, dry_run: dryRun };

  try {
    const liveBalance = await getLiveUsdcBalance(pk);
    if (liveBalance < MINIMUM_USDC_TO_DEPOSIT) {
      return { ...base, skipped: true, skip_reason: `balance ${liveBalance.toFixed(2)} < minimum ${MINIMUM_USDC_TO_DEPOSIT}` };
    }

    const depositAmount = Math.floor((liveBalance - LIQUID_RESERVE_USDC) * 1e7) / 1e7;
    if (depositAmount <= 0) {
      return { ...base, skipped: true, skip_reason: `net deposit after reserve would be ${depositAmount}` };
    }

    let vault;
    try {
      vault = DefindexYieldService.requireVault('USDC');
    } catch (e) {
      return { ...base, skipped: true, skip_reason: `vault not configured: ${e instanceof Error ? e.message : String(e)}` };
    }

    const amountUnits = DefindexYieldService.amountToContractUnits(depositAmount.toString(), 7);

    if (dryRun) {
      logger.info(`[auto-yield] dry_run deposit ${depositAmount} USDC from ${pk} → vault ${vault.vault_address}`);
      return { ...base, deposited_usdc: depositAmount };
    }

    const { xdr } = await DefindexYieldService.buildVaultAction({
      action: 'deposit',
      vaultAddress: vault.vault_address,
      caller: pk,
      amountUnits,
      network: vault.network,
    });

    const secret = await vaultService.getSecret(String(wallet.vault_secret_id!));

    const submitted = await StellarService.signAndSubmitXdr(wallet.session_id, secret, xdr, {
      user_id: wallet.session_id,
      type: 'AUTO_YIELD_DEPOSIT',
      source_public_key: pk,
      source_session_id: wallet.session_id,
      amount: depositAmount,
      asset_code: 'USDC',
      context: `Auto-yield deposit ${depositAmount} USDC to DeFindex vault`,
    });

    if (!submitted.success) {
      return { ...base, error: submitted.error || 'submission failed' };
    }

    logger.info(`[auto-yield] deposited ${depositAmount} USDC from ${pk}, hash=${submitted.hash}`);
    return { ...base, deposited_usdc: depositAmount, hash: submitted.hash };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[auto-yield] processWallet error for ${pk}: ${msg}`);
    return { ...base, error: msg };
  }
}

export async function runAutoYield(opts: { dryRun?: boolean; maxWallets?: number } = {}): Promise<AutoYieldRunSummary> {
  const dryRun = opts.dryRun !== undefined ? opts.dryRun : isDryRun();
  const maxWallets = opts.maxWallets || 200;

  logger.info(`[auto-yield] run start dry_run=${dryRun} maxWallets=${maxWallets}`);

  const allWallets = await walletRepo.getAllEligibleForAutoYield();
  const candidates = allWallets
    .filter((w) => w.vault_secret_id && w.public_key)
    .slice(0, maxWallets);

  const dbEligible = candidates.filter(hasEnoughUsdcInDb);

  logger.info(`[auto-yield] ${candidates.length} custodial wallets, ${dbEligible.length} with enough USDC in DB`);

  const results: AutoYieldResult[] = [];
  for (const wallet of dbEligible) {
    const result = await processWallet(wallet, dryRun);
    results.push(result);
  }

  const processed = results.filter((r) => !r.skipped && !r.error);
  const skipped = results.filter((r) => r.skipped);
  const failed = results.filter((r) => !!r.error);
  const totalDeposited = processed.reduce((sum, r) => sum + r.deposited_usdc, 0);

  logger.info(`[auto-yield] done processed=${processed.length} skipped=${skipped.length} failed=${failed.length} usdc=${totalDeposited.toFixed(7)}`);

  return {
    dry_run: dryRun,
    wallets_checked: candidates.length,
    wallets_eligible: dbEligible.length,
    wallets_processed: processed.length,
    wallets_skipped: skipped.length,
    wallets_failed: failed.length,
    total_usdc_deposited: totalDeposited,
    results,
  };
}

let _schedulerStarted = false;

export function startAutoYieldScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  if (!isEnabled()) {
    logger.info('[auto-yield] disabled (set AUTO_YIELD_ENABLED=true to activate)');
    return;
  }

  const intervalHours = Number(process.env.AUTO_YIELD_INTERVAL_HOURS || '6');
  const intervalMs = intervalHours * 60 * 60 * 1000;

  logger.info(`[auto-yield] scheduler started, interval=${intervalHours}h`);

  const tick = () => {
    runAutoYield().catch((e) => {
      logger.error(`[auto-yield] scheduler error: ${e instanceof Error ? e.message : String(e)}`);
    });
  };

  setTimeout(tick, 30_000);
  setInterval(tick, intervalMs);
}
