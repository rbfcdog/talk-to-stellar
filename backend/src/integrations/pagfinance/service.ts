/**
 * PagFinance Service
 *
 * Domain layer over the client: lazy user provisioning (create + KYC
 * override), per-pubkey JWT cache, cash-in quote/intent operations, and
 * partner webhook-config management. Auto-disables when required env is
 * missing so the app boots cleanly without credentials.
 */

import { loadPagfinanceConfig, validatePagfinanceConfig, type PagfinanceConfig } from './config';
import { PagfinanceClient } from './client';
import { verifyWebhookSignature } from './hmac';
import {
  PagfinanceApiError,
  type CashinIntent,
  type CashinQuote,
  type CreateCashinIntentInput,
  type PagfinanceEnvelope,
  type PagfinanceTokenData,
  type PagfinanceUser,
  type PagfinanceUserProfile,
  type WebhookConfig,
} from './types';
import { logger } from '../../utils/logger';

const JWT_REFRESH_MARGIN_MS = 60_000;

interface CachedJwt {
  token: string;
  expiresAtMs: number;
}

export class PagfinanceService {
  private readonly config: PagfinanceConfig;
  private readonly client: PagfinanceClient;
  private readonly disabledReason: string | null;
  private readonly provisionedPubkeys = new Set<string>();
  private readonly jwtCache = new Map<string, CachedJwt>();

  constructor(config?: PagfinanceConfig, client?: PagfinanceClient) {
    this.config = config ?? loadPagfinanceConfig();
    const missing = validatePagfinanceConfig(this.config);
    if (missing.length > 0) {
      this.disabledReason = `missing env: ${missing.join(', ')}`;
    } else if (!this.config.enabled) {
      this.disabledReason = 'PAGFINANCE_ENABLED is not true';
    } else {
      this.disabledReason = null;
    }
    this.client = client ?? new PagfinanceClient(this.config);
  }

  get enabled(): boolean {
    return this.disabledReason === null;
  }

  get settings(): PagfinanceConfig {
    return this.config;
  }

  /** Throws a clear error when the integration is not configured. */
  private assertEnabled(): void {
    if (!this.enabled) {
      throw new Error(`PagFinance integration is disabled (${this.disabledReason})`);
    }
  }

  // ── User provisioning ────────────────────────────────────────

  /**
   * Ensure the pubkey exists on PagFinance with KYC level 1 APPROVED.
   * Creation is idempotent by pubkey (CONFLICT counts as success).
   */
  async ensureUser(pubkey: string, profile?: PagfinanceUserProfile): Promise<void> {
    this.assertEnabled();
    if (this.provisionedPubkeys.has(pubkey)) return;

    try {
      await this.client.post<PagfinanceEnvelope<PagfinanceUser>>('/api/v1/users', 'hmac', {
        pubkey,
        ...(profile?.name ? { name: profile.name } : {}),
        ...(profile?.email ? { email: profile.email } : {}),
        ...(profile?.phone ? { phone: profile.phone } : {}),
        ...(profile?.taxId ? { taxId: profile.taxId } : {}),
      });
    } catch (err) {
      const conflict = err instanceof PagfinanceApiError && (err.status === 409 || err.code === 'CONFLICT');
      if (!conflict) throw err;
    }

    await this.client.patch<PagfinanceEnvelope<unknown>>(`/api/v1/users/${pubkey}/kyc`, 'hmac', {
      kycLevel: 1,
      kycStatus: 'APPROVED',
    });
    this.provisionedPubkeys.add(pubkey);
  }

  // ── JWT ──────────────────────────────────────────────────────

  /**
   * Mint (or reuse) the end-user JWT for a pubkey. Recovers once from
   * USER_NOT_FOUND / INSUFFICIENT_KYC by provisioning and retrying.
   */
  async getUserJwt(pubkey: string): Promise<string> {
    this.assertEnabled();
    const cached = this.jwtCache.get(pubkey);
    if (cached && cached.expiresAtMs - JWT_REFRESH_MARGIN_MS > Date.now()) {
      return cached.token;
    }

    try {
      return await this.mintJwt(pubkey);
    } catch (err) {
      const recoverable =
        err instanceof PagfinanceApiError &&
        (err.code === 'USER_NOT_FOUND' || err.code === 'INSUFFICIENT_KYC' || err.status === 404);
      if (!recoverable) throw err;
      this.provisionedPubkeys.delete(pubkey);
      await this.ensureUser(pubkey);
      return await this.mintJwt(pubkey);
    }
  }

  private async mintJwt(pubkey: string): Promise<string> {
    const res = await this.client.post<PagfinanceEnvelope<PagfinanceTokenData>>('/api/v1/auth/token', 'hmac', {
      pubkey,
      expiresIn: `${this.config.jwtTtlSeconds}s`,
    });
    const token = res.data?.token;
    if (!token) throw new Error('PagFinance token response missing data.token');
    this.jwtCache.set(pubkey, {
      token,
      expiresAtMs: Date.now() + this.config.jwtTtlSeconds * 1000,
    });
    return token;
  }

  // ── Cash-in ──────────────────────────────────────────────────

  async createQuote(pubkey: string, input: { amount: number; assetId?: number; externalId?: string }): Promise<CashinQuote> {
    const token = await this.getUserJwt(pubkey);
    const res = await this.client.post<PagfinanceEnvelope<CashinQuote>>(
      '/api/v1/cashin/quote',
      { bearer: token },
      { amount: input.amount, fiatCurrency: 'brl', ...(input.assetId ? { assetId: input.assetId } : {}), ...(input.externalId ? { externalId: input.externalId } : {}) },
    );
    return res.data;
  }

  async createIntent(pubkey: string, input: CreateCashinIntentInput, idempotencyKey: string): Promise<CashinIntent> {
    const token = await this.getUserJwt(pubkey);
    const res = await this.client.post<PagfinanceEnvelope<CashinIntent>>(
      '/api/v1/cashin/intent',
      { bearer: token },
      input,
      idempotencyKey,
    );
    return res.data;
  }

  async getIntent(pubkey: string, intentId: string): Promise<CashinIntent> {
    const token = await this.getUserJwt(pubkey);
    const res = await this.client.get<PagfinanceEnvelope<CashinIntent>>(
      `/api/v1/cashin/intent/${encodeURIComponent(intentId)}`,
      { bearer: token },
    );
    return res.data;
  }

  async listIntents(pubkey: string, opts: { limit?: number; cursor?: string } = {}): Promise<CashinIntent[]> {
    const token = await this.getUserJwt(pubkey);
    const res = await this.client.get<PagfinanceEnvelope<CashinIntent[]>>('/api/v1/cashin/intents', { bearer: token }, {
      limit: opts.limit ? String(opts.limit) : undefined,
      cursor: opts.cursor,
    });
    return res.data ?? [];
  }

  // ── Webhook config (partner-level) ───────────────────────────

  async registerWebhookConfig(url: string, events: string[] = ['CASHIN_COMPLETED']): Promise<WebhookConfig> {
    this.assertEnabled();
    const res = await this.client.post<PagfinanceEnvelope<WebhookConfig>>('/api/v1/partners/me/webhook-config', 'hmac', {
      url,
      events,
    });
    return res.data;
  }

  async getWebhookConfig(): Promise<WebhookConfig | null> {
    this.assertEnabled();
    const res = await this.client.get<PagfinanceEnvelope<WebhookConfig | null>>('/api/v1/partners/me/webhook-config', 'hmac');
    return res.data ?? null;
  }

  // ── Webhook verification ─────────────────────────────────────

  /** Verify an inbound webhook signature over the RAW body bytes. */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined | null): boolean {
    if (!this.config.webhookSecret) return false;
    return verifyWebhookSignature(rawBody, signatureHeader, this.config.webhookSecret);
  }
}

/** Singleton instance, lazily initialized. */
let _instance: PagfinanceService | null = null;

export function getPagfinanceService(): PagfinanceService {
  if (!_instance) {
    _instance = new PagfinanceService();
  }
  return _instance;
}

/** Initialize the PagFinance service at startup. */
export function initPagfinanceService(): PagfinanceService {
  _instance = new PagfinanceService();
  if (_instance.enabled) {
    logger.info(`[pagfinance] enabled base_url=${_instance.settings.baseUrl}`);
  } else {
    logger.info('[pagfinance] disabled (missing env or PAGFINANCE_ENABLED != true)');
  }
  return _instance;
}
