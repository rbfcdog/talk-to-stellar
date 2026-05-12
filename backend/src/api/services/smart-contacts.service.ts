import { supabase } from '../../config/supabase';
import { FinancialContextService, toNumber, trackFinancialEvent } from './financial-context.service';

export type SmartContact = {
  id: number;
  owner_id: string;
  contact_name: string;
  display_name?: string;
  nickname?: string;
  role_label?: string;
  country?: string;
  preferred_currency?: string;
  preferred_amount?: number;
  last_amount?: number;
  last_direction?: string;
  total_sent?: number;
  total_received?: number;
  transaction_count?: number;
  tags?: string[];
  favorite?: boolean;
  recurring?: boolean;
};

function normalize(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export class SmartContactsService {
  static async syncStats(input: { sessionId?: string; userId?: string }): Promise<void> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', ctx.userId);

    if (contactsError) {
      throw new Error(`Falha ao carregar contatos: ${contactsError.message}`);
    }

    const { data: logs, error: logsError } = await supabase
      .from('payment_logs')
      .select('destination_public_key, destination_amount, destination_asset_code, source_amount, source_asset_code, status, completed_at')
      .eq('user_id', ctx.userId)
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(500);

    if (logsError) {
      throw new Error(`Falha ao atualizar estatísticas dos contatos: ${logsError.message}`);
    }

    const rows = (logs || []) as Array<Record<string, unknown>>;

    for (const contact of (contacts || []) as Array<Record<string, unknown>>) {
      const publicKey = String(contact.stellar_public_key || '');
      const related = rows.filter((row) => String(row.destination_public_key || '') === publicKey);

      const totalSent = related.reduce((sum, row) => sum + toNumber(row.destination_amount), 0);
      const transactionCount = related.length;
      const lastTx = related[0];
      const recurring = transactionCount >= 3;
      const favorite = transactionCount >= 5;

      const updatePayload: Record<string, unknown> = {
        transaction_count: transactionCount,
        total_sent: Number(totalSent.toFixed(2)),
        total_received: toNumber(contact.total_received),
        last_amount: lastTx ? toNumber(lastTx.destination_amount) : null,
        last_direction: lastTx ? 'sent' : contact.last_direction || null,
        preferred_currency: lastTx ? String(lastTx.destination_asset_code || 'USD').toUpperCase() : contact.preferred_currency || null,
        recurring,
        favorite,
      };

      if (!contact.display_name) {
        updatePayload.display_name = contact.contact_name;
      }

      const { error: updateError } = await supabase
        .from('contacts')
        .update(updatePayload)
        .eq('id', contact.id);

      if (updateError) {
        throw new Error(`Falha ao atualizar contato ${contact.id}: ${updateError.message}`);
      }

      if (recurring && !contact.recurring) {
        await trackFinancialEvent('contact_auto_suggested', {
          session_id: ctx.sessionId,
          user_id: ctx.userId,
          contact_id: contact.id,
          reason: 'recurring_detected',
        });
      }
    }
  }

  static async listSmartContacts(input: { sessionId?: string; userId?: string; limit?: number }): Promise<SmartContact[]> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    await this.syncStats({ sessionId: ctx.sessionId, userId: ctx.userId });

    const limit = Math.min(Math.max(Number(input.limit || 30), 1), 80);

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', ctx.userId)
      .order('transaction_count', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Falha ao listar contatos inteligentes: ${error.message}`);
    }

    return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: Number(row.id),
      owner_id: String(row.owner_id),
      contact_name: String(row.contact_name || ''),
      display_name: row.display_name ? String(row.display_name) : undefined,
      nickname: row.nickname ? String(row.nickname) : undefined,
      role_label: row.role_label ? String(row.role_label) : undefined,
      country: row.country ? String(row.country) : undefined,
      preferred_currency: row.preferred_currency ? String(row.preferred_currency) : undefined,
      preferred_amount: row.preferred_amount ? Number(row.preferred_amount) : undefined,
      last_amount: row.last_amount ? Number(row.last_amount) : undefined,
      last_direction: row.last_direction ? String(row.last_direction) : undefined,
      total_sent: row.total_sent ? Number(row.total_sent) : undefined,
      total_received: row.total_received ? Number(row.total_received) : undefined,
      transaction_count: row.transaction_count ? Number(row.transaction_count) : undefined,
      tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag)) : undefined,
      favorite: Boolean(row.favorite),
      recurring: Boolean(row.recurring),
    }));
  }

  static async resolveByContext(input: { sessionId?: string; userId?: string; query: string }): Promise<SmartContact | null> {
    const contacts = await this.listSmartContacts({ sessionId: input.sessionId, userId: input.userId, limit: 80 });
    const query = normalize(input.query);

    if (!query) return null;

    const matched = contacts.find((contact) => {
      const bucket = [
        contact.contact_name,
        contact.display_name || '',
        contact.nickname || '',
        contact.role_label || '',
        ...(contact.tags || []),
      ]
        .map((value) => normalize(String(value || '')))
        .filter(Boolean);
      return bucket.some((value) => value === query || value.includes(query) || query.includes(value));
    });

    return matched || null;
  }
}
