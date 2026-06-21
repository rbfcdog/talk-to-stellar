/**
 * Axelar — General-Purpose Cross-Chain Messaging & Bridging
 *
 * Axelar connects 60+ chains via a decentralized validator network.
 * It supports Interchain Token Service (ITS) for canonical token transfers
 * and General Message Passing (GMP) for arbitrary cross-chain calls.
 * Stellar support added via axelarnetwork/axelar-amplifier-stellar.
 *
 * AxelarScan API: https://api.axelarscan.io/
 * Docs: https://docs.axelar.dev
 *
 * TalkToStellar use: USDC from any chain → Stellar, plus inter-chain automation.
 */

import { logger } from '../../utils/logger';

const AXELAR_API = 'https://api.axelarscan.io';

async function axelarFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${AXELAR_API}${path}`, {
    headers: { 'User-Agent': 'TalkToStellar/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Axelar API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// 10-minute cache for chain info
const CACHE_TTL = 10 * 60 * 1000;
let chainCache: { data: any; at: number } | null = null;

export const AxelarService = {
  async getChains() {
    const now = Date.now();
    if (chainCache && now - chainCache.at < CACHE_TTL) return chainCache.data;
    try {
      const data = await axelarFetch<any>('/api/chains');
      chainCache = { data, at: now };
      logger.debug(`[axelar] fetched chains`);
      return data;
    } catch (e: any) {
      logger.warn(`[axelar] getChains failed: ${e.message}`);
      if (chainCache) return chainCache.data;
      throw e;
    }
  },

  async getTransferStatus(txHash: string) {
    try {
      return await axelarFetch<any>(`/api/transfers?txHash=${encodeURIComponent(txHash)}`);
    } catch (e: any) {
      logger.warn(`[axelar] getTransferStatus failed: ${e.message}`);
      throw e;
    }
  },

  async getGMPStats() {
    try {
      return await axelarFetch<any>('/api/gmp/stats');
    } catch (e: any) {
      logger.warn(`[axelar] getGMPStats failed: ${e.message}`);
      throw e;
    }
  },

  async getAssets() {
    try {
      return await axelarFetch<any>('/api/assets');
    } catch (e: any) {
      logger.warn(`[axelar] getAssets failed: ${e.message}`);
      throw e;
    }
  },
};
