import crypto from 'crypto';
import {
  InternationalTransfer,
  InternationalTransferState,
  PayoutInstruction,
  QuoteProvenance,
  SettlementEvidence,
  TransferOrchestrationLog,
  TransferOrchestrationLogEntry,
  TransferReconciliation,
} from './international-transfer.types';

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

function sha256Short(value: unknown): string {
  const raw = firstText(value);
  if (!raw) return '';
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

function lastDigits(value: unknown, size = 4): string {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits ? digits.slice(-size) : '';
}

function compactText(value: unknown, maxLength = 180): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as T;
}

function collectTraceIds(value: unknown, result: { requestIds: Set<string>; correlationIds: Set<string> }, depth = 0) {
  if (!value || depth > 5) return;
  if (Array.isArray(value)) {
    for (const item of value) collectTraceIds(item, result, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/request_?id/i.test(key)) {
      const parsed = firstText(item);
      if (parsed) result.requestIds.add(parsed);
    }
    if (/correlation_?id/i.test(key)) {
      const parsed = firstText(item);
      if (parsed) result.correlationIds.add(parsed);
    }
    if (item && typeof item === 'object') collectTraceIds(item, result, depth + 1);
  }
}

const ORCHESTRATION_STATE_ORDER: InternationalTransferState[] = [
  'QUOTE_CREATED',
  'PIX_PENDING',
  'PIX_RECEIVED',
  'BRL_TO_USDC_PENDING',
  'USDC_SETTLEMENT_PENDING',
  'USDC_SETTLED',
  'PAYOUT_INSTRUCTION_CREATED',
  'PAYOUT_PENDING',
  'PAYOUT_COMPLETED',
];

function hasReached(status: InternationalTransferState, target: InternationalTransferState): boolean {
  const current = ORCHESTRATION_STATE_ORDER.indexOf(status);
  const expected = ORCHESTRATION_STATE_ORDER.indexOf(target);
  return current >= 0 && expected >= 0 && current >= expected;
}

function settlementEvidenceState(transfer: InternationalTransfer, settlement?: SettlementEvidence): TransferOrchestrationLog['evidence_status'][string] {
  if (transfer.status === 'FAILED' && !transfer.stellar_tx_hash && !settlement?.stellar_tx_hash) return 'failed';
  if (!transfer.stellar_tx_hash && !settlement?.stellar_tx_hash) {
    return hasReached(transfer.status, 'PIX_RECEIVED') ? 'pending' : 'missing';
  }
  const mode = firstText(settlement?.execution_mode).toLowerCase();
  const status = firstText(settlement?.status).toLowerCase();
  const network = firstText(settlement?.network).toLowerCase();
  if (mode === 'mock' || status === 'mocked') return 'mock';
  if (mode === 'mainnet_validation' || network === 'public' || network === 'mainnet') return 'real_mainnet';
  if (mode === 'testnet' || network === 'testnet') return 'real_testnet';
  return 'captured';
}

function payoutEvidenceState(transfer: InternationalTransfer, payout?: PayoutInstruction): TransferOrchestrationLog['evidence_status'][string] {
  const status = firstText(payout?.status || transfer.payout_status).toLowerCase();
  if (transfer.status === 'FAILED' && !transfer.payout_instruction_id && !payout?.payout_instruction_id) return 'failed';
  if (!transfer.payout_instruction_id && !payout?.payout_instruction_id) {
    return hasReached(transfer.status, 'USDC_SETTLED') ? 'pending' : 'missing';
  }
  if (status === 'failed' || status === 'cancelled') return 'failed';
  const provider = firstText(payout?.provider_name || transfer.payout_provider).toLowerCase();
  const mode = firstText((payout?.metadata || {}).mode).toLowerCase();
  if (provider === 'mock' || mode.includes('mock')) return 'mock';
  if (mode.includes('sandbox') || mode.includes('compatibility') || mode.includes('payload_prepared')) return 'sandbox';
  return status === 'completed' || status === 'pending' || status === 'instruction_created' ? 'captured' : 'pending';
}

function redactedDestination(transfer: InternationalTransfer): TransferOrchestrationLog['destination'] {
  const destination = transfer.payout_destination || {};
  return stripUndefined({
    account_holder_hash: destination.accountHolderName ? sha256Short(destination.accountHolderName) : undefined,
    account_holder_type: destination.accountHolderType,
    country: destination.country,
    provider_label: destination.providerLabel,
    bank_name: destination.bankName ? compactText(destination.bankName, 80) : undefined,
    account_number_last4: lastDigits(destination.accountNumber),
    routing_number_last4: lastDigits(destination.routingNumber),
  });
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
  if (normalized === 'BRL' || normalized === 'TESOURO') return 'BRL';
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

  static buildOrchestrationLog(input: {
    transfer: InternationalTransfer;
    reconciliation?: TransferReconciliation | null;
  }): TransferOrchestrationLog {
    const generatedAt = new Date().toISOString();
    const transfer = input.transfer;
    const reconciliation = input.reconciliation || null;
    const metadata = asRecord(transfer.reconciliation_metadata);
    const settlement = asRecord(metadata.stellar_settlement) as SettlementEvidence | undefined;
    const payout = asRecord(metadata.payout_instruction) as PayoutInstruction | undefined;
    const quote = asRecord(metadata.quote);
    const provenance = (
      metadata.quote_provenance ||
      quote.provenance ||
      quote.quote_provenance ||
      metadata.provenance
    ) as QuoteProvenance | undefined;
    const traceIds = { requestIds: new Set<string>(), correlationIds: new Set<string>() };
    collectTraceIds(metadata, traceIds);
    collectTraceIds(reconciliation?.evidence, traceIds);
    const correlationId = firstText(...Array.from(traceIds.correlationIds));
    const evidence = asRecord(reconciliation?.evidence);
    const validation = asRecord(evidence.metric_validation);
    const timeline: TransferOrchestrationLogEntry[] = [];

    const add = (entry: TransferOrchestrationLogEntry) => {
      timeline.push({
        ...entry,
        references: stripUndefined(entry.references || {}),
      });
    };

    add({
      step: 'quote_created',
      state: 'QUOTE_CREATED',
      status: hasReached(transfer.status, 'QUOTE_CREATED') || transfer.status === 'FAILED' ? 'completed' : 'pending',
      at: transfer.created_at,
      summary: 'BRL/USD quote accepted into an institution transfer record.',
      references: {
        quote_id: transfer.quote_id,
        quote_source: firstText(quote.quote_source),
        quote_provenance_kind: provenance?.kind,
        quote_live: provenance?.live,
        quote_fallback: provenance?.fallback,
        quote_executable: provenance?.executable,
      },
    });

    add({
      step: 'pix_intent_created',
      state: 'PIX_PENDING',
      status: transfer.pix_order_id || transfer.pix_payment_id ? 'completed' : transfer.status === 'FAILED' ? 'failed' : 'pending',
      at: transfer.updated_at,
      summary: transfer.pix_order_id || transfer.pix_payment_id
        ? 'PIX funding intent reference is attached to the transfer.'
        : 'PIX funding intent has not been attached yet.',
      references: {
        pix_order_id: transfer.pix_order_id,
        pix_payment_id: transfer.pix_payment_id,
        pix_status: transfer.pix_status,
      },
    });

    add({
      step: 'pix_funding_confirmed',
      state: 'PIX_RECEIVED',
      status: transfer.pix_received_at || hasReached(transfer.status, 'PIX_RECEIVED') ? 'completed' : transfer.status === 'FAILED' ? 'failed' : 'pending',
      at: transfer.pix_received_at,
      summary: transfer.pix_received_at
        ? 'Source PIX funding event has been confirmed.'
        : 'Waiting for source PIX funding confirmation.',
      references: {
        pix_order_id: transfer.pix_order_id,
        pix_status: transfer.pix_status,
      },
    });

    if (metadata.pix_webhook_replayed_at) {
      add({
        step: 'pix_funding_replay',
        state: 'PIX_RECEIVED',
        status: 'replayed',
        at: firstText(metadata.pix_webhook_replayed_at),
        summary: 'Repeated PIX funding event was treated idempotently.',
        references: {
          pix_order_id: transfer.pix_order_id,
          pix_status: transfer.pix_status,
        },
      });
    }

    add({
      step: 'brl_to_usdc_prepared',
      state: 'BRL_TO_USDC_PENDING',
      status: hasReached(transfer.status, 'BRL_TO_USDC_PENDING') ? 'completed' : transfer.status === 'FAILED' ? 'failed' : 'pending',
      at: transfer.pix_received_at,
      summary: 'Lifecycle is ready to represent BRL funding as USDC settlement exposure.',
      references: {
        source_amount_brl: transfer.brl_amount,
        quoted_usd_amount: transfer.quoted_usd_amount,
        fx_rate: transfer.fx_rate,
      },
    });

    add({
      step: 'stellar_settlement',
      state: 'USDC_SETTLED',
      status: transfer.stellar_tx_hash || settlement?.stellar_tx_hash ? 'completed' : transfer.status === 'FAILED' ? 'failed' : 'pending',
      at: transfer.stellar_settled_at || settlement?.settled_at,
      summary: transfer.stellar_tx_hash || settlement?.stellar_tx_hash
        ? 'Stellar settlement evidence is attached.'
        : 'Stellar settlement evidence has not been attached yet.',
      references: {
        stellar_tx_hash: transfer.stellar_tx_hash || settlement?.stellar_tx_hash,
        stellar_memo: transfer.stellar_memo || settlement?.stellar_memo,
        stellar_network: settlement?.network,
        execution_mode: settlement?.execution_mode,
        asset_code: transfer.stellar_asset_code || settlement?.asset_code,
      },
    });

    if (metadata.stellar_settlement_replayed_at) {
      add({
        step: 'stellar_settlement_replay',
        state: 'USDC_SETTLED',
        status: 'replayed',
        at: firstText(metadata.stellar_settlement_replayed_at),
        summary: 'Repeated Stellar settlement request returned existing evidence.',
        references: {
          stellar_tx_hash: transfer.stellar_tx_hash || settlement?.stellar_tx_hash,
        },
      });
    }

    add({
      step: 'payout_instruction',
      state: 'PAYOUT_INSTRUCTION_CREATED',
      status: transfer.payout_instruction_id || payout?.payout_instruction_id ? 'completed' : transfer.status === 'FAILED' ? 'failed' : 'pending',
      at: payout?.created_at,
      summary: transfer.payout_instruction_id || payout?.payout_instruction_id
        ? 'Destination payout instruction has been created through the selected adapter.'
        : 'Destination payout instruction has not been created yet.',
      references: {
        payout_provider: transfer.payout_provider || payout?.provider_name,
        payout_instruction_id: transfer.payout_instruction_id || payout?.payout_instruction_id,
        provider_payout_id: transfer.provider_payout_id || payout?.provider_payout_id,
        payout_status: transfer.payout_status || payout?.status,
      },
    });

    if (metadata.payout_instruction_replayed_at) {
      add({
        step: 'payout_instruction_replay',
        state: 'PAYOUT_INSTRUCTION_CREATED',
        status: 'replayed',
        at: firstText(metadata.payout_instruction_replayed_at),
        summary: 'Repeated payout instruction request returned the existing provider reference.',
        references: {
          payout_instruction_id: transfer.payout_instruction_id || payout?.payout_instruction_id,
          provider_payout_id: transfer.provider_payout_id || payout?.provider_payout_id,
        },
      });
    }

    if (metadata.payout_status_refresh) {
      const refresh = asRecord(metadata.payout_status_refresh);
      add({
        step: 'payout_status_refresh',
        state: transfer.status,
        status: transfer.status === 'FAILED' ? 'failed' : transfer.status === 'PAYOUT_COMPLETED' ? 'completed' : 'captured',
        at: firstText(refresh.refreshed_at),
        summary: 'Payout provider status was refreshed and persisted.',
        references: {
          payout_provider: refresh.provider,
          provider_payout_id: refresh.provider_payout_id,
          payout_status: refresh.status,
        },
      });
    }

    add({
      step: 'reconciliation',
      state: transfer.status,
      status: reconciliation ? 'captured' : 'pending',
      at: reconciliation?.updated_at,
      summary: reconciliation
        ? 'Reconciliation record is available with route metrics and evidence references.'
        : 'Reconciliation record has not been loaded yet.',
      references: {
        metrics_valid: evidence.metrics_valid,
        fee_math_matches_delta: validation.fee_math_matches_delta,
        final_payout_status: reconciliation?.final_payout_status,
      },
    });

    for (const item of transfer.error_logs || []) {
      const error = asRecord(item);
      add({
        step: `failure_${firstText(error.stage, 'unknown')}`,
        state: transfer.status,
        status: 'failed',
        at: firstText(error.at),
        summary: compactText(firstText(error.message, 'Transfer lifecycle error recorded.'), 240),
        references: {
          stage: error.stage,
        },
      });
    }

    timeline.sort((a, b) => {
      const left = Date.parse(firstText(a.at));
      const right = Date.parse(firstText(b.at));
      if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
      if (!Number.isFinite(left)) return 1;
      if (!Number.isFinite(right)) return -1;
      return left - right;
    });

    return {
      generated_at: generatedAt,
      transfer_id: transfer.transfer_id,
      quote_id: transfer.quote_id,
      current_status: transfer.status,
      ...(correlationId ? { correlation_id: correlationId } : {}),
      request_ids: Array.from(traceIds.requestIds),
      quote_provenance: provenance,
      evidence_status: {
        quote: provenance?.fallback ? 'sandbox' : provenance ? 'captured' : 'missing',
        pix_funding: transfer.pix_order_id || transfer.pix_payment_id
          ? transfer.pix_received_at || hasReached(transfer.status, 'PIX_RECEIVED') ? 'captured' : 'pending'
          : transfer.status === 'FAILED' ? 'failed' : 'missing',
        stellar_settlement: settlementEvidenceState(transfer, settlement),
        payout_instruction: payoutEvidenceState(transfer, payout),
        reconciliation: reconciliation ? 'captured' : 'missing',
      },
      redaction: {
        applied: true,
        notes: [
          'Destination account holder is hashed.',
          'Bank account and routing numbers expose only last four digits when present.',
          'No session tokens, PINs, API keys, private keys, or raw provider secrets are included.',
        ],
      },
      destination: redactedDestination(transfer),
      timeline,
      reconciliation_summary: {
        available: Boolean(reconciliation),
        metrics_valid: evidence.metrics_valid as boolean | undefined,
        final_payout_status: reconciliation?.final_payout_status,
        stellar_tx_hash: reconciliation?.stellar_tx_hash,
        payout_instruction_id: reconciliation?.payout_instruction_id,
      },
      next_action: firstText(metadata.next_action) || undefined,
      error_count: transfer.error_logs?.length || 0,
      errors: (transfer.error_logs || []).map((item) => {
        const error = asRecord(item);
        return {
          at: firstText(error.at) || undefined,
          stage: firstText(error.stage) || undefined,
          message: compactText(firstText(error.message, 'Transfer lifecycle error recorded.'), 240),
        };
      }),
    };
  }
}
