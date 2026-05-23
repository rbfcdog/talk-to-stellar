import { SupabaseClient } from '@supabase/supabase-js';

export interface ExternalAccountRow {
  id: number;
  provider: string;
  provider_user_id: string;
  session_id?: string | null;
  user_id?: string | null;
  data?: Record<string, unknown>;
  created_at?: string;
}

export function normalizeExternalProvider(provider: string): string {
  return String(provider || '').trim().toLowerCase();
}

export function isPhoneProvider(provider: string): boolean {
  const normalizedProvider = normalizeExternalProvider(provider);
  return normalizedProvider === 'whatsapp' || normalizedProvider === 'phone';
}

export function normalizeExternalProviderUserId(provider: string, providerUserId: string): string {
  const raw = String(providerUserId || '').trim();
  if (isPhoneProvider(provider)) {
    return raw.replace(/\D+/g, '');
  }
  return raw;
}

export function externalProviderAliases(provider: string): string[] {
  const normalizedProvider = normalizeExternalProvider(provider);
  if (!isPhoneProvider(normalizedProvider)) {
    return normalizedProvider ? [normalizedProvider] : [];
  }
  return ['whatsapp', 'phone'];
}

export class ExternalRepository {
  supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async findByProviderAndId(provider: string, providerUserId: string): Promise<ExternalAccountRow | null> {
    const normalizedProvider = normalizeExternalProvider(provider);
    const normalizedProviderUserId = normalizeExternalProviderUserId(normalizedProvider, providerUserId);
    const providers = externalProviderAliases(normalizedProvider);
    if (!normalizedProviderUserId || providers.length === 0) return null;

    const { data, error } = await this.supabase
      .from('external_accounts')
      .select('*')
      .in('provider', providers)
      .eq('provider_user_id', normalizedProviderUserId)
      .order('id', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    const rows = (data || []) as ExternalAccountRow[];
    if (rows.length === 0) return null;

    return (
      rows.find((row) => String(row.provider || '').toLowerCase() === normalizedProvider) ||
      rows.find((row) => Boolean(row.session_id) && Boolean(row.user_id)) ||
      rows[0]
    );
  }

  async createMapping(payload: Partial<ExternalAccountRow>) {
    const normalizedProvider = normalizeExternalProvider(String(payload.provider || ''));
    const normalizedPayload = {
      ...payload,
      provider: normalizedProvider,
      provider_user_id: normalizeExternalProviderUserId(normalizedProvider, String(payload.provider_user_id || '')),
    };
    const { data, error } = await this.supabase
      .from('external_accounts')
      .upsert(normalizedPayload, { onConflict: 'provider,provider_user_id' })
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data as ExternalAccountRow;
  }

  async linkSession(provider: string, providerUserId: string, sessionId: string, userId?: string) {
    const normalizedProvider = normalizeExternalProvider(provider);
    const normalizedProviderUserId = normalizeExternalProviderUserId(normalizedProvider, providerUserId);
    const { data, error } = await this.supabase
      .from('external_accounts')
      .update({ session_id: sessionId, user_id: userId || null })
      .eq('provider', normalizedProvider)
      .eq('provider_user_id', normalizedProviderUserId)
      .select()
      .single();

    if (error) throw error;
    return data as ExternalAccountRow;
  }
}

export default ExternalRepository;
