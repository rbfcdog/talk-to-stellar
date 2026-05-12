import { supabase } from '../../config/supabase';
import ExternalService from '../../services/external.service';
import { FinancialContextService, toNumber, trackFinancialEvent } from './financial-context.service';
import { SmartContactsService } from './smart-contacts.service';

export type ReplayCandidate = {
  found: boolean;
  contactName?: string;
  destinationPublicKey?: string;
  amount?: string;
  assetCode?: string;
  lastExecutedAt?: string;
  confirmationLink?: string;
  message: string;
};

function extractTargetName(query: string): string {
  const normalized = String(query || '').trim();
  const match = normalized.match(/(?:pro|pra|para|a)\s+(.+?)(?:\s+de novo|\s+novamente|$)/i);
  return match?.[1]?.trim() || '';
}

export class PaymentReplayService {
  static async findReplayCandidate(input: {
    sessionId?: string;
    userId?: string;
    queryContext?: string;
  }): Promise<ReplayCandidate> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    const externalService = new ExternalService(supabase as any);

    const targetName = extractTargetName(String(input.queryContext || ''));
    let destinationPublicKey = '';
    let contactName = targetName;

    if (targetName) {
      const contact = await SmartContactsService.resolveByContext({
        sessionId: ctx.sessionId,
        userId: ctx.userId,
        query: targetName,
      });
      if (contact?.contact_name && contact.id) {
        contactName = contact.display_name || contact.contact_name;
        const { data: persistedContact } = await supabase
          .from('contacts')
          .select('stellar_public_key')
          .eq('id', contact.id)
          .maybeSingle();
        destinationPublicKey = String((persistedContact as Record<string, unknown> | null)?.stellar_public_key || '');
      }
    }

    let query = supabase
      .from('payment_logs')
      .select('destination_public_key, destination_amount, destination_asset_code, completed_at, status, operation_type, metadata')
      .eq('user_id', ctx.userId)
      .eq('status', 'success')
      .not('destination_public_key', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(40);

    if (destinationPublicKey) {
      query = query.eq('destination_public_key', destinationPublicKey);
    }

    const { data: history, error } = await query;

    if (error) {
      throw new Error(`Falha ao buscar replay de pagamento: ${error.message}`);
    }

    const candidate = (history || []).find((row: Record<string, unknown>) => {
      const operationType = String(row.operation_type || '').toUpperCase();
      return !operationType.includes('CONVERSION');
    }) as Record<string, unknown> | undefined;

    if (!candidate) {
      return {
        found: false,
        message: 'Não encontrei um pagamento anterior com dados suficientes para repetir.',
      };
    }

    const amount = toNumber(candidate.destination_amount);
    const assetCode = String(candidate.destination_asset_code || 'USD').toUpperCase();
    const destination = String(candidate.destination_public_key || '').trim();
    const lastExecutedAt = String(candidate.completed_at || '');

    const { url } = await externalService.createPaymentConfirmUrl({
      amount: amount.toFixed(2),
      asset_code: assetCode,
      destination,
      destination_name: contactName || 'destinatário',
      session_id: ctx.sessionId,
      owner_id: ctx.userId,
    });

    await trackFinancialEvent('replay_candidate_found', {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      destination_public_key: destination,
      destination_amount: amount,
      destination_asset_code: assetCode,
    });

    return {
      found: true,
      contactName: contactName || 'destinatário',
      destinationPublicKey: destination,
      amount: amount.toFixed(2),
      assetCode,
      lastExecutedAt,
      confirmationLink: url,
      message:
        `Encontrei o último envio para ${contactName || 'esse contato'}: ` +
        `${amount.toFixed(2)} ${assetCode}. Deseja repetir agora? Confirme no link: ${url}`,
    };
  }
}
