/**
 * Blend v2 — DeFi Lending Protocol on Stellar/Soroban
 *
 * Blend allows users to deposit USDC or XLM into permissionless lending pools
 * and earn variable APY. Key pools: Stellar (USDC/XLM) and Orbit (XLM+bonds).
 *
 * REST API: https://api.mainnet.blend.capital/
 * Reference: https://docs.blend.capital
 *
 * TalkToStellar use: "Seu USDC está rendendo 8% ao ano no Blend"
 */

import { logger } from '../../utils/logger';

const BLEND_API = 'https://api.mainnet.blend.capital';

async function blendFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BLEND_API}${path}`, {
    headers: { 'User-Agent': 'TalkToStellar/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Blend API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// 5-minute cache
const CACHE_TTL = 5 * 60 * 1000;
let poolCache: { data: any; at: number } | null = null;

export const BlendService = {
  async listPools() {
    const now = Date.now();
    if (poolCache && now - poolCache.at < CACHE_TTL) return poolCache.data;
    try {
      const data = await blendFetch<any>('/backstop');
      const pools = Array.isArray(data?.pools) ? data.pools : (data?.data ?? []);
      poolCache = { data: pools, at: now };
      logger.debug(`[blend] fetched ${pools.length} pools`);
      return pools;
    } catch (e: any) {
      logger.warn(`[blend] listPools failed: ${e.message}`);
      if (poolCache) return poolCache.data;
      throw e;
    }
  },

  async getPool(poolAddress: string) {
    try {
      return await blendFetch<any>(`/pool/${encodeURIComponent(poolAddress)}`);
    } catch (e: any) {
      logger.warn(`[blend] getPool(${poolAddress}) failed: ${e.message}`);
      throw e;
    }
  },

  async getUserPositions(userAddress: string) {
    try {
      return await blendFetch<any>(`/user/${encodeURIComponent(userAddress)}`);
    } catch (e: any) {
      logger.warn(`[blend] getUserPositions(${userAddress}) failed: ${e.message}`);
      throw e;
    }
  },
};
