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

function externalRowData(row: Pick<ExternalAccountRow, 'data'>): Record<string, unknown> {
  return row.data && typeof row.data === 'object' ? row.data : {};
}

export function externalRowHasWhatsAppOrigin(row: Pick<ExternalAccountRow, 'provider' | 'data'>): boolean {
  const provider = normalizeExternalProvider(String(row.provider || ''));
  if (provider === 'whatsapp') return true;
  const data = externalRowData(row);
  const sourceCandidates = [
    data.provider,
    data.external_provider,
    data.externalProvider,
    data.source,
    data.external_source,
    data.externalSource,
    data.channel,
    data.session_source,
    data.sessionSource,
  ]
    .map((value) => normalizeExternalProvider(String(value || '')))
    .filter(Boolean);

  if (sourceCandidates.some((value) => value.includes('whatsapp') || value.includes('evolution'))) return true;

  const jid = String(data.remote_jid || data.remoteJid || data.jid || '').trim().toLowerCase();
  if (jid.includes('whatsapp') || jid.includes('@s.whatsapp.net')) return true;

  return Boolean(
    String(data.whatsapp_number || data.whatsappNumber || '').trim() ||
      String(data.evolution_instance || data.evolutionInstance || data.evolution_instance_id || data.evolutionInstanceId || '').trim()
  );
}

export function externalRowMatchesProvider(row: Pick<ExternalAccountRow, 'provider' | 'data'>, provider: string): boolean {
  const requestedProvider = normalizeExternalProvider(provider);
  const rowProvider = normalizeExternalProvider(String(row.provider || ''));
  if (!requestedProvider || !rowProvider) return false;
  if (!isPhoneProvider(requestedProvider)) return rowProvider === requestedProvider;
  if (requestedProvider === 'whatsapp') {
    return rowProvider === 'whatsapp' || (rowProvider === 'phone' && externalRowHasWhatsAppOrigin(row));
  }
  return rowProvider === 'phone' || rowProvider === 'whatsapp';
}

function rowHasOwner(row: ExternalAccountRow): boolean {
  return Boolean(String(row.session_id || '').trim() || String(row.user_id || '').trim());
}

function rowHasLoginHint(row: ExternalAccountRow): boolean {
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return Boolean(
    rowHasOwner(row) ||
    String((data as any).email || '').trim() ||
    String((data as any).user_id || (data as any).userId || '').trim()
  );
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

    const rows = ((data || []) as ExternalAccountRow[]).filter((row) => externalRowMatchesProvider(row, normalizedProvider));
    if (rows.length === 0) return null;

    const exactRows = rows.filter((row) => String(row.provider || '').toLowerCase() === normalizedProvider);

    return (
      exactRows.find(rowHasOwner) ||
      rows.find(rowHasOwner) ||
      exactRows.find(rowHasLoginHint) ||
      rows.find(rowHasLoginHint) ||
      exactRows[0] ||
      rows[0]
    );
  }

  async createMapping(payload: Partial<ExternalAccountRow>) {
    const normalizedProvider = normalizeExternalProvider(String(payload.provider || ''));
    const normalizedProviderUserId = normalizeExternalProviderUserId(normalizedProvider, String(payload.provider_user_id || ''));
    let existing: ExternalAccountRow | null = null;
    try {
      existing = await this.findByProviderAndId(normalizedProvider, normalizedProviderUserId);
    } catch {
      existing = null;
    }

    const existingIsSameProvider =
      String(existing?.provider || '').toLowerCase() === normalizedProvider &&
      String(existing?.provider_user_id || '') === normalizedProviderUserId;
    const existingData = existingIsSameProvider && existing?.data && typeof existing.data === 'object' ? existing.data : {};
    const incomingData = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const mergedData = {
      ...existingData,
      ...incomingData,
    };

    const normalizedPayload = {
      ...payload,
      provider: normalizedProvider,
      provider_user_id: normalizedProviderUserId,
      session_id: payload.session_id || existing?.session_id || null,
      user_id: payload.user_id || existing?.user_id || null,
      data: Object.keys(mergedData).length > 0 ? mergedData : payload.data || existing?.data || {},
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
