/**
 * Ecosystem Overview Service
 *
 * The "master view" — combines every Stellar integration into one coherent
 * picture of a user's position in the Stellar DeFi ecosystem.
 *
 * Called by the AI agent when a user asks "what's my full situation?" or
 * "how is Stellar doing right now?" Gives the agent all context in one call
 * instead of hitting 5 separate services.
 *
 * Parallel fetch: all upstream calls run concurrently with Promise.allSettled,
 * so a single failing service never blocks the response.
 */

import { logger } from '../../utils/logger';
import { ReflectorService } from '../reflector/service';
import { AquariusService } from '../aquarius/service';
import { StellarNetworkService } from '../stellar-network/service';
import { FraudScreeningService } from '../fraud-screening/service';
import { CctpService } from '../cctp/service';
import { AbroadFinanceService } from '../abroad-finance/service';
import { BRL_STABLECOINS, isBrlStablecoin } from '../brl-stablecoins/index';
import type { EcosystemOverview, WalletBalance } from './types';

const HORIZON_BASE = process.env.STELLAR_HORIZON_URL
  || (process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org');

const USDC_ISSUER = process.env.STELLAR_NETWORK === 'mainnet'
  ? 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
  : 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const NETWORK = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();

async function fetchHorizonBalances(address: string): Promise<WalletBalance[]> {
  const res = await fetch(`${HORIZON_BASE}/accounts/${address}`, {
    headers: { 'User-Agent': 'TalkToStellar/1.0' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Horizon account fetch returned ${res.status}`);
  const data = await res.json() as any;

  return (data.balances ?? []).map((b: any) => ({
    asset: b.asset_type === 'native' ? 'XLM' : b.asset_code ?? 'UNKNOWN',
    balance: b.balance ?? '0',
    issuer: b.asset_issuer ?? null,
  }));
}

export const EcosystemService = {
  /**
   * Build a full Stellar ecosystem overview for a given Stellar address.
   * All upstream calls run in parallel; partial failures return zero/defaults.
   */
  async getOverview(stellarAddress: string): Promise<EcosystemOverview> {
    const now = Date.now();
    logger.info(`[ecosystem] building overview for ${stellarAddress.slice(0, 8)}...`);

    const [
      balancesResult,
      ratesResult,
      aquariusResult,
      networkResult,
      fraudResult,
    ] = await Promise.allSettled([
      fetchHorizonBalances(stellarAddress),
      Promise.all([
        ReflectorService.getPrice('XLM'),
        ReflectorService.getPrice('BRL'),
      ]).then(([xlm, brl]) => ({ xlm_usd: xlm.price, brl_usd: brl.price, usdc_usd: 1 })),
      AquariusService.getPoolRewards(10),
      StellarNetworkService.getStats(),
      FraudScreeningService.screenAddress(stellarAddress, NETWORK === 'mainnet' ? 'mainnet' : 'testnet'),
    ]);

    // Balances
    const balances: WalletBalance[] = balancesResult.status === 'fulfilled'
      ? balancesResult.value
      : [];
    const xlmBal = balances.find((b) => b.asset === 'XLM');
    const usdcBal = balances.find((b) => b.asset === 'USDC' && (!b.issuer || b.issuer === USDC_ISSUER));
    const xlmBalance = xlmBal?.balance ?? '0';
    const usdcBalance = usdcBal?.balance ?? '0';

    // Rates
    const rates = ratesResult.status === 'fulfilled'
      ? ratesResult.value
      : { xlm_usd: 0, brl_usd: 0, usdc_usd: 1 };

    // Portfolio value in USD
    const portfolioUsd =
      parseFloat(usdcBalance) * 1 +
      parseFloat(xlmBalance) * (rates.xlm_usd ?? 0);
    const portfolioBrl = rates.brl_usd > 0 ? portfolioUsd / rates.brl_usd : 0;

    // Aquarius
    const aqua = aquariusResult.status === 'fulfilled' ? aquariusResult.value : null;
    const topPools = aqua?.topPools.slice(0, 5).map((p) => ({
      pair: p.pair,
      dailyAqua: p.dailyTotalReward,
    })) ?? [];

    // Network
    const net = networkResult.status === 'fulfilled' ? networkResult.value : null;
    const netHealth = net
      ? {
          latestLedger: net.ledger.sequence,
          tps: net.tps,
          capacityUsage: net.fees.capacityUsage,
          recommendedFeeStoops: net.fees.p50FeeStroops,
          healthy: true,
        }
      : { latestLedger: 0, tps: 0, capacityUsage: 0, recommendedFeeStoops: 100, healthy: false };

    // Fraud
    const fraud = fraudResult.status === 'fulfilled' ? fraudResult.value : undefined;

    // CCTP supported chains
    const cctpChains = CctpService.getSupportedChains().map((c) => c.chain);

    // BRL stablecoin balances
    const brzBal = balances.find(
      (b) => b.asset === BRL_STABLECOINS.BRZ.code && b.issuer === BRL_STABLECOINS.BRZ.issuer
    );
    const brltBal = balances.find(
      (b) => b.asset === BRL_STABLECOINS.BRLT.code && b.issuer === BRL_STABLECOINS.BRLT.issuer
    );
    const brzBalance = brzBal?.balance ?? '0';
    const brltBalance = brltBal?.balance ?? '0';
    // BRZ and BRLT are BRL-pegged, so 1 unit ≈ brl_usd in USD
    const totalBrlUsd = (parseFloat(brzBalance) + parseFloat(brltBalance)) * (rates.brl_usd ?? 0);

    // Abroad Finance corridor info (cached, non-blocking)
    let abroadCorridor = { stellar_usdc_pix_available: false, min_amount: 1, max_amount: null as number | null };
    try {
      const corridor = await AbroadFinanceService.getStellarCorridor();
      if (corridor) {
        abroadCorridor = {
          stellar_usdc_pix_available: true,
          min_amount: corridor.minAmount,
          max_amount: corridor.maxAmount,
        };
      }
    } catch { /* non-critical */ }

    const overview: EcosystemOverview = {
      address: stellarAddress,
      network: NETWORK,
      fetchedAt: new Date(now).toISOString(),
      network_stats: netHealth,
      balances,
      usdcBalance,
      xlmBalance,
      rates: {
        xlm_usd: rates.xlm_usd ?? 0,
        brl_usd: rates.brl_usd ?? 0,
        usdc_usd: 1,
      },
      portfolioUsd: Math.round(portfolioUsd * 100) / 100,
      portfolioBrl: Math.round(portfolioBrl * 100) / 100,
      brl_stablecoins: {
        brz_balance: brzBalance,
        brlt_balance: brltBalance,
        total_brl_usd: Math.round(totalBrlUsd * 100) / 100,
      },
      abroad: abroadCorridor,
      defi: {
        aquarius_xlm_usdc_daily_aqua: aqua?.xlmUsdcDailyAqua ?? 0,
        top_yield_pools: topPools,
        blend_usdc_apy_note: 'Deposit USDC into Blend Protocol via /api/defindex/deposit to earn lending yield',
      },
      cctp: {
        supported_source_chains: cctpChains,
        stellar_domain_id: 4,
      },
      ...(fraud ? { fraud_screen: { blocked: fraud.blocked, tags: fraud.tags } } : {}),
    };

    logger.info(
      `[ecosystem] overview complete addr=${stellarAddress.slice(0, 8)}... ` +
      `usdc=${usdcBalance} xlm=${xlmBalance} usd≈$${overview.portfolioUsd}`
    );
    return overview;
  },

  /**
   * Returns a human-readable summary in Portuguese for the AI agent to relay
   * as a WhatsApp message.
   */
  async getSummaryText(stellarAddress: string): Promise<string> {
    try {
      const o = await this.getOverview(stellarAddress);
      const lines: string[] = [
        `📊 *Seu portfólio Stellar*`,
        ``,
        `💵 USDC: $${parseFloat(o.usdcBalance).toFixed(2)}`,
        `⭐ XLM: ${parseFloat(o.xlmBalance).toFixed(2)} XLM (~$${(parseFloat(o.xlmBalance) * o.rates.xlm_usd).toFixed(2)})`,
        `🏦 Total: ~$${o.portfolioUsd.toFixed(2)} (R$${o.portfolioBrl.toFixed(2)})`,
        ``,
        `📈 *Stellar agora*`,
        `• Bloco #${o.network_stats.latestLedger.toLocaleString()}`,
        `• ${o.network_stats.tps} ops/s | ${Math.round(o.network_stats.capacityUsage * 100)}% capacidade`,
        `• Taxa recomendada: ${o.network_stats.recommendedFeeStoops} stroops`,
        ``,
        `🌊 *Rewards Aquarius*`,
        `• XLM/USDC: ${o.defi.aquarius_xlm_usdc_daily_aqua.toLocaleString()} AQUA/dia no pool`,
      ];

      if (o.fraud_screen?.blocked) {
        lines.push(``, `⚠️ *ATENÇÃO*: este endereço está sinalizado como malicioso`);
      }

      return lines.join('\n');
    } catch (e: any) {
      logger.warn(`[ecosystem] getSummaryText failed: ${e.message}`);
      return 'Não foi possível carregar o portfólio. Tente novamente em instantes.';
    }
  },
};
