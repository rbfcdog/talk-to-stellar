"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type DepositInstructions = {
  bank_name?: string;
  bank_address?: string;
  bank_routing_number?: string;
  bank_account_number?: string;
  bank_beneficiary_name?: string;
  bank_beneficiary_address?: string;
  payment_rail?: string;
  payment_rails?: string[];
  deposit_message?: string;
  wire_reference?: string;
  iban?: string;
  bic?: string;
};

type UsdVA = {
  id: string;
  status: string;
  currency?: string;
  source_deposit_instructions?: DepositInstructions;
  total_received_usd?: number;
};

type ApiResponse = {
  success: boolean;
  has_account?: boolean;
  kyc_status?: string;
  customer_status?: string;
  email?: string;
  virtual_accounts?: UsdVA[];
  message?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isActive(va: UsdVA) {
  return ["active", "enabled", "activated"].includes(String(va.status).toLowerCase());
}

// ── Copy button ────────────────────────────────────────────────────────────────

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  function tap() {
    navigator.clipboard.writeText(value).catch(() => null);
    setDone(true);
    setTimeout(() => setDone(false), 1800);
  }
  return (
    <button
      onClick={tap}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors
                 text-tts-muted hover:text-tts-deep hover:bg-tts-border/40"
      title={`Copy ${label ?? value}`}
    >
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-tts-confirm shrink-0" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0" />
      )}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

// ── Field row ──────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  mono = true,
  masked = false,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  masked?: boolean;
  highlight?: boolean;
}) {
  const [revealed, setRevealed] = useState(!masked);
  const display = masked && !revealed ? "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4) : value;

  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 border-b border-tts-border/40 last:border-0
                     ${highlight ? "bg-amber-50/30 dark:bg-amber-900/10" : ""}`}>
      <span className="text-xs text-tts-muted uppercase tracking-wide shrink-0 w-36">{label}</span>
      <div className="flex items-center gap-1 min-w-0 ml-auto">
        {highlight && <TriangleAlert className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
        <span className={`text-sm font-semibold truncate ${mono ? "font-mono" : ""} ${highlight ? "text-amber-700 dark:text-amber-400" : "text-tts-deep"}`}>
          {display}
        </span>
        {masked && (
          <button
            onClick={() => setRevealed((r) => !r)}
            className="ml-1 text-xs text-tts-muted hover:text-tts-deep"
          >
            {revealed ? "hide" : "show"}
          </button>
        )}
        <CopyBtn value={value} label={label} />
      </div>
    </div>
  );
}

// ── VA Card ────────────────────────────────────────────────────────────────────

function VaCard({ va }: { va: UsdVA }) {
  const instr = va.source_deposit_instructions;
  const active = isActive(va);
  const received = va.total_received_usd ?? 0;

  const rail = instr?.payment_rail?.toUpperCase() ?? "WIRE";
  const allRails = instr?.payment_rails?.map((r) => r.toUpperCase()).join(" · ") ?? rail;
  const reference = instr?.wire_reference || instr?.deposit_message;

  return (
    <div className="rounded-2xl border border-tts-border bg-tts-surface overflow-hidden shadow-sm">

      {/* VA header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-tts-border/60 bg-tts-bg/50">
        <div className="flex items-center gap-2.5">
          <Building2 className="h-5 w-5 text-tts-muted" />
          <div>
            <p className="text-sm font-bold text-tts-deep">
              {instr?.bank_name ?? "US Bank Account"}
            </p>
            <p className="text-[11px] text-tts-muted mt-0.5">{allRails}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 text-[11px] font-bold uppercase px-2.5 py-1 rounded-full border
          ${active
            ? "border-tts-confirm/30 bg-tts-confirm/10 text-tts-confirm"
            : "border-amber-400/40 bg-amber-50/40 text-amber-600 dark:text-amber-400"
          }`}>
          {active
            ? <BadgeCheck className="h-3 w-3" />
            : <Clock className="h-3 w-3" />
          }
          {active ? "Active" : va.status}
        </span>
      </div>

      {/* Balance */}
      <div className="px-5 py-5 border-b border-tts-border/40">
        <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted mb-1">
          Total received
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-tts-deep">
            {fmt(received)}
          </span>
          <span className="text-base font-bold text-tts-muted">USD</span>
        </div>
        {!active && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Account pending activation — transfers may be held until KYC is approved.
          </p>
        )}
      </div>

      {/* Instructions */}
      {instr && (
        <div>
          <p className="px-5 pt-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            Wire / ACH details
          </p>

          {instr.bank_name && (
            <Field label="Bank" value={instr.bank_name} mono={false} />
          )}
          {instr.bank_routing_number && (
            <Field label="Routing number" value={instr.bank_routing_number} />
          )}
          {instr.bank_account_number && (
            <Field label="Account number" value={instr.bank_account_number} masked />
          )}
          {instr.bank_beneficiary_name && (
            <Field label="Beneficiary" value={instr.bank_beneficiary_name} mono={false} />
          )}
          {instr.bank_beneficiary_address && (
            <Field label="Beneficiary address" value={instr.bank_beneficiary_address} mono={false} />
          )}
          {instr.iban && (
            <Field label="IBAN" value={instr.iban} />
          )}
          {instr.bic && (
            <Field label="BIC / SWIFT" value={instr.bic} />
          )}
          {reference && (
            <Field
              label="Reference / Memo"
              value={reference}
              highlight
            />
          )}
          {instr.bank_address && (
            <Field label="Bank address" value={instr.bank_address} mono={false} />
          )}
        </div>
      )}

      {/* How to guide */}
      <div className="px-5 py-4 bg-tts-bg/50 border-t border-tts-border/40">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-3.5 w-3.5 text-tts-muted shrink-0" />
          <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">
            How to deposit
          </p>
        </div>
        <ol className="space-y-2">
          {[
            "Log into your US bank or wire service.",
            "Create a new wire or ACH transfer to the account above.",
            reference ? (
              <span>In the <strong className="text-tts-deep">Reference / Memo</strong> field, enter <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">{reference}</span> exactly — required for routing.</span>
            ) : "Include a memo if your bank requests one.",
            "Funds typically arrive within 1–2 business days.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-xs text-tts-muted">
              <span className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-tts-border bg-tts-surface text-[10px] font-bold text-tts-deep">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WireOnrampClient({ initialQuery = "" }: { initialQuery?: string }) {
  const searchParams = useSearchParams();
  const qp = new URLSearchParams(initialQuery || searchParams.toString());

  const sessionId = qp.get("session_id") ?? "";
  const emailParam = qp.get("email") ?? "";
  const amount = qp.get("amount") ?? "";
  const lang = qp.get("lang") ?? "pt-BR";
  const isEn = lang === "en";
  const L = (pt: string, en: string) => (isEn ? en : pt);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "no_account" | "error">("idle");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [emailInput, setEmailInput] = useState(emailParam);
  const didAuto = useRef(false);

  const load = useCallback(async (emailOverride?: string) => {
    const params = new URLSearchParams();
    if (sessionId) params.set("session_id", sessionId);
    const email = emailOverride ?? emailInput.trim().toLowerCase();
    if (!sessionId && email) params.set("email", email);

    if (!sessionId && !email) {
      setStatus("idle");
      return;
    }

    setStatus("loading");
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/bridge/session/usd-account?${params}`, { cache: "no-store" });
      const json: ApiResponse = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) throw new Error(json.message || `HTTP ${res.status}`);
      setData(json);
      setStatus(json.has_account ? "ready" : "no_account");
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }, [sessionId, emailInput]);

  useEffect(() => {
    if (didAuto.current) return;
    if (sessionId || emailParam) {
      didAuto.current = true;
      load(emailParam || undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usdAccounts = (data?.virtual_accounts ?? []).filter((va) =>
    ["active", "enabled", "activated", "pending"].includes(String(va.status ?? "").toLowerCase())
  );

  return (
    <div className="min-h-screen bg-tts-bg">
      <div className="mx-auto max-w-md px-4 py-10 space-y-5">

        {/* Brand + title */}
        <div className="text-center space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            TalkToStellar
          </p>
          <h1 className="text-2xl font-bold text-tts-deep">
            {L("Depositar em Dólar", "USD Deposit")}
          </h1>
          <p className="text-sm text-tts-muted">
            {L(
              "Transfira dólares do seu banco americano via wire ou ACH",
              "Transfer dollars from your US bank via wire or ACH"
            )}
          </p>
        </div>

        {/* Amount hint */}
        {amount && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 px-4 py-3">
            <ArrowDownToLine className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
              {L(`Valor desejado: US$ ${amount}`, `Requested amount: US$ ${amount}`)}
            </span>
          </div>
        )}

        {/* Email lookup — only shown when no session_id and no auto-load */}
        {!sessionId && (status === "idle" || status === "no_account" || status === "error") && (
          <div className="rounded-2xl border border-tts-border bg-tts-surface p-5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-tts-muted mb-2">
              {L("E-mail da conta", "Account email")}
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
                placeholder="you@email.com"
                className="flex-1 rounded-xl border border-tts-border bg-tts-bg px-3 py-2.5 text-sm outline-none
                           focus:border-tts-deep placeholder:text-tts-muted/40 transition-colors"
              />
              <button
                onClick={() => load()}
                disabled={loading || !emailInput.trim()}
                className="flex items-center gap-2 rounded-xl bg-tts-deep px-4 py-2.5 text-sm font-bold
                           text-white disabled:opacity-40 transition-opacity hover:opacity-90"
              >
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Search className="h-4 w-4" />
                }
                {L("Buscar", "Search")}
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {status === "loading" && (
          <div className="flex items-center justify-center gap-2 py-12 text-tts-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{L("Carregando sua conta...", "Loading your account...")}</span>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50/40 dark:bg-red-900/10 p-6 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 text-red-400 mx-auto" />
            <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
            <button
              onClick={() => load()}
              className="inline-flex items-center gap-2 rounded-xl border border-tts-border px-4 py-2 text-sm font-medium
                         hover:bg-tts-bg transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {L("Tentar novamente", "Try again")}
            </button>
          </div>
        )}

        {/* No account */}
        {status === "no_account" && (
          <div className="rounded-2xl border border-tts-border bg-tts-surface p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-tts-border bg-tts-bg">
              <Building2 className="h-6 w-6 text-tts-muted" />
            </div>
            <div>
              <p className="font-semibold text-tts-deep">
                {L("Conta USD não configurada", "USD account not set up")}
              </p>
              <p className="mt-1.5 text-sm text-tts-muted leading-relaxed">
                {L(
                  "Sua conta de recebimento em dólar ainda não foi ativada. Fale com a gente no WhatsApp para ativá-la.",
                  "Your USD receiving account hasn't been activated yet. Message us on WhatsApp to set it up."
                )}
              </p>
            </div>
          </div>
        )}

        {/* Ready — VA cards */}
        {status === "ready" && (
          <>
            {usdAccounts.length > 0 ? (
              usdAccounts.map((va) => <VaCard key={va.id} va={va} />)
            ) : (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 p-6 text-center space-y-3">
                <Clock className="h-8 w-8 text-amber-500 mx-auto" />
                <p className="font-semibold text-tts-deep">
                  {L("Conta em processamento", "Account being processed")}
                </p>
                <p className="text-sm text-tts-muted">
                  {L(
                    "Sua conta USD está sendo configurada. Aguarde alguns minutos.",
                    "Your USD account is being set up. Check back in a few minutes."
                  )}
                </p>
              </div>
            )}

            {/* Refresh */}
            <button
              onClick={() => load()}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-tts-border
                         py-2.5 text-sm text-tts-muted hover:bg-tts-surface transition-colors disabled:opacity-40"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {L("Atualizar", "Refresh")}
            </button>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-tts-muted/60 pb-4">
          <CheckCircle2 className="h-3 w-3" />
          <span>TalkToStellar · Powered by Stellar Network</span>
        </div>
      </div>
    </div>
  );
}
