import jwt from 'jsonwebtoken';
import { SupabaseClient } from '@supabase/supabase-js';
import { ExternalRepository } from '../repositories/external.repository';
import { ContactRepository } from '../api/repository/contact.repository';
import { v4 as uuidv4 } from 'uuid';
import { Keypair } from '@stellar/stellar-sdk';
import { logger } from '../utils/logger';
import { getAssetIssuer, normalizeAssetCode } from '../config/assets';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
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

export class ExternalService {
  repo: ExternalRepository;
  supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
    this.repo = new ExternalRepository(supabase);
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
    if (!hasLinkedSession || !hasLinkedUser) {
      return null;
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

    // Dynamic URL: frontend can read token and complete onboarding flow
    const url = `${getCreateAccountBase()}/create-account?token=${encodeURIComponent(token)}`;

    return { token, url };
  }

  // Create a one-time JWT + URL to confirm a payment from an external channel
  createPaymentConfirmUrl(payload: { amount: string; destination: string; destination_name?: string; destination_contact?: Record<string, any>; session_id?: string; owner_id?: string; asset_code?: string; asset_issuer?: string; nonce?: string }, extra = {}) {
    const assetCode = normalizeAssetCode(payload.asset_code || 'XLM');
    const assetIssuer = getAssetIssuer(assetCode, payload.asset_issuer);

    const tokenPayload = {
      sub: 'external_payment_confirm',
      amount: payload.amount,
      asset_code: assetCode,
      asset_issuer: assetIssuer || null,
      destination: payload.destination,
      destination_name: payload.destination_name,
      destination_contact: payload.destination_contact,
      session_id: payload.session_id || null,
      owner_id: payload.owner_id || null,
      nonce: payload.nonce || uuidv4(),
      ...extra,
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

    const base = getPaymentConfirmBase();

    const tryResolveFromOwner = async (): Promise<string | null> => {
      if (!lookupName || !ownerId) return null;
      try {
        const found = await ContactRepository.findByNameForOwner(ownerId, lookupName);
        if (found?.stellar_public_key && isValidStellarPublicKey(String(found.stellar_public_key).trim())) {
          return String(found.stellar_public_key).trim();
        }
      } catch (err) {
        // ignore
      }
      return null;
    };

    const tryResolveGlobal = async (): Promise<string | null> => {
      if (!lookupName) return null;
      try {
        const { data: allContacts } = await this.supabase
          .from('contacts')
          .select('stellar_public_key, contact_name');

        const normalizedLookup = normalize(lookupName || '');
        const exactMatches = (allContacts || []).filter((c: any) => {
          const cName = String(c.contact_name || '');
          return normalize(cName) === normalizedLookup && c.stellar_public_key;
        });

        if (exactMatches.length === 1) {
          const pk = String(exactMatches[0].stellar_public_key).trim();
          if (isValidStellarPublicKey(pk)) return pk;
        }
      } catch (err) {
        // ignore
      }
      return null;
    };

    const buildUrl = (pk: string) => `${base}/confirm-payment?token=${encodeURIComponent(token)}&public_key=${encodeURIComponent(pk)}`;

    // If publicKeyForUrl already set, return synchronously
    if (publicKeyForUrl) {
      return { token, url: buildUrl(publicKeyForUrl) };
    }

    // Otherwise we need to resolve asynchronously — but this function is synchronous
    // To keep API, we will attempt a best-effort synchronous resolve via direct contact lookup using Supabase is async,
    // so we will fallback to throwing and require callers to pass public_key or destination_contact with public key.
    throw new Error('createPaymentConfirmUrl: could not resolve destination public key automatically — include `destination` as a Stellar public key or provide `destination_contact` with `stellar_public_key` or call with owner_id + exact destination_name.');
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
