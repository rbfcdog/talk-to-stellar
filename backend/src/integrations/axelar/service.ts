/**
 * Axelar — General-Purpose Cross-Chain Messaging & Bridging
 *
 * Axelar connects 60+ chains via a decentralized validator network.
 * Stellar support added via axelarnetwork/axelar-amplifier-stellar.
 *
 * AxelarScan API: https://api.axelarscan.io/api?method=<method>
 * Docs: https://docs.axelar.dev
 *
 * TalkToStellar use: USDC from any chain → Stellar, plus inter-chain automation.
 */

import { logger } from '../../utils/logger';

const AXELAR_API = 'https://api.axelarscan.io/api';

async function axelarFetch<T>(method: string, params: Record<string, string> = {}): Promise<T> {
  const p = new URLSearchParams({ method, ...params });
  const res = await fetch(`${AXELAR_API}?${p}`, {
    headers: { 'User-Agent': 'TalkToStellar/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Axelar ${method} → ${res.status}`);
  const json = await res.json() as any;
  if (json?.error) throw new Error(`Axelar ${method} error: ${json.message}`);
  return json as T;
}

// 10-minute cache for chain info
const CACHE_TTL = 10 * 60 * 1000;
let chainCache: { data: any[]; at: number } | null = null;

export const AxelarService = {
  async getChains() {
    const now = Date.now();
    if (chainCache && now - chainCache.at < CACHE_TTL) return chainCache.data;
    try {
      const data = await axelarFetch<any[]>('getChains');
      const chains = Array.isArray(data) ? data : [];
      chainCache = { data: chains, at: now };
      logger.debug(`[axelar] fetched ${chains.length} chains`);
      return chains;
    } catch (e: any) {
      logger.warn(`[axelar] getChains failed: ${e.message}`);
      if (chainCache) return chainCache.data;
      throw e;
    }
  },

  async getTransferStatus(txHash: string) {
    try {
      const data = await axelarFetch<any>('getTransfers', { txHash });
      return data;
    } catch (e: any) {
      logger.warn(`[axelar] getTransferStatus(${txHash}) failed: ${e.message}`);
      throw e;
    }
  },
};
