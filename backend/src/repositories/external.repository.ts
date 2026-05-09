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

export class ExternalRepository {
  supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  private normalizeProviderUserId(provider: string, providerUserId: string): string {
    const normalizedProvider = String(provider || '').toLowerCase();
    const raw = String(providerUserId || '').trim();

    if (normalizedProvider === 'whatsapp' || normalizedProvider === 'phone') {
      return raw.replace(/\D+/g, '');
    }

    return raw;
  }

  async findByProviderAndId(provider: string, providerUserId: string): Promise<ExternalAccountRow | null> {
    const normalizedProviderUserId = this.normalizeProviderUserId(provider, providerUserId);
    const { data, error } = await this.supabase
      .from('external_accounts')
      .select('*')
      .eq('provider', provider)
      .eq('provider_user_id', normalizedProviderUserId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data as ExternalAccountRow | null;
  }

  async createMapping(payload: Partial<ExternalAccountRow>) {
    const normalizedPayload = {
      ...payload,
      provider_user_id: this.normalizeProviderUserId(String(payload.provider || ''), String(payload.provider_user_id || '')),
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
    const normalizedProviderUserId = this.normalizeProviderUserId(provider, providerUserId);
    const { data, error } = await this.supabase
      .from('external_accounts')
      .update({ session_id: sessionId, user_id: userId || null })
      .eq('provider', provider)
      .eq('provider_user_id', normalizedProviderUserId)
      .select()
      .single();

    if (error) throw error;
    return data as ExternalAccountRow;
  }
}

export default ExternalRepository;
