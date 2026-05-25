"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  AlertCircle,
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardList,
  Copy,
  Database,
  Code2,
  Landmark,
  ListChecks,
  Loader2,
  Network,
  Play,
  QrCode,
  RefreshCw,
  Route,
  Send,
  Server,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { getClientSession } from "@/lib/session";

type LogEntry = {
  id: string;
  label: string;
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

type EventEntry = {
  id: string;
  at: string;
  title: string;
  detail: string;
  state: "running" | "ok" | "error" | "info";
  path?: string;
};

type TransferState =
  | "QUOTE_CREATED"
  | "PIX_PENDING"
  | "PIX_RECEIVED"
  | "BRL_TO_USDC_PENDING"
  | "USDC_SETTLEMENT_PENDING"
  | "USDC_SETTLED"
  | "PAYOUT_INSTRUCTION_CREATED"
  | "PAYOUT_PENDING"
  | "PAYOUT_COMPLETED"
  | "FAILED"
  | "REFUNDED";

const states: Array<{ key: TransferState; label: string; icon: any }> = [
  { key: "QUOTE_CREATED", label: "Route quote", icon: ClipboardList },
  { key: "PIX_PENDING", label: "Funding pending", icon: QrCode },
  { key: "PIX_RECEIVED", label: "Funding received", icon: Banknote },
  { key: "BRL_TO_USDC_PENDING", label: "BRL -> USDC", icon: WalletCards },
  { key: "USDC_SETTLEMENT_PENDING", label: "Blockchain send", icon: Network },
  { key: "USDC_SETTLED", label: "USDC settled", icon: CheckCircle2 },
  { key: "PAYOUT_INSTRUCTION_CREATED", label: "Destination instruction", icon: Landmark },
  { key: "PAYOUT_PENDING", label: "Destination pending", icon: Send },
  { key: "PAYOUT_COMPLETED", label: "Done", icon: ShieldCheck },
];

const stateRank = new Map(states.map((state, index) => [state.key, index]));

const nextActionByState: Partial<Record<TransferState, string>> = {
  QUOTE_CREATED: "Create the institution funding intent and attach the funding reference to the settlement record.",
  PIX_PENDING: "Wait for source-institution funding confirmation.",
  PIX_RECEIVED: "Trigger blockchain settlement so USDC evidence can be attached.",
  BRL_TO_USDC_PENDING: "Backend is moving from BRL exposure into USDC settlement preparation.",
  USDC_SETTLEMENT_PENDING: "Backend is submitting or preparing the Stellar blockchain transaction.",
  USDC_SETTLED: "Create the destination-institution USD instruction through the selected adapter.",
  PAYOUT_INSTRUCTION_CREATED: "Move the destination instruction into pending or completed state.",
  PAYOUT_PENDING: "Poll destination status and inspect reconciliation evidence.",
  PAYOUT_COMPLETED: "Capture reconciliation output, screenshots and delta evidence.",
  FAILED: "Open the latest API log and error logs on the settlement record.",
  REFUNDED: "Capture refund evidence and close the settlement record.",
};

const phaseDescriptions: Record<TransferState, string> = {
  QUOTE_CREATED: "The quote is accepted and the institution settlement record exists, but source funding has not settled yet.",
  PIX_PENDING: "A funding reference exists. The system is waiting for the source institution event before value moves forward.",
  PIX_RECEIVED: "Source funding is confirmed. The route can now move into USDC settlement.",
  BRL_TO_USDC_PENDING: "The backend is representing the BRL exposure as USDC for the Stellar leg.",
  USDC_SETTLEMENT_PENDING: "The Stellar blockchain transaction is being prepared or submitted depending on environment configuration.",
  USDC_SETTLED: "Blockchain settlement evidence is attached to the institution settlement record.",
  PAYOUT_INSTRUCTION_CREATED: "The USD adapter has created an instruction object for the destination institution.",
  PAYOUT_PENDING: "The destination has a pending instruction. Live routes would be polled or reconciled by webhook.",
  PAYOUT_COMPLETED: "The institution settlement reached terminal success in the orchestration layer.",
  FAILED: "The flow failed and the settlement error log should be inspected.",
  REFUNDED: "The flow ended in refund state.",
};

function text(value: unknown) {
  return String(value || "").trim();
}

function pretty(value: unknown) {
  return JSON.stringify(value || {}, null, 2);
}

function redactSensitive(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redactSensitive);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (/pin|token|secret|key|accountNumber|account_number/i.test(key)) {
        return [key, item ? "[redacted]" : item];
      }
      return [key, redactSensitive(item)];
    }),
  );
}

function formatCurrency(value: unknown, currency: "BRL" | "USD") {
  const numeric = Number(String(value || "0").replace(",", "."));
  return new Intl.NumberFormat(currency === "BRL" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function parseNumber(value: unknown) {
  const numeric = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "0.00%";
  return `${value.toFixed(2)}%`;
}

function feeSourceLabel(value: unknown) {
  const raw = text(value);
  if (!raw) return "pending quote";
  if (/not_returned|no_fee_returned/i.test(raw)) return "not returned by quote";
  if (/pending/i.test(raw)) return "pending quote";
  if (/order_context/i.test(raw)) return "from payment order";
  if (/metadata/i.test(raw)) return "from route metadata";
  if (/quote/i.test(raw)) return "from quote";
  if (/configured/i.test(raw)) return "configured product fee";
  return raw.replace(/_/g, " ");
}

function shortId(value: unknown, size = 18) {
  const raw = text(value);
  if (!raw) return "-";
  return raw.length > size ? `${raw.slice(0, size)}...` : raw;
}

function formatTime(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isExpiredQuoteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /quote (is not active:\s*)?expired|not active:\s*expired/i.test(message);
}

function quoteStatus(value: any) {
  return text(value?.quote_status || value?.status).toUpperCase();
}

function quoteExpiresAtMs(value: any) {
  const parsed = Date.parse(text(value?.expires_at));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isInactiveQuote(value: any, nowMs = Date.now()) {
  if (!value?.quote_id) return false;
  const status = quoteStatus(value);
  if (status && status !== "ACTIVE") return true;
  const expiresAt = quoteExpiresAtMs(value);
  return expiresAt > 0 && expiresAt <= nowMs;
}

function quoteAmountMatches(value: any, sourceAmount: unknown) {
  if (!value?.quote_id) return false;
  return Math.abs(parseNumber(value.brl_amount) - parseNumber(sourceAmount)) < 0.01;
}

function formatQuoteFreshness(value: any, nowMs: number) {
  if (!value?.quote_id) return "No quote";
  const status = quoteStatus(value) || "UNKNOWN";
  if (status !== "ACTIVE") return status;
  const expiresAt = quoteExpiresAtMs(value);
  if (!expiresAt) return status;
  const totalSeconds = Math.floor((expiresAt - nowMs) / 1000);
  if (totalSeconds <= 0) return "EXPIRED";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s left`;
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-tts-muted ">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-tts-border bg-tts-surface px-3 text-sm font-semibold text-tts-deep shadow-sm outline-none placeholder:text-tts-muted focus:border-tts-gold     "
      />
    </label>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-tts-muted ">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-11 w-full rounded-lg border border-tts-border bg-tts-surface px-3 text-sm font-semibold text-tts-deep shadow-sm outline-none focus:border-tts-gold    "
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "dark",
  full = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "dark" | "light" | "green" | "blue";
  full?: boolean;
}) {
  const classes = {
    dark: "border border-tts-gold bg-black text-tts-gold hover:border-tts-gold hover:bg-tts-surface",
    light: "border border-tts-border bg-black text-tts-deep hover:border-tts-gold hover:bg-tts-surface",
    green: "border border-tts-confirm bg-black text-tts-confirm hover:border-tts-confirm hover:bg-tts-surface",
    blue: "border border-tts-gold bg-black text-tts-gold hover:border-tts-gold hover:bg-tts-surface",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${full ? "w-full" : ""} ${classes[variant]}`}
    >
      {children}
    </button>
  );
}

function StatusPill({ state, children }: { state: EventEntry["state"] | "idle"; children: ReactNode }) {
  const classes = {
    running: "border-tts-gold bg-black text-tts-gold",
    ok: "border-tts-confirm bg-black text-tts-confirm",
    error: "border-tts-error bg-black text-tts-error",
    info: "border-tts-border bg-black text-tts-deep",
    idle: "border-tts-border bg-black text-tts-muted",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-bold ${classes[state]}`}>
      {children}
    </span>
  );
}

export default function InternationalTransferClient() {
  const opsMocksAllowed = String(process.env.NEXT_PUBLIC_ALLOW_OPS_MOCKS || "").toLowerCase() === "true";
  const [brlAmount, setBrlAmount] = useState("1000");
  const [senderName, setSenderName] = useState("Origin BR Institution Ltda");
  const [senderEmail, setSenderEmail] = useState("ops@origin-institution.example");
  const [recipientName, setRecipientName] = useState("Destination USD Institution LLC");
  const [accountHolderType, setAccountHolderType] = useState<"individual" | "business">("business");
  const [bankName, setBankName] = useState("Destination USD Banking Partner");
  const [routingNumber, setRoutingNumber] = useState("021000021");
  const [accountNumber, setAccountNumber] = useState("123456789");
  const [accountType, setAccountType] = useState<"checking" | "savings">("checking");
  const [country, setCountry] = useState("US");
  const [providerLabel, setProviderLabel] = useState<"wise" | "mercury" | "revolut" | "other">("other");
  const [payoutProvider, setPayoutProvider] = useState<"mock" | "etherfuse" | "circle" | "bridge">("etherfuse");
  const [mockPix, setMockPix] = useState(false);
  const [runEtherfuseOffRamp, setRunEtherfuseOffRamp] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [manualSessionId, setManualSessionId] = useState("");
  const [manualSessionToken, setManualSessionToken] = useState("");
  const [walletPin, setWalletPin] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [transfer, setTransfer] = useState<any>(null);
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([
    {
      id: "initial",
      at: new Date().toISOString(),
      title: "Ready",
      detail: "Create an institution route quote or run the full controlled flow to start recording settlement events.",
      state: "info",
    },
  ]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const migrationError = /international_transfer_quotes|international_transfers|schema cache/i.test(error);

  useEffect(() => {
    getClientSession().then((session) => {
      setSessionId(session.sessionId || "");
    });
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const activeStatus = text(transfer?.status) as TransferState;
  const activeRank = stateRank.get(activeStatus) ?? -1;
  const latestEvent = events[0];
  const quoteExpired = isInactiveQuote(quote, nowMs);
  const quoteAmountStale = Boolean(quote?.quote_id && !quoteAmountMatches(quote, brlAmount));
  const quoteNeedsRefresh = Boolean(quote?.quote_id && (quoteExpired || quoteAmountStale));
  const quoteReady = Boolean(quote?.quote_id && !quoteNeedsRefresh);
  const quoteFreshness = quoteAmountStale ? "STALE AMOUNT" : formatQuoteFreshness(quote, nowMs);
  const currentPhase = activeStatus && phaseDescriptions[activeStatus]
    ? phaseDescriptions[activeStatus]
    : quoteNeedsRefresh
      ? "The current BRL/USD quote is no longer usable. Press Route to refresh it and create the institution settlement record."
    : "No institution settlement has been created yet.";
  const nextAction = activeStatus && nextActionByState[activeStatus]
    ? nextActionByState[activeStatus]
    : quoteNeedsRefresh
      ? "Refresh the route quote, then create the institution-to-institution settlement record."
    : quoteReady
      ? "Create the institution-to-institution settlement route from the active quote."
    : "Create an institution-to-institution settlement quote.";
  const quoteDelta = useMemo(() => {
    const sourceBrl = parseNumber(quote?.brl_amount || brlAmount);
    const fxRate = parseNumber(quote?.fx_rate);
    const baselineUsd = fxRate > 0 ? sourceBrl / fxRate : 0;
    const finalUsd = parseNumber(quote?.estimated_usd_amount || transfer?.quoted_usd_amount);
    const deltaUsd = baselineUsd > 0 ? finalUsd - baselineUsd : 0;
    const costUsd = Math.abs(Math.min(deltaUsd, 0));
    const deltaPct = baselineUsd > 0 ? (deltaUsd / baselineUsd) * 100 : 0;
    const retainedPct = baselineUsd > 0 ? (finalUsd / baselineUsd) * 100 : 0;

    return {
      sourceBrl,
      fxRate,
      baselineUsd,
      finalUsd,
      deltaUsd,
      costUsd,
      deltaPct,
      retainedPct,
    };
  }, [brlAmount, quote, transfer?.quoted_usd_amount]);
  const feeBreakdown = useMemo(() => {
    const metrics = reconciliation?.evidence?.metrics || {};
    const metadata = quote?.metadata?.fee_breakdown || transfer?.reconciliation_metadata?.fee_breakdown || {};
    const grossUsd = parseNumber(
      metrics.baseline_usd_before_route_costs ||
      metadata.gross_usd_before_fees ||
      quoteDelta.baselineUsd,
    );
    const platformFeeBrl = parseNumber(
      metrics.talktostellar_fee_brl ||
      metrics.platform_fee_brl ||
      metadata.platform_fee_brl ||
      quote?.platform_fee?.amount ||
      transfer?.fees?.platform_fee?.amount,
    );
    const platformFeeUsd = parseNumber(
      metrics.talktostellar_fee_usd_equivalent ||
      metrics.platform_fee_usd_equivalent ||
      metadata.platform_fee_usd,
    ) || (quoteDelta.fxRate > 0 ? platformFeeBrl / quoteDelta.fxRate : 0);
    const onRampFeeUsd = parseNumber(
      metrics.provider_on_ramp_fee_usd_equivalent ||
      metadata.on_ramp_fee_usd ||
      metadata.provider_on_ramp_fee_usd,
    );
    const onRampFeeBrl = parseNumber(
      metrics.provider_on_ramp_fee_brl_equivalent ||
      metadata.on_ramp_fee_brl ||
      metadata.provider_on_ramp_fee_brl,
    ) || (quoteDelta.fxRate > 0 ? onRampFeeUsd * quoteDelta.fxRate : 0);
    const offRampFeeUsd = parseNumber(
      metrics.provider_off_ramp_fee_usd_equivalent ||
      metadata.off_ramp_fee_usd ||
      metadata.provider_off_ramp_fee_usd,
    );
    const offRampFeeBrl = parseNumber(
      metrics.provider_off_ramp_fee_brl_equivalent ||
      metadata.off_ramp_fee_brl ||
      metadata.provider_off_ramp_fee_brl,
    ) || (quoteDelta.fxRate > 0 ? offRampFeeUsd * quoteDelta.fxRate : 0);
    const chargedComponentFeeUsd = platformFeeUsd + onRampFeeUsd + offRampFeeUsd;
    const chargedTotalFeeUsd = parseNumber(
      metrics.total_charged_fee_usd ||
      metadata.total_charged_fee_usd ||
      metrics.total_empirical_fee_usd ||
      metrics.total_fee_usd_equivalent ||
      metadata.total_fee_usd,
    );
    const totalFeeUsd = chargedTotalFeeUsd || Math.max(0, chargedComponentFeeUsd);
    const totalFeeBrl = parseNumber(
      metrics.total_charged_fee_brl_equivalent ||
      metadata.total_charged_fee_brl ||
      metrics.total_empirical_fee_brl_equivalent ||
      metadata.total_fee_brl ||
      quote?.total_fee?.amount_brl_equivalent ||
      transfer?.fees?.total_fee?.amount_brl_equivalent,
    ) || (quoteDelta.fxRate > 0 ? totalFeeUsd * quoteDelta.fxRate : 0);
    const afterPlatformUsd = parseNumber(metadata.after_platform_fee_usd) || Math.max(0, grossUsd - platformFeeUsd);
    const afterAllUsd = parseNumber(
      metrics.destination_usd_after_route_costs ||
      metadata.estimated_usd_after_charged_fees,
    ) || Math.max(0, grossUsd - totalFeeUsd);
    const totalFeePct = grossUsd > 0 ? (totalFeeUsd / grossUsd) * 100 : 0;
    const platformFeePct = grossUsd > 0 ? (platformFeeUsd / grossUsd) * 100 : 0;
    const onRampFeePct = grossUsd > 0 ? (onRampFeeUsd / grossUsd) * 100 : 0;
    const offRampFeePct = grossUsd > 0 ? (offRampFeeUsd / grossUsd) * 100 : 0;
    const retainedPct = grossUsd > 0 ? (afterAllUsd / grossUsd) * 100 : quoteDelta.retainedPct;

    return {
      grossUsd,
      platformFeeBrl,
      platformFeeUsd,
      onRampFeeUsd,
      onRampFeeBrl,
      offRampFeeUsd,
      offRampFeeBrl,
      totalFeeUsd,
      totalFeeBrl,
      totalFeePct,
      platformFeePct,
      onRampFeePct,
      offRampFeePct,
      afterPlatformUsd,
      afterAllUsd,
      retainedPct,
      onRampFeeSource: metrics.provider_on_ramp_fee_source || metadata.on_ramp_fee_source,
      offRampFeeSource: metrics.provider_off_ramp_fee_source || metadata.off_ramp_fee_source,
      feeSource: metrics.fee_source || metadata.fee_model,
    };
  }, [
    reconciliation?.evidence?.metrics,
    quote?.metadata?.fee_breakdown,
    quote?.platform_fee?.amount,
    quote?.total_fee?.amount_brl_equivalent,
    quote?.total_fee?.amount_usd_equivalent,
    quoteDelta.baselineUsd,
    quoteDelta.finalUsd,
    quoteDelta.fxRate,
    quoteDelta.retainedPct,
    transfer?.fees?.platform_fee?.amount,
    transfer?.fees?.total_fee?.amount_brl_equivalent,
    transfer?.fees?.total_fee?.amount_usd_equivalent,
    transfer?.reconciliation_metadata?.fee_breakdown,
  ]);
  const metricValidation = useMemo(() => {
    const backendMetrics = reconciliation?.evidence?.metrics || {};
    const backendValidation = reconciliation?.evidence?.metric_validation || {};
    const totalFeeUsd = feeBreakdown.totalFeeUsd;
    const impliedCostUsd = feeBreakdown.grossUsd > 0 ? Math.max(0, feeBreakdown.grossUsd - feeBreakdown.afterAllUsd) : 0;
    const feeDeltaUsd = Math.abs(impliedCostUsd - totalFeeUsd);
    const checks = [
      {
        label: "Source amount is valid",
        ok: quoteDelta.sourceBrl > 0 || backendValidation.source_amount_positive === true,
        detail: formatCurrency(quoteDelta.sourceBrl, "BRL"),
      },
      {
        label: "FX rate is valid",
        ok: quoteDelta.fxRate > 0 || backendValidation.fx_rate_positive === true,
        detail: quoteDelta.fxRate ? `${quoteDelta.fxRate.toFixed(6)} BRL/USD` : "-",
      },
      {
        label: "Final value is non-negative",
        ok: feeBreakdown.afterAllUsd >= 0 || backendValidation.destination_not_negative === true,
        detail: formatCurrency(feeBreakdown.afterAllUsd, "USD"),
      },
      {
        label: "Fees explain the route delta",
        ok: quote ? feeDeltaUsd <= 0.02 : backendValidation.fee_math_matches_delta === true,
        detail: quote ? `${formatCurrency(feeDeltaUsd, "USD")} variance` : "-",
      },
      {
        label: "Retention is in expected range",
        ok: quote ? feeBreakdown.retainedPct >= 0 && feeBreakdown.retainedPct <= 100.5 : backendValidation.retained_pct_in_expected_range === true,
        detail: `${formatPercent(feeBreakdown.retainedPct)} retained`,
      },
    ];

    return {
      backendMetrics,
      backendValidation,
      totalFeeUsd,
      impliedCostUsd,
      feeDeltaUsd,
      checks,
      allOk: checks.every((check) => check.ok),
    };
  }, [feeBreakdown, quote, quoteDelta, reconciliation]);
  const evidenceItems = useMemo(
    () => [
      {
        label: "Quote ID",
        value: quote?.quote_id ? `${quote.quote_id}${quoteReady ? "" : ` (${quoteFreshness.toLowerCase()})`}` : "",
        ready: quoteReady,
      },
      { label: "Settlement ID", value: transfer?.transfer_id, ready: Boolean(transfer?.transfer_id) },
      { label: "Funding reference", value: transfer?.pix_order_id || transfer?.pix_payment_id, ready: Boolean(transfer?.pix_order_id || transfer?.pix_payment_id) },
      { label: "Funding status", value: transfer?.pix_status, ready: transfer?.status === "PIX_RECEIVED" || activeRank >= (stateRank.get("PIX_RECEIVED") ?? 2) },
      { label: "Blockchain hash", value: transfer?.stellar_tx_hash, ready: Boolean(transfer?.stellar_tx_hash) },
      { label: "Blockchain memo", value: transfer?.stellar_memo, ready: Boolean(transfer?.stellar_memo) },
      { label: "Destination instruction", value: transfer?.payout_instruction_id, ready: Boolean(transfer?.payout_instruction_id) },
      { label: "Destination reference ID", value: transfer?.provider_payout_id, ready: Boolean(transfer?.provider_payout_id) },
      { label: "Reconciliation", value: reconciliation?.transfer_id, ready: Boolean(reconciliation?.transfer_id) },
      { label: "Same-name check", value: transfer?.same_name_match_status, ready: Boolean(transfer?.same_name_match_status) },
    ],
    [activeRank, quote?.quote_id, quoteFreshness, quoteReady, reconciliation?.transfer_id, transfer],
  );

  const transferPayload = useMemo(
    () => ({
      quote_id: quote?.quote_id,
      user_id: sessionId || undefined,
      sender_identity: {
        legal_name: senderName,
        email: senderEmail,
        country: "BR",
        type: accountHolderType === "business" ? "institution" : "individual",
      },
      recipient_identity: {
        legal_name: recipientName,
        country,
        type: accountHolderType,
      },
      payout_destination: {
        accountHolderName: recipientName,
        accountHolderType,
        bankName,
        routingNumber,
        accountNumber,
        accountType,
        country,
        providerLabel,
      },
      same_name_payout_required: true,
    }),
    [accountHolderType, accountNumber, accountType, bankName, country, providerLabel, quote?.quote_id, recipientName, routingNumber, senderEmail, senderName, sessionId],
  );

  function pushEvent(title: string, detail: string, state: EventEntry["state"], path?: string) {
    setEvents((items) => [
      {
        id: `${Date.now()}-${title}-${Math.random().toString(16).slice(2)}`,
        at: new Date().toISOString(),
        title,
        detail,
        state,
        path,
      },
      ...items,
    ].slice(0, 20));
  }

  async function copyDebugBundle() {
    const bundle = {
      generated_at: new Date().toISOString(),
      current_operation: busy || "idle",
      value_delta: quoteDelta,
      metric_validation: metricValidation,
      quote: redactSensitive(quote),
      transfer: redactSensitive(transfer),
      reconciliation: redactSensitive(reconciliation),
      events,
      api_logs: logs,
    };
    await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function resetRun() {
    setQuote(null);
    setTransfer(null);
    setReconciliation(null);
    setLogs([]);
    setError("");
    setCopied(false);
    setEvents([
      {
        id: `reset-${Date.now()}`,
        at: new Date().toISOString(),
        title: "Reset",
        detail: "The local tester state was cleared. Backend records were not deleted.",
        state: "info",
      },
    ]);
  }

  async function callApi(label: string, method: string, path: string, body?: unknown) {
    const startedAt = performance.now();
    setBusy(label);
    setError("");
    pushEvent(label, `${method} ${path}`, "running", path);
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      const entry: LogEntry = {
        id: `${Date.now()}-${label}`,
        label,
        method,
        path,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        request: redactSensitive(body),
        response: payload,
      };
      setLogs((items) => [entry, ...items].slice(0, 8));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || `${label} failed with ${response.status}`);
      }
      const status = text(payload?.transfer?.status || payload?.quote?.quote_status || payload?.reconciliation?.final_payout_status);
      pushEvent(
        label,
        `HTTP ${response.status} in ${Math.round(performance.now() - startedAt)}ms${status ? `; backend state: ${status}` : ""}.`,
        "ok",
        path,
      );
      return payload;
    } catch (apiError: any) {
      const message = apiError?.message || String(apiError);
      setError(message);
      pushEvent(label, message, "error", path);
      setLogs((items) => [
        {
          id: `${Date.now()}-${label}-error`,
          label,
          method,
          path,
          request: redactSensitive(body),
          error: message,
          durationMs: Math.round(performance.now() - startedAt),
        },
        ...items,
      ].slice(0, 8));
      throw apiError;
    } finally {
      setBusy("");
    }
  }

  async function createQuote() {
    const payload = await callApi("Create quote", "POST", "/api/quotes/brl-usd", {
      brl_amount: brlAmount,
      user_id: sessionId || undefined,
    });
    setQuote(payload.quote);
    setTransfer(null);
    setReconciliation(null);
    return payload.quote;
  }

  async function ensureActiveRouteQuote(currentQuote = quote) {
    if (!currentQuote?.quote_id) {
      pushEvent("Quote needed", "Creating a BRL/USD quote before creating the institution route.", "info", "/api/quotes/brl-usd");
      return createQuote();
    }

    if (isInactiveQuote(currentQuote) || !quoteAmountMatches(currentQuote, brlAmount)) {
      const reason = isInactiveQuote(currentQuote) ? "expired" : "not aligned with the current BRL amount";
      pushEvent("Quote refresh", `The existing BRL/USD quote is ${reason}. Creating a fresh quote before routing.`, "info", "/api/quotes/brl-usd");
      return createQuote();
    }

    return currentQuote;
  }

  async function createTransfer(currentQuote = quote) {
    const activeQuote = await ensureActiveRouteQuote(currentQuote);
    try {
      const payload = await callApi("Create institution route", "POST", "/api/transfers", {
        ...transferPayload,
        quote_id: activeQuote.quote_id,
      });
      setTransfer(payload.transfer);
      setReconciliation(null);
      return payload.transfer;
    } catch (routeError) {
      if (!isExpiredQuoteError(routeError)) throw routeError;

      setQuote((stored: any) => (
        stored?.quote_id === activeQuote.quote_id
          ? { ...stored, quote_status: "EXPIRED", updated_at: new Date().toISOString() }
          : stored
      ));
      pushEvent("Quote expired", "Creating a fresh BRL/USD quote and retrying the institution route.", "info", "/api/quotes/brl-usd");
      const freshQuote = await createQuote();
      const retryPayload = await callApi("Create institution route", "POST", "/api/transfers", {
        ...transferPayload,
        quote_id: freshQuote.quote_id,
      });
      setTransfer(retryPayload.transfer);
      setReconciliation(null);
      setError("");
      return retryPayload.transfer;
    }
  }

	  async function createPixIntent(currentTransfer = transfer, useMock = mockPix) {
	    if (!currentTransfer?.transfer_id) throw new Error("Create an institution settlement route first.");
	    if (useMock && !opsMocksAllowed) {
	      throw new Error("Local PIX funding is disabled. Configure session credentials and create a payment-backed PIX intent.");
	    }
    const payload = await callApi("Create funding intent", "POST", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/pix-intent`, {
      mock_pix_intent: useMock,
      session_id: manualSessionId || undefined,
      session_token: manualSessionToken || undefined,
      email: senderEmail,
    });
    setTransfer(payload.transfer);
    return payload.transfer;
  }

	  async function simulatePixReceived(currentTransfer = transfer) {
	    if (!currentTransfer?.transfer_id) throw new Error("Create an institution settlement route first.");
	    if (!opsMocksAllowed) {
	      throw new Error("Internal funding confirmation is disabled. Wait for the payment confirmation event instead.");
	    }
	    const payload = await callApi("Confirm funding", "POST", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/funding-confirmation`, {
      status: "completed",
      event: "pix.received",
    });
    setTransfer(payload.transfer);
    return payload.transfer;
  }

  async function settleStellar(currentTransfer = transfer) {
    if (!currentTransfer?.transfer_id) throw new Error("Create an institution settlement route first.");
    const payload = await callApi("Settle blockchain", "POST", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/settle-stellar`);
    setTransfer(payload.transfer);
    return payload.transfer;
  }

  async function createPayoutInstruction(currentTransfer = transfer) {
    if (!currentTransfer?.transfer_id) throw new Error("Create an institution settlement route first.");
    const payload = await callApi("Create destination instruction", "POST", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/payout-instruction`, {
      provider: payoutProvider,
      session_id: manualSessionId || sessionId || undefined,
      session_token: manualSessionToken || undefined,
      wallet_pin: walletPin || undefined,
      run_etherfuse_offramp_test: payoutProvider === "etherfuse" && runEtherfuseOffRamp,
      target_brl: quoteDelta.sourceBrl ? String(quoteDelta.sourceBrl) : undefined,
    });
    setTransfer(payload.transfer);
    return payload.transfer;
  }

  async function loadReconciliation(currentTransfer = transfer) {
    if (!currentTransfer?.transfer_id) throw new Error("Create an institution settlement route first.");
    const payload = await callApi("Load reconciliation", "GET", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/reconciliation`);
    setReconciliation(payload.reconciliation);
    return payload.reconciliation;
  }

  async function runSandboxFlow() {
	    pushEvent("Payment-backed route started", "Running quote, institution route creation and PIX funding intent without local confirmation.", "info");
    try {
      const q = await createQuote();
      const t = await createTransfer(q);
      const pix = await createPixIntent(t, false);
      if (!opsMocksAllowed) {
	        pushEvent("Funding pending", "Local funding confirmation is disabled. The next transition must come from a payment confirmation event.", "info");
        await loadReconciliation(pix).catch(() => null);
        return;
      }
      const funded = await simulatePixReceived(pix);
      const settled = await settleStellar(funded);
      const payout = await createPayoutInstruction(settled);
      await loadReconciliation(payout);
	      pushEvent("Ops route complete", "The ops-only confirmation path completed. Keep this out of user-facing demos.", "ok");
	    } catch (flowError: any) {
	      pushEvent("Payment-backed route stopped", flowError?.message || String(flowError), "error");
	    }
  }

  const guidedSteps = [
    {
      label: "Quote",
      detail: quote ? (quoteReady ? formatCurrency(quote.estimated_usd_amount, "USD") : quoteFreshness) : "BRL -> USD route",
      done: quoteReady,
      active: !quoteReady,
      icon: ClipboardList,
    },
    {
      label: "Route",
      detail: transfer ? shortId(transfer.transfer_id, 16) : quoteNeedsRefresh ? "Refresh first" : "Create record",
      done: Boolean(transfer),
      active: Boolean(quoteReady && !transfer),
      icon: Route,
    },
    {
      label: "Funding",
      detail: transfer?.pix_status || "Source event",
      done: activeRank >= (stateRank.get("PIX_RECEIVED") ?? 2),
      active: Boolean(transfer && activeRank < (stateRank.get("PIX_RECEIVED") ?? 2)),
      icon: Banknote,
    },
    {
      label: "Blockchain",
      detail: transfer?.stellar_tx_hash ? shortId(transfer.stellar_tx_hash, 16) : "USDC evidence",
      done: activeRank >= (stateRank.get("USDC_SETTLED") ?? 5),
      active: Boolean(transfer && activeRank >= (stateRank.get("PIX_RECEIVED") ?? 2) && activeRank < (stateRank.get("USDC_SETTLED") ?? 5)),
      icon: Network,
    },
    {
      label: "Destination",
      detail: transfer?.payout_status || "USD instruction",
      done: activeRank >= (stateRank.get("PAYOUT_INSTRUCTION_CREATED") ?? 6),
      active: Boolean(transfer && activeRank >= (stateRank.get("USDC_SETTLED") ?? 5) && activeRank < (stateRank.get("PAYOUT_INSTRUCTION_CREATED") ?? 6)),
      icon: Landmark,
    },
  ];

  return (
    <main className="dark usd-rail-dark min-h-screen bg-black text-tts-deep transition-colors">
      <style jsx global>{`
        .usd-rail-dark {
          color-scheme: dark;
          background: #000;
        }
        .usd-rail-dark .bg-white {
          background-color: #000 !important;
        }
        .usd-rail-dark .bg-tts-surface {
          background-color: #000 !important;
        }
        .usd-rail-dark .bg-tts-deep,
        .usd-rail-dark .bg-tts-deep {
          background-color: #000 !important;
        }
        .usd-rail-dark .bg-tts-confirm,
        .usd-rail-dark .bg-tts-confirm {
          background-color: #000 !important;
        }
        .usd-rail-dark .bg-tts-gold,
        .usd-rail-dark .bg-tts-gold,
        .usd-rail-dark .bg-tts-gold,
        .usd-rail-dark .bg-tts-gold {
          background-color: #000 !important;
        }
        .usd-rail-dark .bg-tts-error {
          background-color: #000 !important;
        }
        .usd-rail-dark [class*="bg-white"],
        .usd-rail-dark [class*="bg-slate-"],
        .usd-rail-dark [class*="bg-neutral-"],
        .usd-rail-dark [class*="bg-emerald-"],
        .usd-rail-dark [class*="bg-sky-"],
        .usd-rail-dark [class*="bg-cyan-"],
        .usd-rail-dark [class*="bg-indigo-"],
        .usd-rail-dark [class*="bg-red-"],
        .usd-rail-dark [class*="bg-amber-"] {
          background-color: #000 !important;
        }
        .usd-rail-dark [class*="bg-black"] {
          background-color: #000 !important;
        }
        .usd-rail-dark .border-tts-border,
        .usd-rail-dark .border-tts-border,
        .usd-rail-dark .border-tts-border,
        .usd-rail-dark .border-tts-border,
        .usd-rail-dark .border-tts-border,
        .usd-rail-dark .border-tts-border {
          border-color: #262626 !important;
        }
        .usd-rail-dark .border-tts-confirm,
        .usd-rail-dark .border-tts-confirm {
          border-color: rgba(52, 211, 153, 0.38) !important;
        }
        .usd-rail-dark .border-tts-gold,
        .usd-rail-dark .border-tts-gold {
          border-color: rgba(34, 211, 238, 0.38) !important;
        }
        .usd-rail-dark .border-tts-error {
          border-color: rgba(248, 113, 113, 0.38) !important;
        }
        .usd-rail-dark .text-tts-deep,
        .usd-rail-dark .text-tts-deep,
        .usd-rail-dark .text-tts-deep {
          color: rgb(248, 250, 252) !important;
        }
        .usd-rail-dark .text-tts-muted,
        .usd-rail-dark .text-tts-muted {
          color: rgb(203, 213, 225) !important;
        }
        .usd-rail-dark .text-tts-muted {
          color: rgb(148, 163, 184) !important;
        }
        .usd-rail-dark .text-tts-confirm,
        .usd-rail-dark .text-tts-confirm,
        .usd-rail-dark .text-tts-confirm {
          color: rgb(110, 231, 183) !important;
        }
        .usd-rail-dark .text-tts-gold,
        .usd-rail-dark .text-tts-gold,
        .usd-rail-dark .text-tts-gold,
        .usd-rail-dark .text-tts-gold {
          color: rgb(125, 211, 252) !important;
        }
        .usd-rail-dark .shadow-sm {
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.72) !important;
        }
        .usd-rail-dark input,
        .usd-rail-dark select,
        .usd-rail-dark textarea,
        .usd-rail-dark pre,
        .usd-rail-dark code {
          background-color: #000 !important;
        }
      `}</style>
      <header className="border-b border-tts-border bg-black backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg border border-tts-border bg-white px-3 text-sm font-semibold text-tts-muted transition hover:border-tts-border">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Home
            </Link>
            <Link href="/global-transfer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-tts-border bg-white px-3 text-sm font-semibold text-tts-muted transition hover:border-tts-border">
              <Route className="h-4 w-4" aria-hidden="true" />
              Cost lab
            </Link>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tts-confirm">Institution settlement tester</p>
            <h1 className="text-xl font-bold tracking-tight text-tts-deep sm:text-2xl">Cost-efficient USD route room</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="rounded-lg border border-tts-border bg-white p-4 shadow-sm xl:sticky xl:top-5 xl:self-start">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-tts-confirm text-tts-confirm">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold">Institution route input</h2>
              <p className="mt-1 text-sm leading-6 text-tts-muted">Compare origin value, route fees, Stellar evidence and destination value in one run.</p>
            </div>
          </div>

          <div className="mb-4 grid gap-2 rounded-lg border border-tts-confirm bg-black p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-tts-confirm">Empirical route fee</span>
              <span className="rounded-md border border-tts-confirm px-2 py-1 text-xs font-bold text-tts-confirm">
                {quote ? `${formatPercent(feeBreakdown.totalFeePct)} charged fee` : "waiting quote"}
              </span>
            </div>
            <p className="text-sm font-semibold leading-6 text-tts-deep">
              Show only charged route fees: PIX entry, TalkToStellar transaction fee and PIX withdrawal.
            </p>
            <div className="grid gap-2 text-xs font-semibold text-tts-muted">
              <div className="rounded-md border border-tts-border p-2">
                <p className="uppercase tracking-[0.08em]">Charged fee model</p>
                <p className="mt-1 text-tts-deep">On-ramp + TalkToStellar + off-ramp</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <Field label="Source amount" type="number" value={brlAmount} onChange={setBrlAmount} />
            <Field label="Origin institution" value={senderName} onChange={setSenderName} />
            <Field label="Origin ops email" value={senderEmail} onChange={setSenderEmail} />
            <Field label="Destination institution" value={recipientName} onChange={setRecipientName} />
            <SelectField
              label="Destination owner type"
              value={accountHolderType}
              onChange={setAccountHolderType}
              options={[
                { value: "individual", label: "Individual" },
                { value: "business", label: "Business" },
              ]}
            />
            <Field label="Destination bank/account" value={bankName} onChange={setBankName} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Routing" value={routingNumber} onChange={setRoutingNumber} />
              <Field label="Account" value={accountNumber} onChange={setAccountNumber} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Account type"
                value={accountType}
                onChange={setAccountType}
                options={[
                  { value: "checking", label: "Checking" },
                  { value: "savings", label: "Savings" },
                ]}
              />
              <Field label="Country" value={country} onChange={setCountry} />
            </div>
            <SelectField
              label="Destination account profile"
              value={providerLabel}
              onChange={setProviderLabel}
              options={[
                { value: "other", label: "Other" },
                { value: "wise", label: "USD account" },
                { value: "mercury", label: "Mercury" },
                { value: "revolut", label: "Revolut" },
              ]}
            />
            <SelectField
              label="Destination adapter"
              value={payoutProvider}
              onChange={(value) => setPayoutProvider(value as "mock" | "etherfuse" | "circle" | "bridge")}
              options={[
                { value: "etherfuse", label: "PIX withdrawal proof" },
                ...(opsMocksAllowed ? [{ value: "mock", label: "USD instruction" }] : []),
                { value: "circle", label: "Circle compatibility" },
                { value: "bridge", label: "Bridge compatibility" },
              ]}
            />
            {opsMocksAllowed ? (
              <label className="flex items-center gap-2 rounded-lg border border-tts-border bg-tts-surface px-3 py-2 text-sm font-semibold text-tts-muted">
                <input
                  type="checkbox"
                  checked={mockPix}
                  onChange={(event) => setMockPix(event.target.checked)}
                  className="h-4 w-4 rounded border-tts-border"
                />
                Use local PIX funding intent
              </label>
            ) : (
              <div className="rounded-lg border border-tts-confirm bg-tts-confirm/10 px-3 py-2 text-sm font-semibold text-tts-confirm">
                Local funding is disabled. This route creates only payment-backed PIX intents.
              </div>
            )}
            <details className="rounded-lg border border-tts-border bg-black p-3">
              <summary className="cursor-pointer text-sm font-bold text-tts-deep">
                Advanced execution credentials
              </summary>
              <p className="mt-2 text-xs font-semibold leading-5 text-tts-muted">
                Keep this closed for normal demos. Open only when you intentionally want to execute advanced internal helpers.
              </p>
              <div className="mt-3 grid gap-3">
                {payoutProvider === "etherfuse" ? (
                  <label className="flex items-center gap-2 rounded-lg border border-tts-border bg-tts-surface px-3 py-2 text-sm font-semibold text-tts-muted">
                    <input
                      type="checkbox"
                      checked={runEtherfuseOffRamp}
                      onChange={(event) => setRunEtherfuseOffRamp(event.target.checked)}
                      className="h-4 w-4 rounded border-tts-border"
                    />
                    Execute PIX withdrawal proof
                  </label>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Session ID" value={manualSessionId} onChange={setManualSessionId} placeholder={sessionId || "cookie"} />
                  <Field label="Session token" value={manualSessionToken} onChange={setManualSessionToken} placeholder="cookie" />
                </div>
                {payoutProvider === "etherfuse" && runEtherfuseOffRamp ? (
                  <Field label="Wallet PIN for withdrawal" type="password" value={walletPin} onChange={setWalletPin} placeholder="Required only to execute PIX withdrawal" />
                ) : null}
              </div>
            </details>
          </div>

          <div className="mt-4 border-t border-tts-border pt-4 ">
            <ActionButton onClick={runSandboxFlow} disabled={Boolean(busy)} variant="dark" full>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              Run payment-backed route
            </ActionButton>
            <p className="mt-2 text-xs font-semibold text-tts-muted">Creates quote, route record and PIX funding intent. Later steps require payment confirmation and settlement evidence.</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <ActionButton onClick={() => createQuote()} disabled={Boolean(busy)} variant="dark">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Quote
            </ActionButton>
            <ActionButton onClick={() => createTransfer()} disabled={Boolean(busy)} variant="light">
              <Route className="h-4 w-4" aria-hidden="true" />
              {quoteReady ? "Route" : "Quote + Route"}
            </ActionButton>
            <ActionButton onClick={() => createPixIntent()} disabled={Boolean(busy || !transfer)} variant="light">
              <QrCode className="h-4 w-4" aria-hidden="true" />
              Funding intent
            </ActionButton>
            <ActionButton onClick={() => simulatePixReceived()} disabled={Boolean(busy || !transfer)} variant="green">
              <Banknote className="h-4 w-4" aria-hidden="true" />
              Confirm funding
            </ActionButton>
            <ActionButton onClick={() => settleStellar()} disabled={Boolean(busy || !transfer)} variant="blue">
              <Network className="h-4 w-4" aria-hidden="true" />
              Blockchain
            </ActionButton>
            <ActionButton onClick={() => createPayoutInstruction()} disabled={Boolean(busy || !transfer)} variant="blue">
              <Send className="h-4 w-4" aria-hidden="true" />
              Destination
            </ActionButton>
          </div>
          <div className="mt-3 grid gap-3">
            <ActionButton onClick={() => loadReconciliation()} disabled={Boolean(busy || !transfer)} variant="light">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reconciliation
            </ActionButton>
            <div className="grid grid-cols-2 gap-3">
              <ActionButton onClick={copyDebugBundle} disabled={Boolean(busy)} variant="light">
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? "Copied" : "Copy logs"}
              </ActionButton>
              <ActionButton onClick={resetRun} disabled={Boolean(busy)} variant="light">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reset
              </ActionButton>
            </div>
          </div>
        </section>

        <div className="grid gap-5">
          {error ? (
            <section className="rounded-lg border border-tts-error bg-tts-error p-4 text-sm font-semibold text-tts-error">
              {error}
              {migrationError ? (
                <div className="mt-4 rounded-lg border border-tts-error bg-white p-3 text-sm font-semibold text-tts-error">
                  <p className="font-bold">Migration missing in this Supabase project.</p>
                  <p className="mt-2 leading-6">
                    Run this SQL in Supabase SQL Editor, then redeploy or retry:
                  </p>
                  <code className="mt-2 block rounded-md bg-tts-error p-2 text-xs text-tts-error">
                    backend/migrations/20260520_00_international_usd_transfers.sql
                  </code>
                  <p className="mt-2 leading-6">
                    After running it, the tables `international_transfer_quotes`, `international_transfers` and
                    `international_transfer_reconciliations` must exist in `public`.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-lg border border-tts-confirm bg-black p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tts-confirm">Before and after fees</p>
                <h2 className="mt-1 text-lg font-bold text-tts-deep">Gross route value to net destination value</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
                  This is the reviewer-facing cost bridge: source BRL, theoretical USD before charged fees, source on-ramp fee, TalkToStellar transaction fee, destination off-ramp fee and the net USD that reaches the destination instruction.
                </p>
              </div>
              <StatusPill state={quote ? "ok" : "idle"}>
                {quote ? `${formatPercent(feeBreakdown.retainedPct)} retained` : "quote needed"}
              </StatusPill>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-tts-border bg-black p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">Before fees</p>
                <p className="mt-2 text-xl font-black text-tts-gold">{quote ? formatCurrency(feeBreakdown.grossUsd, "USD") : "-"}</p>
                <p className="mt-1 text-sm font-semibold text-tts-muted">{quote ? `${formatCurrency(quoteDelta.sourceBrl, "BRL")} at ${quoteDelta.fxRate.toFixed(4)} BRL/USD` : "Waiting for quote"}</p>
              </div>
              <div className="rounded-lg border border-tts-gold bg-black p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-gold">Fees deducted</p>
                <p className="mt-2 text-xl font-black text-tts-gold">{quote ? formatCurrency(feeBreakdown.totalFeeUsd, "USD") : "-"}</p>
                <p className="mt-1 text-sm font-semibold text-tts-muted">{quote ? `${formatCurrency(feeBreakdown.totalFeeBrl, "BRL")} / ${formatPercent(feeBreakdown.totalFeePct)}` : "Waiting for quote"}</p>
              </div>
              <div className="rounded-lg border border-tts-confirm bg-black p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-confirm">After fees</p>
                <p className="mt-2 text-xl font-black text-tts-confirm">{quote ? formatCurrency(feeBreakdown.afterAllUsd, "USD") : "-"}</p>
                <p className="mt-1 text-sm font-semibold text-tts-muted">{quote ? `${formatPercent(feeBreakdown.retainedPct)} of gross USD delivered` : "Waiting for quote"}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.7fr)]">
              <div className="rounded-lg border border-tts-border bg-tts-surface p-4">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-tts-muted">Cost bridge</p>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-center justify-between gap-4 rounded-md bg-tts-surface px-3 py-2">
                    <span className="text-tts-deep">Gross USD before charged fees</span>
                    <span className="font-black text-tts-gold">{quote ? formatCurrency(feeBreakdown.grossUsd, "USD") : "-"}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md bg-tts-surface px-3 py-2">
                    <span className="text-tts-deep">
                      Source on-ramp fee
                      <span className="block text-[11px] font-semibold text-tts-muted">{feeSourceLabel(feeBreakdown.onRampFeeSource)}</span>
                    </span>
                    <span className="text-right font-black text-tts-gold">
                      {quote ? `-${formatCurrency(feeBreakdown.onRampFeeUsd, "USD")} (${formatPercent(feeBreakdown.onRampFeePct)})` : "-"}
                      {quote ? <span className="block text-[11px] text-tts-muted">{formatCurrency(feeBreakdown.onRampFeeBrl, "BRL")}</span> : null}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md bg-tts-surface px-3 py-2">
                    <span className="text-tts-deep">
                      TalkToStellar transaction fee
                      <span className="block text-[11px] font-semibold text-tts-muted">configured product fee</span>
                    </span>
                    <span className="text-right font-black text-tts-gold">
                      {quote ? `-${formatCurrency(feeBreakdown.platformFeeUsd, "USD")} (${formatPercent(feeBreakdown.platformFeePct)})` : "-"}
                      {quote ? <span className="block text-[11px] text-tts-muted">{formatCurrency(feeBreakdown.platformFeeBrl, "BRL")}</span> : null}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md bg-tts-surface px-3 py-2">
                    <span className="text-tts-deep">
                      Destination off-ramp fee
                      <span className="block text-[11px] font-semibold text-tts-muted">{feeSourceLabel(feeBreakdown.offRampFeeSource)}</span>
                    </span>
                    <span className="text-right font-black text-tts-gold">
                      {quote ? `-${formatCurrency(feeBreakdown.offRampFeeUsd, "USD")} (${formatPercent(feeBreakdown.offRampFeePct)})` : "-"}
                      {quote ? <span className="block text-[11px] text-tts-muted">{formatCurrency(feeBreakdown.offRampFeeBrl, "BRL")}</span> : null}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md border border-tts-confirm bg-tts-confirm/10 px-3 py-2">
                    <span className="font-bold text-tts-confirm">Net USD after fees</span>
                    <span className="font-black text-tts-confirm">{quote ? formatCurrency(feeBreakdown.afterAllUsd, "USD") : "-"}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-tts-border bg-tts-surface p-4">
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-tts-muted">Demo explanation</p>
                <p className="mt-3 text-sm leading-6 text-tts-deep">
                  Use this panel to explain that the app does not hide charged fees inside a final number. The reviewer sees the value before fees, on-ramp fee, TalkToStellar fee, off-ramp fee and the final destination amount before the payout instruction is created.
                </p>
                <p className="mt-3 rounded-md border border-tts-gold bg-tts-gold-bg p-3 text-xs font-semibold leading-5 text-tts-gold">
	                  Optional taxes, bank fees, benchmarks and unallocated deltas are not counted here. If a real route starts charging them, they must be mapped as either PIX entry, TalkToStellar transaction fee, or PIX withdrawal before appearing in this panel.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tts-gold ">Guided path</p>
                <h2 className="mt-1 text-lg font-bold text-tts-deep">BRL source to USD destination</h2>
              </div>
              <StatusPill state={transfer ? "ok" : quoteNeedsRefresh ? "error" : quoteReady ? "running" : "idle"}>
                {evidenceItems.filter((item) => item.ready).length} evidence items ready
              </StatusPill>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              {guidedSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.label}
                    className={`rounded-lg border p-3 ${
                      step.done
                        ? "border-tts-confirm bg-tts-confirm  "
                        : step.active
                          ? "border-tts-gold bg-tts-gold  "
                          : "border-tts-border bg-tts-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`grid h-9 w-9 place-items-center rounded-lg ${step.done ? "bg-tts-confirm text-tts-confirm  " : step.active ? "bg-tts-gold text-tts-gold  " : "bg-white text-tts-muted"}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs font-bold text-tts-muted">0{index + 1}</span>
                    </div>
                    <p className="mt-3 text-sm font-bold text-tts-deep">{step.label}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-tts-muted">{step.detail}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <div className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-tts-gold text-tts-gold">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Activity className="h-5 w-5" aria-hidden="true" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-tts-muted">What is happening</p>
                    <h2 className="mt-1 text-lg font-bold text-tts-deep">{busy || transfer?.status || "Waiting for route quote"}</h2>
                    <p className="mt-2 text-sm leading-6 text-tts-muted">{busy ? latestEvent?.detail : currentPhase}</p>
                  </div>
                </div>
                <StatusPill state={busy ? "running" : error ? "error" : transfer ? "ok" : "idle"}>
                  {busy ? "running" : error ? "needs attention" : transfer ? "state synced" : "idle"}
                </StatusPill>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">
                    <Server className="h-4 w-4" aria-hidden="true" />
                    Backend call
                  </div>
                  <p className="mt-2 text-sm font-semibold text-tts-deep">{latestEvent?.path || "No request yet"}</p>
                </div>
                <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">
                    <Database className="h-4 w-4" aria-hidden="true" />
                    Persisted record
                  </div>
                  <p className="mt-2 text-sm font-semibold text-tts-deep">
                    {transfer?.transfer_id
                      ? shortId(transfer.transfer_id, 26)
                      : quote?.quote_id
                        ? `${shortId(quote.quote_id, 22)} ${quoteFreshness}`
                        : "-"}
                  </p>
                </div>
                <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                    Next action
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-5 text-tts-deep">{nextAction}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                  <h2 className="text-base font-bold text-tts-deep">Evidence checklist</h2>
                </div>
                <StatusPill state="info">{evidenceItems.filter((item) => item.ready).length}/{evidenceItems.length}</StatusPill>
              </div>
              <div className="grid gap-2">
                {evidenceItems.map((item) => (
                  <div key={item.label} className="grid grid-cols-[22px_minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-2 rounded-lg bg-tts-surface px-3 py-2 text-sm">
                    {item.ready ? (
                      <CheckCircle2 className="h-4 w-4 text-tts-confirm" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-tts-muted" aria-hidden="true" />
                    )}
                    <span className="font-semibold text-tts-muted">{item.label}</span>
                    <span className="truncate text-right font-mono text-xs text-tts-muted">{shortId(item.value, 30)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-tts-muted">Source value</p>
              <p className="mt-2 text-lg font-bold text-tts-deep">{quote ? formatCurrency(quote.brl_amount, "BRL") : formatCurrency(brlAmount, "BRL")}</p>
              <p className="text-sm text-tts-muted">{quote ? `FX ${quote.fx_rate} BRL/USD - ${quoteFreshness}` : "No route quote"}</p>
            </div>
            <div className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-tts-muted">Baseline USD</p>
              <p className="mt-2 text-lg font-bold text-tts-deep">{quote ? formatCurrency(quoteDelta.baselineUsd, "USD") : "-"}</p>
              <p className="text-sm text-tts-muted">Before route costs</p>
            </div>
            <div className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-tts-muted">Destination value</p>
              <p className="mt-2 text-lg font-bold text-tts-confirm">{quote ? formatCurrency(quoteDelta.finalUsd, "USD") : "-"}</p>
              <p className="text-sm text-tts-muted">{quote ? `${formatPercent(quoteDelta.retainedPct)} retained` : "No destination value"}</p>
            </div>
            <div className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-tts-muted">Route delta</p>
              <p className={`mt-2 text-lg font-bold ${quoteDelta.deltaUsd < 0 ? "text-tts-gold" : "text-tts-confirm"}`}>
                {quote ? `${quoteDelta.deltaUsd >= 0 ? "+" : "-"}${formatCurrency(Math.abs(quoteDelta.deltaUsd), "USD")}` : "-"}
              </p>
              <p className="text-sm text-tts-muted">{quote ? `${formatPercent(quoteDelta.deltaPct)} vs baseline` : "No delta"}</p>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <QrCode className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                <h2 className="text-base font-bold text-tts-deep">On/off ramp proof</h2>
              </div>
              <div className="grid gap-3">
	                <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
	                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">On-ramp</p>
	                  <p className="mt-1 text-sm font-bold text-tts-deep">PIX funding</p>
	                  <p className="mt-1 text-xs font-semibold text-tts-muted">{mockPix ? "Validation intent enabled" : "Real payment intent mode"}</p>
	                </div>
	                <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
	                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">Off-ramp</p>
	                  <p className="mt-1 text-sm font-bold text-tts-deep">{payoutProvider === "etherfuse" ? "PIX withdrawal proof" : `${payoutProvider} destination adapter`}</p>
	                  <p className="mt-1 text-xs font-semibold text-tts-muted">
	                    {payoutProvider === "etherfuse"
	                      ? runEtherfuseOffRamp
	                        ? "Will execute the withdrawal proof when credentials and PIN are present."
	                        : "Will prepare the withdrawal payload without signing."
	                      : "USD bank payout remains compatible with the selected destination flow."}
	                  </p>
	                </div>
              </div>
            </div>

            <div className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-tts-gold" aria-hidden="true" />
                  <h2 className="text-base font-bold text-tts-deep">Metric validation</h2>
                </div>
                <StatusPill state={metricValidation.allOk ? "ok" : quote ? "error" : "idle"}>
                  {metricValidation.allOk ? "valid" : quote ? "check" : "waiting"}
                </StatusPill>
              </div>
              <div className="grid gap-2">
                {metricValidation.checks.map((check) => (
                  <div key={check.label} className="grid grid-cols-[22px_minmax(0,1fr)_minmax(0,0.8fr)] items-center gap-2 rounded-lg border border-tts-border bg-tts-surface px-3 py-2 text-sm">
                    {check.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-tts-confirm" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-tts-error" aria-hidden="true" />
                    )}
                    <span className="font-semibold text-tts-muted">{check.label}</span>
                    <span className="truncate text-right font-mono text-xs text-tts-muted">{check.detail}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">Total fee</p>
                  <p className="mt-1 text-sm font-bold text-tts-deep">{quote ? formatCurrency(metricValidation.totalFeeUsd, "USD") : "-"}</p>
                </div>
                <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">Implied cost</p>
                  <p className="mt-1 text-sm font-bold text-tts-deep">{quote ? formatCurrency(metricValidation.impliedCostUsd, "USD") : "-"}</p>
                </div>
                <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">Variance</p>
                  <p className="mt-1 text-sm font-bold text-tts-deep">{quote ? formatCurrency(metricValidation.feeDeltaUsd, "USD") : "-"}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Network className="h-5 w-5 text-tts-gold" aria-hidden="true" />
              <h2 className="text-base font-bold text-tts-deep">Institution value route</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">Origin institution</p>
                <p className="mt-2 text-sm font-bold text-tts-deep">{senderName}</p>
                <p className="mt-1 text-sm text-tts-muted">{formatCurrency(quoteDelta.sourceBrl, "BRL")} funded</p>
              </div>
              <div className="hidden items-center text-tts-muted md:flex">→</div>
              <div className="rounded-lg border border-tts-gold bg-tts-gold p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-gold">Blockchain settlement</p>
                <p className="mt-2 text-sm font-bold text-tts-deep">{transfer?.stellar_asset_code || "USDC"} on Stellar</p>
                <p className="mt-1 text-sm text-tts-muted">{transfer?.stellar_tx_hash ? shortId(transfer.stellar_tx_hash, 28) : "Evidence pending"}</p>
              </div>
              <div className="hidden items-center text-tts-muted md:flex">→</div>
              <div className="rounded-lg border border-tts-confirm bg-tts-confirm p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-tts-confirm">Destination institution</p>
                <p className="mt-2 text-sm font-bold text-tts-deep">{recipientName}</p>
                <p className="mt-1 text-sm text-tts-muted">{quote ? formatCurrency(quoteDelta.finalUsd, "USD") : "USD instruction pending"}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
              <h2 className="text-base font-bold text-tts-deep">Lifecycle</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
              {states.map((item, index) => {
                const Icon = item.icon;
                const done = activeRank >= index;
                const active = activeRank === index;
                return (
                  <div key={item.key} className={`rounded-lg border p-3 ${done ? "border-tts-confirm bg-tts-confirm" : active ? "border-tts-gold bg-tts-gold" : "border-tts-border bg-tts-surface"}`}>
                    <div className={`grid h-9 w-9 place-items-center rounded-lg ${done ? "bg-tts-confirm text-tts-confirm" : "bg-white text-tts-muted"}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-tts-muted">{item.label}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-lg border border-tts-border bg-tts-deep p-4 text-tts-deep shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-tts-deep" aria-hidden="true" />
                <h2 className="text-base font-bold">Quote</h2>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg bg-tts-deep/20 p-3 text-xs leading-5 text-tts-deep">{pretty(redactSensitive(quote))}</pre>
            </div>
            <div className="rounded-lg border border-tts-border bg-tts-deep p-4 text-tts-deep shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-tts-deep" aria-hidden="true" />
                <h2 className="text-base font-bold">Settlement record</h2>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg bg-tts-deep/20 p-3 text-xs leading-5 text-tts-deep">{pretty(redactSensitive(transfer))}</pre>
            </div>
            <div className="rounded-lg border border-tts-border bg-tts-deep p-4 text-tts-deep shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-tts-deep" aria-hidden="true" />
                <h2 className="text-base font-bold">Reconciliation</h2>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg bg-tts-deep/20 p-3 text-xs leading-5 text-tts-deep">{pretty(redactSensitive(reconciliation))}</pre>
            </div>
          </section>

          <section className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-tts-gold" aria-hidden="true" />
                <h2 className="text-base font-bold text-tts-deep">Execution stream</h2>
              </div>
              <button
                type="button"
                onClick={copyDebugBundle}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-tts-border bg-white px-3 text-xs font-bold text-tts-muted transition hover:border-tts-border"
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? "Copied" : "Copy debug bundle"}
              </button>
            </div>
            <div className="space-y-3">
              {events.map((event, index) => (
                <div key={event.id} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
                  <div className="relative flex justify-center">
                    <div
                      className={`grid h-8 w-8 place-items-center rounded-lg ${
                        event.state === "ok"
                          ? "bg-tts-confirm text-tts-confirm"
                          : event.state === "error"
                            ? "bg-tts-error text-tts-error"
                            : event.state === "running"
                              ? "bg-tts-gold text-tts-gold"
                              : "bg-tts-surface text-tts-muted"
                      }`}
                    >
                      {event.state === "running" ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : event.state === "error" ? (
                        <AlertCircle className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    {index < events.length - 1 ? <div className="absolute top-9 h-full w-px bg-tts-surface" /> : null}
                  </div>
                  <div className="rounded-lg border border-tts-border bg-tts-surface p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-tts-deep">{event.title}</h3>
                        <StatusPill state={event.state}>{event.state}</StatusPill>
                      </div>
                      <span className="font-mono text-xs text-tts-muted">{formatTime(event.at)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-tts-muted">{event.detail}</p>
                    {event.path ? <p className="mt-2 font-mono text-xs text-tts-muted">{event.path}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-tts-border bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Code2 className="h-5 w-5 text-tts-muted" aria-hidden="true" />
              <h2 className="text-base font-bold text-tts-deep">API log</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {logs.length ? logs.map((log) => (
                <details key={log.id} className="rounded-lg border border-tts-border bg-tts-surface p-3">
                  <summary className="cursor-pointer text-sm font-bold text-tts-deep">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="font-mono">{log.method}</span>
                      <span>{log.path}</span>
                      {log.status ? <StatusPill state={log.status >= 200 && log.status < 300 ? "ok" : "error"}>{log.status}</StatusPill> : null}
                      {log.durationMs ? <span className="text-xs text-tts-muted">{log.durationMs}ms</span> : null}
                    </span>
                  </summary>
                  <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg bg-white p-3 text-xs leading-5 text-tts-muted">
                    {pretty({ label: log.label, request: log.request, response: log.response, error: log.error })}
                  </pre>
                </details>
              )) : (
                <p className="text-sm text-tts-muted">No calls yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
