/**
 * Aquarius Protocol Integration
 *
 * Aquarius is Stellar's DeFi Hub — AMM swaps, liquidity pools, and AQUA rewards.
 * Every pair that provides liquidity via the SDEX or AMM earns daily AQUA tokens
 * proportional to their share. The XLM/USDC pair alone distributes 700K AQUA/day.
 *
 * Reward API: https://reward-api.aqua.network/api/rewards/
 * AQUA issuer: GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA
 *
 * TalkToStellar use: Show users the extra yield layer on top of swap fees when
 * they hold USDC/XLM in AMM positions — AQUA rewards stack on Blend APY and fees.
 */

import { logger } from '../../utils/logger';
import type { AquaPoolReward, AquaRewardsResponse, PoolRewardSummary } from './types';

export const AQUA_ISSUER = 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA';
export const AQUA_REWARD_API = 'https://reward-api.aqua.network/api/rewards/';

// 5-minute cache — rewards update every ~hour but we don't need to hit the API on every request
const CACHE_TTL = 5 * 60 * 1000;
let rewardsCache: { data: AquaRewardsResponse; fetchedAt: number } | null = null;

function pairKey(r: AquaPoolReward): string {
  return `${r.market_key.asset1_code}/${r.market_key.asset2_code}`;
}

function toSummary(r: AquaPoolReward): PoolRewardSummary {
  return {
    pair: pairKey(r),
    asset1: r.market_key.asset1_code,
    asset2: r.market_key.asset2_code,
    dailySdexReward: r.daily_sdex_reward,
    dailyAmmReward: r.daily_amm_reward,
    dailyTotalReward: r.daily_total_reward,
    updatedAt: r.last_updated,
  };
}

export const AquariusService = {
  /**
   * Fetch all pools with AQUA rewards, sorted by daily total reward descending.
   * Cached for 5 minutes. XLM/USDC is almost always the top pair.
   */
  async getPoolRewards(limit = 20): Promise<AquaRewardsResponse> {
    const now = Date.now();
    if (rewardsCache && now - rewardsCache.fetchedAt < CACHE_TTL) {
      return rewardsCache.data;
    }

    try {
      // Fetch more than limit to allow sorting + filtering
      const url = `${AQUA_REWARD_API}?format=json&page_size=${Math.max(limit, 50)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TalkToStellar/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        throw new Error(`Aquarius reward API returned ${res.status}`);
      }

      const raw = await res.json() as any;
      const results: AquaPoolReward[] = Array.isArray(raw.results) ? raw.results : [];

      // Sort by total daily reward descending
      results.sort((a, b) => b.daily_total_reward - a.daily_total_reward);

      const topPools = results.slice(0, limit).map(toSummary);

      // Find XLM/USDC specifically — most relevant for TalkToStellar
      const xlmUsdc = results.find(
        (r) => r.market_key.asset1_code === 'XLM' && r.market_key.asset2_code === 'USDC'
      ) ?? results.find(
        (r) => r.market_key.asset2_code === 'XLM' && r.market_key.asset1_code === 'USDC'
      );

      const response: AquaRewardsResponse = {
        topPools,
        xlmUsdcDailyAqua: xlmUsdc?.daily_total_reward ?? 0,
        aquaIssuer: AQUA_ISSUER,
        fetchedAt: new Date(now).toISOString(),
      };

      rewardsCache = { data: response, fetchedAt: now };
      logger.debug(`[aquarius] fetched ${topPools.length} pool rewards, xlm/usdc daily=${response.xlmUsdcDailyAqua}`);
      return response;
    } catch (e: any) {
      logger.warn(`[aquarius] getPoolRewards failed: ${e.message}`);
      if (rewardsCache) {
        logger.warn('[aquarius] returning stale cache');
        return rewardsCache.data;
      }
      throw e;
    }
  },

  /**
   * Get AQUA rewards for a specific trading pair.
   * Returns null if the pair has no reward programme.
   */
  async getPairReward(asset1: string, asset2: string): Promise<PoolRewardSummary | null> {
    const rewards = await this.getPoolRewards(100);
    const upper1 = asset1.toUpperCase();
    const upper2 = asset2.toUpperCase();

    const found = rewards.topPools.find(
      (p) =>
        (p.asset1.toUpperCase() === upper1 && p.asset2.toUpperCase() === upper2) ||
        (p.asset1.toUpperCase() === upper2 && p.asset2.toUpperCase() === upper1)
    );
    return found ?? null;
  },

  /**
   * Estimate daily AQUA earnings for a given LP position.
   *
   * @param poolTotalValue  - Total USD value locked in the pool (needed to compute share)
   * @param userValue       - User's USD value in the pool
   * @param pairKey         - e.g. "XLM/USDC"
   *
   * Simple proportional estimate: (userValue / poolTotal) * dailyAqua
   */
  async estimateDailyAqua(
    poolTotalValueUsd: number,
    userValueUsd: number,
    asset1: string,
    asset2: string,
  ): Promise<{ dailyAqua: number; sharePercent: number; pair: string }> {
    const reward = await this.getPairReward(asset1, asset2);
    if (!reward || poolTotalValueUsd <= 0) {
      return { dailyAqua: 0, sharePercent: 0, pair: `${asset1}/${asset2}` };
    }

    const sharePercent = (userValueUsd / poolTotalValueUsd) * 100;
    const dailyAqua = (userValueUsd / poolTotalValueUsd) * reward.dailyAmmReward;

    return {
      dailyAqua: Math.round(dailyAqua * 100) / 100,
      sharePercent: Math.round(sharePercent * 1000) / 1000,
      pair: reward.pair,
    };
  },

  clearCache(): void {
    rewardsCache = null;
  },
};
