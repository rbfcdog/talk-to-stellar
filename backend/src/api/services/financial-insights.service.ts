import { supabase } from '../../config/supabase';
import { EconomyEngineService } from './economy-engine.service';
import { FinancialContextService, daysAgo, formatMoney, startOfMonth, toNumber, trackFinancialEvent } from './financial-context.service';

export type GeneratedInsight = {
  type: string;
  title: string;
  description: string;
  amount?: number;
  currency?: string;
  periodStart: string;
  periodEnd: string;
  metadata: Record<string, unknown>;
};

export class FinancialInsightsService {
  static async generateUserInsights(input: { sessionId?: string; userId?: string }): Promise<GeneratedInsight[]> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });

    const now = new Date();
    const monthStart = startOfMonth(now);
    const sevenDaysAgo = daysAgo(7);
    const thirtyDaysAgo = daysAgo(30);

    const [paymentLogsResp, rateResp, monthlySavingsResp] = await Promise.all([
      supabase
        .from('payment_logs')
        .select('source_amount, source_asset_code, destination_amount, destination_asset_code, source_public_key, destination_public_key, operation_type, status, completed_at, metadata')
        .eq('user_id', ctx.userId)
        .eq('status', 'success')
        .gte('completed_at', thirtyDaysAgo.toISOString()),
      supabase
        .from('currency_rate_history')
        .select('rate, observed_at')
        .eq('base_currency', 'USD')
        .eq('quote_currency', 'BRL')
        .gte('observed_at', sevenDaysAgo.toISOString())
        .order('observed_at', { ascending: false }),
      EconomyEngineService.calculateMonthly({ sessionId: ctx.sessionId, userId: ctx.userId }),
    ]);

    if (paymentLogsResp.error) {
      throw new Error(`Falha ao gerar insights: ${paymentLogsResp.error.message}`);
    }
    if (rateResp.error) {
      throw new Error(`Falha ao carregar histórico de cotação: ${rateResp.error.message}`);
    }

    const logs = (paymentLogsResp.data || []) as Array<Record<string, unknown>>;
    const rates = (rateResp.data || []) as Array<{ rate: number; observed_at: string }>;

    let monthlyConvertedBrl = 0;
    let monthlyDistinctPayers = new Set<string>();
    let biggestIncoming = { amount: 0, label: '—' };

    for (const log of logs) {
      const operationType = String(log.operation_type || '').toUpperCase();
      const sourceAmount = toNumber(log.source_amount);
      const sourceAsset = String(log.source_asset_code || '').toUpperCase();
      const destinationAmount = toNumber(log.destination_amount);
      const destinationPublicKey = String(log.destination_public_key || '');
      const sourcePublicKey = String(log.source_public_key || '');
      const completedAt = String(log.completed_at || '');

      if (completedAt && new Date(completedAt) >= monthStart) {
        if (operationType.includes('CONVERSION') && (sourceAsset === 'BRL' || sourceAsset === 'TESOURO')) {
          monthlyConvertedBrl += sourceAmount;
        }

        if (destinationPublicKey && ctx.walletPublicKey && destinationPublicKey === ctx.walletPublicKey && sourcePublicKey) {
          monthlyDistinctPayers.add(sourcePublicKey);
          if (destinationAmount > biggestIncoming.amount) {
            biggestIncoming = {
              amount: destinationAmount,
              label: sourcePublicKey,
            };
          }
        }
      }
    }

    const averageRate7d = rates.length > 0
      ? rates.reduce((sum, item) => sum + toNumber(item.rate), 0) / rates.length
      : 0;

    const monthlySavings = monthlySavingsResp.savings;

    const insights: GeneratedInsight[] = [
      {
        type: 'savings_vs_traditional',
        title: 'Economia estimada no mês',
        description: `${monthlySavingsResp.message}`,
        amount: Number(monthlySavings.estimatedSavings.toFixed(2)),
        currency: 'BRL',
        periodStart: monthStart.toISOString(),
        periodEnd: now.toISOString(),
        metadata: {
          estimated_traditional_fee: monthlySavings.estimatedTraditionalFee,
          actual_fee: monthlySavings.actualFee,
          savings_percentage: monthlySavings.savingsPercentage,
          comparison_method: monthlySavings.comparisonMethod,
        },
      },
      {
        type: 'average_quote_7d',
        title: 'Média de cotação (7 dias)',
        description: averageRate7d > 0
          ? `Sua média de cotação nos últimos 7 dias foi R$${averageRate7d.toFixed(2)} por US$1.`
          : 'Ainda não há histórico suficiente para calcular sua média de cotação dos últimos 7 dias.',
        amount: averageRate7d > 0 ? Number(averageRate7d.toFixed(4)) : undefined,
        currency: 'BRL',
        periodStart: sevenDaysAgo.toISOString(),
        periodEnd: now.toISOString(),
        metadata: {
          sample_count: rates.length,
        },
      },
      {
        type: 'monthly_received_counterparties',
        title: 'Pagadores únicos no mês',
        description: `Você recebeu de ${monthlyDistinctPayers.size} pessoa(s) diferente(s) neste mês.`,
        amount: monthlyDistinctPayers.size,
        currency: 'COUNT',
        periodStart: monthStart.toISOString(),
        periodEnd: now.toISOString(),
        metadata: {
          counterparties: Array.from(monthlyDistinctPayers).slice(0, 10),
        },
      },
      {
        type: 'largest_monthly_received',
        title: 'Maior recebimento do mês',
        description: biggestIncoming.amount > 0
          ? `Seu maior recebimento foi de ${formatMoney(biggestIncoming.amount, 'USD')} vindo de ${biggestIncoming.label}.`
          : 'Ainda não há recebimentos neste mês para destacar um maior valor.',
        amount: biggestIncoming.amount > 0 ? Number(biggestIncoming.amount.toFixed(2)) : undefined,
        currency: 'USD',
        periodStart: monthStart.toISOString(),
        periodEnd: now.toISOString(),
        metadata: {
          payer_label: biggestIncoming.label,
        },
      },
      {
        type: 'monthly_conversion_volume',
        title: 'Volume convertido no mês',
        description: `Você converteu ${formatMoney(monthlyConvertedBrl, 'BRL')} para dólar digital nos últimos 30 dias.`,
        amount: Number(monthlyConvertedBrl.toFixed(2)),
        currency: 'BRL',
        periodStart: thirtyDaysAgo.toISOString(),
        periodEnd: now.toISOString(),
        metadata: {
          conversion_type: 'BRL_to_USD',
        },
      },
    ];

    for (const insight of insights) {
      const dedupeKey = `${ctx.userId}:${insight.type}:${insight.periodStart.slice(0, 10)}:${insight.periodEnd.slice(0, 10)}`;
      await supabase.from('financial_insights').upsert({
        user_id: ctx.userId,
        type: insight.type,
        title: insight.title,
        description: insight.description,
        amount: insight.amount,
        currency: insight.currency,
        period_start: insight.periodStart,
        period_end: insight.periodEnd,
        metadata_json: insight.metadata,
        dedupe_key: dedupeKey,
      }, { onConflict: 'dedupe_key' });
    }

    await trackFinancialEvent('insight_generated', {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      count: insights.length,
    });

    return insights;
  }

  static async listLatestInsights(input: { sessionId?: string; userId?: string; limit?: number }): Promise<GeneratedInsight[]> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    const limit = Math.min(Math.max(Number(input.limit || 8), 1), 20);

    const generated = await this.generateUserInsights({ sessionId: ctx.sessionId, userId: ctx.userId });

    const { data, error } = await supabase
      .from('financial_insights')
      .select('*')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return generated.slice(0, limit);
    }

    return (data || []).map((row: Record<string, unknown>) => ({
      type: String(row.type || ''),
      title: String(row.title || ''),
      description: String(row.description || ''),
      amount: row.amount ? Number(row.amount) : undefined,
      currency: row.currency ? String(row.currency) : undefined,
      periodStart: String(row.period_start || ''),
      periodEnd: String(row.period_end || ''),
      metadata: (row.metadata_json as Record<string, unknown>) || {},
    }));
  }
}
