/**
 * Abroad Finance Integration
 *
 * Abroad Finance is a Stellar-native USDC → PIX settlement layer for Brazil and Colombia.
 * 910+ transactions/month, 200K+ USDC volume in September 2025 (Meridian 2025 data).
 *
 * Why this complements Bridge.xyz:
 *   - Bridge.xyz: Full KYC anchor, supports on-ramp AND off-ramp, PIX ↔ USDC
 *   - Abroad Finance: Direct USDC→PIX settlement via Stellar payment, faster for simple flows,
 *     and decodes Brazilian PIX QR codes (key for WhatsApp "scan and pay" UX)
 *
 * Public endpoints (no auth for quotes/corridors):
 *   GET /public/corridors — supported chains/assets/limits
 *   POST /qr-decoder/br  — decode a Brazilian PIX QR code payload
 *   GET /quote            — USDC → BRL quote (may require partner auth)
 *
 * Partner API key (ABROAD_PARTNER_API_KEY) required for:
 *   POST /transaction     — initiate a settlement
 *   GET /transaction/{id} — poll settlement status
 *   GET /payments/liquidity — check available liquidity
 *
 * Stellar corridor: USDC on Stellar pubnet, min $1, max $5,000,000.
 * Payment lands in recipient's Brazilian bank/PIX key within seconds.
 *
 * API docs: https://api.abroad.finance/docs
 */

import { logger } from '../../utils/logger';
import type { AbroadCorridor, StellarCorridor, AbroadQuote, DecodedPixQr } from './types';

const ABROAD_BASE = process.env.ABROAD_API_URL || 'https://api.abroad.finance';
const ABROAD_API_KEY = process.env.ABROAD_PARTNER_API_KEY || '';

// Cache corridors for 10 minutes — they don't change often
let corridorCache: { data: AbroadCorridor[]; fetchedAt: number } | null = null;
const CORRIDOR_CACHE_TTL = 10 * 60 * 1000;

async function fetchJson(url: string, options?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'TalkToStellar/1.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...(ABROAD_API_KEY ? { 'x-api-key': ABROAD_API_KEY } : {}),
      ...(options?.headers ?? {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Abroad API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export const AbroadFinanceService = {
  /**
   * List all supported USDC → BRL corridors.
   * Stellar corridor: min $1, max $5M. No auth required.
   */
  async getCorridors(): Promise<AbroadCorridor[]> {
    const now = Date.now();
    if (corridorCache && now - corridorCache.fetchedAt < CORRIDOR_CACHE_TTL) {
      return corridorCache.data;
    }
    try {
      const data = await fetchJson(`${ABROAD_BASE}/public/corridors`);
      const corridors: AbroadCorridor[] = Array.isArray(data.corridors) ? data.corridors : [];
      corridorCache = { data: corridors, fetchedAt: now };
      logger.debug(`[abroad] ${corridors.length} corridors cached`);
      return corridors;
    } catch (e: any) {
      logger.warn(`[abroad] getCorridors failed: ${e.message}`);
      return corridorCache?.data ?? [];
    }
  },

  /**
   * Get the Stellar-specific USDC → PIX corridor with limits.
   */
  async getStellarCorridor(): Promise<StellarCorridor | null> {
    const all = await this.getCorridors();
    const stellar = all.find(
      (c) => c.blockchain === 'STELLAR' && c.cryptoCurrency === 'USDC' && c.paymentMethod === 'PIX'
    );
    return (stellar as StellarCorridor) ?? null;
  },

  /**
   * Decode a Brazilian PIX QR code (EMV/QRCPS-MPM format).
   * Users can paste or photo a PIX QR code; this returns the recipient key and amount.
   * Super useful for "send payment to this QR code" WhatsApp flow.
   *
   * @param qrPayload — raw QR code string (starts with "00020126...")
   */
  async decodePixQr(qrPayload: string): Promise<DecodedPixQr> {
    try {
      const data = await fetchJson(`${ABROAD_BASE}/qr-decoder/br`, {
        method: 'POST',
        body: JSON.stringify({ payload: qrPayload }),
      });
      return {
        pixKey: data.pixKey ?? data.key,
        recipientName: data.recipientName ?? data.name,
        amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount ?? '0') || undefined,
        merchantName: data.merchantName ?? data.merchant,
        city: data.city,
        description: data.description ?? data.desc,
        rawData: data,
      };
    } catch (e: any) {
      logger.warn(`[abroad] decodePixQr failed: ${e.message}`);
      throw e;
    }
  },

  /**
   * Get a USDC → BRL exchange quote from Abroad Finance.
   * Returns null if the endpoint requires auth and none is configured.
   */
  async getQuote(usdcAmount: number): Promise<AbroadQuote | null> {
    if (!ABROAD_API_KEY) {
      logger.debug('[abroad] getQuote skipped — ABROAD_PARTNER_API_KEY not set');
      return null;
    }
    try {
      const data = await fetchJson(
        `${ABROAD_BASE}/quote?amount=${usdcAmount}&fromAsset=USDC&toAsset=BRL&blockchain=STELLAR`
      );
      return {
        inputAmount: data.inputAmount ?? usdcAmount,
        outputAmount: data.outputAmount ?? data.output ?? 0,
        exchangeRate: data.exchangeRate ?? data.rate ?? 0,
        fee: data.fee ?? 0,
        feePercent: data.feePercent ?? data.feePercentage ?? 0,
        cryptoCurrency: 'USDC',
        fiatCurrency: 'BRL',
        blockchain: 'STELLAR',
        expiresAt: data.expiresAt,
      };
    } catch (e: any) {
      logger.warn(`[abroad] getQuote failed: ${e.message}`);
      return null;
    }
  },

  clearCache(): void {
    corridorCache = null;
  },
};
