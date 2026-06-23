"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  TriangleAlert,
  Wallet,
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
  source_currency?: string;
  source_deposit_instructions?: DepositInstructions;
  total_received_usd?: number;
};

type StellarWallet = {
  public_key: string;
  usdc_balance: string | null;
};

type ApiResponse = {
  success: boolean;
  has_account?: boolean;
  kyc_status?: string;
  customer_status?: string;
  email?: string;
  virtual_accounts?: UsdVA[];
  stellar_wallet?: StellarWallet | null;
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
              <span key="ref">In the <strong className="text-tts-deep">Reference / Memo</strong> field, enter <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">{reference}</span> exactly — required for routing.</span>
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

// ── Stellar wallet destination card ───────────────────────────────────────────

function StellarWalletCard({ wallet }: { wallet: StellarWallet }) {
  const short = wallet.public_key.length > 12
    ? `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-6)}`
    : wallet.public_key;
  const balance = wallet.usdc_balance !== null ? Number(wallet.usdc_balance) : null;

  return (
    <div className="rounded-2xl border border-tts-border bg-tts-surface overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-tts-border/60 bg-tts-bg/50">
        <div className="flex items-center gap-2.5">
          <Wallet className="h-5 w-5 text-tts-muted" />
          <div>
            <p className="text-sm font-bold text-tts-deep">Stellar Wallet</p>
            <p className="text-[11px] text-tts-muted mt-0.5">USDC destination</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase px-2.5 py-1 rounded-full border border-tts-confirm/30 bg-tts-confirm/10 text-tts-confirm">
          <ArrowRight className="h-3 w-3" />
          Auto-routed
        </span>
      </div>

      <div className="px-5 py-5 border-b border-tts-border/40">
        {balance !== null && (
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted mb-1">
              USDC balance
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums text-tts-deep">
                {fmt(balance)}
              </span>
              <span className="text-base font-bold text-tts-muted">USDC</span>
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted mb-0.5">
              Wallet address
            </p>
            <span className="text-sm font-mono font-semibold text-tts-deep">{short}</span>
          </div>
          <CopyBtn value={wallet.public_key} label="wallet address" />
        </div>
      </div>

      <div className="px-5 py-4 bg-tts-bg/50">
        <div className="flex items-start gap-2">
          <Info className="h-3.5 w-3.5 text-tts-muted shrink-0 mt-0.5" />
          <p className="text-xs text-tts-muted leading-relaxed">
            When USD arrives via wire or ACH, it is automatically converted to USDC and credited to this wallet. No action needed.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Arrow divider ──────────────────────────────────────────────────────────────

function FlowArrow() {
  return (
    <div className="flex items-center justify-center py-1">
      <div className="flex flex-col items-center gap-0.5">
        <div className="h-4 w-px bg-tts-border/60" />
        <ArrowRight className="h-4 w-4 text-tts-muted rotate-90" />
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

  type Status = "login" | "loading" | "ready" | "no_account" | "error";
  const [status, setStatus] = useState<Status>("login");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [emailInput, setEmailInput] = useState(emailParam);
  const [loggedEmail, setLoggedEmail] = useState("");
  const didAuto = useRef(false);

  const load = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed && !sessionId) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (sessionId) params.set("session_id", sessionId);
      else params.set("email", trimmed);

      const res = await fetch(`/api/bridge/session/usd-account?${params}`, { cache: "no-store" });
      const json: ApiResponse = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) throw new Error(json.message || `HTTP ${res.status}`);
      setData(json);
      setLoggedEmail(json.email ?? trimmed);
      setStatus(json.has_account ? "ready" : "no_account");
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setStatus("error");
    }
  }, [sessionId]);

  // Auto-load when session_id or email is in the URL
  useEffect(() => {
    if (didAuto.current) return;
    if (sessionId || emailParam) {
      didAuto.current = true;
      load(emailParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usdAccounts = (data?.virtual_accounts ?? []).filter((va) =>
    ["active", "enabled", "activated", "pending"].includes(String(va.status ?? "").toLowerCase())
  );

  // ── Login gate ─────────────────────────────────────────────────────────────

  if (status === "login") {
    return (
      <div className="min-h-screen bg-tts-bg flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-8">

          {/* Brand */}
          <div className="text-center space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">
              TalkToStellar
            </p>
            <h1 className="text-3xl font-bold text-tts-deep">
              {L("Depositar em Dólar", "USD Deposit")}
            </h1>
            <p className="text-sm text-tts-muted">
              {L("Entre com seu e-mail para ver sua conta", "Enter your email to see your account")}
            </p>
          </div>

          {/* Amount hint */}
          {amount && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 px-4 py-3">
              <ArrowDownToLine className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                {L(`Valor: US$ ${amount}`, `Amount: US$ ${amount}`)}
              </span>
            </div>
          )}

          {/* Email form */}
          <form
            onSubmit={(e) => { e.preventDefault(); load(emailInput); }}
            className="space-y-3"
          >
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-tts-muted mb-2">
                {L("E-mail da conta", "Account email")}
              </label>
              <input
                type="email"
                autoFocus
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@email.com"
                className="w-full rounded-xl border border-tts-border bg-tts-bg px-4 py-3 text-sm outline-none
                           focus:border-tts-deep placeholder:text-tts-muted/40 transition-colors text-center"
              />
            </div>
            <button
              type="submit"
              disabled={!emailInput.trim()}
              className="w-full rounded-xl bg-tts-deep py-3 text-sm font-bold text-white
                         disabled:opacity-40 transition-opacity hover:opacity-90"
            >
              {L("Continuar", "Continue")}
            </button>
          </form>

          <p className="text-center text-xs text-tts-muted/60">
            TalkToStellar · Powered by Stellar Network
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-tts-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-tts-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">{L("Carregando sua conta...", "Loading your account...")}</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (status === "error") {
    return (
      <div className="min-h-screen bg-tts-bg flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
          <div>
            <p className="font-semibold text-tts-deep">
              {L("Erro ao carregar", "Failed to load")}
            </p>
            <p className="mt-1 text-sm text-tts-muted">{errorMsg}</p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => load(emailInput)}
              className="w-full rounded-xl bg-tts-deep py-3 text-sm font-bold text-white hover:opacity-90"
            >
              {L("Tentar novamente", "Try again")}
            </button>
            <button
              onClick={() => { setStatus("login"); setErrorMsg(""); }}
              className="w-full rounded-xl border border-tts-border py-3 text-sm font-medium text-tts-muted hover:bg-tts-surface"
            >
              {L("Mudar e-mail", "Change email")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── No account ─────────────────────────────────────────────────────────────

  if (status === "no_account") {
    return (
      <div className="min-h-screen bg-tts-bg flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-tts-border bg-tts-surface">
            <Building2 className="h-7 w-7 text-tts-muted" />
          </div>
          <div>
            <p className="font-semibold text-tts-deep">
              {L("Conta USD não encontrada", "No USD account found")}
            </p>
            <p className="mt-1.5 text-sm text-tts-muted leading-relaxed">
              {loggedEmail && (
                <span className="block font-mono text-xs text-tts-deep/60 mb-2">{loggedEmail}</span>
              )}
              {L(
                "Nenhuma conta de recebimento em dólar encontrada. Fale com a gente no WhatsApp para ativá-la.",
                "No USD receiving account found for this email. Message us on WhatsApp to set one up."
              )}
            </p>
          </div>
          <button
            onClick={() => { setStatus("login"); setData(null); }}
            className="w-full rounded-xl border border-tts-border py-3 text-sm font-medium text-tts-muted hover:bg-tts-surface"
          >
            {L("Tentar outro e-mail", "Try a different email")}
          </button>
        </div>
      </div>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-tts-bg">
      <div className="mx-auto max-w-md px-4 py-10 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">
              TalkToStellar
            </p>
            <h1 className="text-xl font-bold text-tts-deep">
              {L("Depositar em Dólar", "USD Deposit")}
            </h1>
          </div>
          <button
            onClick={() => { setStatus("login"); setData(null); setLoggedEmail(""); }}
            className="text-xs text-tts-muted hover:text-tts-deep transition-colors"
          >
            {loggedEmail ? (
              <span className="flex flex-col items-end gap-0.5">
                <span className="font-mono">{loggedEmail.split("@")[0]}</span>
                <span className="text-[10px] underline">change</span>
              </span>
            ) : L("Sair", "Sign out")}
          </button>
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

        {/* VA cards */}
        {usdAccounts.length > 0 ? (
          <>
            {usdAccounts.map((va) => <VaCard key={va.id} va={va} />)}
            {data?.stellar_wallet && (
              <>
                <FlowArrow />
                <StellarWalletCard wallet={data.stellar_wallet} />
              </>
            )}
          </>
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
          onClick={() => load(loggedEmail || emailInput)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-tts-border
                     py-2.5 text-sm text-tts-muted hover:bg-tts-surface transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {L("Atualizar", "Refresh")}
        </button>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-tts-muted/60 pb-4">
          <CheckCircle2 className="h-3 w-3" />
          <span>TalkToStellar · Powered by Stellar Network</span>
        </div>
      </div>
    </div>
  );
}
