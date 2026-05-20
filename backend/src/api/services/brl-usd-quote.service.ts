import crypto from 'crypto';
import { InternationalTransferRepository, internationalTransferRepository } from '../repository/international-transfer.repository';
import { BrlReferenceRateService, BrlReferenceQuote } from './brl-reference-rate.service';
import { PlatformFeeService } from './platform-fee.service';
import { InternationalTransferQuote } from './international-transfer.types';

function toPositiveNumber(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function amount(value: number, decimals = 7): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

function quoteTtlSeconds(): number {
  const parsed = Number(process.env.BRL_USD_QUOTE_TTL_SECONDS || process.env.QUOTE_TTL_SECONDS || 300);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 3600) : 300;
}

function fallbackBrlPerUsd(): number {
  const parsed = Number(process.env.DEFAULT_USD_BRL_RATE || process.env.BRL_USD_FALLBACK_RATE || 5.6);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5.6;
}

function providerFeeBps(): number {
  const parsed = Number(process.env.USD_PAYOUT_PROVIDER_FEE_BPS || 25);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1000) : 25;
}

function providerMinFeeUsd(): number {
  const parsed = Number(process.env.USD_PAYOUT_PROVIDER_MIN_FEE_USD || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

type QuoteDeps = {
  repository?: InternationalTransferRepository;
  quoteBrlToUsdc?: (amountBrl: string) => Promise<BrlReferenceQuote>;
  now?: () => Date;
};

export class BrlUsdQuoteService {
  private readonly repository: InternationalTransferRepository;
  private readonly quoteBrlToUsdc: (amountBrl: string) => Promise<BrlReferenceQuote>;
  private readonly now: () => Date;

  constructor(deps: QuoteDeps = {}) {
    this.repository = deps.repository || internationalTransferRepository;
    this.quoteBrlToUsdc = deps.quoteBrlToUsdc || ((amountBrl) => BrlReferenceRateService.quoteBrlToUsdc(amountBrl));
    this.now = deps.now || (() => new Date());
  }

  async createQuote(input: {
    brl_amount: string | number;
    user_id?: string;
    institution_id?: string;
  }): Promise<InternationalTransferQuote> {
    const brlAmount = toPositiveNumber(input.brl_amount);
    if (!brlAmount) {
      throw new Error('brl_amount must be a positive number.');
    }

    let quoteSource: InternationalTransferQuote['quote_source'] = 'stellar_pathfinding';
    let estimatedUsdcGross = 0;
    let brlPerUsd = 0;
    let referenceQuote: BrlReferenceQuote | null = null;

    try {
      referenceQuote = await this.quoteBrlToUsdc(amount(brlAmount));
      estimatedUsdcGross = toPositiveNumber(referenceQuote.destinationAmount);
      brlPerUsd = estimatedUsdcGross > 0 ? brlAmount / estimatedUsdcGross : 0;
      if (!estimatedUsdcGross || !brlPerUsd) throw new Error('Invalid path quote amount.');
    } catch (error) {
      quoteSource = 'configured_fallback_rate';
      brlPerUsd = fallbackBrlPerUsd();
      estimatedUsdcGross = brlAmount / brlPerUsd;
      referenceQuote = null;
    }

    const platformFee = PlatformFeeService.calculateSpread({
      sourceAmount: brlAmount,
      sourceAssetCode: 'BRL',
      destinationAssetCode: 'USDC',
      mode: 'deduct_from_source',
    });
    const platformFeeBrl = toPositiveNumber(platformFee.feeAmount);
    const platformFeeUsd = brlPerUsd > 0 ? platformFeeBrl / brlPerUsd : 0;
    const estimatedUsdcAfterPlatformFee = Math.max(0, estimatedUsdcGross - platformFeeUsd);
    const providerFeeRate = providerFeeBps() / 10000;
    const estimatedProviderFeeUsd = Math.max(estimatedUsdcAfterPlatformFee * providerFeeRate, providerMinFeeUsd());
    const estimatedUsd = Math.max(0, estimatedUsdcAfterPlatformFee - estimatedProviderFeeUsd);
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + quoteTtlSeconds() * 1000);

    const quote: InternationalTransferQuote = {
      quote_id: `q_brl_usd_${crypto.randomUUID()}`,
      user_id: input.user_id,
      institution_id: input.institution_id,
      source_currency: 'BRL',
      destination_currency: 'USD',
      brl_amount: amount(brlAmount, 2),
      estimated_usdc_amount: amount(estimatedUsdcAfterPlatformFee),
      estimated_usd_amount: amount(estimatedUsd),
      fx_rate: amount(brlPerUsd, 8),
      platform_fee: {
        amount: amount(platformFeeBrl, 2),
        currency: 'BRL',
        bps: platformFee.feeBps,
      },
      estimated_provider_fee: {
        amount: amount(estimatedProviderFeeUsd),
        currency: 'USD',
        bps: providerFeeBps(),
      },
      total_fee: {
        amount_brl_equivalent: amount(platformFeeBrl + estimatedProviderFeeUsd * brlPerUsd, 2),
        amount_usd_equivalent: amount(platformFeeUsd + estimatedProviderFeeUsd),
      },
      expires_at: expiresAt.toISOString(),
      quote_status: 'ACTIVE',
      quote_source: quoteSource,
      metadata: {
        reference_quote: referenceQuote,
        usdc_assumed_usd_parity: true,
        provider_fee_min_usd: providerMinFeeUsd(),
      },
      created_at: issuedAt.toISOString(),
      updated_at: issuedAt.toISOString(),
    };

    return this.repository.createQuote(quote);
  }

  async getActiveQuote(quoteId: string): Promise<InternationalTransferQuote> {
    const quote = await this.repository.getQuote(quoteId);
    if (!quote) throw new Error('Quote not found.');
    if (quote.quote_status !== 'ACTIVE') throw new Error(`Quote is not active: ${quote.quote_status}.`);
    if (Date.parse(quote.expires_at) <= this.now().getTime()) {
      await this.repository.updateQuote(quote.quote_id, { quote_status: 'EXPIRED' });
      throw new Error('Quote expired. Create a new BRL/USD quote.');
    }
    return quote;
  }
}

export const brlUsdQuoteService = new BrlUsdQuoteService();
