import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

type EarlyAccessLocale = 'pt-BR' | 'en';

export type EarlyAccessSignupInput = {
  email?: string | null;
  locale?: string | null;
  source?: string | null;
  campaign?: string | null;
  referrer?: string | null;
  pageUrl?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type EarlyAccessSignupResult = {
  id: string | null;
  email: string;
  status: 'subscribed';
};

export class EarlyAccessSignupError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'EarlyAccessSignupError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeEmail(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeLocale(value?: string | null): EarlyAccessLocale {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english')) return 'en';
  return 'pt-BR';
}

function compactText(value: unknown, maxLength: number): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function safeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined && typeof item !== 'function')
      .slice(0, 24)
  );
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (message.includes('early_access_signups') && (
      message.includes('schema cache') ||
      message.includes('does not exist') ||
      message.includes('could not find the table')
    ))
  );
}

function isPermissionError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return (
    code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('insufficient privilege') ||
    message.includes('not authorized')
  );
}

function handleStorageError(error: any): never {
  logger.warn(`[early-access] storage error: ${String(error?.code || '')} ${String(error?.message || error)}`);
  if (isMissingTableError(error)) {
    throw new EarlyAccessSignupError(
      'EARLY_ACCESS_TABLE_MISSING',
      'Early access signup table was not found. Run the backend migrations in the Supabase project used by the backend.',
      500
    );
  }
  if (isPermissionError(error)) {
    throw new EarlyAccessSignupError(
      'EARLY_ACCESS_TABLE_INACCESSIBLE',
      'Early access signup storage is not accessible. Check the early_access_signups RLS policy and backend service role.',
      500
    );
  }
  throw error;
}

export class EarlyAccessSignupService {
  constructor(private readonly db: SupabaseClient = supabase as SupabaseClient) {}

  async subscribe(input: EarlyAccessSignupInput): Promise<EarlyAccessSignupResult> {
    const email = normalizeEmail(input.email);
    if (!looksLikeEmail(email)) {
      throw new EarlyAccessSignupError(
        'EARLY_ACCESS_EMAIL_INVALID',
        'Informe um e-mail válido para entrar na lista.',
        400
      );
    }

    const now = new Date().toISOString();
    const row = {
      email,
      status: 'subscribed',
      locale: normalizeLocale(input.locale),
      source: compactText(input.source, 80) || 'landing-reluca',
      campaign: compactText(input.campaign, 80),
      referrer: compactText(input.referrer, 300),
      page_url: compactText(input.pageUrl, 300),
      metadata_json: safeMetadata(input.metadata),
      last_subscribed_at: now,
      unsubscribed_at: null,
      updated_at: now,
    };

    const { data, error } = await this.db
      .from('early_access_signups')
      .upsert(row, { onConflict: 'email' })
      .select('id, email, status')
      .single();

    if (error) handleStorageError(error);

    return {
      id: data?.id || null,
      email: data?.email || email,
      status: 'subscribed',
    };
  }
}

export const earlyAccessSignupService = new EarlyAccessSignupService();
