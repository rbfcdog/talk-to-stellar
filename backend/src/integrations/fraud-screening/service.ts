/**
 * StellarExpert Fraud Screening
 *
 * Free API — no auth needed. CORS open.
 * Screen every outbound payment recipient before sending.
 *
 * API: https://stellar.expert/openapi.html
 */

import { logger } from '../../utils/logger';

const BASE = 'https://stellar.expert/api/explorer';

// Simple in-memory cache — 1h TTL
const cache = new Map<string, { tags: string[]; timestamp: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export interface ScreenResult {
  address: string;
  tags: string[];
  blocked: boolean;
  warning?: string;
  isMalicious: boolean;
  isExchange: boolean;
  isAnchor: boolean;
  note?: string;
}

export const FraudScreeningService = {
  async screenAddress(address: string, network: 'mainnet' | 'testnet' = 'mainnet'): Promise<ScreenResult> {
    const cacheKey = `${network}:${address}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return this.buildResult(address, cached.tags);
    }

    try {
      const res = await fetch(`${BASE}/directory/${address}`, {
        headers: { 'User-Agent': 'TalkToStellar/1.0' },
        signal: AbortSignal.timeout(5000),
      });

      if (res.status === 404) {
        // Unknown address — not flagged
        const result = this.buildResult(address, []);
        cache.set(cacheKey, { tags: [], timestamp: Date.now() });
        return result;
      }

      if (!res.ok) {
        logger.warn(`[fraud-screening] StellarExpert returned ${res.status} for ${address}`);
        return this.buildResult(address, []);
      }

      const data = await res.json() as any;
      const tags: string[] = Array.isArray(data.tags) ? data.tags : [];
      cache.set(cacheKey, { tags, timestamp: Date.now() });
      return this.buildResult(address, tags);
    } catch (e: any) {
      logger.warn(`[fraud-screening] screenAddress failed: ${e.message}`);
      // Fail open — don't block payments if screening is unavailable
      return this.buildResult(address, []);
    }
  },

  buildResult(address: string, tags: string[]): ScreenResult {
    const isMalicious = tags.includes('malicious');
    const isExchange = tags.includes('exchange');
    const isAnchor = tags.includes('anchor') || tags.includes('issuer');

    let warning: string | undefined;
    if (isMalicious) warning = 'Endereço sinalizado como malicioso — transação bloqueada';
    else if (isExchange) warning = 'Esse é o endereço de uma exchange, não de uma conta pessoal';

    return {
      address,
      tags,
      blocked: isMalicious,
      warning,
      isMalicious,
      isExchange,
      isAnchor,
      note: tags.join(', ') || undefined,
    };
  },

  async screenDomain(domain: string): Promise<{ blocked: boolean; domain: string }> {
    try {
      const res = await fetch(`${BASE}/directory/blocked-domains/${encodeURIComponent(domain)}`, {
        signal: AbortSignal.timeout(5000),
      });
      return { blocked: res.ok, domain };
    } catch {
      return { blocked: false, domain };
    }
  },

  clearCache(): void {
    cache.clear();
  },
};
