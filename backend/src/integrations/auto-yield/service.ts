/**
 * Auto-Yield Service
 *
 * Automatically deposits idle USDC (and XLM for LP) into yield protocols
 * on behalf of custodial wallets. Runs every AUTO_YIELD_INTERVAL_HOURS hours.
 *
 * Strategies:
 *   defindex    — deposit USDC into DeFindex vault (~8.6% APY)
 *   blend       — supply USDC to Blend lending pool (~5–8% APY)
 *   soroswap_lp — provide XLM+USDC liquidity to Soroswap AMM (trading fees)
 *   all         — split USDC across all three (default)
 *
 * Allocation when strategy=all:
 *   50% DeFindex · 30% Blend · 20% Soroswap LP
 */

import { supabase } from '../../config/supabase';
import { WalletRepository, WalletInfo } from '../../api/repository/core/wallet.repository';
import { DefindexYieldService } from '../../api/services/defindex-yield.service';
import { VaultService } from '../../api/services/core/vault.service';
import { StellarService } from '../../api/services/stellar.service';
import { BlendService } from '../blend/service';
import { SoroswapService } from '../soroswap/service';
import { loadSoroswapConfig, MAINNET_TOKENS } from '../soroswap/config';
import { stellarConfig } from '../../config/stellar';
import { PUBLIC_USDC_ISSUER, TESTNET_USDC_ISSUER } from '../../config/assets';
import { logger } from '../../utils/logger';

// ── Config ─────────────────────────────────────────────────────────────────────

const MINIMUM_USDC    = Number(process.env.AUTO_YIELD_MIN_USDC             || '2.0');
const LIQUID_RESERVE  = Number(process.env.AUTO_YIELD_LIQUID_RESERVE_USDC  || '0.5');
const MIN_XLM_FOR_LP  = Number(process.env.AUTO_YIELD_MIN_XLM_FOR_LP       || '5.0');
const XLM_LP_RESERVE  = Number(process.env.AUTO_YIELD_XLM_LP_RESERVE       || '2.0');

// Allocation shares when strategy=all (must sum to 100)
const SHARE_DEFINDEX    = Number(process.env.AUTO_YIELD_DEFINDEX_SHARE  || '50');
const SHARE_BLEND       = Number(process.env.AUTO_YIELD_BLEND_SHARE     || '30');
const SHARE_SOROSWAP_LP = Number(process.env.AUTO_YIELD_SOROSWAP_SHARE  || '20');

type Strategy = 'defindex' | 'blend' | 'soroswap_lp' | 'all';

function activeStrategy(): Strategy {
  const s = String(process.env.AUTO_YIELD_STRATEGY || 'all').toLowerCase();
  if (s === 'defindex' || s === 'blend' || s === 'soroswap_lp') return s;
  return 'all';
}

function isEnabled()  { return String(process.env.AUTO_YIELD_ENABLED || '').toLowerCase() === 'true'; }
function isMainnet()  { return stellarConfig.networkName === 'PUBLIC'; }
function isDryRun() {
  const f = String(process.env.AUTO_YIELD_DRY_RUN || '').toLowerCase();
  if (f === 'false') return false;
  if (f === 'true')  return true;
  return !isMainnet();
}

const usdcIssuer    = () => isMainnet() ? PUBLIC_USDC_ISSUER   : TESTNET_USDC_ISSUER;
const usdcSacAddr   = () => isMainnet()
  ? 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'   // mainnet Circle USDC SAC
  : 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F';  // testnet
const xlmSacAddr    = () => isMainnet()
  ? (MAINNET_TOKENS['XLM'] ?? 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA')
  : 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';   // testnet

// ── Live balance fetch ─────────────────────────────────────────────────────────

type LiveBalances = { usdc: number; xlm: number };

async function getLiveBalances(publicKey: string): Promise<LiveBalances> {
  const r = await fetch(`${stellarConfig.horizonUrl}/accounts/${encodeURIComponent(publicKey)}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!r.ok) {
    if (r.status === 404) return { usdc: 0, xlm: 0 };
    throw new Error(`Horizon fetch failed: ${r.status}`);
  }
  const data: any = await r.json();
  const balances: any[] = data.balances || [];
  const issuer = usdcIssuer();
  const usdcEntry = balances.find((b) => b.asset_code === 'USDC' && b.asset_issuer === issuer);
  const xlmEntry  = balances.find((b) => b.asset_type === 'native');
  return {
    usdc: usdcEntry ? parseFloat(usdcEntry.balance) : 0,
    xlm:  xlmEntry  ? parseFloat(xlmEntry.balance)  : 0,
  };
}

function hasEnoughUsdcInDb(wallet: WalletInfo): boolean {
  const e = (wallet.balance || []).find((b) => b.asset_code === 'USDC');
  return e ? parseFloat(e.balance) >= MINIMUM_USDC : false;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProtocolId = 'defindex' | 'blend' | 'soroswap_lp';

export interface StrategyResult {
  protocol: ProtocolId;
  usdc_amount: number;
  xlm_amount?: number;
  hash?: string;
  dry_run: boolean;
  skipped?: boolean;
  skip_reason?: string;
  error?: string;
}

export interface WalletYieldResult {
  wallet: string;
  total_usdc_deposited: number;
  strategies: StrategyResult[];
}

export interface AutoYieldRunSummary {
  dry_run: boolean;
  strategy: Strategy;
  wallets_checked: number;
  wallets_eligible: number;
  wallets_processed: number;
  wallets_skipped: number;
  wallets_failed: number;
  total_usdc_deposited: number;
  results: WalletYieldResult[];
}

// ── Protocol handlers ──────────────────────────────────────────────────────────

async function yieldWithDefindex(
  wallet: WalletInfo,
  usdcAmount: number,
  secret: string,
  dryRun: boolean,
): Promise<StrategyResult> {
  const base: StrategyResult = { protocol: 'defindex', usdc_amount: usdcAmount, dry_run: dryRun };

  let vault: ReturnType<typeof DefindexYieldService.resolveVault>;
  try {
    vault = DefindexYieldService.requireVault('USDC');
  } catch (e) {
    return { ...base, skipped: true, skip_reason: `vault not configured: ${e instanceof Error ? e.message : String(e)}` };
  }

  const amountUnits = DefindexYieldService.amountToContractUnits(usdcAmount.toFixed(7), 7);

  if (dryRun) {
    logger.info(`[auto-yield:defindex] dry_run ${usdcAmount} USDC from ${wallet.public_key}`);
    return base;
  }

  const { xdr } = await DefindexYieldService.buildVaultAction({
    action: 'deposit',
    vaultAddress: vault!.vault_address,
    caller: wallet.public_key,
    amountUnits,
    network: vault!.network,
  });

  const result = await StellarService.signAndSubmitXdr(wallet.session_id, secret, xdr, {
    user_id: wallet.session_id,
    type: 'AUTO_YIELD_DEFINDEX',
    source_public_key: wallet.public_key,
    source_session_id: wallet.session_id,
    amount: usdcAmount,
    asset_code: 'USDC',
    context: `Auto-yield DeFindex deposit ${usdcAmount} USDC`,
  });

  if (!result.success) return { ...base, error: result.error || 'submission failed' };
  logger.info(`[auto-yield:defindex] deposited ${usdcAmount} USDC hash=${result.hash}`);
  return { ...base, hash: result.hash };
}

async function yieldWithBlend(
  wallet: WalletInfo,
  usdcAmount: number,
  secret: string,
  dryRun: boolean,
): Promise<StrategyResult> {
  const base: StrategyResult = { protocol: 'blend', usdc_amount: usdcAmount, dry_run: dryRun };
  const network = isMainnet() ? 'mainnet' : 'testnet';

  // Get USDC asset ID from live pool info (avoids hardcoding wrong address)
  let assetId: string;
  try {
    const poolInfo = await BlendService.getPoolInfo(network);
    if (!poolInfo.usdc?.assetId) throw new Error('USDC reserve not found in Blend pool');
    assetId = poolInfo.usdc.assetId;
  } catch (e) {
    return { ...base, skipped: true, skip_reason: `blend pool info failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  // Amount in stroops (7 decimals, integer string)
  const amountStroops = String(Math.floor(usdcAmount * 1e7));

  if (dryRun) {
    logger.info(`[auto-yield:blend] dry_run supply ${usdcAmount} USDC from ${wallet.public_key}`);
    return base;
  }

  const { xdr } = await BlendService.buildSupplyXdr({
    userAddress: wallet.public_key,
    assetId,
    amount: amountStroops,
    network,
  });

  const result = await StellarService.signAndSubmitXdr(wallet.session_id, secret, xdr, {
    user_id: wallet.session_id,
    type: 'AUTO_YIELD_BLEND',
    source_public_key: wallet.public_key,
    source_session_id: wallet.session_id,
    amount: usdcAmount,
    asset_code: 'USDC',
    context: `Auto-yield Blend supply ${usdcAmount} USDC`,
  });

  if (!result.success) return { ...base, error: result.error || 'submission failed' };
  logger.info(`[auto-yield:blend] supplied ${usdcAmount} USDC hash=${result.hash}`);
  return { ...base, hash: result.hash };
}

async function yieldWithSoroswapLP(
  wallet: WalletInfo,
  usdcAmount: number,
  xlmAmount: number,
  secret: string,
  dryRun: boolean,
): Promise<StrategyResult> {
  const base: StrategyResult = {
    protocol: 'soroswap_lp',
    usdc_amount: usdcAmount,
    xlm_amount: xlmAmount,
    dry_run: dryRun,
  };

  const usdcStroops = String(Math.floor(usdcAmount * 1e7));
  const xlmStroops  = String(Math.floor(xlmAmount  * 1e7));

  if (dryRun) {
    logger.info(`[auto-yield:soroswap_lp] dry_run add LP ${usdcAmount} USDC + ${xlmAmount} XLM from ${wallet.public_key}`);
    return base;
  }

  const { xdr } = await SoroswapService.buildAddLiquidityXdr({
    tokenA: xlmSacAddr(),
    tokenB: usdcSacAddr(),
    amountADesired: xlmStroops,
    amountBDesired: usdcStroops,
    senderAddress: wallet.public_key,
    slippageBps: 100,
  });

  const result = await StellarService.signAndSubmitXdr(wallet.session_id, secret, xdr, {
    user_id: wallet.session_id,
    type: 'AUTO_YIELD_SOROSWAP_LP',
    source_public_key: wallet.public_key,
    source_session_id: wallet.session_id,
    amount: usdcAmount,
    asset_code: 'USDC',
    context: `Auto-yield Soroswap LP ${usdcAmount} USDC + ${xlmAmount} XLM`,
  });

  if (!result.success) return { ...base, error: result.error || 'submission failed' };
  logger.info(`[auto-yield:soroswap_lp] added LP ${usdcAmount} USDC + ${xlmAmount} XLM hash=${result.hash}`);
  return { ...base, hash: result.hash };
}

// ── Allocation ─────────────────────────────────────────────────────────────────

function floor7(n: number) { return Math.floor(n * 1e7) / 1e7; }

function allocate(totalUsdc: number, strategy: Strategy): {
  defindex: number; blend: number; soroswap: number;
} {
  if (strategy === 'defindex')    return { defindex: totalUsdc, blend: 0, soroswap: 0 };
  if (strategy === 'blend')       return { defindex: 0, blend: totalUsdc, soroswap: 0 };
  if (strategy === 'soroswap_lp') return { defindex: 0, blend: 0, soroswap: totalUsdc };
  // all — proportional split
  const total = SHARE_DEFINDEX + SHARE_BLEND + SHARE_SOROSWAP_LP;
  return {
    defindex:  floor7(totalUsdc * SHARE_DEFINDEX    / total),
    blend:     floor7(totalUsdc * SHARE_BLEND       / total),
    soroswap:  floor7(totalUsdc * SHARE_SOROSWAP_LP / total),
  };
}

// ── Per-wallet processor ───────────────────────────────────────────────────────

const walletRepo   = new WalletRepository(supabase);
const vaultService = new VaultService(supabase);

async function processWallet(wallet: WalletInfo, strategy: Strategy, dryRun: boolean): Promise<WalletYieldResult> {
  const pk = wallet.public_key;
  const strategies: StrategyResult[] = [];

  const live = await getLiveBalances(pk);
  const idleUsdc = floor7(live.usdc - LIQUID_RESERVE);

  if (idleUsdc <= 0) {
    return { wallet: pk, total_usdc_deposited: 0, strategies: [{
      protocol: 'defindex', usdc_amount: 0, dry_run: dryRun,
      skipped: true, skip_reason: `live USDC ${live.usdc.toFixed(2)} ≤ reserve ${LIQUID_RESERVE}`,
    }] };
  }

  const alloc = allocate(idleUsdc, strategy);
  const secret = dryRun ? '' : await vaultService.getSecret(String(wallet.vault_secret_id!));

  // DeFindex
  if (alloc.defindex > 0) {
    try {
      strategies.push(await yieldWithDefindex(wallet, alloc.defindex, secret, dryRun));
    } catch (e) {
      strategies.push({ protocol: 'defindex', usdc_amount: alloc.defindex, dry_run: dryRun,
        error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Blend
  if (alloc.blend > 0) {
    try {
      strategies.push(await yieldWithBlend(wallet, alloc.blend, secret, dryRun));
    } catch (e) {
      strategies.push({ protocol: 'blend', usdc_amount: alloc.blend, dry_run: dryRun,
        error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Soroswap LP — requires XLM too
  if (alloc.soroswap > 0) {
    const availableXlm = floor7(live.xlm - XLM_LP_RESERVE);
    if (availableXlm < MIN_XLM_FOR_LP) {
      strategies.push({ protocol: 'soroswap_lp', usdc_amount: alloc.soroswap, dry_run: dryRun,
        skipped: true, skip_reason: `XLM balance ${live.xlm.toFixed(4)} - reserve ${XLM_LP_RESERVE} = ${availableXlm.toFixed(4)} < min ${MIN_XLM_FOR_LP}` });
    } else {
      try {
        strategies.push(await yieldWithSoroswapLP(wallet, alloc.soroswap, availableXlm, secret, dryRun));
      } catch (e) {
        strategies.push({ protocol: 'soroswap_lp', usdc_amount: alloc.soroswap, dry_run: dryRun,
          error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  const totalDeposited = strategies
    .filter((s) => !s.skipped && !s.error)
    .reduce((sum, s) => sum + s.usdc_amount, 0);

  return { wallet: pk, total_usdc_deposited: totalDeposited, strategies };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function runAutoYield(opts: { dryRun?: boolean; maxWallets?: number; strategy?: Strategy } = {}): Promise<AutoYieldRunSummary> {
  const dryRun   = opts.dryRun   !== undefined ? opts.dryRun   : isDryRun();
  const strategy = opts.strategy ?? activeStrategy();
  const maxWallets = opts.maxWallets || 200;

  logger.info(`[auto-yield] run start strategy=${strategy} dry_run=${dryRun} maxWallets=${maxWallets}`);

  // DeFindex/Blend/Soroswap are mainnet products. Live execution on testnet
  // always fails (the testnet vault uses its own USDC issuance, so wallets that
  // hold standard testnet USDC simulate as InsufficientBalance / MissingTrustline)
  // and just spams errors every interval. Skip unless explicitly forced.
  if (!dryRun && !isMainnet() && String(process.env.AUTO_YIELD_ALLOW_TESTNET || '').toLowerCase() !== 'true') {
    logger.info('[auto-yield] skipped: live execution disabled on testnet (set AUTO_YIELD_DRY_RUN=true to simulate, or AUTO_YIELD_ALLOW_TESTNET=true to force)');
    return {
      dry_run: dryRun, strategy,
      wallets_checked: 0, wallets_eligible: 0, wallets_processed: 0,
      wallets_skipped: 0, wallets_failed: 0, total_usdc_deposited: 0, results: [],
    };
  }

  const allWallets = await walletRepo.getAllEligibleForAutoYield();
  const candidates = allWallets
    .filter((w) => w.vault_secret_id && w.public_key)
    .slice(0, maxWallets);

  const dbEligible = candidates.filter(hasEnoughUsdcInDb);
  logger.info(`[auto-yield] ${candidates.length} custodial wallets, ${dbEligible.length} with enough USDC (DB)`);

  const results: WalletYieldResult[] = [];
  for (const wallet of dbEligible) {
    try {
      results.push(await processWallet(wallet, strategy, dryRun));
    } catch (e) {
      logger.error(`[auto-yield] wallet ${wallet.public_key} fatal: ${e instanceof Error ? e.message : String(e)}`);
      results.push({ wallet: wallet.public_key, total_usdc_deposited: 0, strategies: [{
        protocol: 'defindex', usdc_amount: 0, dry_run: dryRun,
        error: e instanceof Error ? e.message : String(e),
      }] });
    }
    // Throttle between wallets so we don't trip the DeFindex API rate limit (429).
    if (!dryRun) await new Promise((r) => setTimeout(r, 350));
  }

  const processed = results.filter((r) => r.total_usdc_deposited > 0);
  const skipped   = results.filter((r) => r.total_usdc_deposited === 0 && r.strategies.every((s) => s.skipped));
  const failed    = results.filter((r) => r.total_usdc_deposited === 0 && r.strategies.some((s) => s.error));
  const totalUsdc = results.reduce((sum, r) => sum + r.total_usdc_deposited, 0);

  logger.info(`[auto-yield] done processed=${processed.length} skipped=${skipped.length} failed=${failed.length} usdc=${totalUsdc.toFixed(7)}`);

  return {
    dry_run: dryRun,
    strategy,
    wallets_checked: candidates.length,
    wallets_eligible: dbEligible.length,
    wallets_processed: processed.length,
    wallets_skipped: skipped.length,
    wallets_failed: failed.length,
    total_usdc_deposited: totalUsdc,
    results,
  };
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let _schedulerStarted = false;

export function startAutoYieldScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  if (!isEnabled()) {
    logger.info('[auto-yield] disabled (set AUTO_YIELD_ENABLED=true to activate)');
    return;
  }

  const intervalHours = Number(process.env.AUTO_YIELD_INTERVAL_HOURS || '6');
  logger.info(`[auto-yield] scheduler started strategy=${activeStrategy()} interval=${intervalHours}h`);

  const tick = () => {
    runAutoYield().catch((e) => logger.error(`[auto-yield] scheduler error: ${e instanceof Error ? e.message : String(e)}`));
  };

  setTimeout(tick, 30_000);
  setInterval(tick, intervalHours * 60 * 60 * 1000);
}
