/**
 * PagFinance HTTP Client
 *
 * Thin wrapper over the REST API with HMAC/Bearer auth, per-attempt request
 * re-signing (fresh timestamp + nonce — nonces are single-use server-side),
 * timeouts, and real retry/backoff:
 *
 *   - network errors / timeouts and 502/503/504 are retryable
 *   - 429 is retryable honoring `retryAfter` from the body (capped)
 *   - POST/PATCH/DELETE are retried ONLY when an Idempotency-Key was sent
 *   - deterministic 4xx never retries
 *
 * The body is serialized exactly once; the same string is hashed for the
 * signature and put on the wire (the server hashes a normalized
 * JSON.stringify of the raw body, so compact JSON round-trips identically).
 */

import crypto from 'crypto';
import type { PagfinanceConfig } from './config';
import { PagfinanceApiError } from './types';
import { buildAuthorizationHeader, deriveSigningKey } from './hmac';
import { logger } from '../../utils/logger';

export type PagfinanceAuth = 'hmac' | { bearer: string };

export interface PagfinanceRequestOptions {
  body?: unknown;
  auth: PagfinanceAuth;
  idempotencyKey?: string;
  query?: Record<string, string | undefined>;
}

interface ClientHooks {
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  nowFn?: () => number;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [500, 1_500, 4_000];
const RETRY_AFTER_CAP_MS = 15_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export class PagfinanceClient {
  private readonly config: PagfinanceConfig;
  private readonly signingKey: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly nowFn: () => number;

  constructor(config: PagfinanceConfig, hooks: ClientHooks = {}) {
    this.config = config;
    this.signingKey = deriveSigningKey(config.rawSecret, config.partnerId);
    this.fetchFn = hooks.fetchFn ?? fetch;
    this.sleepFn = hooks.sleepFn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.nowFn = hooks.nowFn ?? Date.now;
  }

  async get<T>(path: string, auth: PagfinanceAuth, query?: Record<string, string | undefined>): Promise<T> {
    return this.request<T>('GET', path, { auth, query });
  }

  async post<T>(path: string, auth: PagfinanceAuth, body?: unknown, idempotencyKey?: string): Promise<T> {
    return this.request<T>('POST', path, { auth, body, idempotencyKey });
  }

  async patch<T>(path: string, auth: PagfinanceAuth, body?: unknown, idempotencyKey?: string): Promise<T> {
    return this.request<T>('PATCH', path, { auth, body, idempotencyKey });
  }

  async delete<T>(path: string, auth: PagfinanceAuth): Promise<T> {
    return this.request<T>('DELETE', path, { auth });
  }

  async request<T>(method: string, path: string, options: PagfinanceRequestOptions): Promise<T> {
    const upperMethod = method.toUpperCase();
    // Serialize ONCE — this exact string is signed and sent.
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : '';
    const url = this.buildUrl(path, options.query);
    const canRetryMethod = upperMethod === 'GET' || Boolean(options.idempotencyKey);

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.attempt<T>(upperMethod, path, url, bodyStr, options);
      } catch (err) {
        lastError = err;
        const delayMs = this.retryDelayMs(err, attempt, canRetryMethod);
        if (delayMs === null || attempt === MAX_ATTEMPTS) throw err;
        logger.warn(
          `[pagfinance-client] ${upperMethod} ${path} attempt ${attempt} failed (${describeError(err)}); retrying in ${delayMs}ms`,
        );
        await this.sleepFn(delayMs);
      }
    }
    throw lastError;
  }

  /** Unique idempotency key for money-creating POSTs (8..200 chars). */
  static idempotencyKey(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID()}`;
  }

  // ── Internal ─────────────────────────────────────────────────

  private async attempt<T>(
    method: string,
    path: string,
    url: string,
    bodyStr: string,
    options: PagfinanceRequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.auth === 'hmac') {
      // Fresh timestamp + nonce per attempt: nonces are single-use server-side.
      headers['Authorization'] = buildAuthorizationHeader({
        partnerId: this.config.partnerId,
        signingKey: this.signingKey,
        method,
        path,
        timestampSec: Math.floor(this.nowFn() / 1000),
        nonce: crypto.randomUUID(),
        body: bodyStr,
      });
    } else {
      headers['Authorization'] = `Bearer ${options.auth.bearer}`;
    }
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetchFn(url, {
        method,
        headers,
        body: bodyStr || undefined,
        signal: controller.signal,
      });
      const responseBody = await response.json().catch(() => null);
      if (!response.ok) throw this.buildError(response.status, responseBody);
      return responseBody as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.config.baseUrl}${normalized}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value) url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private buildError(status: number, body: unknown): PagfinanceApiError {
    const b = body as Record<string, unknown> | null;
    const retryAfterRaw = Number(b?.retryAfter);
    return new PagfinanceApiError({
      status,
      code: typeof b?.code === 'string' ? b.code : '',
      message: typeof b?.error === 'string' ? b.error : typeof b?.message === 'string' ? b.message : `HTTP ${status}`,
      retryAfter: Number.isFinite(retryAfterRaw) && retryAfterRaw > 0 ? retryAfterRaw : undefined,
      response: body ?? undefined,
    });
  }

  /** Returns the delay before the next attempt, or null when not retryable. */
  private retryDelayMs(err: unknown, attempt: number, canRetryMethod: boolean): number | null {
    if (!canRetryMethod) return null;
    const backoff = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)] + Math.floor(Math.random() * 250);

    if (err instanceof PagfinanceApiError) {
      if (err.status === 429) {
        const fromServer = (err.retryAfter ?? 0) * 1000;
        return Math.min(Math.max(fromServer, backoff), RETRY_AFTER_CAP_MS);
      }
      return RETRYABLE_STATUSES.has(err.status) ? backoff : null;
    }
    // Network error / abort — retryable.
    return backoff;
  }
}

function describeError(err: unknown): string {
  if (err instanceof PagfinanceApiError) return `${err.status} ${err.code || err.message}`;
  return err instanceof Error ? err.message : String(err);
}
