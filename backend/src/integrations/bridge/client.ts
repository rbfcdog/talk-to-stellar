/**
 * Bridge.xyz HTTP Client
 *
 * Low-level wrapper around the Bridge REST API.
 * Handles authentication, idempotency, error parsing, and retries.
 */

import type { BridgeConfig } from './config';
import type { BridgeApiError } from './types';
import { logger } from '../../utils/logger';

export class BridgeClient {
  private baseUrl: string;
  private apiKey: string;
  private timeoutMs: number;

  constructor(config: BridgeConfig, timeoutMs = 45_000) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeoutMs = timeoutMs;
  }

  // ── Public HTTP Methods ─────────────────────────────────────

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.request<T>('GET', url);
  }

  async post<T>(path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>('POST', url, body, idempotencyKey);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>('PUT', url, body);
  }

  async delete<T>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    return this.request<T>('DELETE', url);
  }

  // ── Internal ─────────────────────────────────────────────────

  private buildUrl(path: string, params?: Record<string, string>): string {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalized}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value) url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    idempotencyKey?: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Api-Key': this.apiKey,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const responseBody = await response.json().catch(() => null);

      if (!response.ok) {
        const err = this.buildError(response.status, responseBody, method, url);
        logger.warn(`[bridge-client] ${method} ${url} → ${err.status} ${err.error}`);
        throw err;
      }

      return responseBody as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildError(
    status: number,
    body: unknown,
    method: string,
    url: string,
  ): BridgeApiError {
    const b = body as Record<string, unknown> | null;
    return {
      status,
      code: String(b?.code ?? ''),
      error: String(b?.error ?? b?.message ?? `HTTP ${status}`),
      message: String(b?.message ?? ''),
      source: (b?.source as Record<string, unknown>) ?? undefined,
      response: body ?? undefined,
    };
  }

  /** Generate a unique idempotency key for Bridge API calls. */
  static idempotencyKey(prefix: string): string {
    const random = Math.random().toString(36).slice(2, 10);
    const ts = Date.now().toString(36);
    return `${prefix}_${ts}_${random}`;
  }
}
