/**
 * Allbridge Core — Cross-Chain Stablecoin Bridge to Stellar
 *
 * Allbridge enables native 1:1 stablecoin transfers between EVM chains and Stellar
 * with automatic account activation. Stellar was added as the 10th supported chain.
 *
 * API: https://core.api.allbridgecore.com
 * Docs: https://docs.allbridge.io
 *
 * TalkToStellar use: Bridge USDC from Base/Arbitrum directly to Stellar for PIX off-ramp.
 * The user sends USDC on Base → receives USDC on Stellar — no DEX slippage.
 */

import { logger } from '../../utils/logger';

const ALLBRIDGE_API = 'https://core.api.allbridgecore.com';

async function allbridgeFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${ALLBRIDGE_API}${path}`, {
    headers: { 'User-Agent': 'TalkToStellar/1.0', Accept: 'application/json', 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12_000),
    ...opts,
  });
  if (!res.ok) throw new Error(`Allbridge ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// 10-minute cache for chain/token info
const CACHE_TTL = 10 * 60 * 1000;
let chainsCache: { data: any; at: number } | null = null;

export const AllbridgeService = {
  async getChainTokenMap() {
    const now = Date.now();
    if (chainsCache && now - chainsCache.at < CACHE_TTL) return chainsCache.data;
    try {
      const data = await allbridgeFetch<any>('/v1/token-info');
      chainsCache = { data, at: now };
      logger.debug('[allbridge] fetched chain/token map');
      return data;
    } catch (e: any) {
      logger.warn(`[allbridge] getChainTokenMap failed: ${e.message}`);
      if (chainsCache) return chainsCache.data;
      throw e;
    }
  },

  async getStellarTokens() {
    const map = await this.getChainTokenMap();
    const stellarEntry = Object.entries(map ?? {}).find(
      ([key]) => key.toUpperCase() === 'STELLAR' || key.toUpperCase() === 'SOL' // try different key forms
    ) ?? Object.entries(map ?? {}).find(([, v]: any) => v?.chainSymbol?.toUpperCase() === 'STELLAR');
    return stellarEntry ? (stellarEntry[1] as any) : null;
  },

  async getTransferTime(sourceChain: string, destChain: string) {
    try {
      const params = new URLSearchParams({ from: sourceChain, to: destChain });
      return await allbridgeFetch<any>(`/v1/transfer/time?${params}`);
    } catch (e: any) {
      logger.warn(`[allbridge] getTransferTime failed: ${e.message}`);
      throw e;
    }
  },

  async getReceiveAmount(input: { amount: string; sourceChainId: string; sourceToken: string; destChainId: string; destToken: string }) {
    try {
      return await allbridgeFetch<any>('/v1/receive/amount', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    } catch (e: any) {
      logger.warn(`[allbridge] getReceiveAmount failed: ${e.message}`);
      throw e;
    }
  },
};
