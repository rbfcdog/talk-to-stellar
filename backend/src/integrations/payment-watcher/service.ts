/**
 * Payment Watcher — Horizon SSE → WhatsApp
 *
 * Maintains a long-lived SSE connection to Horizon for each active wallet.
 * When a USDC payment arrives, looks up the user's phone number via agent_sessions
 * and sends a WhatsApp notification via EvolutionService.sendText().
 *
 * Start at boot: PaymentWatcherService.start()
 * Subscribe a new wallet: PaymentWatcherService.subscribe(publicKey)
 */

import { Horizon } from '@stellar/stellar-sdk';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

// EvolutionService is huge — import only what we need
const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const HORIZON_URL = process.env.STELLAR_NETWORK === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
const USDC_ISSUER_MAINNET = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const STREAM_RECONNECT_BASE_MS = parseInt(process.env.PAYMENT_WATCHER_RECONNECT_BASE_MS || '30000', 10);
const STREAM_RECONNECT_MAX_MS = parseInt(process.env.PAYMENT_WATCHER_RECONNECT_MAX_MS || '300000', 10);
const ACCOUNT_NOT_FOUND_RETRY_MS = parseInt(process.env.PAYMENT_WATCHER_ACCOUNT_RETRY_MS || '600000', 10);
const ACCOUNT_CHECK_TIMEOUT_MS = parseInt(process.env.PAYMENT_WATCHER_ACCOUNT_CHECK_TIMEOUT_MS || '10000', 10);
const ACCOUNT_CHECK_SPACING_MS = parseInt(process.env.PAYMENT_WATCHER_ACCOUNT_CHECK_SPACING_MS || '1000', 10);
const HORIZON_RATE_LIMIT_RETRY_MS = parseInt(process.env.PAYMENT_WATCHER_RATE_LIMIT_RETRY_MS || '300000', 10);

class HorizonRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Horizon account check returned HTTP 429');
    this.name = 'HorizonRateLimitError';
  }
}

function isHorizonRateLimitError(error: unknown): error is HorizonRateLimitError {
  return error instanceof HorizonRateLimitError || (error as any)?.name === 'HorizonRateLimitError';
}

function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

function getUsdcIssuer() {
  return process.env.STELLAR_NETWORK === 'mainnet' ? USDC_ISSUER_MAINNET : USDC_ISSUER_TESTNET;
}

function maskedKey(publicKey: string) {
  return `${publicKey.slice(0, 8)}...`;
}

function isNotFoundError(err: any): boolean {
  const message = String(err?.message || err?.statusText || err || '').toLowerCase();
  return err?.status === 404 || message.includes('not found');
}

function clampDelay(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? ms : 30_000;
}

function nonNegativeDelay(ms: number, fallback = 0): number {
  return Number.isFinite(ms) && ms >= 0 ? ms : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWhatsApp(phone: string, text: string): Promise<void> {
  if (!EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) return;
  try {
    const url = `${EVOLUTION_BASE_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number: phone, text }),
    });
  } catch (e: any) {
    logger.warn(`[payment-watcher] sendWhatsApp failed: ${e.message}`);
  }
}

async function lookupPhone(stellarAddress: string): Promise<string | null> {
  // Check wallets table → agent_sessions join
  const { data } = await supabase
    .from('wallets')
    .select('session_id, agent_sessions(phone_number)')
    .eq('public_key', stellarAddress)
    .maybeSingle();
  if (data?.agent_sessions) {
    const s = data.agent_sessions as any;
    return s.phone_number || null;
  }
  // Also check user_stellar_wallets
  const { data: d2 } = await supabase
    .from('user_stellar_wallets')
    .select('user_id')
    .eq('public_key', stellarAddress)
    .maybeSingle();
  if (d2?.user_id) {
    const { data: d3 } = await supabase
      .from('agent_sessions')
      .select('phone_number')
      .eq('user_id', d2.user_id)
      .not('phone_number', 'is', null)
      .limit(1)
      .maybeSingle();
    return d3?.phone_number || null;
  }
  return null;
}

async function formatPaymentMessage(payment: any, to: string): Promise<string> {
  const amount = parseFloat(payment.amount || '0').toFixed(2);
  const assetCode = payment.asset_code || (payment.asset_type === 'native' ? 'XLM' : 'USDC');
  const from = payment.from ? `${payment.from.slice(0, 8)}...${payment.from.slice(-4)}` : 'alguém';

  // Get current balance
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${to}`);
    const account = await res.json() as any;
    const usdcBalance = account.balances?.find((b: any) =>
      b.asset_code === 'USDC' && b.asset_issuer === getUsdcIssuer()
    )?.balance || '0';
    return `💸 Você recebeu ${amount} ${assetCode}!\n\nSaldo USDC: $${parseFloat(usdcBalance).toFixed(2)}\n\nDe: ${from}\n\nDigite /saldo para ver detalhes.`;
  } catch {
    return `💸 Você recebeu ${amount} ${assetCode}! Digite /saldo para ver seu saldo.`;
  }
}

class PaymentWatcherService {
  private streams = new Map<string, any>();
  private reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingSubscribes = new Set<string>();
  private retryCounts = new Map<string, number>();
  private missingAccountLogs = new Set<string>();
  private accountCheckQueue: Promise<void> = Promise.resolve();
  private lastAccountCheckAt = 0;
  private horizonRateLimitedUntil = 0;
  private nextRateLimitLogAt = 0;
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    logger.info('[payment-watcher] Starting — loading active wallets from DB');
    await this.loadAndSubscribeAll();
  }

  private async loadAndSubscribeAll(): Promise<void> {
    try {
      // Load from wallets table
      const { data: wallets } = await supabase
        .from('wallets')
        .select('public_key')
        .not('public_key', 'is', null)
        .limit(500);

      // Load from user_stellar_wallets
      const { data: stellarWallets } = await supabase
        .from('user_stellar_wallets')
        .select('public_key')
        .limit(500);

      const keys = new Set<string>();
      wallets?.forEach((w: any) => { if (w.public_key) keys.add(w.public_key); });
      stellarWallets?.forEach((w: any) => { if (w.public_key) keys.add(w.public_key); });

      logger.info(`[payment-watcher] Subscribing to ${keys.size} wallets`);
      for (const key of keys) {
        await this.subscribe(key);
        // Stagger connections to avoid hammering Horizon
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (e: any) {
      logger.warn(`[payment-watcher] loadAndSubscribeAll failed: ${e.message}`);
    }
  }

  async subscribe(publicKey: string): Promise<void> {
    const key = publicKey.trim();
    if (!key || this.streams.has(key) || this.pendingSubscribes.has(key) || this.reconnectTimers.has(key)) return;

    this.pendingSubscribes.add(key);

    try {
      const accountReady = await this.accountExists(key);
      if (!accountReady) {
        this.scheduleAccountRetry(key);
        return;
      }

      this.openStream(key);
      this.retryCounts.delete(key);
      this.missingAccountLogs.delete(key);
    } catch (e: any) {
      if (isHorizonRateLimitError(e)) {
        this.logRateLimit(e.retryAfterMs);
        this.scheduleReconnect(key, e.retryAfterMs);
        return;
      }

      const delayMs = this.nextBackoffMs(key);
      logger.warn(`[payment-watcher] Horizon preflight failed for ${maskedKey(key)}: ${e.message}; retrying in ${Math.round(delayMs / 1000)}s`);
      this.scheduleReconnect(key, delayMs);
    } finally {
      this.pendingSubscribes.delete(key);
    }
  }

  private async accountExists(publicKey: string): Promise<boolean> {
    await this.waitForAccountCheckSlot();

    const res = await fetch(`${HORIZON_URL}/accounts/${encodeURIComponent(publicKey)}`, {
      signal: AbortSignal.timeout(clampDelay(ACCOUNT_CHECK_TIMEOUT_MS)),
    });
    if (res.status === 404) return false;
    if (res.status === 429) {
      const retryAfterMs = parseRetryAfterMs(res.headers?.get?.('retry-after')) ?? clampDelay(HORIZON_RATE_LIMIT_RETRY_MS);
      this.horizonRateLimitedUntil = Math.max(this.horizonRateLimitedUntil, Date.now() + retryAfterMs);
      throw new HorizonRateLimitError(retryAfterMs);
    }
    if (!res.ok) throw new Error(`Horizon account check returned HTTP ${res.status}`);
    return true;
  }

  private async waitForAccountCheckSlot(): Promise<void> {
    const previous = this.accountCheckQueue.catch(() => undefined);
    const next = previous.then(async () => {
      const rateLimitDelay = Math.max(0, this.horizonRateLimitedUntil - Date.now());
      if (rateLimitDelay > 0) {
        await sleep(rateLimitDelay);
      }

      const spacingMs = nonNegativeDelay(ACCOUNT_CHECK_SPACING_MS, 1000);
      const elapsedMs = Date.now() - this.lastAccountCheckAt;
      if (this.lastAccountCheckAt > 0 && elapsedMs < spacingMs) {
        await sleep(spacingMs - elapsedMs);
      }

      this.lastAccountCheckAt = Date.now();
    });

    this.accountCheckQueue = next;
    await next;
  }

  private logRateLimit(delayMs: number): void {
    const now = Date.now();
    if (now < this.nextRateLimitLogAt) return;

    logger.warn(`[payment-watcher] Horizon preflight rate limited (HTTP 429); pausing account checks for ${Math.round(delayMs / 1000)}s`);
    this.nextRateLimitLogAt = now + Math.max(delayMs, 60000);
  }

  private openStream(publicKey: string): void {
    const server = new Horizon.Server(HORIZON_URL);
    const stream = server
      .payments()
      .forAccount(publicKey)
      .cursor('now')
      .stream({
        onmessage: async (payment: any) => {
          try {
            if (payment.to !== publicKey) return;
            if (payment.type !== 'payment' && payment.type !== 'path_payment_strict_send' && payment.type !== 'path_payment_strict_receive') return;

            // Only notify for USDC (and XLM as fallback)
            const isUsdc = payment.asset_code === 'USDC' && payment.asset_issuer === getUsdcIssuer();
            const isXlm = payment.asset_type === 'native';
            if (!isUsdc && !isXlm) return;

            logger.info(`[payment-watcher] Payment received address=${maskedKey(publicKey)} amount=${payment.amount} asset=${payment.asset_code || 'XLM'}`);

            const phone = await lookupPhone(publicKey);
            if (!phone) return;

            const message = await formatPaymentMessage(payment, publicKey);
            await sendWhatsApp(phone, message);
            logger.info(`[payment-watcher] WhatsApp notification sent to ***${phone.slice(-4)}`);
          } catch (e: any) {
            logger.warn(`[payment-watcher] onmessage error: ${e.message}`);
          }
        },
        onerror: (err: any) => {
          this.handleStreamError(publicKey, err);
        },
      });

    this.streams.set(publicKey, stream);
    logger.debug(`[payment-watcher] Subscribed to ${maskedKey(publicKey)}`);
  }

  private handleStreamError(publicKey: string, err: any): void {
    this.closeStream(publicKey);

    if (isNotFoundError(err)) {
      this.scheduleAccountRetry(publicKey);
      return;
    }

    if (this.reconnectTimers.has(publicKey)) return;

    const delayMs = this.nextBackoffMs(publicKey);
    logger.warn(`[payment-watcher] SSE error for ${maskedKey(publicKey)}: ${err?.message || err}; retrying in ${Math.round(delayMs / 1000)}s`);
    this.scheduleReconnect(publicKey, delayMs);
  }

  private nextBackoffMs(publicKey: string): number {
    const retries = (this.retryCounts.get(publicKey) || 0) + 1;
    this.retryCounts.set(publicKey, retries);
    const base = clampDelay(STREAM_RECONNECT_BASE_MS);
    const max = clampDelay(STREAM_RECONNECT_MAX_MS);
    return Math.min(base * 2 ** (retries - 1), max);
  }

  private scheduleAccountRetry(publicKey: string): void {
    if (!this.missingAccountLogs.has(publicKey)) {
      logger.debug(`[payment-watcher] ${maskedKey(publicKey)} is not funded on Horizon yet; retrying activation check in ${Math.round(clampDelay(ACCOUNT_NOT_FOUND_RETRY_MS) / 1000)}s`);
      this.missingAccountLogs.add(publicKey);
    }
    this.scheduleReconnect(publicKey, clampDelay(ACCOUNT_NOT_FOUND_RETRY_MS));
  }

  private scheduleReconnect(publicKey: string, delayMs: number): void {
    if (this.reconnectTimers.has(publicKey)) return;
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(publicKey);
      void this.subscribe(publicKey);
    }, delayMs);
    timer.unref?.();
    this.reconnectTimers.set(publicKey, timer);
  }

  private closeStream(publicKey: string): void {
    const stream = this.streams.get(publicKey);
    if (!stream) return;
    try { (stream as any)(); } catch {}
    this.streams.delete(publicKey);
  }

  unsubscribe(publicKey: string): void {
    this.closeStream(publicKey);
    const timer = this.reconnectTimers.get(publicKey);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(publicKey);
    }
    this.pendingSubscribes.delete(publicKey);
    this.retryCounts.delete(publicKey);
    this.missingAccountLogs.delete(publicKey);
  }

  status(): { watching: number; addresses: string[]; reconnecting: number; reconnectingAddresses: string[]; pending: number } {
    const addresses = [...this.streams.keys()];
    const reconnectingAddresses = [...this.reconnectTimers.keys()];
    return {
      watching: addresses.length,
      addresses,
      reconnecting: reconnectingAddresses.length,
      reconnectingAddresses,
      pending: this.pendingSubscribes.size,
    };
  }
}

export const paymentWatcher = new PaymentWatcherService();
