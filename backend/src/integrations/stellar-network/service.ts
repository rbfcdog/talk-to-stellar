/**
 * Stellar Network Stats Service
 *
 * Real-time ledger and fee data from Horizon.
 * Used by the AI agent to:
 * - Quote optimal transaction fees (avoid overpaying when capacity is low)
 * - Show users network health ("Stellar está operacional — 5s block time, $0.00001 fee")
 * - Diagnose delays (high capacity usage = slower tx confirmation)
 *
 * Endpoints used:
 *   GET /fee_stats          — fee percentiles, capacity usage
 *   GET /ledgers?limit=1    — latest closed ledger (TPS proxy)
 *
 * Cache: 30s — ledgers close every ~5s, but we don't need sub-second freshness.
 */

import { logger } from '../../utils/logger';
import type { NetworkStats, NetworkHealth, FeeStats, LedgerStats } from './types';

const HORIZON_BASE = process.env.STELLAR_HORIZON_URL
  || (process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org');

const NETWORK_PASSPHRASE = process.env.STELLAR_NETWORK === 'mainnet'
  ? 'Public Global Stellar Network ; September 2015'
  : 'Test SDF Network ; September 2015';

const CACHE_TTL = 30_000; // 30s
let statsCache: { data: NetworkStats; fetchedAt: number } | null = null;

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TalkToStellar/1.0' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

export const StellarNetworkService = {
  /**
   * Returns comprehensive Stellar network stats.
   * Combines fee stats and latest ledger data into one object.
   */
  async getStats(): Promise<NetworkStats> {
    const now = Date.now();
    if (statsCache && now - statsCache.fetchedAt < CACHE_TTL) {
      return statsCache.data;
    }

    try {
      const [feeRaw, ledgerRaw] = await Promise.all([
        fetchJson(`${HORIZON_BASE}/fee_stats`),
        fetchJson(`${HORIZON_BASE}/ledgers?order=desc&limit=1`),
      ]);

      const ledgerRecord = ledgerRaw?._embedded?.records?.[0];

      const fees: FeeStats = {
        lastLedger: parseInt(feeRaw.last_ledger ?? '0', 10),
        baseFeeStroops: parseInt(feeRaw.last_ledger_base_fee ?? '100', 10),
        capacityUsage: parseFloat(feeRaw.ledger_capacity_usage ?? '0'),
        p50FeeStroops: parseInt(feeRaw.fee_charged?.p50 ?? '100', 10),
        p99FeeStroops: parseInt(feeRaw.fee_charged?.p99 ?? '100', 10),
      };

      const ledger: LedgerStats = ledgerRecord
        ? {
            sequence: ledgerRecord.sequence,
            successfulTxCount: ledgerRecord.successful_transaction_count ?? 0,
            failedTxCount: ledgerRecord.failed_transaction_count ?? 0,
            operationCount: ledgerRecord.operation_count ?? 0,
            closedAt: ledgerRecord.closed_at ?? new Date(now).toISOString(),
            baseFeeInStroops: ledgerRecord.base_fee_in_stroops ?? 100,
            baseReserveInStroops: ledgerRecord.base_reserve_in_stroops ?? 5_000_000,
            totalCoins: ledgerRecord.total_coins ?? '0',
          }
        : {
            sequence: fees.lastLedger,
            successfulTxCount: 0,
            failedTxCount: 0,
            operationCount: 0,
            closedAt: new Date(now).toISOString(),
            baseFeeInStroops: fees.baseFeeStroops,
            baseReserveInStroops: 5_000_000,
            totalCoins: '0',
          };

      // Rough TPS: ops per ledger ÷ ~5s close time
      const tps = ledger.operationCount > 0 ? Math.round((ledger.operationCount / 5) * 10) / 10 : 0;

      const stats: NetworkStats = {
        ledger,
        fees,
        tps,
        networkPassphrase: NETWORK_PASSPHRASE,
        horizonUrl: HORIZON_BASE,
        fetchedAt: new Date(now).toISOString(),
      };

      statsCache = { data: stats, fetchedAt: now };
      logger.debug(`[stellar-network] stats fetched ledger=${ledger.sequence} tps=${tps} capacity=${fees.capacityUsage}`);
      return stats;
    } catch (e: any) {
      logger.warn(`[stellar-network] getStats failed: ${e.message}`);
      if (statsCache) {
        logger.warn('[stellar-network] returning stale cache');
        return statsCache.data;
      }
      throw e;
    }
  },

  /**
   * Quick health check — is the Stellar network reachable and producing ledgers?
   * Returns latency in milliseconds and the latest ledger number.
   */
  async getHealth(): Promise<NetworkHealth> {
    const start = Date.now();
    try {
      const raw = await fetchJson(`${HORIZON_BASE}/ledgers?order=desc&limit=1`);
      const latencyMs = Date.now() - start;
      const ledger = raw?._embedded?.records?.[0];

      return {
        healthy: true,
        latencyMs,
        latestLedger: ledger?.sequence ?? 0,
        closedAt: ledger?.closed_at ?? new Date().toISOString(),
      };
    } catch (e: any) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        latestLedger: 0,
        closedAt: '',
      };
    }
  },

  /**
   * Recommend an optimal fee for the current network state.
   * Uses p50 when capacity < 80%, p99 when busy.
   */
  async getRecommendedFeeMicroXlm(): Promise<{ feeStroops: number; reason: string }> {
    try {
      const stats = await this.getStats();
      const { capacityUsage, p50FeeStroops, p99FeeStroops, baseFeeStroops } = stats.fees;

      if (capacityUsage >= 0.9) {
        return {
          feeStroops: p99FeeStroops,
          reason: `High network load (${Math.round(capacityUsage * 100)}% capacity) — using p99 fee for priority inclusion`,
        };
      }
      if (capacityUsage >= 0.6) {
        return {
          feeStroops: p50FeeStroops,
          reason: `Moderate network load (${Math.round(capacityUsage * 100)}% capacity) — using median fee`,
        };
      }
      return {
        feeStroops: baseFeeStroops,
        reason: `Light network load (${Math.round(capacityUsage * 100)}% capacity) — base fee is sufficient`,
      };
    } catch {
      return { feeStroops: 100, reason: 'Could not fetch fee stats — using Stellar minimum base fee (100 stroops)' };
    }
  },

  clearCache(): void {
    statsCache = null;
  },
};
