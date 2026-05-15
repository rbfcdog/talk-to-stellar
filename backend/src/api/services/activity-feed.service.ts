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
  if (eventType.includes('pix_onramp')) return { icon: 'arrow-down-left', color: 'emerald' };
  if (eventType.includes('pix_offramp')) return { icon: 'arrow-up-right', color: 'cyan' };
  if (eventType.includes('conversion')) return { icon: 'refresh-cw', color: 'blue' };
  if (eventType.includes('payment_sent')) return { icon: 'arrow-up-right', color: 'green' };
  if (eventType.includes('payment_received')) return { icon: 'arrow-down-left', color: 'emerald' };
  if (eventType.includes('invoice')) return { icon: 'file-text', color: 'orange' };
  if (eventType.includes('quote_expired')) return { icon: 'clock', color: 'amber' };
  if (eventType.includes('savings')) return { icon: 'piggy-bank', color: 'teal' };
  return { icon: 'dot', color: 'slate' };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function userFacingAsset(code: unknown): string {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized || normalized === 'TESOURO') return 'BRL';
  if (normalized === 'USD') return 'USDC';
  return normalized;
}

function formatAmountForFeed(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return `0 ${currency}`;
  if (currency === 'BRL') return `R$ ${amount.toFixed(2).replace('.', ',')}`;
  if (currency === 'USDC') return `US$ ${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${currency}`;
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
        const feeBrl = toNumber(metadata?.actual_fee_brl || metadata?.fee_brl);
        const savedSavings = (metadata?.savings || {}) as Record<string, unknown>;
        const quoteMetadata = (metadata?.quote || {}) as Record<string, unknown>;
        const sourceAmountBrl = toNumber(savedSavings.gross_amount_brl) ||
          (sourceCurrency === 'BRL' ? sourceAmount : toNumber(quoteMetadata.sourceAmount));
        if (sourceAmountBrl > 0) {
          const savings = toNumber(savedSavings.estimated_savings) > 0
            ? {
                estimatedTraditionalFee: toNumber(savedSavings.estimated_traditional_fee),
                actualFee: toNumber(savedSavings.actual_fee),
                estimatedSavings: toNumber(savedSavings.estimated_savings),
                savingsPercentage: toNumber(savedSavings.savings_percentage),
                comparisonMethod: String(savedSavings.comparison_method || EconomyEngineService.comparisonMethod()),
              }
            : EconomyEngineService.calculateForOperation({
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
                source_amount_brl: sourceAmountBrl,
                platform_spread_fee: metadata?.platform_spread_fee || null,
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

  static async syncFromRampOperations(input: { sessionId?: string; userId?: string }): Promise<void> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });

    const { data: operations, error } = await supabase
      .from('operations')
      .select('id, user_id, type, status, amount, asset_code, context, source_session_id, source_public_key, stellar_transaction_hash, created_at, updated_at')
      .eq('user_id', ctx.userId)
      .in('type', ['PIX_ONRAMP', 'PIX_OFFRAMP'])
      .order('created_at', { ascending: false })
      .limit(120);

    if (error) {
      throw new Error(`Falha ao sincronizar feed PIX: ${error.message}`);
    }

    for (const row of (operations || []) as Array<Record<string, unknown>>) {
      const context = parseJsonObject(row.context);
      const type = String(row.type || '').toUpperCase();
      const status = String(row.status || 'PENDING').toUpperCase();
      const completed = status === 'COMPLETED' || status === 'SUCCESS';
      const failed = status === 'FAILED' || status === 'ERROR';
      const isOnRamp = type === 'PIX_ONRAMP';
      const visibleCurrency = isOnRamp
        ? userFacingAsset(context.final_asset_code || context.final_asset || row.asset_code)
        : 'BRL';
      const rawAmount = isOnRamp
        ? toNumber(context.final_amount || context.destination_amount || context.source_amount_brl || row.amount)
        : toNumber(context.target_brl || context.destination_amount || context.source_amount || row.amount);
      const amount = rawAmount > 0 ? rawAmount : toNumber(row.amount);
      const amountText = formatAmountForFeed(amount, visibleCurrency);
      const eventType = isOnRamp
        ? completed ? 'pix_onramp_completed' : failed ? 'pix_onramp_failed' : 'pix_onramp_processing'
        : completed ? 'pix_offramp_completed' : failed ? 'pix_offramp_failed' : 'pix_offramp_processing';
      const title = isOnRamp
        ? completed ? 'PIX recebido' : failed ? 'PIX não concluído' : 'PIX em andamento'
        : completed ? 'Retirada via PIX concluída' : failed ? 'Retirada via PIX não concluída' : 'Retirada via PIX em andamento';
      const description = isOnRamp
        ? completed
          ? `${amountText} entrou como saldo na sua conta TalkToStellar.`
          : failed
            ? 'O checkout PIX não foi concluído. Gere um novo PIX para tentar de novo.'
            : 'Checkout PIX criado. Aguardando confirmação.'
        : completed
          ? `${amountText} saiu da conta TalkToStellar e entrou no seu PIX.`
          : failed
            ? 'A retirada para PIX não foi concluída. Confira saldo e tente novamente.'
            : 'Retirada criada. Aguardando confirmação.';
      const visual = normalizeEventVisual(eventType);
      const createdAt = String(row.updated_at || row.created_at || new Date().toISOString());
      const dedupeKey = `${ctx.userId}:${eventType}:${String(row.id || '')}:${status}`;
      const payload = {
        user_id: ctx.userId,
        event_type: eventType,
        title,
        description,
        amount,
        currency: visibleCurrency,
        status: completed ? 'success' : failed ? 'failed' : 'pending',
        related_operation_id: row.id || null,
        related_contact_id: null,
        metadata_json: {
          operation_id: row.id,
          ramp_type: type,
          ramp_status: status,
          source_public_key: row.source_public_key,
          anchor_order_id: context.anchor_order_id,
          intent_id: context.intent_id,
          receipt_url: context.receipt_url,
          raw_context: context,
          dedupe_key: dedupeKey,
        },
        icon: visual.icon,
        semantic_color: visual.color,
        created_at: createdAt,
        dedupe_key: dedupeKey,
      };

      const { error: upsertError } = await supabase
        .from('financial_events')
        .upsert(payload, { onConflict: 'dedupe_key' });

      if (upsertError) {
        await supabase.from('financial_events').insert(payload);
      }
    }
  }

  static async listFeed(input: { sessionId?: string; userId?: string; limit?: number }): Promise<FinancialEventItem[]> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    await this.syncFromPayments({ sessionId: ctx.sessionId, userId: ctx.userId });
    await this.syncFromRampOperations({ sessionId: ctx.sessionId, userId: ctx.userId });

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
