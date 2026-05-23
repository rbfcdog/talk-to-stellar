import { InternationalTransfer, PayoutInstruction, SettlementEvidence, TransferReconciliation } from './international-transfer.types';

function toNumber(value: unknown): number {
  const parsed = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: number, decimals = 6): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

function amount(value: number, decimals = 6): string {
  return rounded(value, decimals).toFixed(decimals).replace(/\.?0+$/, '') || '0';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const parsed = String(value || '').trim();
    if (parsed) return parsed;
  }
  return '';
}

function firstPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const parsed = toNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function normalizeCurrency(value: unknown, fallback: 'BRL' | 'USD' | 'USDC' = 'USD'): 'BRL' | 'USD' | 'USDC' {
  const normalized = String(value || '').trim().toUpperCase().replace(/^USD$/, 'USD');
  if (normalized === 'BRL') return 'BRL';
  if (normalized === 'USDC') return 'USDC';
  if (normalized === 'USD') return 'USD';
  return fallback;
}

function usdEquivalent(value: number, currency: 'BRL' | 'USD' | 'USDC', fxRate: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (currency === 'BRL') return fxRate > 0 ? value / fxRate : 0;
  return value;
}

function brlEquivalent(value: number, currency: 'BRL' | 'USD' | 'USDC', fxRate: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (currency === 'BRL') return value;
  return fxRate > 0 ? value * fxRate : 0;
}

function quoteProviderFee(input: {
  quote?: Record<string, unknown>;
  sourceAmount?: unknown;
  fallbackCurrency: 'BRL' | 'USD' | 'USDC';
  defaultSource: string;
}): {
  amountOriginal: number;
  currency: 'BRL' | 'USD' | 'USDC';
  bps: number;
  source: string;
} {
  const quote = asRecord(input.quote);
  const rawFee = firstPositiveNumber(
    quote.feeAmount,
    quote.fee,
    quote.anchorProviderFeeAmount,
    quote.provider_fee_amount,
    quote.feeAmountInFiat,
  );
  const bps = firstPositiveNumber(quote.feeBps, quote.fee_bps);
  const sourceAmount = firstPositiveNumber(input.sourceAmount, quote.sourceAmount, quote.fromAmount);
  const amountOriginal = rawFee > 0
    ? rawFee
    : bps > 0 && sourceAmount > 0
      ? sourceAmount * (bps / 10000)
      : 0;
  const currency = normalizeCurrency(
    quote.feeCurrency ||
    quote.fee_currency ||
    quote.anchorProviderFeeCurrency,
    input.fallbackCurrency,
  );

  return {
    amountOriginal,
    currency,
    bps,
    source: amountOriginal > 0
      ? input.defaultSource
      : Object.keys(quote).length
        ? `${input.defaultSource}_no_fee_returned`
        : 'pending_provider_quote',
  };
}

function extractOnRampFee(input: {
  transfer: InternationalTransfer;
  fxRate: number;
}): {
  amountOriginal: number;
  amountBrl: number;
  amountUsd: number;
  currency: 'BRL' | 'USD' | 'USDC';
  bps: number;
  source: string;
} {
  const metadata = asRecord(input.transfer.reconciliation_metadata);
  const pixIntent = asRecord(metadata.pix_funding_intent);
  const raw = asRecord(pixIntent.raw);
  const quote = asRecord(raw.quote || pixIntent.quote);
  const explicitFee = firstPositiveNumber(
    raw.provider_onramp_fee_amount,
    raw.provider_on_ramp_fee_amount,
    metadata.provider_onramp_fee_amount,
  );

  const quoted = quoteProviderFee({
    quote,
    sourceAmount: input.transfer.brl_amount,
    fallbackCurrency: 'BRL',
    defaultSource: 'etherfuse_on_ramp_quote',
  });
  const currency = explicitFee > 0 ? 'BRL' : quoted.currency;
  const amountOriginal = explicitFee > 0 ? explicitFee : quoted.amountOriginal;
  const source = explicitFee > 0
    ? 'etherfuse_on_ramp_order_context'
    : quoted.source === 'pending_provider_quote' && String(pixIntent.provider || '').trim()
      ? 'etherfuse_on_ramp_quote_pending'
      : quoted.source;

  return {
    amountOriginal,
    amountBrl: brlEquivalent(amountOriginal, currency, input.fxRate),
    amountUsd: usdEquivalent(amountOriginal, currency, input.fxRate),
    currency,
    bps: quoted.bps,
    source,
  };
}

function extractOffRampFee(input: {
  transfer: InternationalTransfer;
  payout?: PayoutInstruction;
  fxRate: number;
}): {
  amountOriginal: number;
  amountBrl: number;
  amountUsd: number;
  currency: 'BRL' | 'USD' | 'USDC';
  bps: number;
  source: string;
  provider: string;
} {
  const metadata = asRecord(input.transfer.reconciliation_metadata);
  const payout = input.payout || (asRecord(metadata.payout_instruction) as PayoutInstruction | undefined);
  const payoutMetadata = asRecord(payout?.metadata);
  const provider = firstText(payout?.provider_name, input.transfer.payout_provider, 'pending');
  const quote = asRecord(
    payoutMetadata.quote ||
    payoutMetadata.off_ramp_quote ||
    payoutMetadata.provider_quote ||
    payoutMetadata.raw_quote,
  );
  const explicitFee = firstPositiveNumber(
    payoutMetadata.provider_off_ramp_fee_amount,
    payoutMetadata.off_ramp_fee_amount,
    payoutMetadata.fee_amount,
  );
  const explicitCurrency = normalizeCurrency(
    payoutMetadata.provider_off_ramp_fee_currency ||
    payoutMetadata.off_ramp_fee_currency ||
    payoutMetadata.fee_currency,
    provider === 'etherfuse' ? 'BRL' : 'USD',
  );
  const quoted = quoteProviderFee({
    quote,
    sourceAmount: payoutMetadata.requested_source_amount || payout?.amount_usd,
    fallbackCurrency: explicitCurrency,
    defaultSource: `${provider}_off_ramp_quote`,
  });
  const amountOriginal = explicitFee > 0 ? explicitFee : quoted.amountOriginal;
  const currency = explicitFee > 0 ? explicitCurrency : quoted.currency;
  const source = amountOriginal > 0
    ? (explicitFee > 0 ? `${provider}_off_ramp_metadata` : quoted.source)
    : provider === 'pending'
      ? 'pending_payout_adapter'
      : `${provider}_off_ramp_quote_pending`;

  return {
    amountOriginal,
    amountBrl: brlEquivalent(amountOriginal, currency, input.fxRate),
    amountUsd: usdEquivalent(amountOriginal, currency, input.fxRate),
    currency,
    bps: quoted.bps,
    source,
    provider,
  };
}

function buildRouteMetrics(transfer: InternationalTransfer) {
  const sourceBrl = toNumber(transfer.brl_amount);
  const fxRate = toNumber(transfer.fx_rate);
  const baselineUsd = fxRate > 0 ? sourceBrl / fxRate : 0;
  const quotedDestinationUsd = toNumber(transfer.quoted_usd_amount);
  const platformFeeBrl = toNumber(transfer.fees?.platform_fee?.amount);
  const platformFeeUsd = fxRate > 0 ? platformFeeBrl / fxRate : 0;
  const onRampFee = extractOnRampFee({ transfer, fxRate });
  const offRampFee = extractOffRampFee({ transfer, fxRate });
  const totalChargedFeeUsd = platformFeeUsd + onRampFee.amountUsd + offRampFee.amountUsd;
  const totalChargedFeeBrl = platformFeeBrl + onRampFee.amountBrl + offRampFee.amountBrl;
  const destinationUsd = Math.max(0, baselineUsd - totalChargedFeeUsd);
  const routeDeltaUsd = destinationUsd - baselineUsd;
  const retainedPct = baselineUsd > 0 ? (destinationUsd / baselineUsd) * 100 : 0;
  const effectiveFeeBps = baselineUsd > 0 ? (totalChargedFeeUsd / baselineUsd) * 10000 : 0;

  return {
    source_amount_brl: amount(sourceBrl, 2),
    fx_rate_brl_per_usd: amount(fxRate, 8),
    baseline_usd_before_route_costs: amount(baselineUsd),
    quoted_destination_usd: amount(quotedDestinationUsd),
    destination_usd_after_route_costs: amount(destinationUsd),
    platform_fee_brl: amount(platformFeeBrl, 2),
    platform_fee_usd_equivalent: amount(platformFeeUsd),
    talktostellar_fee_brl: amount(platformFeeBrl, 2),
    talktostellar_fee_usd_equivalent: amount(platformFeeUsd),
    provider_on_ramp_fee_amount: amount(onRampFee.amountOriginal),
    provider_on_ramp_fee_currency: onRampFee.currency,
    provider_on_ramp_fee_brl_equivalent: amount(onRampFee.amountBrl, 2),
    provider_on_ramp_fee_usd_equivalent: amount(onRampFee.amountUsd),
    provider_on_ramp_fee_bps: amount(onRampFee.bps, 2),
    provider_on_ramp_fee_source: onRampFee.source,
    provider_off_ramp_fee_amount: amount(offRampFee.amountOriginal),
    provider_off_ramp_fee_currency: offRampFee.currency,
    provider_off_ramp_fee_brl_equivalent: amount(offRampFee.amountBrl, 2),
    provider_off_ramp_fee_usd_equivalent: amount(offRampFee.amountUsd),
    provider_off_ramp_fee_bps: amount(offRampFee.bps, 2),
    provider_off_ramp_fee_source: offRampFee.source,
    off_ramp_provider: offRampFee.provider,
    known_component_fee_usd: amount(totalChargedFeeUsd),
    total_charged_fee_usd: amount(totalChargedFeeUsd),
    total_charged_fee_brl_equivalent: amount(totalChargedFeeBrl, 2),
    total_fee_usd_equivalent: amount(totalChargedFeeUsd),
    total_empirical_fee_usd: amount(totalChargedFeeUsd),
    total_empirical_fee_brl_equivalent: amount(totalChargedFeeBrl, 2),
    route_delta_usd: amount(routeDeltaUsd),
    implied_cost_usd: amount(totalChargedFeeUsd),
    retained_pct: amount(retainedPct, 4),
    effective_fee_bps: amount(effectiveFeeBps, 2),
    fee_delta_usd: amount(Math.abs((baselineUsd - destinationUsd) - totalChargedFeeUsd)),
    fee_model: 'charged_on_off_ramp_transaction_fees_only',
    fee_source: 'charged_on_off_ramp_transaction_fees_only',
  };
}

function buildMetricValidation(metrics: ReturnType<typeof buildRouteMetrics>) {
  const baselineUsd = toNumber(metrics.baseline_usd_before_route_costs);
  const destinationUsd = toNumber(metrics.destination_usd_after_route_costs);
  const retainedPct = toNumber(metrics.retained_pct);
  const feeDeltaUsd = toNumber(metrics.fee_delta_usd);

  return {
    source_amount_positive: toNumber(metrics.source_amount_brl) > 0,
    fx_rate_positive: toNumber(metrics.fx_rate_brl_per_usd) > 0,
    destination_not_negative: destinationUsd >= 0,
    retained_pct_in_expected_range: retainedPct >= 0 && retainedPct <= 100.5,
    fee_math_matches_delta: feeDeltaUsd <= 0.02 || baselineUsd === 0,
    route_delta_explained_by_fees: destinationUsd <= baselineUsd + 0.02,
  };
}

export class SettlementEvidenceService {
  static buildReconciliation(input: {
    transfer: InternationalTransfer;
    settlement?: SettlementEvidence;
    payout?: PayoutInstruction;
  }): TransferReconciliation {
    const now = new Date().toISOString();
    const transfer = input.transfer;
    const settlement = input.settlement || (transfer.reconciliation_metadata?.stellar_settlement as SettlementEvidence | undefined);
    const payout = input.payout || (transfer.reconciliation_metadata?.payout_instruction as PayoutInstruction | undefined);
    const routeMetrics = buildRouteMetrics(transfer);
    const metricValidation = buildMetricValidation(routeMetrics);

    return {
      transfer_id: transfer.transfer_id,
      quote_id: transfer.quote_id,
      pix_payment_id: transfer.pix_payment_id,
      pix_order_id: transfer.pix_order_id,
      stellar_tx_hash: settlement?.stellar_tx_hash || transfer.stellar_tx_hash,
      stellar_memo: settlement?.stellar_memo || transfer.stellar_memo,
      payout_instruction_id: payout?.payout_instruction_id || transfer.payout_instruction_id,
      provider_payout_id: payout?.provider_payout_id || transfer.provider_payout_id,
      final_payout_status: payout?.status || transfer.payout_status,
      evidence: {
        quote_id: transfer.quote_id,
        pix: {
          payment_id: transfer.pix_payment_id,
          order_id: transfer.pix_order_id,
          status: transfer.pix_status,
          received_at: transfer.pix_received_at,
        },
        stellar_settlement: settlement || null,
        payout_instruction: payout || null,
        on_off_ramp: {
          on_ramp_provider: 'etherfuse',
          on_ramp_order_id: transfer.pix_order_id,
          on_ramp_status: transfer.pix_status,
          off_ramp_provider: transfer.payout_provider || payout?.provider_name,
          off_ramp_instruction_id: payout?.payout_instruction_id || transfer.payout_instruction_id,
          off_ramp_status: payout?.status || transfer.payout_status,
        },
        metrics: routeMetrics,
        metric_validation: metricValidation,
        metrics_valid: Object.values(metricValidation).every(Boolean),
        transfer_status: transfer.status,
        reconciliation_metadata: transfer.reconciliation_metadata || {},
      },
      created_at: now,
      updated_at: now,
    };
  }
}
