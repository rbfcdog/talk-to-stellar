import type {
  JsonRecord,
  RouteEconomics,
  TransferState,
  WorkflowSnapshot,
} from "./settlement-console.types";

export const REPOSITORY_URL = "https://github.com/rbfcdog/talk-to-stellar";

export const TRANSFER_STATES: Array<{ state: TransferState; label: string }> = [
  { state: "QUOTE_CREATED", label: "Route" },
  { state: "PIX_PENDING", label: "PIX intent" },
  { state: "PIX_RECEIVED", label: "Funded" },
  { state: "BRL_TO_USDC_PENDING", label: "Conversion" },
  { state: "USDC_SETTLEMENT_PENDING", label: "Stellar submit" },
  { state: "USDC_SETTLED", label: "Settled" },
  { state: "PAYOUT_INSTRUCTION_CREATED", label: "Instruction" },
  { state: "PAYOUT_PENDING", label: "Payout" },
  { state: "PAYOUT_COMPLETED", label: "Complete" },
];

export function text(value: unknown) {
  return String(value || "").trim();
}

export function numberValue(value: unknown) {
  const parsed = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function money(value: unknown, currency: "BRL" | "USD") {
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numberValue(value));
}

export function percent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(2) : "0.00"}%`;
}

export function compact(value: unknown, size = 20) {
  const raw = text(value);
  if (!raw) return "-";
  return raw.length > size ? `${raw.slice(0, size)}...` : raw;
}

export function pretty(value: unknown) {
  return JSON.stringify(value || {}, null, 2);
}

function hashPlaceholder(value: unknown) {
  return text(value) ? "[redacted]" : value;
}

export function redactSensitive(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, item]) => {
      if (/_hash$|_last4$/i.test(key)) return [key, item];
      if (/^(pix_payment_id|pix_order_id|provider_payout_id|order_id|payment_id)$/i.test(key)) {
        return [key, hashPlaceholder(item)];
      }
      if (/pin|token|secret|password|authorization|private|seed|api[_-]?key/i.test(key)) {
        return [key, hashPlaceholder(item)];
      }
      if (/accountNumber|account_number|routingNumber|routing_number|email|legal_name|entity_name|tax_id|cpf/i.test(key)) {
        return [key, hashPlaceholder(item)];
      }
      return [key, redactSensitive(item)];
    }),
  );
}

export function routeEconomics(
  quote: JsonRecord | null,
  transfer: JsonRecord | null,
  reconciliation: JsonRecord | null,
): RouteEconomics {
  const metrics = reconciliation?.evidence?.metrics || {};
  const feeMetadata = quote?.metadata?.fee_breakdown || transfer?.reconciliation_metadata?.fee_breakdown || {};
  const sourceBrl = numberValue(quote?.brl_amount || transfer?.brl_amount);
  const fxRate = numberValue(quote?.fx_rate || transfer?.fx_rate);
  const grossUsd = numberValue(
    metrics.baseline_usd_before_route_costs ||
    feeMetadata.gross_usd_before_fees ||
    (fxRate > 0 ? sourceBrl / fxRate : 0),
  );
  const destinationUsd = numberValue(
    metrics.destination_usd_after_route_costs ||
    quote?.estimated_usd_amount ||
    transfer?.quoted_usd_amount,
  );
  const platformFeeBrl = numberValue(
    metrics.talktostellar_fee_brl ||
    metrics.platform_fee_brl ||
    feeMetadata.platform_fee_brl ||
    quote?.platform_fee?.amount ||
    transfer?.fees?.platform_fee?.amount,
  );
  const platformFeeUsd = numberValue(
    metrics.talktostellar_fee_usd_equivalent ||
    metrics.platform_fee_usd_equivalent ||
    feeMetadata.platform_fee_usd,
  ) || (fxRate > 0 ? platformFeeBrl / fxRate : 0);
  const onRampFeeBrl = numberValue(metrics.provider_on_ramp_fee_brl_equivalent || feeMetadata.on_ramp_fee_brl);
  const onRampFeeUsd = numberValue(metrics.provider_on_ramp_fee_usd_equivalent || feeMetadata.on_ramp_fee_usd) ||
    (fxRate > 0 ? onRampFeeBrl / fxRate : 0);
  const offRampFeeBrl = numberValue(metrics.provider_off_ramp_fee_brl_equivalent || feeMetadata.off_ramp_fee_brl);
  const offRampFeeUsd = numberValue(metrics.provider_off_ramp_fee_usd_equivalent || feeMetadata.off_ramp_fee_usd) ||
    (fxRate > 0 ? offRampFeeBrl / fxRate : 0);
  const componentFeeUsd = platformFeeUsd + onRampFeeUsd + offRampFeeUsd;
  const totalFeeUsd = numberValue(
    metrics.total_charged_fee_usd ||
    metrics.total_empirical_fee_usd ||
    feeMetadata.total_charged_fee_usd,
  ) || componentFeeUsd;
  const totalFeeBrl = numberValue(
    metrics.total_charged_fee_brl_equivalent ||
    metrics.total_empirical_fee_brl_equivalent ||
    quote?.total_fee?.amount_brl_equivalent ||
    transfer?.fees?.total_fee?.amount_brl_equivalent,
  ) || (fxRate > 0 ? totalFeeUsd * fxRate : 0);
  const impliedCost = Math.max(0, grossUsd - destinationUsd);
  const retainedPct = grossUsd > 0 ? (destinationUsd / grossUsd) * 100 : 0;
  const feePct = grossUsd > 0 ? (totalFeeUsd / grossUsd) * 100 : 0;
  const feeVarianceUsd = Math.abs(impliedCost - totalFeeUsd);
  const backendValid = reconciliation?.evidence?.metrics_valid;

  return {
    sourceBrl,
    fxRate,
    grossUsd,
    destinationUsd,
    platformFeeBrl,
    platformFeeUsd,
    onRampFeeBrl,
    onRampFeeUsd,
    offRampFeeBrl,
    offRampFeeUsd,
    totalFeeBrl,
    totalFeeUsd,
    retainedPct,
    feePct,
    feeVarianceUsd,
    metricsValid: typeof backendValid === "boolean"
      ? backendValid
      : sourceBrl > 0 && fxRate > 0 && destinationUsd >= 0 && feeVarianceUsd <= 0.02,
  };
}

export function evidenceRows(
  workflow: WorkflowSnapshot | null,
  reviewerEvidence: JsonRecord | null,
) {
  const checklist = new Map<string, JsonRecord>(
    (Array.isArray(reviewerEvidence?.checklist) ? reviewerEvidence.checklist : [])
      .map((item: JsonRecord) => [String(item.id), item]),
  );
  return [
    {
      id: "repository",
      label: "Repository",
      detail: "main branch",
      ready: checklist.get("repository")?.status === "ready" || Boolean(REPOSITORY_URL),
    },
    {
      id: "dashboard_screenshot",
      label: "Dashboard",
      detail: "/institution-settlement",
      ready: checklist.get("dashboard_screenshot")?.status === "ready" || Boolean(reviewerEvidence),
    },
    {
      id: "orchestration_logs",
      label: "Orchestration log",
      detail: workflow ? `${workflow.progress.completed_steps}/${workflow.progress.total_steps} lifecycle steps` : "waiting",
      ready: checklist.get("orchestration_logs")?.status === "ready" || Boolean(reviewerEvidence?.orchestration_log?.timeline?.length),
    },
    {
      id: "transfer_record",
      label: "Transfer record",
      detail: compact(reviewerEvidence?.transfer_record?.transfer_id, 18),
      ready: checklist.get("transfer_record")?.status === "ready" || Boolean(reviewerEvidence?.transfer_record?.transfer_id),
    },
  ];
}

export function payoutEvidenceRows(payoutEvidence: JsonRecord | null) {
  const checklist = Array.isArray(payoutEvidence?.checklist) ? payoutEvidence.checklist : [];
  if (!checklist.length) {
    return [
      {
        id: "adapter_interface_code",
        label: "Adapter Interface Code",
        detail: "backend payout contract",
        ready: true,
      },
      {
        id: "stellar_transaction_hash",
        label: "Stellar Transaction Hash",
        detail: "waiting",
        ready: false,
      },
      {
        id: "circle_bridge_compatibility",
        label: "Circle / Bridge Compatibility",
        detail: "provider adapters",
        ready: true,
      },
      {
        id: "payout_coordination_record",
        label: "Payout Coordination Record",
        detail: "waiting",
        ready: false,
      },
    ];
  }
  return checklist.map((item: JsonRecord) => ({
    id: text(item.id),
    label: text(item.label),
    detail: compact(item.artifact, 34),
    ready: item.ready === true,
  }));
}

export function createCorrelationId() {
  return `instawards_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
