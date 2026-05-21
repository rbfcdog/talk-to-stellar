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

function buildRouteMetrics(transfer: InternationalTransfer) {
  const sourceBrl = toNumber(transfer.brl_amount);
  const fxRate = toNumber(transfer.fx_rate);
  const baselineUsd = fxRate > 0 ? sourceBrl / fxRate : 0;
  const destinationUsd = toNumber(transfer.quoted_usd_amount);
  const platformFeeBrl = toNumber(transfer.fees?.platform_fee?.amount);
  const platformFeeUsd = fxRate > 0 ? platformFeeBrl / fxRate : 0;
  const providerFeeUsd = toNumber(transfer.fees?.estimated_provider_fee?.amount);
  const totalFeeUsd = toNumber(transfer.fees?.total_fee?.amount_usd_equivalent) || (platformFeeUsd + providerFeeUsd);
  const routeDeltaUsd = destinationUsd - baselineUsd;
  const impliedCostUsd = Math.max(0, baselineUsd - destinationUsd);
  const feeDeltaUsd = Math.abs(impliedCostUsd - totalFeeUsd);
  const retainedPct = baselineUsd > 0 ? (destinationUsd / baselineUsd) * 100 : 0;
  const effectiveFeeBps = baselineUsd > 0 ? (impliedCostUsd / baselineUsd) * 10000 : 0;

  return {
    source_amount_brl: amount(sourceBrl, 2),
    fx_rate_brl_per_usd: amount(fxRate, 8),
    baseline_usd_before_route_costs: amount(baselineUsd),
    destination_usd_after_route_costs: amount(destinationUsd),
    platform_fee_brl: amount(platformFeeBrl, 2),
    platform_fee_usd_equivalent: amount(platformFeeUsd),
    provider_fee_usd: amount(providerFeeUsd),
    total_fee_usd_equivalent: amount(totalFeeUsd),
    route_delta_usd: amount(routeDeltaUsd),
    implied_cost_usd: amount(impliedCostUsd),
    retained_pct: amount(retainedPct, 4),
    effective_fee_bps: amount(effectiveFeeBps, 2),
    fee_delta_usd: amount(feeDeltaUsd),
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
