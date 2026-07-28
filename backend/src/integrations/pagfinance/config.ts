/**
 * PagFinance Configuration
 *
 * Environment variables:
 *   PAGFINANCE_ENABLED               — Feature flag (default: false)
 *   PAGFINANCE_BASE_URL              — Base URL (default: https://sandbox.brlp.io)
 *   PAGFINANCE_PARTNER_ID            — Partner identifier (required)
 *   PAGFINANCE_RAW_SECRET            — HMAC raw secret (required, never logged)
 *   PAGFINANCE_WEBHOOK_SECRET        — Verifies inbound webhook signatures
 *   PAGFINANCE_JWT_TTL_SECONDS       — End-user JWT lifetime (default: 86400)
 *   PAGFINANCE_TIMEOUT_MS            — HTTP timeout per attempt (default: 30000)
 *   PAGFINANCE_MIN_BRL_AMOUNT        — Min cash-in BRL (default: 1)
 *   PAGFINANCE_MAX_BRL_AMOUNT        — Max cash-in BRL (default: 5000)
 *   PAGFINANCE_INTENT_EXPIRES_IN     — Pix charge lifetime seconds (default: 900)
 *   PAGFINANCE_USDC_TREASURY_SECRET  — Stellar secret paying USDC credits
 *   PAGFINANCE_FALLBACK_BRL_PER_USDC — Mainnet emergency rate (optional)
 *
 * Switching sandbox ↔ production is just BASE_URL + PARTNER_ID + RAW_SECRET +
 * WEBHOOK_SECRET. Reuses APP_PUBLIC_WEBHOOK_URL for the webhook destination.
 */

export interface PagfinanceConfig {
  enabled: boolean;
  baseUrl: string;
  partnerId: string;
  rawSecret: string;
  webhookSecret: string;
  jwtTtlSeconds: number;
  timeoutMs: number;
  minBrlAmount: number;
  maxBrlAmount: number;
  intentExpiresInSeconds: number;
  usdcTreasurySecret: string;
  fallbackBrlPerUsdc: number | null;
  appPublicWebhookUrl: string;
}

function env(name: string, fallback = ''): string {
  return String(process.env[name] ?? fallback).trim();
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function numEnv(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadPagfinanceConfig(): PagfinanceConfig {
  const fallbackRate = numEnv('PAGFINANCE_FALLBACK_BRL_PER_USDC', 0);
  return {
    enabled: boolEnv('PAGFINANCE_ENABLED', false),
    baseUrl: env('PAGFINANCE_BASE_URL', 'https://sandbox.brlp.io').replace(/\/$/, ''),
    partnerId: env('PAGFINANCE_PARTNER_ID'),
    rawSecret: env('PAGFINANCE_RAW_SECRET'),
    webhookSecret: env('PAGFINANCE_WEBHOOK_SECRET'),
    jwtTtlSeconds: numEnv('PAGFINANCE_JWT_TTL_SECONDS', 86_400),
    timeoutMs: numEnv('PAGFINANCE_TIMEOUT_MS', 30_000),
    minBrlAmount: numEnv('PAGFINANCE_MIN_BRL_AMOUNT', 1),
    maxBrlAmount: numEnv('PAGFINANCE_MAX_BRL_AMOUNT', 5_000),
    intentExpiresInSeconds: numEnv('PAGFINANCE_INTENT_EXPIRES_IN', 900),
    usdcTreasurySecret: env('PAGFINANCE_USDC_TREASURY_SECRET'),
    fallbackBrlPerUsdc: fallbackRate > 0 ? fallbackRate : null,
    appPublicWebhookUrl: env('APP_PUBLIC_WEBHOOK_URL'),
  };
}

/** Returns the missing required env var names (empty array = usable). */
export function validatePagfinanceConfig(config: PagfinanceConfig): string[] {
  const missing: string[] = [];
  if (!config.partnerId) missing.push('PAGFINANCE_PARTNER_ID');
  if (!config.rawSecret) missing.push('PAGFINANCE_RAW_SECRET');
  return missing;
}
