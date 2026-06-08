import jwt from 'jsonwebtoken';
import { SupabaseClient } from '@supabase/supabase-js';
import { ExternalRepository, externalProviderAliases, isPhoneProvider, normalizeExternalProvider, normalizeExternalProviderUserId } from '../../repository/core/external.repository';
import { ContactRepository } from '../../repository/contact.repository';
import { v4 as uuidv4 } from 'uuid';
import { Keypair } from '@stellar/stellar-sdk';
import { logger } from '../../../utils/logger';
import { getAssetIssuer, normalizeAssetCode } from '../../../config/assets';
import crypto from 'crypto';
import { getRequiredJwtSecret } from '../../../config/secrets';

const SENSITIVE_SHORT_LINK_MAX_AGE_MS = 30 * 60 * 1000;
const PIX_RAMP_SHORT_LINK_MAX_AGE_MS = 90 * 60 * 1000;

type ShortLinkConfirmationState = {
  consumed: boolean;
  completed: boolean;
  expired: boolean;
  used: boolean;
  status: string;
};

function getJwtSecret() {
  return getRequiredJwtSecret();
}

function normalizeLanguage(value: unknown): 'pt-BR' | 'en' | '' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english')) return 'en';
  if (normalized === 'pt' || normalized === 'pt-br' || normalized.includes('portugu')) return 'pt-BR';
  return '';
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeExpiresAt(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function shortCodeFromToken(token: string, purpose: string): string {
  return crypto
    .createHash('sha256')
    .update(`${purpose}:${token}`)
    .digest('base64url')
    .slice(0, 10);
}

function shortCodeFromSeed(seed: string, purpose: string): string {
  return crypto
    .createHash('sha256')
    .update(`${purpose}:${seed}`)
    .digest('base64url')
    .slice(0, 12);
}

function sensitiveShortLinkMaxAgeMs(purpose: unknown): number {
  const normalized = String(purpose || '').trim().toLowerCase();
  if (!normalized) return 0;
  if (normalized.startsWith('pix_')) return PIX_RAMP_SHORT_LINK_MAX_AGE_MS;
  if ([
    'payment_confirm',
    'payment_claim',
    'conversion_confirm',
    'logout_confirm',
    'external_onboard',
    'external_login',
    'login_entry',
    'onboarding_generic',
    'balance_view',
    'transaction_history',
    'create_account_passkey_qr',
    'login_passkey_qr',
    'confirm_payment_passkey_qr',
  ].includes(normalized)) {
    return SENSITIVE_SHORT_LINK_MAX_AGE_MS;
  }
  return 0;
}

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(String(url || '').trim());
}

function ensureHttpProtocol(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getHostedPublicFrontendBase(): string {
  const explicitHosted =
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.CREATE_ACCOUNT_BASE ||
    process.env.PAYMENT_CONFIRM_BASE ||
    '';

  const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? ensureHttpProtocol(process.env.RAILWAY_PUBLIC_DOMAIN)
    : '';
  const renderUrl = process.env.RENDER_EXTERNAL_URL
    ? ensureHttpProtocol(process.env.RENDER_EXTERNAL_URL)
    : '';
  const vercelUrl = process.env.VERCEL_URL
    ? ensureHttpProtocol(process.env.VERCEL_URL)
    : '';

  const hosted = [explicitHosted, railwayUrl, renderUrl, vercelUrl]
    .map((value) => ensureHttpProtocol(String(value || '').trim()))
    .find((value) => value && !isLocalhostUrl(value));

  return hosted ? hosted.replace(/\/$/, '') : '';
}

function isHostedEnvironment(): boolean {
  return Boolean(
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.VERCEL_URL ||
    process.env.FLY_APP_NAME ||
    process.env.NODE_ENV === 'production'
  );
}

let loggedHostedFrontendBase = '';

function resolveBaseUrl(candidates: Array<string | undefined>, fallbackDev: string): string {
  const hostedBase = getHostedPublicFrontendBase();
  if (hostedBase) {
    if (loggedHostedFrontendBase !== hostedBase) {
      loggedHostedFrontendBase = hostedBase;
      logger.debug(`[external-url] using hosted frontend base: ${hostedBase}`);
    }
    return hostedBase;
  }

  const firstValid = candidates
    .map((value) => ensureHttpProtocol(String(value || '').trim()))
    .find((value) => value.length > 0);

  if (firstValid && !isLocalhostUrl(firstValid)) {
    return firstValid.replace(/\/$/, '');
  }

  if (firstValid && isLocalhostUrl(firstValid) && isHostedEnvironment()) {
    throw new Error(`Invalid frontend base URL for hosted environment: ${firstValid}`);
  }

  if (isHostedEnvironment()) {
    throw new Error('Frontend base URL is not configured for hosted environment');
  }

  if (firstValid && isLocalhostUrl(firstValid)) {
    return firstValid.replace(/\/$/, '');
  }

  return fallbackDev;
}

function getCreateAccountBase() {
  return resolveBaseUrl(
    [
      process.env.CREATE_ACCOUNT_BASE,
      process.env.FRONTEND_URL,
      process.env.PUBLIC_APP_URL,
    ],
    'http://localhost:3000'
  );
}

function getPaymentConfirmBase() {
  return resolveBaseUrl(
    [
      process.env.PAYMENT_CONFIRM_BASE,
      process.env.CREATE_ACCOUNT_BASE,
      process.env.FRONTEND_URL,
      process.env.PUBLIC_APP_URL,
    ],
    'http://localhost:3000'
  );
}

function isValidStellarPublicKey(value?: string) {
  if (!value) return false;
  try {
    Keypair.fromPublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}

function compactContact(contact?: Record<string, any>) {
  if (!contact || typeof contact !== 'object') return undefined;
  return {
    contact_name: contact.contact_name || contact.name || undefined,
    stellar_public_key: contact.stellar_public_key || contact.public_key || undefined,
    pix_key: contact.pix_key || contact.contact_profile?.pix_key || undefined,
    email: contact.email || contact.contact_profile?.email || undefined,
    phone_number: contact.phone_number || contact.phone || contact.contact_profile?.phone_number || contact.contact_profile?.phone || undefined,
    cpf: contact.cpf || contact.contact_profile?.cpf || undefined,
  };
}

function compactQuote(quote?: any) {
  if (!quote || typeof quote !== 'object') return null;
  return {
    sourceAmount: quote.sourceAmount || undefined,
    effectiveSourceAmount: quote.effectiveSourceAmount || undefined,
    sourceMax: quote.sourceMax || undefined,
    pathSourceAmount: quote.pathSourceAmount || undefined,
    pathSourceMax: quote.pathSourceMax || undefined,
    destinationAmount: quote.destinationAmount || undefined,
    destinationMin: quote.destinationMin || undefined,
    networkFeeXlm: quote.networkFeeXlm || undefined,
    platformFee: quote.platformFee
      ? {
          enabled: Boolean(quote.platformFee.enabled),
          feeAmount: quote.platformFee.feeAmount || undefined,
          feeAssetCode: quote.platformFee.feeAssetCode || undefined,
          grossSourceAmount: quote.platformFee.grossSourceAmount || undefined,
          netSourceAmount: quote.platformFee.netSourceAmount || undefined,
          treasuryPublicKey: quote.platformFee.treasuryPublicKey || undefined,
        }
      : undefined,
    fee_display: quote.fee_display || undefined,
    fee_usdc: quote.fee_usdc || undefined,
    fee_brl: quote.fee_brl || undefined,
    quote_issued_at: quote.quote_issued_at || quote.issued_at || undefined,
    quote_expires_at: quote.quote_expires_at || quote.expires_at || undefined,
    quote_ttl_seconds: quote.quote_ttl_seconds || quote.ttl_seconds || undefined,
    sourceAsset: quote.sourceAsset
      ? {
          code: quote.sourceAsset.code,
          issuer: quote.sourceAsset.issuer || undefined,
        }
      : undefined,
    destinationAsset: quote.destinationAsset
      ? {
          code: quote.destinationAsset.code,
          issuer: quote.destinationAsset.issuer || undefined,
        }
      : undefined,
    path: Array.isArray(quote.path)
      ? quote.path.map((asset: any) => ({
          code: asset.code || asset.asset_code || undefined,
          issuer: asset.issuer || asset.asset_issuer || undefined,
          type: asset.type || asset.asset_type || undefined,
        }))
      : [],
  };
}

function compactExtra(extra: Record<string, any>) {
  return Object.fromEntries(
    Object.entries({
      ...extra,
      quote: compactQuote((extra as any).quote),
    }).filter(([, value]) => value !== undefined && value !== null && (typeof value !== 'string' || value !== ''))
  );
}

type ExternalLinkContext = {
  provider?: string;
  provider_user_id?: string;
  source?: string;
};

function normalizeExternalSessionScope(value: unknown): 'whatsapp' | 'telegram' | '' {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('telegram')) return 'telegram';
  if (normalized.includes('whatsapp') || normalized.includes('evolution') || normalized === 'phone') return 'whatsapp';
  return '';
}

export class ExternalService {
  repo: ExternalRepository;
  supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.repo = new ExternalRepository(supabase);
  }

  private async shortenFrontendUrl(input: {
    token: string;
    url: string;
    purpose: string;
    sessionId?: string | null;
    userId?: string | null;
    expiresInMinutes?: number;
    expiresInHours?: number;
    expiresAt?: string | Date | null;
  }): Promise<string> {
    const disabled = String(process.env.DISABLE_SHORT_LINKS || '').trim().toLowerCase();
    if (disabled === 'true' || disabled === '1') return input.url;

    const code = shortCodeFromToken(input.token, input.purpose);
    const hash = tokenHash(input.token);
    const explicitExpiresAt = normalizeExpiresAt(input.expiresAt);
    const expiresInMinutes = Number(input.expiresInMinutes || 0);
    const expiresAt = (explicitExpiresAt || new Date(
      Date.now() + (
        Number.isFinite(expiresInMinutes) && expiresInMinutes > 0
          ? expiresInMinutes * 60 * 1000
          : (input.expiresInHours || 24) * 60 * 60 * 1000
      )
    )).toISOString();

    try {
      const { error } = await this.supabase
        .from('short_links')
        .upsert({
          code,
          url: input.url,
          purpose: input.purpose,
          token_hash: hash,
          session_id: input.sessionId || null,
          user_id: input.userId || null,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        }, { onConflict: 'code' });

      if (error) {
        logger.warn(`[short-links] could not persist short link: ${error.message}`);
        return input.url;
      }

      return `${getPaymentConfirmBase()}/r/${encodeURIComponent(code)}`;
    } catch (error) {
      logger.warn(`[short-links] failed to create short link: ${error instanceof Error ? error.message : String(error)}`);
      return input.url;
    }
  }

  private async shortenArbitraryUrl(input: {
    url: string;
    purpose: string;
    sessionId?: string | null;
    userId?: string | null;
    expiresAt?: string | Date | null;
  }): Promise<string> {
    const disabled = String(process.env.DISABLE_SHORT_LINKS || '').trim().toLowerCase();
    if (disabled === 'true' || disabled === '1') return input.url;

    const normalizedUrl = String(input.url || '').trim();
    if (!normalizedUrl) return input.url;

    const expiresAt = (normalizeExpiresAt(input.expiresAt) || new Date(Date.now() + 24 * 60 * 60 * 1000)).toISOString();
    const code = shortCodeFromSeed(`${input.purpose}:${normalizedUrl}`, input.purpose);

    try {
      const { error } = await this.supabase
        .from('short_links')
        .upsert({
          code,
          url: normalizedUrl,
          purpose: input.purpose,
          token_hash: null,
          session_id: input.sessionId || null,
          user_id: input.userId || null,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
        }, { onConflict: 'code' });

      if (error) {
        logger.warn(`[short-links] could not persist arbitrary short link: ${error.message}`);
        return normalizedUrl;
      }

      return `${getPaymentConfirmBase()}/r/${encodeURIComponent(code)}`;
    } catch (error) {
      logger.warn(`[short-links] failed to create arbitrary short link: ${error instanceof Error ? error.message : String(error)}`);
      return normalizedUrl;
    }
  }

  private async registerPaymentConfirmation(input: {
    token: string;
    sessionId?: string | null;
    userId?: string | null;
    destination: string;
    destinationName?: string | null;
    destinationContact?: any;
    amount: string;
    assetCode: string;
    details?: any;
    expiresAt?: string | Date | null;
  }): Promise<void> {
    const token_hash = tokenHash(input.token);
    const operationFingerprint = crypto
      .createHash('sha256')
      .update(`payment-confirmation:${token_hash}`)
      .digest('hex');
    const { error } = await this.supabase
      .from('payment_confirmations')
      .insert({
        token_hash,
        session_id: input.sessionId || null,
        user_id: input.userId || null,
        destination: input.destination,
        destination_name: input.destinationName || null,
        destination_contact: input.destinationContact || null,
        amount: input.amount,
        asset_code: input.assetCode,
        status: 'pending',
        used: false,
        used_at: null,
        operation_fingerprint: operationFingerprint,
        expires_at: normalizeExpiresAt(input.expiresAt)?.toISOString() || null,
        details: input.details || null,
        created_at: new Date().toISOString(),
      });

    if (error) {
      if (String(error.code || '') === '23505') return;
      throw new Error(`Não foi possível registrar o link de pagamento: ${error.message}`);
    }
  }

  async resolveShortLinkRecord(code: string): Promise<{
    url: string;
    purpose?: string | null;
    session_id?: string | null;
    user_id?: string | null;
    already_completed?: boolean;
    completed?: boolean;
    completion_status?: string | null;
  } | null> {
    const normalized = String(code || '').trim();
    if (!normalized) return null;

    const { data, error } = await this.supabase
      .from('short_links')
      .select('url, purpose, token_hash, session_id, user_id, expires_at, created_at')
      .eq('code', normalized)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.url) return null;
    const confirmationState = await this.shortLinkConfirmationState(data);
    const completedMoneyLink = this.isCompletedMoneyShortLink(data.purpose, confirmationState);
    const expiresAt = data.expires_at ? Date.parse(String(data.expires_at)) : 0;
    if (expiresAt && Number.isFinite(expiresAt) && expiresAt < Date.now() && !completedMoneyLink) return null;
    const sensitiveMaxAgeMs = sensitiveShortLinkMaxAgeMs(data.purpose);
    const createdAt = data.created_at ? Date.parse(String(data.created_at)) : 0;
    if (
      sensitiveMaxAgeMs > 0 &&
      createdAt &&
      Number.isFinite(createdAt) &&
      Date.now() - createdAt > sensitiveMaxAgeMs &&
      !completedMoneyLink
    ) {
      return null;
    }
    if (confirmationState.consumed && !completedMoneyLink) return null;
    return {
      url: String(data.url),
      purpose: data.purpose || null,
      session_id: data.session_id || null,
      user_id: data.user_id || null,
      already_completed: completedMoneyLink,
      completed: completedMoneyLink,
      completion_status: confirmationState.status || null,
    };
  }

  private confirmationTableForShortLinkPurpose(purpose: unknown): 'payment_confirmations' | 'logout_confirmations' | '' {
    const normalized = String(purpose || '').trim().toLowerCase();
    if (normalized === 'logout_confirm') return 'logout_confirmations';
    if (normalized === 'payment_confirm' || normalized === 'payment_claim' || normalized === 'conversion_confirm') {
      return 'payment_confirmations';
    }
    return '';
  }

  private tokenHashFromShortLinkData(data: any): string {
    const storedHash = String(data?.token_hash || '').trim();
    if (storedHash) return storedHash;

    try {
      const token = new URL(String(data?.url || '')).searchParams.get('token') || '';
      return token ? tokenHash(token) : '';
    } catch {
      return '';
    }
  }

  private isCompletedMoneyShortLink(purpose: unknown, state: ShortLinkConfirmationState): boolean {
    const normalized = String(purpose || '').trim().toLowerCase();
    if (!['payment_confirm', 'payment_claim', 'conversion_confirm'].includes(normalized)) return false;
    return Boolean(state.completed);
  }

  private async shortLinkConfirmationState(data: any): Promise<ShortLinkConfirmationState> {
    const table = this.confirmationTableForShortLinkPurpose(data?.purpose);
    const hash = this.tokenHashFromShortLinkData(data);
    const empty = { consumed: false, completed: false, expired: false, used: false, status: '' };
    if (!table || !hash) return empty;

    try {
      const { data: confirmation, error } = await this.supabase
        .from(table)
        .select('used, status, expires_at')
        .eq('token_hash', hash)
        .maybeSingle();

      if (error || !confirmation) return empty;
      const status = String((confirmation as any)?.status || '').trim().toLowerCase();
      const used = Boolean((confirmation as any)?.used);
      const failed = ['failed', 'failure', 'expired', 'cancelled', 'canceled', 'rejected'].includes(status);
      const completed = ['completed', 'claimed', 'success', 'succeeded'].includes(status) || (used && !failed);
      const expiresAt = (confirmation as any)?.expires_at ? Date.parse(String((confirmation as any).expires_at)) : 0;
      const expired = !completed && Boolean(expiresAt && Number.isFinite(expiresAt) && expiresAt < Date.now());
      return {
        consumed: used || completed || expired,
        completed,
        expired,
        used,
        status,
      };
    } catch (error) {
      logger.warn(`[short-links] could not check confirmation consumption: ${error instanceof Error ? error.message : String(error)}`);
      return empty;
    }
  }

  async expireShortLink(code: string): Promise<boolean> {
    const normalized = String(code || '').trim();
    if (!normalized) return false;

    try {
      const { error } = await this.supabase
        .from('short_links')
        .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
        .eq('code', normalized);

      if (error) {
        logger.warn(`[short-links] could not expire short link ${normalized}: ${error.message}`);
        return false;
      }
      return true;
    } catch (error) {
      logger.warn(`[short-links] failed to expire short link ${normalized}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  async resolveShortLink(code: string): Promise<string | null> {
    const record = await this.resolveShortLinkRecord(code);
    return record?.url || null;
  }

  private completedFinalizationLink(row: any): { sessionId: string; userId: string } {
    const status = String(row?.status || '').trim().toLowerCase();
    const completed = Boolean(row?.used) || status === 'completed';
    if (!completed) return { sessionId: '', userId: '' };
    const result = row?.result && typeof row.result === 'object' ? row.result : {};
    return {
      sessionId: String(row?.session_id || result.sessionId || result.session_id || '').trim(),
      userId: String(row?.user_id || result.userId || result.user_id || result.email || '').trim(),
    };
  }

  private async recoverExternalAccountFromFinalization(provider: string, providerUserId: string) {
    const normalizedProvider = normalizeExternalProvider(provider);
    const normalizedProviderUserId = normalizeExternalProviderUserId(normalizedProvider, providerUserId);
    const providers = isPhoneProvider(normalizedProvider)
      ? [normalizedProvider]
      : externalProviderAliases(normalizedProvider);
    if (!normalizedProviderUserId || providers.length === 0) return null;

    const { data, error } = await this.supabase
      .from('onboarding_finalizations')
      .select('session_id, user_id, used, status, result, updated_at')
      .in('provider', providers)
      .eq('provider_user_id', normalizedProviderUserId)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('onboarding_finalizations') || message.includes('schema cache') || message.includes('does not exist')) {
        return null;
      }
      throw error;
    }

    for (const item of data || []) {
      let { sessionId, userId } = this.completedFinalizationLink(item);
      if (!sessionId && !userId) continue;

      if (sessionId) {
        const { data: session } = await this.supabase
          .from('agent_sessions')
          .select('session_id, user_id, email')
          .eq('session_id', sessionId)
          .maybeSingle();
        if (session?.session_id) {
          sessionId = String(session.session_id);
          userId = userId || String(session.user_id || session.email || '').trim();
        }
      }

      if (!sessionId && userId) {
        let { data: latestSession } = await this.supabase
          .from('agent_sessions')
          .select('session_id, user_id, email')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!latestSession) {
          const retry = await this.supabase
            .from('agent_sessions')
            .select('session_id, user_id, email')
            .eq('email', userId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          latestSession = retry.data;
        }
        if (latestSession?.session_id) {
          sessionId = String(latestSession.session_id);
          userId = userId || String(latestSession.user_id || latestSession.email || '').trim();
        }
      }

      if (!sessionId || !userId) continue;

      const { data: recovered, error: upsertError } = await this.supabase
        .from('external_accounts')
        .upsert({
          provider: normalizedProvider,
          provider_user_id: normalizedProviderUserId,
          session_id: sessionId,
          user_id: userId,
          data: {
            recovered_from: 'onboarding_finalizations',
            recovered_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'provider,provider_user_id' })
        .select()
        .single();

      if (upsertError) throw upsertError;
      logger.info(`[external-account] recovered ${normalizedProvider}/${normalizedProviderUserId.slice(-6)} from onboarding finalization`);
      return recovered;
    }

    return null;
  }

  // Check if provider user exists; return account info or null
  async checkExternalAccount(provider: string, providerUserId: string) {
    let row;
    try {
      row = await this.repo.findByProviderAndId(provider, providerUserId);
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes("could not find the table 'public.external_accounts' in the schema cache") ||
          message.includes('relation "external_accounts" does not exist') ||
          message.includes('relation public.external_accounts does not exist')) {
        return null;
      }
      throw error;
    }

    if (!row) return await this.recoverExternalAccountFromFinalization(provider, providerUserId);

    // Placeholder rows can exist before onboarding is finalized.
    // Only consider account as existing when it is actually linked.
    const hasLinkedSession = Boolean(row.session_id);
    const hasLinkedUser = Boolean(row.user_id);
    if (!hasLinkedSession || !hasLinkedUser) {
      return await this.recoverExternalAccountFromFinalization(provider, providerUserId);
    }

    return row;
  }

  // Create a one-time JWT + URL to onboard the external user
  createOnboardUrl(provider: string, providerUserId: string, extra = {}) {
    const payload = {
      sub: 'external_onboard',
      provider,
      provider_user_id: providerUserId,
      nonce: uuidv4(),
      ...extra,
    };

    // 24 hours expiration
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });

    // Dynamic URL: frontend can read token and preserve the external-channel context.
    const urlObj = new URL(`${getCreateAccountBase()}/create-account`);
    urlObj.searchParams.set('token', token);
    urlObj.searchParams.set('provider', provider);
    urlObj.searchParams.set('provider_user_id', providerUserId);
    urlObj.searchParams.set('source', provider);
    const sessionScope = normalizeExternalSessionScope(provider);
    if (sessionScope) urlObj.searchParams.set('session_scope', sessionScope);
    const language = normalizeLanguage((extra as any)?.language || (extra as any)?.lang || (extra as any)?.locale);
    if (language) urlObj.searchParams.set('lang', language);
    const telegramChatId = String((extra as any)?.telegram_chat_id || (extra as any)?.chat_id || '').trim();
    if (telegramChatId) {
      urlObj.searchParams.set('telegram_chat_id', telegramChatId);
      urlObj.searchParams.set('chat_id', telegramChatId);
    }
    const url = urlObj.toString();

    return { token, url };
  }

  async createOnboardUrlWithShortLink(provider: string, providerUserId: string, extra = {}) {
    const { token, url: longUrl } = this.createOnboardUrl(provider, providerUserId, extra);
    const shortUrl = await this.shortenFrontendUrl({
      token,
      url: longUrl,
      purpose: 'external_onboard',
      expiresInMinutes: Number((extra as any).expires_in_minutes || (extra as any).expiresInMinutes || 15),
    });
    return { token, url: shortUrl, longUrl };
  }

  createLoginUrl(provider: string, providerUserId: string, extra: Record<string, any> = {}) {
    const sessionId = String(extra.session_id || extra.sessionId || '').trim();
    const userId = String(extra.user_id || extra.userId || '').trim();
    const tokenExtra = {
      ...extra,
      ...(sessionId ? { session_id: sessionId, sessionId } : {}),
      ...(userId ? { user_id: userId, userId } : {}),
    };
    const { token } = this.createOnboardUrl(provider, providerUserId, tokenExtra);
    const urlObj = new URL(`${getPaymentConfirmBase()}/login`);
    urlObj.searchParams.set('token', token);
    urlObj.searchParams.set('provider', provider);
    urlObj.searchParams.set('provider_user_id', providerUserId);
    const source = String(extra.source || provider).trim().toLowerCase();
    urlObj.searchParams.set('source', source);
    const sessionScope = normalizeExternalSessionScope(source || provider);
    if (sessionScope) urlObj.searchParams.set('session_scope', sessionScope);
    const language = normalizeLanguage(extra.language || extra.lang || extra.locale);
    if (language) urlObj.searchParams.set('lang', language);

    const nextPath = String(extra.next_path || extra.nextPath || '').trim();
    if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
      urlObj.searchParams.set('next', nextPath);
    }

    return { token, url: urlObj.toString() };
  }

  async createLoginUrlWithShortLink(provider: string, providerUserId: string, extra: Record<string, any> = {}) {
    const { token, url: longUrl } = this.createLoginUrl(provider, providerUserId, extra);
    const shortUrl = await this.shortenFrontendUrl({
      token,
      url: longUrl,
      purpose: 'external_login',
      sessionId: String(extra.session_id || extra.sessionId || '').trim() || null,
      userId: String(extra.user_id || extra.userId || '').trim() || null,
      expiresInMinutes: Number(extra.expires_in_minutes || extra.expiresInMinutes || 15),
      expiresInHours: Number(extra.expires_in_hours || extra.expiresInHours || 24),
    });
    return { token, url: shortUrl, longUrl };
  }

  async createLogoutUrl(input: {
    sessionId?: string;
    provider?: string;
    providerUserId?: string;
    source?: string;
    userId?: string;
    expiresInMinutes?: number;
    expiresInHours?: number;
  }): Promise<string> {
    const sessionId = String(input.sessionId || '').trim();
    const provider = String(input.provider || '').trim().toLowerCase();
    const providerUserId = String(input.providerUserId || '').trim();
    const source = String(input.source || provider || '').trim().toLowerCase();
    const userId = String(input.userId || '').trim();

    const payload = {
      sub: 'external_logout_confirm',
      session_id: sessionId || null,
      provider: provider || null,
      provider_user_id: providerUserId || null,
      source: source || null,
      nonce: uuidv4(),
    };
    const expiresInMinutes = Math.max(0, Number(input.expiresInMinutes || 0));
    const expiresInHours = Math.max(1, Number(input.expiresInHours || 24));
    const expiresMs = expiresInMinutes > 0 ? expiresInMinutes * 60 * 1000 : expiresInHours * 60 * 60 * 1000;
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: expiresInMinutes > 0 ? `${expiresInMinutes}m` : `${expiresInHours}h` });
    await this.registerLogoutConfirmation({
      token,
      sessionId: sessionId || null,
      userId: userId || null,
      provider: provider || null,
      providerUserId: providerUserId || null,
      expiresAt: new Date(Date.now() + expiresMs),
    });

    const url = new URL(`${getPaymentConfirmBase()}/logout`);
    url.searchParams.set('token', token);

    const expiresAt = new Date(Date.now() + expiresMs);
    return await this.shortenArbitraryUrl({
      url: url.toString(),
      purpose: 'logout_confirm',
      sessionId: sessionId || null,
      userId: userId || null,
      expiresAt,
    });
  }

  private async registerLogoutConfirmation(input: {
    token: string;
    sessionId?: string | null;
    userId?: string | null;
    provider?: string | null;
    providerUserId?: string | null;
    expiresAt?: string | Date | null;
  }): Promise<void> {
    const token_hash = tokenHash(input.token);
    const { error } = await this.supabase
      .from('logout_confirmations')
      .insert({
        token_hash,
        session_id: input.sessionId || null,
        user_id: input.userId || null,
        provider: input.provider || null,
        provider_user_id: input.providerUserId || null,
        status: 'pending',
        used: false,
        used_at: null,
        expires_at: normalizeExpiresAt(input.expiresAt)?.toISOString() || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      if (String(error.code || '') === '23505') return;
      throw new Error(`Não foi possível registrar o link de logout: ${error.message}`);
    }
  }

  async shortenPublicUrl(input: {
    url: string;
    purpose: string;
    sessionId?: string;
    userId?: string;
    expiresInMinutes?: number;
    expiresInHours?: number;
  }): Promise<string> {
    const expiresInMinutes = Number(input.expiresInMinutes || 0);
    const expiresAt = new Date(Date.now() + (
      Number.isFinite(expiresInMinutes) && expiresInMinutes > 0
        ? Math.max(1, expiresInMinutes) * 60 * 1000
        : Math.max(1, Number(input.expiresInHours || 24)) * 60 * 60 * 1000
    ));
    return await this.shortenArbitraryUrl({
      url: input.url,
      purpose: input.purpose,
      sessionId: input.sessionId || null,
      userId: input.userId || null,
      expiresAt,
    });
  }

  // Create a one-time JWT + URL to confirm a payment from an external channel
  async createPaymentConfirmUrl(payload: { amount: string; destination: string; destination_name?: string; destination_contact?: Record<string, any>; session_id?: string; owner_id?: string; asset_code?: string; asset_issuer?: string; nonce?: string }, extra = {}) {
    const assetCode = normalizeAssetCode(payload.asset_code || 'XLM');
    const assetIssuer = getAssetIssuer(assetCode, payload.asset_issuer);
    const compactedExtra = compactExtra(extra as Record<string, any>);
    const resolvedExternalContext = await this.resolveExternalLinkContext(payload.session_id, payload.owner_id);
    const explicitExternalContext = this.normalizeExternalLinkContext(compactedExtra);
    const externalContext = {
      ...resolvedExternalContext,
      ...explicitExternalContext,
    };
    const language = normalizeLanguage((extra as any)?.language || (extra as any)?.lang || (extra as any)?.locale);

    const tokenPayload = {
      sub: 'external_payment_confirm',
      amount: payload.amount,
      asset_code: assetCode,
      asset_issuer: assetIssuer || null,
      destination: payload.destination,
      destination_name: payload.destination_name,
      destination_contact: compactContact(payload.destination_contact),
      session_id: payload.session_id || null,
      owner_id: payload.owner_id || null,
      nonce: payload.nonce || uuidv4(),
      ...compactedExtra,
      ...externalContext,
    };

    const token = jwt.sign(tokenPayload, getJwtSecret(), { expiresIn: '24h' });

    // Resolve a public key and ALWAYS include it in the generated URL.
    const maybe = (v?: any) => (typeof v === 'string' ? String(v).trim() : '');
    const candidate1 = maybe(payload.destination);
    const candidate2 = maybe(payload.destination_contact && (payload.destination_contact.stellar_public_key || payload.destination_contact.public_key));

    let publicKeyForUrl: string | null = null;
    if (isValidStellarPublicKey(candidate1)) {
      publicKeyForUrl = candidate1;
    } else if (isValidStellarPublicKey(candidate2)) {
      publicKeyForUrl = candidate2;
    }

    // If not found yet, try resolving by destination_name + owner_id via contacts
    const lookupName = maybe(payload.destination_name || payload.destination);
    const ownerId = maybe(payload.owner_id || payload.session_id);

    const normalize = (value: string) =>
      value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const buildUrl = (pk: string) => this.buildFrontendUrl('/confirm-payment', token, externalContext, {
      public_key: pk,
      lang: language || undefined,
    });

    // If publicKeyForUrl already set, return synchronously
    if (publicKeyForUrl) {
      await this.registerPaymentConfirmation({
        token,
        sessionId: payload.session_id,
        userId: payload.owner_id,
        destination: publicKeyForUrl,
        destinationName: payload.destination_name || null,
        destinationContact: compactContact(payload.destination_contact),
        amount: payload.amount,
        assetCode,
        details: { purpose: 'payment_confirm' },
      });
      const longUrl = buildUrl(publicKeyForUrl);
      const url = await this.shortenFrontendUrl({
        token,
        url: longUrl,
        purpose: 'payment_confirm',
        sessionId: payload.session_id,
        userId: payload.owner_id,
        expiresInMinutes: 15,
      });
      return { token, url };
    }

    const resolveByOwner = async (): Promise<string | null> => {
      if (!lookupName || !ownerId) return null;
      try {
        const found = await ContactRepository.findByNameForOwner(ownerId, lookupName);
        if (found?.stellar_public_key && isValidStellarPublicKey(String(found.stellar_public_key).trim())) {
          return String(found.stellar_public_key).trim();
        }
      } catch (err) {
        // ignore owner lookup failures
      }
      return null;
    };

    const resolveByGlobalLookup = async (): Promise<string | null> => {
      if (!lookupName) return null;
      try {
        const { data: allContacts } = await this.supabase
          .from('contacts')
          .select('stellar_public_key, contact_name');

        const normalizedLookup = normalize(lookupName);
        const exactMatches = (allContacts || []).filter((contact: any) => {
          const contactName = String(contact.contact_name || '');
          return normalize(contactName) === normalizedLookup && contact.stellar_public_key;
        });

        if (exactMatches.length === 1) {
          const pk = String(exactMatches[0].stellar_public_key).trim();
          if (isValidStellarPublicKey(pk)) {
            return pk;
          }
        }
      } catch (err) {
        // ignore global lookup failures
      }
      return null;
    };

    const resolvedFromOwner = await resolveByOwner();
    if (resolvedFromOwner) {
      await this.registerPaymentConfirmation({
        token,
        sessionId: payload.session_id,
        userId: payload.owner_id,
        destination: resolvedFromOwner,
        destinationName: payload.destination_name || null,
        destinationContact: compactContact(payload.destination_contact),
        amount: payload.amount,
        assetCode,
        details: { purpose: 'payment_confirm' },
      });
      const longUrl = buildUrl(resolvedFromOwner);
      const url = await this.shortenFrontendUrl({
        token,
        url: longUrl,
        purpose: 'payment_confirm',
        sessionId: payload.session_id,
        userId: payload.owner_id,
        expiresInMinutes: 15,
      });
      return { token, url };
    }

    const resolvedGlobally = await resolveByGlobalLookup();
    if (resolvedGlobally) {
      await this.registerPaymentConfirmation({
        token,
        sessionId: payload.session_id,
        userId: payload.owner_id,
        destination: resolvedGlobally,
        destinationName: payload.destination_name || null,
        destinationContact: compactContact(payload.destination_contact),
        amount: payload.amount,
        assetCode,
        details: { purpose: 'payment_confirm' },
      });
      const longUrl = buildUrl(resolvedGlobally);
      const url = await this.shortenFrontendUrl({
        token,
        url: longUrl,
        purpose: 'payment_confirm',
        sessionId: payload.session_id,
        userId: payload.owner_id,
        expiresInMinutes: 15,
      });
      return { token, url };
    }

    throw new Error('createPaymentConfirmUrl: could not resolve destination public key automatically — include `destination` as a Stellar public key or provide `destination_contact` with `stellar_public_key` or call with owner_id + exact destination_name.');
  }

  async createClaimPaymentUrl(payload: {
    amount: string;
    recipient_name?: string;
    sender_name?: string;
    session_id: string;
    owner_id: string;
    asset_code?: string;
    asset_issuer?: string;
    destination_asset_code?: string;
    destination_asset_issuer?: string;
    nonce?: string;
    expires_at?: string;
  }, extra = {}) {
    const assetCode = normalizeAssetCode(payload.asset_code || 'USDC');
    const assetIssuer = getAssetIssuer(assetCode, payload.asset_issuer);
    const destinationAssetCode = normalizeAssetCode(payload.destination_asset_code || assetCode);
    const destinationAssetIssuer = getAssetIssuer(destinationAssetCode, payload.destination_asset_issuer);

    const requestedExpiry = normalizeExpiresAt(payload.expires_at);
    const minExpiryMs = Date.now() + 60 * 1000;
    if (requestedExpiry && requestedExpiry.getTime() < minExpiryMs) {
      throw new Error('A expiração do link deve ser de pelo menos 1 minuto no futuro.');
    }
    const defaultExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiresAt = requestedExpiry || defaultExpiry;
    const ttlSeconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));

    const tokenPayload = {
      sub: 'external_payment_claim',
      amount: payload.amount,
      asset_code: assetCode,
      asset_issuer: assetIssuer || null,
      source_amount: payload.amount,
      source_asset_code: assetCode,
      source_asset_issuer: assetIssuer || null,
      destination_asset_code: destinationAssetCode,
      destination_asset_issuer: destinationAssetIssuer || null,
      recipient_name: payload.recipient_name || null,
      sender_name: payload.sender_name || null,
      session_id: payload.session_id,
      owner_id: payload.owner_id,
      requires_recipient_login: true,
      expires_at: expiresAt.toISOString(),
      nonce: payload.nonce || uuidv4(),
      ...compactExtra(extra as Record<string, any>),
    };

    const token = jwt.sign(tokenPayload, getJwtSecret(), { expiresIn: ttlSeconds });
    await this.registerPaymentConfirmation({
      token,
      sessionId: payload.session_id,
      userId: payload.owner_id,
      destination: 'CLAIM_LINK_PENDING',
      destinationName: payload.recipient_name || null,
      amount: payload.amount,
      assetCode,
      expiresAt,
      details: {
        purpose: 'payment_claim',
        destination_asset_code: destinationAssetCode,
        destination_asset_issuer: destinationAssetIssuer || null,
        expires_at: expiresAt.toISOString(),
      },
    });
    const base = getPaymentConfirmBase();
    const longUrl = `${base}/claim-payment?token=${encodeURIComponent(token)}`;
    const url = await this.shortenFrontendUrl({
      token,
      url: longUrl,
      purpose: 'payment_claim',
      sessionId: payload.session_id,
      userId: payload.owner_id,
      expiresAt,
    });

    return { token, url, expires_at: expiresAt.toISOString() };
  }

  async createConversionConfirmUrl(payload: {
    session_id: string;
    owner_id?: string;
    source_amount?: string;
    source_asset_code: string;
    source_asset_issuer?: string;
    dest_amount: string;
    dest_asset_code: string;
    dest_asset_issuer?: string;
    quote?: any;
    conversion_mode?: 'strict_send' | 'strict_receive' | string;
    nonce?: string;
  }, extra = {}) {
    const sourceAssetCode = normalizeAssetCode(payload.source_asset_code || 'XLM');
    const destAssetCode = normalizeAssetCode(payload.dest_asset_code || 'XLM');
    const sourceAssetIssuer = getAssetIssuer(sourceAssetCode, payload.source_asset_issuer);
    const destAssetIssuer = getAssetIssuer(destAssetCode, payload.dest_asset_issuer);

    const compactedExtra = compactExtra(extra as Record<string, any>);
    const externalContext = this.normalizeExternalLinkContext(compactedExtra);

    const tokenPayload = {
      sub: 'external_conversion_confirm',
      session_id: payload.session_id,
      owner_id: payload.owner_id || null,
      source_amount: payload.source_amount || null,
      source_asset_code: sourceAssetCode,
      source_asset_issuer: sourceAssetIssuer || null,
      dest_amount: payload.dest_amount,
      dest_asset_code: destAssetCode,
      dest_asset_issuer: destAssetIssuer || null,
      conversion_mode: payload.conversion_mode || (payload.source_amount ? 'strict_send' : 'strict_receive'),
      quote: compactQuote(payload.quote),
      nonce: payload.nonce || uuidv4(),
      ...compactedExtra,
      ...externalContext,
    };

    const token = jwt.sign(tokenPayload, getJwtSecret(), { expiresIn: '24h' });
    await this.registerPaymentConfirmation({
      token,
      sessionId: payload.session_id,
      userId: payload.owner_id,
      destination: 'CONVERSION_SELF',
      destinationName: null,
      amount: payload.dest_amount,
      assetCode: destAssetCode,
      details: {
        purpose: 'conversion_confirm',
        source_amount: payload.source_amount || null,
        source_asset_code: sourceAssetCode,
        source_asset_issuer: sourceAssetIssuer || null,
        dest_amount: payload.dest_amount,
        dest_asset_code: destAssetCode,
        dest_asset_issuer: destAssetIssuer || null,
        conversion_mode: payload.conversion_mode || (payload.source_amount ? 'strict_send' : 'strict_receive'),
      },
    });
    const returnTo = String((compactedExtra as any).return_to || (compactedExtra as any).returnTo || '').trim();
    const returnSource = String(
      (compactedExtra as any).return_source ||
      (compactedExtra as any).returnSource ||
      (compactedExtra as any).from ||
      ''
    ).trim();
    const longUrl = this.buildFrontendUrl('/confirm-conversion', token, externalContext, {
      return_to: returnTo,
      from: returnSource,
      return_source: returnSource,
    });
    const url = await this.shortenFrontendUrl({
      token,
      url: longUrl,
      purpose: 'conversion_confirm',
      sessionId: payload.session_id,
      userId: payload.owner_id,
      expiresInMinutes: 15,
    });

    return { token, url };
  }

  async createConversionConfirmUrlWithContext(payload: {
    session_id: string;
    owner_id?: string;
    source_amount?: string;
    source_asset_code: string;
    source_asset_issuer?: string;
    dest_amount: string;
    dest_asset_code: string;
    dest_asset_issuer?: string;
    quote?: any;
    conversion_mode?: 'strict_send' | 'strict_receive' | string;
    nonce?: string;
  }, extra = {}) {
    const externalContext = await this.resolveExternalLinkContext(payload.session_id, payload.owner_id);
    return await this.createConversionConfirmUrl(payload, {
      ...externalContext,
      ...extra,
    });
  }

  private async resolveExternalLinkContext(sessionId?: string, userId?: string): Promise<ExternalLinkContext> {
    const session = String(sessionId || '').trim();
    const user = String(userId || '').trim();
    const selectContextRows = async (column: 'session_id' | 'user_id', value: string): Promise<any[]> => {
      if (!value) return [];
      const { data, error } = await this.supabase
        .from('external_accounts')
        .select('provider, provider_user_id')
        .eq(column, value)
        .order('provider', { ascending: true })
        .limit(20);

      if (error) {
        const message = String(error.message || '').toLowerCase();
        if (message.includes('external_accounts') || message.includes('schema cache') || message.includes('does not exist')) {
          return [];
        }
        throw error;
      }

      return Array.isArray(data) ? data : [];
    };

    const pickDeliveryContext = (rows: any[]) => {
      const priority = ['whatsapp', 'phone', 'evolution', 'whatsapp_evolution', 'telegram'];
      return priority
        .map((provider) => rows.find((row: any) => String(row.provider || '').toLowerCase() === provider))
        .find(Boolean) || null;
    };

    const sessionRows = await selectContextRows('session_id', session);
    const userRows = await selectContextRows('user_id', user);
    const row =
      pickDeliveryContext(sessionRows) ||
      pickDeliveryContext(userRows) ||
      sessionRows[0] ||
      userRows[0] ||
      null;

    return this.normalizeExternalLinkContext(row || {});
  }

  private normalizeExternalLinkContext(input: Record<string, any>): ExternalLinkContext {
    const provider = String(input.provider || '').trim().toLowerCase();
    const providerUserId = String(input.provider_user_id || input.providerUserId || '').trim();
    if (!provider || !providerUserId) return {};
    return {
      provider,
      provider_user_id: providerUserId,
      source: String(input.source || provider).trim().toLowerCase(),
    };
  }

  private buildFrontendUrl(path: string, token: string, context: ExternalLinkContext = {}, extraParams: Record<string, string | undefined> = {}) {
    const url = new URL(`${getPaymentConfirmBase()}${path}`);
    url.searchParams.set('token', token);
    for (const [key, value] of Object.entries(extraParams)) {
      if (value) url.searchParams.set(key, value);
    }
    if (context.provider) url.searchParams.set('provider', context.provider);
    if (context.provider_user_id) url.searchParams.set('provider_user_id', context.provider_user_id);
    if (context.source) url.searchParams.set('source', context.source);
    const sessionScope = normalizeExternalSessionScope(context.source || context.provider);
    if (sessionScope) url.searchParams.set('session_scope', sessionScope);
    return url.toString();
  }

  // Create mapping row for external account (optional pre-provision)
  async provisionExternalAccount(provider: string, providerUserId: string, userId?: string) {
    const sessionId = uuidv4();
    const row = await this.repo.createMapping({
      provider,
      provider_user_id: providerUserId,
      session_id: sessionId,
      user_id: userId || null,
    });
    return row;
  }
}

export default ExternalService;
