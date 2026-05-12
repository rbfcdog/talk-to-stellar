import { supabase } from '../../config/supabase';
import { FinancialContextService, formatMoney, toNumber, trackFinancialEvent } from './financial-context.service';

export type SavingsResult = {
  estimatedTraditionalFee: number;
  actualFee: number;
  estimatedSavings: number;
  savingsPercentage: number;
  comparisonMethod: string;
};

const DEFAULT_TRADITIONAL_FEE_PCT = Number(process.env.TRADITIONAL_FEE_PCT || 0.045);

export class EconomyEngineService {
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

    const fallback = Number(input.fallbackUsdBrl || process.env.DEFAULT_USD_BRL_RATE || 5.6);
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
    const actualFeeBrl = networkFeeBrl + platformFeeBrl;
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
      comparisonMethod: input.comparisonMethod || 'market_average_4_5pct',
    };
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
      `Estimativa do mês: você economizou ${formatMoney(savings.estimatedSavings, 'BRL')} ` +
      `comparado a uma média de mercado (${(DEFAULT_TRADITIONAL_FEE_PCT * 100).toFixed(1)}%). ` +
      `Essa comparação é uma estimativa e pode variar.`;

    return { savings, message };
  }
}
