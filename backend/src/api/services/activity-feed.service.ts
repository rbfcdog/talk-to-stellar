import { supabase } from '../../config/supabase';
import { EconomyEngineService } from './economy-engine.service';
import { FinancialContextService, toNumber, trackFinancialEvent } from './financial-context.service';

export type FinancialEventItem = {
  id: string;
  event_type: string;
  title: string;
  description?: string;
  amount?: number;
  currency?: string;
  status?: string;
  icon?: string;
  semantic_color?: string;
  created_at: string;
  metadata_json?: Record<string, unknown>;
};

function normalizeEventVisual(eventType: string): { icon: string; color: string } {
  if (eventType.includes('conversion')) return { icon: 'refresh-cw', color: 'blue' };
  if (eventType.includes('payment_sent')) return { icon: 'arrow-up-right', color: 'green' };
  if (eventType.includes('payment_received')) return { icon: 'arrow-down-left', color: 'emerald' };
  if (eventType.includes('invoice')) return { icon: 'file-text', color: 'orange' };
  if (eventType.includes('quote_expired')) return { icon: 'clock', color: 'amber' };
  if (eventType.includes('savings')) return { icon: 'piggy-bank', color: 'teal' };
  return { icon: 'dot', color: 'slate' };
}

export class ActivityFeedService {
  static async syncFromPayments(input: { sessionId?: string; userId?: string }): Promise<void> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });

    const { data: logs, error } = await supabase
      .from('payment_logs')
      .select('id, payment_hash, operation_type, status, source_amount, source_asset_code, destination_amount, destination_asset_code, destination_public_key, error_message, metadata, created_at, completed_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(150);

    if (error) {
      throw new Error(`Falha ao sincronizar feed: ${error.message}`);
    }

    const rows = (logs || []) as Array<Record<string, unknown>>;

    for (const row of rows) {
      const operationType = String(row.operation_type || '').toUpperCase();
      const status = String(row.status || '').toLowerCase();
      const metadata = (row.metadata || {}) as Record<string, unknown>;
      const destinationAmount = toNumber(row.destination_amount);
      const destinationCurrency = String(row.destination_asset_code || 'USD').toUpperCase();
      const sourceAmount = toNumber(row.source_amount);
      const sourceCurrency = String(row.source_asset_code || '').toUpperCase();
      const hash = String(row.payment_hash || row.id || '');
      const createdAt = String(row.completed_at || row.created_at || new Date().toISOString());

      let eventType = 'payment_sent';
      let title = 'Pagamento enviado';
      let description = `Operação concluída para ${String(row.destination_public_key || 'destinatário')}.`;

      if (operationType.includes('CONVERSION')) {
        eventType = status === 'success' ? 'conversion_completed' : 'conversion_failed';
        title = status === 'success' ? 'Conversão concluída' : 'Conversão não concluída';
        description = status === 'success'
          ? `Conversão de ${sourceAmount} ${sourceCurrency} para ${destinationAmount} ${destinationCurrency}.`
          : `Conversão falhou: ${String(row.error_message || 'erro desconhecido')}`;
      } else if (status !== 'success') {
        eventType = 'payment_failed';
        title = 'Pagamento não concluído';
        description = String(row.error_message || 'A operação não foi confirmada.');
      }

      const visual = normalizeEventVisual(eventType);
      const eventPayload = {
        user_id: ctx.userId,
        event_type: eventType,
        title,
        description,
        amount: destinationAmount > 0 ? destinationAmount : sourceAmount,
        currency: destinationAmount > 0 ? destinationCurrency : sourceCurrency,
        status,
        related_operation_id: null,
        related_contact_id: null,
        metadata_json: {
          payment_hash: hash,
          source_amount: sourceAmount,
          source_currency: sourceCurrency,
          destination_amount: destinationAmount,
          destination_currency: destinationCurrency,
          destination_public_key: row.destination_public_key,
          raw_metadata: metadata,
          dedupe_key: `${ctx.userId}:${eventType}:${hash}:${status}`,
        },
        icon: visual.icon,
        semantic_color: visual.color,
        created_at: createdAt,
        dedupe_key: `${ctx.userId}:${eventType}:${hash}:${status}`,
      };

      const { error: upsertError } = await supabase
        .from('financial_events')
        .upsert(eventPayload, { onConflict: 'dedupe_key' });

      if (upsertError) {
        // Fallback for old schema without dedupe_key unique index.
        await supabase.from('financial_events').insert(eventPayload);
      }

      if (status === 'success' && (eventType === 'payment_sent' || eventType === 'conversion_completed')) {
        const feeBrl = toNumber(metadata?.fee_brl);
        const quoteMetadata = (metadata?.quote || {}) as Record<string, unknown>;
        const sourceAmountBrl = sourceCurrency === 'BRL' ? sourceAmount : toNumber(quoteMetadata.sourceAmount);
        if (sourceAmountBrl > 0) {
          const savings = EconomyEngineService.calculateForOperation({
            grossAmount: sourceAmountBrl,
            actualFee: feeBrl,
          });

          if (savings.estimatedSavings > 0) {
            const savingsEvent = {
              user_id: ctx.userId,
              event_type: 'savings_estimated',
              title: 'Economia estimada em taxa',
              description: `Estimativa de economia de R$ ${savings.estimatedSavings.toFixed(2)} nesta operação.`,
              amount: Number(savings.estimatedSavings.toFixed(2)),
              currency: 'BRL',
              status: 'info',
              metadata_json: {
                estimated_traditional_fee: savings.estimatedTraditionalFee,
                actual_fee: savings.actualFee,
                savings_percentage: savings.savingsPercentage,
                comparison_method: savings.comparisonMethod,
                payment_hash: hash,
              },
              icon: 'piggy-bank',
              semantic_color: 'teal',
              created_at: createdAt,
              dedupe_key: `${ctx.userId}:savings_estimated:${hash}`,
            };

            const { error: savingsErr } = await supabase
              .from('financial_events')
              .upsert(savingsEvent, { onConflict: 'dedupe_key' });

            if (savingsErr) {
              await supabase.from('financial_events').insert(savingsEvent);
            }
          }
        }
      }
    }
  }

  static async listFeed(input: { sessionId?: string; userId?: string; limit?: number }): Promise<FinancialEventItem[]> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    await this.syncFromPayments({ sessionId: ctx.sessionId, userId: ctx.userId });

    const limit = Math.min(Math.max(Number(input.limit || 40), 1), 120);

    const { data, error } = await supabase
      .from('financial_events')
      .select('*')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Falha ao carregar feed: ${error.message}`);
    }

    await trackFinancialEvent('activity_feed_opened', {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      limit,
    });

    return (data || []) as FinancialEventItem[];
  }
}
