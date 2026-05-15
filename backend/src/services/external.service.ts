import jwt from 'jsonwebtoken';
import { SupabaseClient } from '@supabase/supabase-js';
import { ExternalRepository } from '../repositories/external.repository';
import { ContactRepository } from '../api/repository/contact.repository';
import { v4 as uuidv4 } from 'uuid';
import { Keypair } from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { getAssetIssuer, normalizeAssetCode } from '../config/assets';
import crypto from 'crypto';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
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

function resolveBaseUrl(candidates: Array<string | undefined>, fallbackDev: string): string {
  const hostedBase = getHostedPublicFrontendBase();
  if (hostedBase) {
    logger.info(`[external-url] using hosted frontend base: ${hostedBase}`);
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
  };
}

function compactQuote(quote?: any) {
  if (!quote || typeof quote !== 'object') return null;
  return {
    sourceAmount: quote.sourceAmount || undefined,
    destinationAmount: quote.destinationAmount || undefined,
    networkFeeXlm: quote.networkFeeXlm || undefined,
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
    expiresInHours?: number;
    expiresAt?: string | Date | null;
  }): Promise<string> {
    const disabled = String(process.env.DISABLE_SHORT_LINKS || '').trim().toLowerCase();
    if (disabled === 'true' || disabled === '1') return input.url;

    const code = shortCodeFromToken(input.token, input.purpose);
    const hash = tokenHash(input.token);
    const explicitExpiresAt = normalizeExpiresAt(input.expiresAt);
    const expiresAt = (explicitExpiresAt || new Date(Date.now() + (input.expiresInHours || 24) * 60 * 60 * 1000)).toISOString();

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

  async resolveShortLink(code: string): Promise<string | null> {
    const normalized = String(code || '').trim();
    if (!normalized) return null;

    const { data, error } = await this.supabase
      .from('short_links')
      .select('url, expires_at')
      .eq('code', normalized)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.url) return null;
    const expiresAt = data.expires_at ? Date.parse(String(data.expires_at)) : 0;
    if (expiresAt && Number.isFinite(expiresAt) && expiresAt < Date.now()) return null;
    return String(data.url);
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

    if (!row) return null;

    // Placeholder rows can exist before onboarding is finalized.
    // Only consider account as existing when it is actually linked.
    const hasLinkedSession = Boolean(row.session_id);
    const hasLinkedUser = Boolean(row.user_id);
    if (!hasLinkedSession || !hasLinkedUser) return null;

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
      expiresInHours: 24,
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
    urlObj.searchParams.set('source', String(extra.source || provider).trim().toLowerCase());
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
    const expiresInHours = Math.max(1, Number(input.expiresInHours || 24));
    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: `${expiresInHours}h` });
    await this.registerLogoutConfirmation({
      token,
      sessionId: sessionId || null,
      userId: userId || null,
      provider: provider || null,
      providerUserId: providerUserId || null,
      expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000),
    });

    const url = new URL(`${getPaymentConfirmBase()}/logout`);
    url.searchParams.set('token', token);

    const expiresAt = new Date(Date.now() + Math.max(1, Number(input.expiresInHours || 24)) * 60 * 60 * 1000);
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
    expiresInHours?: number;
  }): Promise<string> {
    const expiresAt = new Date(Date.now() + Math.max(1, Number(input.expiresInHours || 24)) * 60 * 60 * 1000);
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
    const externalContext = await this.resolveExternalLinkContext(payload.session_id, payload.owner_id);

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
      ...externalContext,
      ...compactExtra(extra as Record<string, any>),
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
        expiresInHours: 24,
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
        expiresInHours: 24,
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
        expiresInHours: 24,
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
      quote: compactQuote(payload.quote),
      nonce: payload.nonce || uuidv4(),
      ...externalContext,
      ...compactedExtra,
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
      },
    });
    const longUrl = this.buildFrontendUrl('/confirm-conversion', token, externalContext);
    const url = await this.shortenFrontendUrl({
      token,
      url: longUrl,
      purpose: 'conversion_confirm',
      sessionId: payload.session_id,
      userId: payload.owner_id,
      expiresInHours: 24,
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
    nonce?: string;
  }, extra = {}) {
    const externalContext = await this.resolveExternalLinkContext(payload.session_id, payload.owner_id);
    return await this.createConversionConfirmUrl(payload, {
      ...extra,
      ...externalContext,
    });
  }

  private async resolveExternalLinkContext(sessionId?: string, userId?: string): Promise<ExternalLinkContext> {
    const session = String(sessionId || '').trim();
    const user = String(userId || '').trim();
    const selectContext = async (column: 'session_id' | 'user_id', value: string) => {
      if (!value) return null;
      const { data, error } = await this.supabase
        .from('external_accounts')
        .select('provider, provider_user_id')
        .eq(column, value)
        .order('provider', { ascending: true })
        .limit(20);

      if (error) {
        const message = String(error.message || '').toLowerCase();
        if (message.includes('external_accounts') || message.includes('schema cache') || message.includes('does not exist')) {
          return null;
        }
        throw error;
      }

      const rows = data || [];
      return rows.find((row: any) => String(row.provider || '').toLowerCase() === 'telegram') || rows[0] || null;
    };

    const row = await selectContext('session_id', session) || await selectContext('user_id', user);
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
