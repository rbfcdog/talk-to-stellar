"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardList,
  Code2,
  Landmark,
  Loader2,
  Network,
  Play,
  QrCode,
  RefreshCw,
  Route,
  Send,
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
  { key: "QUOTE_CREATED", label: "Quote", icon: ClipboardList },
  { key: "PIX_PENDING", label: "Pix pending", icon: QrCode },
  { key: "PIX_RECEIVED", label: "Pix received", icon: Banknote },
  { key: "BRL_TO_USDC_PENDING", label: "BRL -> USDC", icon: WalletCards },
  { key: "USDC_SETTLEMENT_PENDING", label: "Stellar send", icon: Network },
  { key: "USDC_SETTLED", label: "USDC settled", icon: CheckCircle2 },
  { key: "PAYOUT_INSTRUCTION_CREATED", label: "Payout created", icon: Landmark },
  { key: "PAYOUT_PENDING", label: "Payout pending", icon: Send },
  { key: "PAYOUT_COMPLETED", label: "Done", icon: ShieldCheck },
];

const stateRank = new Map(states.map((state, index) => [state.key, index]));

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
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500"
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
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none focus:border-sky-500"
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
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "dark" | "light" | "green" | "blue";
}) {
  const classes = {
    dark: "bg-slate-950 text-white hover:bg-slate-800",
    light: "border border-slate-300 bg-white text-slate-800 hover:border-slate-500",
    green: "border border-emerald-300 bg-emerald-50 text-emerald-900 hover:border-emerald-500",
    blue: "bg-sky-900 text-white hover:bg-sky-800",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${classes[variant]}`}
    >
      {children}
    </button>
  );
}

export default function InternationalTransferClient() {
  const [brlAmount, setBrlAmount] = useState("1000");
  const [senderName, setSenderName] = useState("Rodrigo Banin");
  const [senderEmail, setSenderEmail] = useState("rodrigo@example.com");
  const [recipientName, setRecipientName] = useState("Rodrigo Banin");
  const [accountHolderType, setAccountHolderType] = useState<"individual" | "business">("individual");
  const [bankName, setBankName] = useState("International USD Bank");
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
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getClientSession().then((session) => {
      setSessionId(session.sessionId || "");
    });
  }, []);

  const activeStatus = text(transfer?.status) as TransferState;
  const activeRank = stateRank.get(activeStatus) ?? -1;

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

  async function callApi(label: string, method: string, path: string, body?: unknown) {
    const startedAt = performance.now();
    setBusy(label);
    setError("");
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
      return payload;
    } catch (apiError: any) {
      const message = apiError?.message || String(apiError);
      setError(message);
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
    if (!currentQuote?.quote_id) throw new Error("Create a quote first.");
    const payload = await callApi("Create transfer", "POST", "/api/transfers", {
      ...transferPayload,
      quote_id: currentQuote.quote_id,
    });
    setTransfer(payload.transfer);
    setReconciliation(null);
    return payload.transfer;
  }

  async function createPixIntent(currentTransfer = transfer, useMock = mockPix) {
    if (!currentTransfer?.transfer_id) throw new Error("Create a transfer first.");
    const payload = await callApi("Create Pix intent", "POST", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/pix-intent`, {
      mock_pix_intent: useMock,
      session_id: manualSessionId || undefined,
      session_token: manualSessionToken || undefined,
      email: senderEmail,
    });
    setTransfer(payload.transfer);
    return payload.transfer;
  }

  async function simulatePixReceived(currentTransfer = transfer) {
    if (!currentTransfer?.transfer_id) throw new Error("Create a transfer first.");
    const reference = currentTransfer.pix_order_id || currentTransfer.pix_payment_id || currentTransfer.transfer_id;
    const payload = await callApi("Simulate Pix webhook", "POST", "/api/webhooks/etherfuse/pix", {
      transfer_id: currentTransfer.transfer_id,
      order_id: reference,
      status: "completed",
      event: "pix.received",
    });
    setTransfer(payload.transfer);
    return payload.transfer;
  }

  async function settleStellar(currentTransfer = transfer) {
    if (!currentTransfer?.transfer_id) throw new Error("Create a transfer first.");
    const payload = await callApi("Settle Stellar", "POST", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/settle-stellar`);
    setTransfer(payload.transfer);
    return payload.transfer;
  }

  async function createPayoutInstruction(currentTransfer = transfer) {
    if (!currentTransfer?.transfer_id) throw new Error("Create a transfer first.");
    const payload = await callApi("Create payout", "POST", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/payout-instruction`, {
      provider: payoutProvider,
    });
    setTransfer(payload.transfer);
    return payload.transfer;
  }

  async function loadReconciliation(currentTransfer = transfer) {
    if (!currentTransfer?.transfer_id) throw new Error("Create a transfer first.");
    const payload = await callApi("Load reconciliation", "GET", `/api/transfers/${encodeURIComponent(currentTransfer.transfer_id)}/reconciliation`);
    setReconciliation(payload.reconciliation);
    return payload.reconciliation;
  }

  async function runSandboxFlow() {
    const q = await createQuote();
    const t = await createTransfer(q);
    const pix = await createPixIntent(t, true);
    const funded = await simulatePixReceived(pix);
    const settled = await settleStellar(funded);
    const payout = await createPayoutInstruction(settled);
    await loadReconciliation(payout);
  }

  return (
    <main className="min-h-screen bg-[#f4f7f5] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Live backend tester</p>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">BRL to USD transfer rail</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold">Transfer input</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Same-origin API proxy, backend state machine and reconciliation.</p>
            </div>
          </div>

          <div className="grid gap-3">
            <Field label="BRL amount" type="number" value={brlAmount} onChange={setBrlAmount} />
            <Field label="Sender legal name" value={senderName} onChange={setSenderName} />
            <Field label="Sender email" value={senderEmail} onChange={setSenderEmail} />
            <Field label="Account holder" value={recipientName} onChange={setRecipientName} />
            <SelectField
              label="Holder type"
              value={accountHolderType}
              onChange={setAccountHolderType}
              options={[
                { value: "individual", label: "Individual" },
                { value: "business", label: "Business" },
              ]}
            />
            <Field label="Bank name" value={bankName} onChange={setBankName} />
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
              label="Account provider"
              value={providerLabel}
              onChange={setProviderLabel}
              options={[
                { value: "other", label: "Other" },
                { value: "wise", label: "Wise-compatible" },
                { value: "mercury", label: "Mercury" },
                { value: "revolut", label: "Revolut" },
              ]}
            />
            <SelectField
              label="Payout adapter"
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
              Mock Pix funding intent
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Session ID" value={manualSessionId} onChange={setManualSessionId} placeholder={sessionId || "cookie"} />
              <Field label="Session token" value={manualSessionToken} onChange={setManualSessionToken} placeholder="cookie" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <ActionButton onClick={() => createQuote()} disabled={Boolean(busy)} variant="dark">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Quote
            </ActionButton>
            <ActionButton onClick={() => createTransfer()} disabled={Boolean(busy || !quote)} variant="light">
              <Route className="h-4 w-4" aria-hidden="true" />
              Transfer
            </ActionButton>
            <ActionButton onClick={() => createPixIntent()} disabled={Boolean(busy || !transfer)} variant="light">
              <QrCode className="h-4 w-4" aria-hidden="true" />
              Pix intent
            </ActionButton>
            <ActionButton onClick={() => simulatePixReceived()} disabled={Boolean(busy || !transfer)} variant="green">
              <Banknote className="h-4 w-4" aria-hidden="true" />
              Pix paid
            </ActionButton>
            <ActionButton onClick={() => settleStellar()} disabled={Boolean(busy || !transfer)} variant="blue">
              <Network className="h-4 w-4" aria-hidden="true" />
              Stellar
            </ActionButton>
            <ActionButton onClick={() => createPayoutInstruction()} disabled={Boolean(busy || !transfer)} variant="blue">
              <Send className="h-4 w-4" aria-hidden="true" />
              Payout
            </ActionButton>
          </div>
          <div className="mt-3 grid gap-3">
            <ActionButton onClick={() => loadReconciliation()} disabled={Boolean(busy || !transfer)} variant="light">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reconciliation
            </ActionButton>
            <ActionButton onClick={runSandboxFlow} disabled={Boolean(busy)} variant="dark">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              Run sandbox flow
            </ActionButton>
          </div>
        </section>

        <div className="grid gap-5">
          {error ? (
            <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
              {error}
            </section>
          ) : null}

          <section className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Quote</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{quote ? formatCurrency(quote.brl_amount, "BRL") : "-"}</p>
              <p className="text-sm text-slate-600">{quote ? `${formatCurrency(quote.estimated_usd_amount, "USD")} net` : "No quote"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Status</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{transfer?.status || "-"}</p>
              <p className="text-sm text-slate-600">{transfer?.transfer_id ? transfer.transfer_id.slice(0, 24) : "No transfer"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Stellar</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{transfer?.stellar_tx_hash ? "Evidence attached" : "-"}</p>
              <p className="text-sm text-slate-600">{transfer?.stellar_memo || "No memo"}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Payout</p>
              <p className="mt-2 text-lg font-bold text-slate-950">{transfer?.payout_status || "-"}</p>
              <p className="text-sm text-slate-600">{transfer?.payout_provider || payoutProvider}</p>
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
                <h2 className="text-base font-bold">Transfer</h2>
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
            <h2 className="text-base font-bold text-slate-950">API log</h2>
            <div className="mt-4 grid gap-3">
              {logs.length ? logs.map((log) => (
                <details key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-sm font-bold text-slate-900">
                    {log.method} {log.path} {log.status ? `- ${log.status}` : ""} {log.durationMs ? `(${log.durationMs}ms)` : ""}
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
