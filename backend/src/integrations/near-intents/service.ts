/**
 * Near Intents — 1Click Multi-Chain Execution API
 *
 * Near Intents provides a solver-based execution layer where users express intent
 * ("I want USDC on Stellar") and solvers compete to route it optimally across chains.
 * The 1Click API abstracts the complexity into a single API call.
 *
 * 1Click API: https://1click.chaindefuser.com/v0/
 * GitHub: https://github.com/near/intents
 * Docs: https://docs.near-intents.org
 *
 * TalkToStellar use: Receive BTC/ETH/SOL from abroad → convert to USDC on Stellar in 1 step.
 */

import { logger } from '../../utils/logger';

const ONECLICK_API = 'https://1click.chaindefuser.com/v0';

async function clickFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${ONECLICK_API}${path}`, {
    headers: { 'User-Agent': 'TalkToStellar/1.0', Accept: 'application/json', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12_000),
    ...opts,
  });
  if (!res.ok) throw new Error(`1Click API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Cache token list for 10 minutes
const CACHE_TTL = 10 * 60 * 1000;
let tokenCache: { data: any; at: number } | null = null;

export const NearIntentsService = {
  async getTokens() {
    const now = Date.now();
    if (tokenCache && now - tokenCache.at < CACHE_TTL) return tokenCache.data;
    try {
      const data = await clickFetch<any>('/tokens');
      tokenCache = { data, at: now };
      logger.debug('[near-intents] fetched token list');
      return data;
    } catch (e: any) {
      logger.warn(`[near-intents] getTokens failed: ${e.message}`);
      if (tokenCache) return tokenCache.data;
      throw e;
    }
  },

  async getQuote(input: {
    defuse_asset_identifier_in: string;
    defuse_asset_identifier_out: string;
    exact_amount_in?: string;
    exact_amount_out?: string;
    min_deadline_ms?: number;
    referral_id?: string;
  }) {
    try {
      const data = await clickFetch<any>('/quote', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      logger.debug(`[near-intents] quote: ${input.defuse_asset_identifier_in}→${input.defuse_asset_identifier_out}`);
      return data;
    } catch (e: any) {
      logger.warn(`[near-intents] getQuote failed: ${e.message}`);
      throw e;
    }
  },

  getStellarUsdcIdentifier() {
    // Near Intents uses format: nep141:token.contract@chain
    // For Stellar USDC (via NEAR bridge):
    return 'nep141:ft.usdc.near';
  },

  async getSupportedRoutes() {
    try {
      const tokens = await this.getTokens();
      const all = Array.isArray(tokens) ? tokens : (tokens?.tokens ?? tokens?.data ?? []);
      return all.filter((t: any) =>
        t.blockchain === 'NEAR' || t.blockchain === 'ETH' || t.symbol === 'USDC'
      );
    } catch (e: any) {
      logger.warn(`[near-intents] getSupportedRoutes failed: ${e.message}`);
      throw e;
    }
  },
};
