"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  Send,
  TriangleAlert,
  User,
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

/** Deduplicate a name that appears stacked (e.g. "John Doe John Doe" → "John Doe"). */
function dedupName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length < 4) return trimmed;
  const half = Math.floor(trimmed.length / 2);
  if (trimmed.slice(0, half) === trimmed.slice(half).trimStart()) {
    return trimmed.slice(0, half).trim();
  }
  const midSpace = trimmed.lastIndexOf(' ', half + 5);
  if (midSpace > 2 && midSpace < trimmed.length - 3) {
    const left = trimmed.slice(0, midSpace).trim();
    const right = trimmed.slice(midSpace).trim();
    if (left && right && left === right) return left;
    if (right.startsWith(left)) return left;
    if (left.startsWith(right)) return right;
  }
  return trimmed;
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
  const display = masked && !revealed
    ? "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4)
    : value;

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
          {active ? <BadgeCheck className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {active ? "Active" : va.status}
        </span>
      </div>

      <div className="px-5 py-5 border-b border-tts-border/40">
        <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted mb-1">
          Total received
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-tts-deep">{fmt(received)}</span>
          <span className="text-base font-bold text-tts-muted">USD</span>
        </div>
        {!active && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Account pending activation — transfers may be held until KYC is approved.
          </p>
        )}
      </div>

      {instr && (
        <div>
          <p className="px-5 pt-4 pb-2 text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            Wire / ACH details
          </p>
          {instr.bank_name && <Field label="Bank" value={instr.bank_name} mono={false} />}
          {instr.bank_routing_number && <Field label="Routing number" value={instr.bank_routing_number} />}
          {instr.bank_account_number && <Field label="Account number" value={instr.bank_account_number} masked />}
          {instr.bank_beneficiary_name && <Field label="Beneficiary" value={dedupName(instr.bank_beneficiary_name)} mono={false} />}
          {instr.bank_beneficiary_address && <Field label="Beneficiary address" value={instr.bank_beneficiary_address} mono={false} />}
          {instr.iban && <Field label="IBAN" value={instr.iban} />}
          {instr.bic && <Field label="BIC / SWIFT" value={instr.bic} />}
          {reference && <Field label="Reference / Memo" value={reference} highlight />}
          {instr.bank_address && <Field label="Bank address" value={instr.bank_address} mono={false} />}
        </div>
      )}

      <div className="px-5 py-4 bg-tts-bg/50 border-t border-tts-border/40">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-3.5 w-3.5 text-tts-muted shrink-0" />
          <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">How to deposit</p>
        </div>
        <ol className="space-y-2">
          {[
            "Log into your US bank or wire service.",
            "Create a new wire or ACH transfer to the account above.",
            reference ? (
              <span key="ref">In the <strong className="text-tts-deep">Reference / Memo</strong> field, enter <span className="font-mono font-semibold text-amber-700 dark:text-amber-400">{reference}</span> exactly.</span>
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

export default function BridgeClient({ initialQuery = "" }: { initialQuery?: string }) {
  const searchParams = useSearchParams();
  const qp = new URLSearchParams(initialQuery || searchParams.toString());

  const sessionId = qp.get("session_id") ?? "";
  const emailParam = qp.get("email") ?? "";
  const amount = qp.get("amount") ?? "";
  const lang = qp.get("lang") ?? "pt-BR";
  const isEn = lang === "en" || lang === "en-US";
  const L = (pt: string, en: string) => (isEn ? en : pt);

  type Status = "login" | "loading" | "ready" | "no_account" | "error";
  const [status, setStatus] = useState<Status>("login");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [emailInput, setEmailInput] = useState(emailParam);
  const [loggedEmail, setLoggedEmail] = useState("");
  const [accountIndex, setAccountIndex] = useState(0);
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

  useEffect(() => {
    if (didAuto.current) return;
    if (sessionId || emailParam) {
      didAuto.current = true;
      load(emailParam);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show all VAs the backend returned (already filtered to USD by backend)
  const usdAccounts = data?.virtual_accounts ?? [];
  const safeIndex = Math.max(0, Math.min(accountIndex, usdAccounts.length - 1));
  const activeVa = usdAccounts.length > 0 ? usdAccounts[safeIndex] : null;
  const beneficiaryName = activeVa?.source_deposit_instructions?.bank_beneficiary_name
    ? dedupName(activeVa.source_deposit_instructions.bank_beneficiary_name)
    : "";
  const totalReceivedAll = usdAccounts.reduce((sum, va) => sum + (va.total_received_usd ?? 0), 0);

  // ── Login gate ─────────────────────────────────────────────────────────────

  if (status === "login") {
    return (
      <div className="min-h-screen bg-tts-bg flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">TalkToStellar</p>
            <h1 className="text-3xl font-bold text-tts-deep">
              {L("Depositar em Dólar", "USD Deposit")}
            </h1>
            <p className="text-sm text-tts-muted">
              {L("Entre com seu e-mail para ver sua conta", "Enter your email to see your account")}
            </p>
          </div>

          {amount && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 px-4 py-3">
              <ArrowDownToLine className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                {L(`Valor: US$ ${amount}`, `Amount: US$ ${amount}`)}
              </span>
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); load(emailInput); }} className="space-y-3">
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

          <p className="text-center text-xs text-tts-muted/60">TalkToStellar · Powered by Stellar Network</p>
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
            <p className="font-semibold text-tts-deep">{L("Erro ao carregar", "Failed to load")}</p>
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

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">TalkToStellar</p>
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

        {/* Beneficiary name at top */}
        {beneficiaryName && (
          <div className="flex items-center gap-2 rounded-xl border border-tts-border bg-tts-surface px-4 py-3">
            <User className="h-4 w-4 text-tts-muted shrink-0" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">
                {L("Titular da conta", "Account holder")}
              </p>
              <p className="text-sm font-semibold text-tts-deep">{beneficiaryName}</p>
            </div>
          </div>
        )}

        {amount && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 px-4 py-3">
            <ArrowDownToLine className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
              {L(`Valor desejado: US$ ${amount}`, `Requested amount: US$ ${amount}`)}
            </span>
          </div>
        )}

        {usdAccounts.length > 0 && activeVa ? (
          <>
            <VaCard key={activeVa.id} va={activeVa} />

            {usdAccounts.length > 1 && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setAccountIndex((i) => (i - 1 + usdAccounts.length) % usdAccounts.length)}
                    className="flex items-center gap-1 rounded-lg border border-tts-border px-3 py-1.5 text-xs font-medium
                               text-tts-muted hover:bg-tts-surface hover:text-tts-deep transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {L("Anterior", "Prev")}
                  </button>
                  <span className="text-xs font-mono text-tts-muted tabular-nums">
                    {safeIndex + 1} / {usdAccounts.length}
                  </span>
                  <button
                    onClick={() => setAccountIndex((i) => (i + 1) % usdAccounts.length)}
                    className="flex items-center gap-1 rounded-lg border border-tts-border px-3 py-1.5 text-xs font-medium
                               text-tts-muted hover:bg-tts-surface hover:text-tts-deep transition-colors"
                  >
                    {L("Próximo", "Next")}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-tts-border/60 bg-tts-bg/50 px-4 py-3">
                  <span className="text-xs text-tts-muted uppercase tracking-wide">
                    {L("Total todas as contas", "Total all accounts")}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-tts-deep">
                    {fmt(totalReceivedAll)} <span className="text-tts-muted font-medium">USD</span>
                  </span>
                </div>
              </>
            )}

            {data?.stellar_wallet && (
              <div className="rounded-2xl border border-tts-border bg-tts-surface overflow-hidden shadow-sm">
                <div className="flex items-center gap-2.5 px-5 py-4 border-b border-tts-border/60 bg-tts-bg/50">
                  <Send className="h-5 w-5 text-tts-muted" />
                  <div>
                    <p className="text-sm font-bold text-tts-deep">
                      {L("Enviar para carteira Stellar", "Send to Stellar Wallet")}
                    </p>
                    <p className="text-[11px] text-tts-muted mt-0.5">
                      {L("Seus fundos são convertidos para USDC automaticamente", "Your funds are converted to USDC automatically")}
                    </p>
                  </div>
                </div>
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-tts-muted">
                      {L("Destino", "Destination")}
                    </span>
                    <span className="text-sm font-mono font-semibold text-tts-deep">
                      {data.stellar_wallet.public_key.length > 12
                        ? `${data.stellar_wallet.public_key.slice(0, 6)}...${data.stellar_wallet.public_key.slice(-6)}`
                        : data.stellar_wallet.public_key}
                    </span>
                  </div>
                  {data.stellar_wallet.usdc_balance !== null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-tts-muted">
                        {L("Saldo USDC atual", "Current USDC balance")}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-tts-deep">
                        {fmt(Number(data.stellar_wallet.usdc_balance))} USDC
                      </span>
                    </div>
                  )}
                </div>
                <div className="px-5 py-4 bg-tts-bg/50 border-t border-tts-border/40">
                  <div className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-tts-muted shrink-0 mt-0.5" />
                    <p className="text-xs text-tts-muted leading-relaxed">
                      {L(
                        "Quando seu depósito em USD chegar, ele será convertido e enviado automaticamente para esta carteira Stellar. Nenhuma ação é necessária.",
                        "When your USD deposit arrives, it is automatically converted and sent to this Stellar wallet. No action needed."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {data?.stellar_wallet?.usdc_balance && Number(data.stellar_wallet.usdc_balance) > 0 && (
              <div className="rounded-2xl border border-tts-confirm/30 bg-tts-confirm/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-tts-confirm">
                      {L("Rendimento disponível", "Yield available")}
                    </p>
                    <p className="text-sm font-bold text-tts-deep">
                      {L("Seu USDC pode estar rendendo", "Your USDC can be earning yield")}
                    </p>
                    <p className="text-xs text-tts-muted leading-relaxed">
                      {L(
                        "Invista seu USDC em rendimentos automáticos e acompanhe seus ganhos.",
                        "Invest your USDC in automatic yield and track your earnings."
                      )}
                    </p>
                  </div>
                </div>
                <a
                  href={`/rendimentos?view=application&action=deposit&asset=USDC&amount=${Math.floor(Number(data.stellar_wallet.usdc_balance))}&lang=${lang}`}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-tts-confirm py-3 text-sm font-bold text-white hover:opacity-90 transition-opacity"
                >
                  {L("Investir USDC", "Invest USDC")}
                </a>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-tts-border bg-tts-surface p-6 text-center space-y-3">
            <Clock className="h-8 w-8 text-tts-muted mx-auto" />
            <p className="font-semibold text-tts-deep">
              {L("Nenhuma conta USD vinculada", "No USD account linked")}
            </p>
            <p className="text-sm text-tts-muted">
              {loggedEmail && <span className="block font-mono text-xs mb-1">{loggedEmail}</span>}
              {L(
                "Esta conta ainda não possui uma conta bancária americana ativa. Fale conosco no WhatsApp para ativá-la.",
                "This account doesn't have a US bank account yet. Message us on WhatsApp to set one up."
              )}
            </p>
          </div>
        )}

        <button
          onClick={() => load(loggedEmail || emailInput)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-tts-border
                     py-2.5 text-sm text-tts-muted hover:bg-tts-surface transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {L("Atualizar", "Refresh")}
        </button>

        <div className="flex items-center justify-center gap-1.5 text-xs text-tts-muted/60 pb-4">
          <CheckCircle2 className="h-3 w-3" />
          <span>TalkToStellar · Powered by Stellar Network</span>
        </div>
      </div>
    </div>
  );
}
