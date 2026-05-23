import { supabase } from '../../../config/supabase';
import { FinancialContextService, formatMoney, toNumber, trackFinancialEvent } from '../financial-context.service';

export type SavingsResult = {
  estimatedTraditionalFee: number;
  actualFee: number;
  estimatedSavings: number;
  savingsPercentage: number;
  comparisonMethod: string;
};

export type SavingsIdentityPeriod = 'today' | 'month' | 'lifetime';

export type SavingsIdentity = {
  period: SavingsIdentityPeriod;
  operationCount: number;
  countryCount: number;
  operationAmountBrl: number;
  estimatedTraditionalFee: number;
  actualFee: number;
  estimatedSavings: number;
  savingsPercentage: number;
  effectiveSavingsRate: number;
  comparisonMethod: string;
  biggestSavingsOperation?: {
    amountBrl: number;
    estimatedSavings: number;
    completedAt?: string;
    destinationLabel?: string;
  };
  message: string;
};

const DEFAULT_TRADITIONAL_FEE_PCT = Number(process.env.TRADITIONAL_FEE_PCT || 0.035);
const DEFAULT_USD_BRL_REFERENCE_RATE = 5;

function comparisonMethodForRate(rate: number): string {
  const normalized = Number.isFinite(rate) && rate > 0 ? rate : 0.035;
  const pct = normalized * 100;
  const compact = pct.toFixed(2).replace(/\.?0+$/, '').replace('.', '_');
  return `traditional_providers_average_${compact}pct`;
}

const DEFAULT_COMPARISON_METHOD = comparisonMethodForRate(DEFAULT_TRADITIONAL_FEE_PCT);

export class EconomyEngineService {
  static traditionalFeePct(): number {
    return DEFAULT_TRADITIONAL_FEE_PCT;
  }

  static comparisonMethod(): string {
    return DEFAULT_COMPARISON_METHOD;
  }

  static estimateAmountInBrl(input: {
    amount: unknown;
    assetCode: unknown;
    quote?: any;
    fallbackUsdBrl?: number;
  }): number {
    const amount = toNumber(input.amount);
    const assetCode = String(input.assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    if (amount <= 0) return 0;
    if (assetCode === 'BRL') return amount;

    const quote = input.quote || {};
    const sourceAmount = toNumber(quote.sourceAmount);
    const sourceAsset = String(quote.sourceAsset?.code || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const destinationAmount = toNumber(quote.destinationAmount);
    const destinationAsset = String(quote.destinationAsset?.code || '').trim().toUpperCase().replace(/^USD$/, 'USDC');

    if (assetCode === sourceAsset && destinationAsset === 'BRL' && destinationAmount > 0 && sourceAmount > 0) {
      return amount * (destinationAmount / sourceAmount);
    }
    if (assetCode === destinationAsset && sourceAsset === 'BRL' && destinationAmount > 0 && sourceAmount > 0) {
      return amount * (sourceAmount / destinationAmount);
    }

    const fallback = Number(input.fallbackUsdBrl || process.env.DEFAULT_USD_BRL_RATE || DEFAULT_USD_BRL_REFERENCE_RATE);
    if ((assetCode === 'USDC' || assetCode === 'USD') && Number.isFinite(fallback) && fallback > 0) {
      return amount * fallback;
    }

    return 0;
  }

  static calculateForSettledOperation(input: {
    sourceAmount: unknown;
    sourceAssetCode: unknown;
    feeBrl?: unknown;
    platformFeeAmount?: unknown;
    platformFeeAssetCode?: unknown;
    quote?: any;
    effectiveFeeBrl?: unknown;
    comparisonMethod?: string;
  }): SavingsResult & {
    grossAmountBrl: number;
    platformFeeBrl: number;
    actualFeeBrl: number;
  } {
    const grossAmountBrl = this.estimateAmountInBrl({
      amount: input.sourceAmount,
      assetCode: input.sourceAssetCode,
      quote: input.quote,
    });
    const networkFeeBrl = toNumber(input.feeBrl);
    const platformFeeBrl = this.estimateAmountInBrl({
      amount: input.platformFeeAmount,
      assetCode: input.platformFeeAssetCode,
      quote: input.quote,
    });
    const effectiveFeeBrl = toNumber(input.effectiveFeeBrl);
    const actualFeeBrl = effectiveFeeBrl > 0 ? effectiveFeeBrl : networkFeeBrl + platformFeeBrl;
    const savings = this.calculateForOperation({
      grossAmount: grossAmountBrl,
      actualFee: actualFeeBrl,
      comparisonMethod: input.comparisonMethod,
    });

    return {
      ...savings,
      grossAmountBrl,
      platformFeeBrl,
      actualFeeBrl,
    };
  }

  static calculateForOperation(input: {
    grossAmount: number;
    actualFee: number;
    comparisonMethod?: string;
  }): SavingsResult {
    const gross = Math.max(0, input.grossAmount);
    const actualFee = Math.max(0, input.actualFee);
    const estimatedTraditionalFee = gross * DEFAULT_TRADITIONAL_FEE_PCT;
    const estimatedSavings = Math.max(0, estimatedTraditionalFee - actualFee);
    const savingsPercentage = estimatedTraditionalFee > 0
      ? (estimatedSavings / estimatedTraditionalFee) * 100
      : 0;

    return {
      estimatedTraditionalFee,
      actualFee,
      estimatedSavings,
      savingsPercentage,
      comparisonMethod: input.comparisonMethod || DEFAULT_COMPARISON_METHOD,
    };
  }

  static effectiveCostFromQuote(input: {
    grossAmountBrl: number;
    networkFeeBrl?: unknown;
    platformFeeBrl?: unknown;
    quote?: any;
  }): number {
    const networkFeeBrl = toNumber(input.networkFeeBrl);
    const platformFeeBrl = toNumber(input.platformFeeBrl);
    const quote = input.quote || {};
    const midMarketRate = toNumber(
      quote.midMarketRate ||
      quote.mid_market_rate ||
      quote.referenceRate ||
      quote.reference_rate
    );
    const sourceAmount = toNumber(quote.pathSourceAmount || quote.effectiveSourceAmount || quote.sourceAmount);
    const destinationAmount = toNumber(quote.destinationAmount);
    const sourceAsset = String(quote.sourceAsset?.code || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const destinationAsset = String(quote.destinationAsset?.code || '').trim().toUpperCase().replace(/^USD$/, 'USDC');

    let fxSpreadBrl = 0;
    if (midMarketRate > 0 && sourceAmount > 0 && destinationAmount > 0) {
      if (sourceAsset === 'BRL' && (destinationAsset === 'USDC' || destinationAsset === 'USD')) {
        const expectedDestination = sourceAmount / midMarketRate;
        const destinationLoss = Math.max(0, expectedDestination - destinationAmount);
        fxSpreadBrl = destinationLoss * midMarketRate;
      } else if ((sourceAsset === 'USDC' || sourceAsset === 'USD') && destinationAsset === 'BRL') {
        const expectedDestination = sourceAmount * midMarketRate;
        fxSpreadBrl = Math.max(0, expectedDestination - destinationAmount);
      }
    }

    return Math.max(0, networkFeeBrl + platformFeeBrl + fxSpreadBrl);
  }

  static async calculateMonthly(input: { sessionId?: string; userId?: string }): Promise<{
    savings: SavingsResult;
    message: string;
  }> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { data: logs, error } = await supabase
      .from('payment_logs')
      .select('source_amount, source_asset_code, metadata, completed_at, status')
      .eq('user_id', ctx.userId)
      .eq('status', 'success')
      .gte('completed_at', monthStart.toISOString());

    if (error) {
      throw new Error(`Falha ao calcular economia mensal: ${error.message}`);
    }

    let grossBrl = 0;
    let actualFeeBrl = 0;

    for (const row of logs || []) {
      const metadata = (row as Record<string, unknown>).metadata as Record<string, unknown> | null;
      const sourceAmount = toNumber((row as Record<string, unknown>).source_amount);
      const sourceAsset = String((row as Record<string, unknown>).source_asset_code || '').toUpperCase();

      const savedGrossBrl = toNumber((metadata?.savings as any)?.gross_amount_brl || metadata?.gross_amount_brl);
      if (savedGrossBrl > 0) {
        grossBrl += savedGrossBrl;
      } else if (sourceAsset === 'BRL') {
        grossBrl += sourceAmount;
      }

      const feeBrlFromMetadata = toNumber(metadata?.actual_fee_brl || metadata?.fee_brl);
      actualFeeBrl += feeBrlFromMetadata;
    }

    const savings = this.calculateForOperation({ grossAmount: grossBrl, actualFee: actualFeeBrl });

    await trackFinancialEvent('savings_calculated', {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      estimated_traditional_fee: savings.estimatedTraditionalFee,
      actual_fee: savings.actualFee,
      estimated_savings: savings.estimatedSavings,
      savings_percentage: savings.savingsPercentage,
      comparison_method: savings.comparisonMethod,
      period: 'month_to_date',
    });

    const message =
      `Você economizou aproximadamente ${formatMoney(savings.estimatedSavings, 'BRL')} este mês ` +
      `em relação a métodos tradicionais. Estimativa baseada em taxas internacionais médias.`;

    return { savings, message };
  }

  static async calculateIdentity(input: {
    sessionId?: string;
    userId?: string;
    period?: SavingsIdentityPeriod;
  }): Promise<SavingsIdentity> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    const period = input.period || 'month';
    const start = this.periodStart(period);

    let query = supabase
      .from('payment_logs')
      .select('source_amount, source_asset_code, metadata, completed_at, status')
      .eq('user_id', ctx.userId)
      .eq('status', 'success')
      .order('completed_at', { ascending: false });

    if (start) {
      query = query.gte('completed_at', start.toISOString());
    }

    const { data: logs, error } = await query;
    if (error) {
      throw new Error(`Falha ao calcular economia: ${error.message}`);
    }

    let operationAmountBrl = 0;
    let actualFee = 0;
    let estimatedTraditionalFee = 0;
    let estimatedSavings = 0;
    const countries = new Set<string>();
    let biggestSavingsOperation: SavingsIdentity['biggestSavingsOperation'];

    for (const row of logs || []) {
      const metadata = ((row as Record<string, unknown>).metadata || {}) as Record<string, any>;
      const savedSavings = (metadata.savings || {}) as Record<string, unknown>;
      const sourceAmount = toNumber((row as Record<string, unknown>).source_amount);
      const sourceAsset = String((row as Record<string, unknown>).source_asset_code || '').toUpperCase();
      const grossBrl = toNumber(savedSavings.gross_amount_brl || metadata.gross_amount_brl) ||
        (sourceAsset === 'BRL' ? sourceAmount : 0);
      const rowActualFee = toNumber(savedSavings.actual_fee || metadata.actual_fee_brl || metadata.fee_brl);
      const rowTraditionalFee = toNumber(savedSavings.estimated_traditional_fee) ||
        (grossBrl > 0 ? grossBrl * DEFAULT_TRADITIONAL_FEE_PCT : 0);
      const rowSavings = toNumber(savedSavings.estimated_savings) ||
        Math.max(0, rowTraditionalFee - rowActualFee);

      operationAmountBrl += grossBrl;
      actualFee += rowActualFee;
      estimatedTraditionalFee += rowTraditionalFee;
      estimatedSavings += rowSavings;

      const country = String(
        metadata.destination_country ||
        metadata.recipient_country ||
        metadata.country ||
        ''
      ).trim().toUpperCase();
      if (country) countries.add(country);

      if (rowSavings > 0 && (!biggestSavingsOperation || rowSavings > biggestSavingsOperation.estimatedSavings)) {
        biggestSavingsOperation = {
          amountBrl: grossBrl,
          estimatedSavings: rowSavings,
          completedAt: String((row as Record<string, unknown>).completed_at || ''),
          destinationLabel: String(metadata.destination_name || metadata.recipient_name || metadata.destination || '').trim() || undefined,
        };
      }
    }

    const savingsPercentage = estimatedTraditionalFee > 0
      ? (estimatedSavings / estimatedTraditionalFee) * 100
      : 0;
    const effectiveSavingsRate = operationAmountBrl > 0
      ? (estimatedSavings / operationAmountBrl) * 100
      : 0;

    const identity: SavingsIdentity = {
      period,
      operationCount: (logs || []).length,
      countryCount: countries.size,
      operationAmountBrl,
      estimatedTraditionalFee,
      actualFee,
      estimatedSavings,
      savingsPercentage,
      effectiveSavingsRate,
      comparisonMethod: DEFAULT_COMPARISON_METHOD,
      biggestSavingsOperation,
      message: this.identityMessage(period, {
        operationCount: (logs || []).length,
        countryCount: countries.size,
        estimatedSavings,
        savingsPercentage,
        effectiveSavingsRate,
        biggestSavingsOperation,
      }),
    };

    await trackFinancialEvent('savings_identity_viewed', {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      period,
      operation_count: identity.operationCount,
      estimated_savings: identity.estimatedSavings,
      savings_percentage: identity.savingsPercentage,
      comparison_method: identity.comparisonMethod,
    });

    return identity;
  }

  private static periodStart(period: SavingsIdentityPeriod): Date | null {
    const now = new Date();
    if (period === 'lifetime') return null;
    if (period === 'today') {
      const start = new Date(now);
      start.setUTCHours(0, 0, 0, 0);
      return start;
    }
    const start = new Date(now);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    return start;
  }

  private static identityMessage(period: SavingsIdentityPeriod, input: {
    operationCount: number;
    countryCount: number;
    estimatedSavings: number;
    savingsPercentage: number;
    effectiveSavingsRate: number;
    biggestSavingsOperation?: SavingsIdentity['biggestSavingsOperation'];
  }): string {
    if (period === 'lifetime') {
      return `Você já economizou aproximadamente ${formatMoney(input.estimatedSavings, 'BRL')} usando sua conta global, em relação a métodos tradicionais.`;
    }

    if (period === 'today') {
      return `Hoje você economizou aproximadamente ${formatMoney(input.estimatedSavings, 'BRL')} em relação a métodos tradicionais.`;
    }

    const countriesLine = input.countryCount > 0 ? `\n• ${input.countryCount} país(es)` : '';
    return [
      `Você já economizou aproximadamente ${formatMoney(input.estimatedSavings, 'BRL')} este mês usando sua conta global.`,
      `Esse mês:`,
      `• ${input.operationCount} transferência(s)${countriesLine}`,
      `• economia média: ${input.effectiveSavingsRate.toFixed(1)}%`,
      `Estimativa baseada em taxas internacionais médias de métodos tradicionais.`,
    ].join('\n');
  }
}
