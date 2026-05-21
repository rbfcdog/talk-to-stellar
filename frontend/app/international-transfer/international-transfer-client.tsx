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
  Moon,
  Network,
  Play,
  QrCode,
  RefreshCw,
  Route,
  Send,
  Server,
  ShieldCheck,
  Sun,
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
  PIX_PENDING: "Wait for source-institution funding confirmation or simulate the funding webhook in sandbox.",
  PIX_RECEIVED: "Trigger blockchain settlement so USDC evidence can be attached.",
  BRL_TO_USDC_PENDING: "Backend is moving from BRL exposure into USDC settlement preparation.",
  USDC_SETTLEMENT_PENDING: "Backend is submitting or mocking the Stellar blockchain transaction.",
  USDC_SETTLED: "Create the destination-institution USD instruction through the selected adapter.",
  PAYOUT_INSTRUCTION_CREATED: "Move the destination instruction into pending or completed state.",
  PAYOUT_PENDING: "Poll destination provider status and inspect reconciliation evidence.",
  PAYOUT_COMPLETED: "Capture reconciliation output, screenshots and delta evidence.",
  FAILED: "Open the latest API log and error logs on the settlement record.",
  REFUNDED: "Capture refund evidence and close the settlement record.",
};

const phaseDescriptions: Record<TransferState, string> = {
  QUOTE_CREATED: "The quote is accepted and the institution settlement record exists, but source funding has not settled yet.",
  PIX_PENDING: "A funding reference exists. The system is waiting for the source institution event before value moves forward.",
  PIX_RECEIVED: "Source funding is confirmed. The route can now move into USDC settlement.",
  BRL_TO_USDC_PENDING: "The backend is representing the BRL exposure as USDC for the Stellar leg.",
  USDC_SETTLEMENT_PENDING: "The Stellar blockchain transaction is being prepared, submitted, or mocked depending on env configuration.",
  USDC_SETTLED: "Blockchain settlement evidence is attached to the institution settlement record.",
  PAYOUT_INSTRUCTION_CREATED: "The USD adapter has created an instruction object for the destination institution.",
  PAYOUT_PENDING: "The destination provider has a pending instruction. Live providers would be polled or reconciled by webhook.",
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
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-cyan-400"
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
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600 dark:text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none focus:border-sky-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100 dark:focus:border-cyan-400"
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
    dark: "bg-slate-950 text-white hover:bg-slate-800 dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200",
    light: "border border-slate-300 bg-white text-slate-800 hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-cyan-400",
    green: "border border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-500 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:border-emerald-300",
    blue: "bg-sky-900 text-white hover:bg-sky-800 dark:bg-indigo-400 dark:text-slate-950 dark:hover:bg-indigo-300",
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
    running: "border-sky-200 bg-sky-50 text-sky-800 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-200",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200",
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200",
    info: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
    idle: "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-bold ${classes[state]}`}>
      {children}
    </span>
  );
}

export default function InternationalTransferClient() {
  const [darkMode, setDarkMode] = useState(true);
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
  const [payoutProvider, setPayoutProvider] = useState<"mock" | "circle" | "bridge">("mock");
  const [mockPix, setMockPix] = useState(true);
  const [sessionId, setSessionId] = useState("");
  const [manualSessionId, setManualSessionId] = useState("");
  const [manualSessionToken, setManualSessionToken] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [transfer, setTransfer] = useState<any>(null);
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [events, setEvents] = useState<EventEntry[]>([
    {
      id: "initial",
      at: new Date().toISOString(),
      title: "Ready",
      detail: "Create an institution route quote or run the full sandbox flow to start recording blockchain settlement events.",
      state: "info",
    },
  ]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const migrationError = /international_transfer_quotes|international_transfers|schema cache/i.test(error);

  useEffect(() => {
    getClientSession().then((session) => {
      setSessionId(session.sessionId || "");
    });
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("tts-usd-rail-theme");
    if (saved === "light") setDarkMode(false);
    if (saved === "dark") setDarkMode(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("tts-usd-rail-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  const activeStatus = text(transfer?.status) as TransferState;
  const activeRank = stateRank.get(activeStatus) ?? -1;
  const latestEvent = events[0];
  const currentPhase = activeStatus && phaseDescriptions[activeStatus]
    ? phaseDescriptions[activeStatus]
    : "No institution settlement has been created yet.";
  const nextAction = activeStatus && nextActionByState[activeStatus]
    ? nextActionByState[activeStatus]
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
  const evidenceItems = useMemo(
    () => [
      { label: "Quote ID", value: quote?.quote_id, ready: Boolean(quote?.quote_id) },
      { label: "Settlement ID", value: transfer?.transfer_id, ready: Boolean(transfer?.transfer_id) },
      { label: "Funding reference", value: transfer?.pix_order_id || transfer?.pix_payment_id, ready: Boolean(transfer?.pix_order_id || transfer?.pix_payment_id) },
      { label: "Funding status", value: transfer?.pix_status, ready: transfer?.status === "PIX_RECEIVED" || activeRank >= (stateRank.get("PIX_RECEIVED") ?? 2) },
      { label: "Blockchain hash", value: transfer?.stellar_tx_hash, ready: Boolean(transfer?.stellar_tx_hash) },
      { label: "Blockchain memo", value: transfer?.stellar_memo, ready: Boolean(transfer?.stellar_memo) },
      { label: "Destination instruction", value: transfer?.payout_instruction_id, ready: Boolean(transfer?.payout_instruction_id) },
      { label: "Destination provider ID", value: transfer?.provider_payout_id, ready: Boolean(transfer?.provider_payout_id) },
      { label: "Reconciliation", value: reconciliation?.transfer_id, ready: Boolean(reconciliation?.transfer_id) },
      { label: "Same-name check", value: transfer?.same_name_match_status, ready: Boolean(transfer?.same_name_match_status) },
    ],
    [activeRank, quote?.quote_id, reconciliation?.transfer_id, transfer],
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
      quote,
      transfer,
      reconciliation,
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
        request: body,
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
          request: body,
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

  async function createTransfer(currentQuote = quote) {
    if (!currentQuote?.quote_id) throw new Error("Create a route quote first.");
    const payload = await callApi("Create institution route", "POST", "/api/transfers", {
      ...transferPayload,
      quote_id: currentQuote.quote_id,
    });
    setTransfer(payload.transfer);
    setReconciliation(null);
    return payload.transfer;
  }

  async function createPixIntent(currentTransfer = transfer, useMock = mockPix) {
    if (!currentTransfer?.transfer_id) throw new Error("Create an institution settlement route first.");
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
    const reference = currentTransfer.pix_order_id || currentTransfer.pix_payment_id || currentTransfer.transfer_id;
    const payload = await callApi("Simulate funding webhook", "POST", "/api/webhooks/etherfuse/pix", {
      transfer_id: currentTransfer.transfer_id,
      order_id: reference,
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
    pushEvent("Sandbox flow started", "Running quote, source funding mock, funding webhook, blockchain settlement, destination instruction and reconciliation.", "info");
    try {
      const q = await createQuote();
      const t = await createTransfer(q);
      const pix = await createPixIntent(t, true);
      const funded = await simulatePixReceived(pix);
      const settled = await settleStellar(funded);
      const payout = await createPayoutInstruction(settled);
      await loadReconciliation(payout);
      pushEvent("Sandbox flow complete", "All orchestration steps returned successfully. Capture the delta, evidence checklist and reconciliation panel.", "ok");
    } catch (flowError: any) {
      pushEvent("Sandbox flow stopped", flowError?.message || String(flowError), "error");
    }
  }

  const guidedSteps = [
    {
      label: "Quote",
      detail: quote ? formatCurrency(quote.estimated_usd_amount, "USD") : "BRL -> USD route",
      done: Boolean(quote),
      active: !quote,
      icon: ClipboardList,
    },
    {
      label: "Route",
      detail: transfer ? shortId(transfer.transfer_id, 16) : "Create record",
      done: Boolean(transfer),
      active: Boolean(quote && !transfer),
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
    <main className={`${darkMode ? "dark usd-rail-dark" : ""} min-h-screen bg-[#f4f7f5] text-slate-950 transition-colors dark:bg-[#06110f] dark:text-slate-100`}>
      <style jsx global>{`
        .usd-rail-dark {
          color-scheme: dark;
        }
        .usd-rail-dark .bg-white {
          background-color: rgba(15, 23, 42, 0.84) !important;
        }
        .usd-rail-dark .bg-slate-50 {
          background-color: rgba(2, 6, 23, 0.54) !important;
        }
        .usd-rail-dark .bg-emerald-50,
        .usd-rail-dark .bg-emerald-100 {
          background-color: rgba(16, 185, 129, 0.12) !important;
        }
        .usd-rail-dark .bg-sky-50,
        .usd-rail-dark .bg-sky-100,
        .usd-rail-dark .bg-cyan-50,
        .usd-rail-dark .bg-cyan-100 {
          background-color: rgba(34, 211, 238, 0.12) !important;
        }
        .usd-rail-dark .bg-red-50 {
          background-color: rgba(248, 113, 113, 0.12) !important;
        }
        .usd-rail-dark .border-slate-200,
        .usd-rail-dark .border-slate-300 {
          border-color: rgba(51, 65, 85, 0.92) !important;
        }
        .usd-rail-dark .text-slate-950,
        .usd-rail-dark .text-slate-900,
        .usd-rail-dark .text-slate-800 {
          color: rgb(248, 250, 252) !important;
        }
        .usd-rail-dark .text-slate-700,
        .usd-rail-dark .text-slate-600 {
          color: rgb(203, 213, 225) !important;
        }
        .usd-rail-dark .text-slate-500 {
          color: rgb(148, 163, 184) !important;
        }
        .usd-rail-dark .text-emerald-700,
        .usd-rail-dark .text-emerald-800,
        .usd-rail-dark .text-emerald-900 {
          color: rgb(110, 231, 183) !important;
        }
        .usd-rail-dark .text-sky-700,
        .usd-rail-dark .text-sky-800,
        .usd-rail-dark .text-cyan-700,
        .usd-rail-dark .text-cyan-800 {
          color: rgb(125, 211, 252) !important;
        }
        .usd-rail-dark .shadow-sm {
          box-shadow: 0 18px 46px rgba(0, 0, 0, 0.28) !important;
        }
      `}</style>
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Home
            </Link>
            <Link href="/global-transfer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500">
              <Route className="h-4 w-4" aria-hidden="true" />
              Cost lab
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 text-right">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Institution settlement tester</p>
              <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">USD rail control room</h1>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode((value) => !value)}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 transition hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-400"
              aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {darkMode ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-5 xl:self-start">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold">Institution route input</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Origin value, blockchain evidence and destination value in one run.</p>
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
            <Field label="Destination provider" value={bankName} onChange={setBankName} />
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
                { value: "wise", label: "USD account provider" },
                { value: "mercury", label: "Mercury" },
                { value: "revolut", label: "Revolut" },
              ]}
            />
            <SelectField
              label="Destination adapter"
              value={payoutProvider}
              onChange={setPayoutProvider}
              options={[
                { value: "mock", label: "Mock" },
                { value: "circle", label: "Circle compatibility" },
                { value: "bridge", label: "Bridge compatibility" },
              ]}
            />
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={mockPix}
                onChange={(event) => setMockPix(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Mock source funding intent
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Session ID" value={manualSessionId} onChange={setManualSessionId} placeholder={sessionId || "cookie"} />
              <Field label="Session token" value={manualSessionToken} onChange={setManualSessionToken} placeholder="cookie" />
            </div>
          </div>

          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <ActionButton onClick={runSandboxFlow} disabled={Boolean(busy)} variant="dark" full>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              Run complete sandbox route
            </ActionButton>
            <p className="mt-2 text-xs font-semibold text-slate-500">Recommended for demos: creates quote, funding event, blockchain evidence and destination instruction.</p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <ActionButton onClick={() => createQuote()} disabled={Boolean(busy)} variant="dark">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Quote
            </ActionButton>
            <ActionButton onClick={() => createTransfer()} disabled={Boolean(busy || !quote)} variant="light">
              <Route className="h-4 w-4" aria-hidden="true" />
              Route
            </ActionButton>
            <ActionButton onClick={() => createPixIntent()} disabled={Boolean(busy || !transfer)} variant="light">
              <QrCode className="h-4 w-4" aria-hidden="true" />
              Funding intent
            </ActionButton>
            <ActionButton onClick={() => simulatePixReceived()} disabled={Boolean(busy || !transfer)} variant="green">
              <Banknote className="h-4 w-4" aria-hidden="true" />
              Funding confirmed
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
            <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              {error}
              {migrationError ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-white p-3 text-sm font-semibold text-red-900">
                  <p className="font-bold">Migration missing in this Supabase project.</p>
                  <p className="mt-2 leading-6">
                    Run this SQL in Supabase SQL Editor, then redeploy or retry:
                  </p>
                  <code className="mt-2 block rounded-md bg-red-950 p-2 text-xs text-red-50">
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

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:text-cyan-300">Guided path</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">BRL source to USD destination</h2>
              </div>
              <StatusPill state={transfer ? "ok" : quote ? "running" : "idle"}>
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
                        ? "border-emerald-300 bg-emerald-50 dark:border-emerald-400/35 dark:bg-emerald-400/10"
                        : step.active
                          ? "border-cyan-300 bg-cyan-50 dark:border-cyan-300/45 dark:bg-cyan-300/10"
                          : "border-slate-200 bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={`grid h-9 w-9 place-items-center rounded-lg ${step.done ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200" : step.active ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-400/15 dark:text-cyan-200" : "bg-white text-slate-500"}`}>
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-500">0{index + 1}</span>
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-950">{step.label}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-600">{step.detail}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(340px,0.95fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-800">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Activity className="h-5 w-5" aria-hidden="true" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">What is happening</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-950">{busy || transfer?.status || "Waiting for route quote"}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{busy ? latestEvent?.detail : currentPhase}</p>
                  </div>
                </div>
                <StatusPill state={busy ? "running" : error ? "error" : transfer ? "ok" : "idle"}>
                  {busy ? "running" : error ? "needs attention" : transfer ? "state synced" : "idle"}
                </StatusPill>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    <Server className="h-4 w-4" aria-hidden="true" />
                    Backend call
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{latestEvent?.path || "No request yet"}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    <Database className="h-4 w-4" aria-hidden="true" />
                    Persisted record
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{shortId(transfer?.transfer_id || quote?.quote_id, 26)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    <ListChecks className="h-4 w-4" aria-hidden="true" />
                    Next action
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-5 text-slate-800">{nextAction}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                  <h2 className="text-base font-bold text-slate-950">Evidence checklist</h2>
                </div>
                <StatusPill state="info">{evidenceItems.filter((item) => item.ready).length}/{evidenceItems.length}</StatusPill>
              </div>
              <div className="grid gap-2">
                {evidenceItems.map((item) => (
                  <div key={item.label} className="grid grid-cols-[22px_minmax(0,0.9fr)_minmax(0,1.1fr)] items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    {item.ready ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    )}
                    <span className="font-semibold text-slate-700">{item.label}</span>
                    <span className="truncate text-right font-mono text-xs text-slate-600">{shortId(item.value, 30)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Source value</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{quote ? formatCurrency(quote.brl_amount, "BRL") : formatCurrency(brlAmount, "BRL")}</p>
              <p className="text-sm text-slate-600">{quote ? `FX ${quote.fx_rate} BRL/USD` : "No route quote"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Baseline USD</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{quote ? formatCurrency(quoteDelta.baselineUsd, "USD") : "-"}</p>
              <p className="text-sm text-slate-600">Before route costs</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Destination value</p>
              <p className="mt-2 text-lg font-bold text-emerald-800">{quote ? formatCurrency(quoteDelta.finalUsd, "USD") : "-"}</p>
              <p className="text-sm text-slate-600">{quote ? `${formatPercent(quoteDelta.retainedPct)} retained` : "No destination value"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Route delta</p>
              <p className={`mt-2 text-lg font-bold ${quoteDelta.deltaUsd < 0 ? "text-amber-800" : "text-emerald-800"}`}>
                {quote ? `${quoteDelta.deltaUsd >= 0 ? "+" : "-"}${formatCurrency(Math.abs(quoteDelta.deltaUsd), "USD")}` : "-"}
              </p>
              <p className="text-sm text-slate-600">{quote ? `${formatPercent(quoteDelta.deltaPct)} vs baseline` : "No delta"}</p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Network className="h-5 w-5 text-sky-800" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-950">Institution value route</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Origin institution</p>
                <p className="mt-2 text-sm font-bold text-slate-950">{senderName}</p>
                <p className="mt-1 text-sm text-slate-600">{formatCurrency(quoteDelta.sourceBrl, "BRL")} funded</p>
              </div>
              <div className="hidden items-center text-slate-400 md:flex">→</div>
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-sky-700">Blockchain settlement</p>
                <p className="mt-2 text-sm font-bold text-slate-950">{transfer?.stellar_asset_code || "USDC"} on Stellar</p>
                <p className="mt-1 text-sm text-slate-600">{transfer?.stellar_tx_hash ? shortId(transfer.stellar_tx_hash, 28) : "Evidence pending"}</p>
              </div>
              <div className="hidden items-center text-slate-400 md:flex">→</div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-700">Destination institution</p>
                <p className="mt-2 text-sm font-bold text-slate-950">{recipientName}</p>
                <p className="mt-1 text-sm text-slate-600">{quote ? formatCurrency(quoteDelta.finalUsd, "USD") : "USD instruction pending"}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-950">Lifecycle</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
              {states.map((item, index) => {
                const Icon = item.icon;
                const done = activeRank >= index;
                const active = activeRank === index;
                return (
                  <div key={item.key} className={`rounded-lg border p-3 ${done ? "border-emerald-200 bg-emerald-50" : active ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className={`grid h-9 w-9 place-items-center rounded-lg ${done ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-500"}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-700">{item.label}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-slate-300" aria-hidden="true" />
                <h2 className="text-base font-bold">Quote</h2>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg bg-black/35 p-3 text-xs leading-5 text-slate-200">{pretty(quote)}</pre>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-slate-300" aria-hidden="true" />
                <h2 className="text-base font-bold">Settlement record</h2>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg bg-black/35 p-3 text-xs leading-5 text-slate-200">{pretty(transfer)}</pre>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Code2 className="h-5 w-5 text-slate-300" aria-hidden="true" />
                <h2 className="text-base font-bold">Reconciliation</h2>
              </div>
              <pre className="max-h-[360px] overflow-auto rounded-lg bg-black/35 p-3 text-xs leading-5 text-slate-200">{pretty(reconciliation)}</pre>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-sky-800" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-950">Execution stream</h2>
              </div>
              <button
                type="button"
                onClick={copyDebugBundle}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 transition hover:border-slate-500"
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
                          ? "bg-emerald-100 text-emerald-800"
                          : event.state === "error"
                            ? "bg-red-100 text-red-800"
                            : event.state === "running"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-slate-100 text-slate-600"
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
                    {index < events.length - 1 ? <div className="absolute top-9 h-full w-px bg-slate-200" /> : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-950">{event.title}</h3>
                        <StatusPill state={event.state}>{event.state}</StatusPill>
                      </div>
                      <span className="font-mono text-xs text-slate-500">{formatTime(event.at)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{event.detail}</p>
                    {event.path ? <p className="mt-2 font-mono text-xs text-slate-500">{event.path}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Code2 className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-950">API log</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {logs.length ? logs.map((log) => (
                <details key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-bold text-slate-900">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      <span className="font-mono">{log.method}</span>
                      <span>{log.path}</span>
                      {log.status ? <StatusPill state={log.status >= 200 && log.status < 300 ? "ok" : "error"}>{log.status}</StatusPill> : null}
                      {log.durationMs ? <span className="text-xs text-slate-500">{log.durationMs}ms</span> : null}
                    </span>
                  </summary>
                  <pre className="mt-3 max-h-[320px] overflow-auto rounded-lg bg-white p-3 text-xs leading-5 text-slate-700">
                    {pretty({ label: log.label, request: log.request, response: log.response, error: log.error })}
                  </pre>
                </details>
              )) : (
                <p className="text-sm text-slate-600">No calls yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
