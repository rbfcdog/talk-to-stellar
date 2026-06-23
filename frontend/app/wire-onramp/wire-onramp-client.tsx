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
  LogOut,
  RefreshCw,
  Send,
  TriangleAlert,
  User,
} from "lucide-react";
import {
  OperationalCard,
  OperationalHeader,
  OperationalPage,
  OperationalStat,
  StatusPill,
} from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  balance_summaries?: Array<{
    amount?: string;
    currency?: string;
    source?: string;
    label?: string;
  }>;
  account_source?: string;
  activity_count?: number;
};

type StellarWallet = {
  public_key: string;
  usdc_balance: string | null;
};

type BridgeWallet = {
  id: string;
  chain: string | null;
  address: string | null;
  balances: Array<{ currency: string; amount: string }>;
};

type ApiResponse = {
  success: boolean;
  has_account?: boolean;
  kyc_status?: string;
  customer_status?: string;
  customer_id?: string;
  email?: string;
  lookup_source?: string | null;
  virtual_account_source?: string;
  virtual_accounts?: UsdVA[];
  stellar_wallet?: StellarWallet | null;
  bridge_wallets?: BridgeWallet[];
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

const EMAIL_CACHE_KEY = "tts:wire-onramp:email";

function readCachedEmail() {
  if (typeof window === "undefined") return "";
  try {
    return String(window.localStorage.getItem(EMAIL_CACHE_KEY) || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

function writeCachedEmail(email: string) {
  if (typeof window === "undefined") return;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return;
  try {
    window.localStorage.setItem(EMAIL_CACHE_KEY, normalized);
  } catch {
    // Browser storage can be disabled; the page still works without cache.
  }
}

function clearCachedEmail() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(EMAIL_CACHE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function shortId(value?: string | null) {
  const raw = String(value || "");
  return raw.length > 16 ? `${raw.slice(0, 10)}...${raw.slice(-6)}` : raw || "-";
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
  const balanceRows = va.balance_summaries ?? [];

  const rail = instr?.payment_rail?.toUpperCase() ?? "WIRE";
  const allRails = instr?.payment_rails?.map((r) => r.toUpperCase()).join(" · ") ?? rail;
  const reference = instr?.wire_reference || instr?.deposit_message;

  return (
    <div className="overflow-hidden rounded-lg border border-tts-border bg-tts-surface shadow-sm">

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
        {balanceRows.length > 0 && (
          <div className="mt-3 grid gap-1">
            {balanceRows.map((b, index) => (
              <div key={`${b.source}-${index}`} className="flex items-center justify-between rounded bg-tts-bg/70 px-2 py-1 text-xs">
                <span className="text-tts-muted">{b.label || b.source || "Balance"}</span>
                <span className="font-mono font-bold text-tts-deep">
                  {fmt(Number(b.amount || 0))} {(b.currency || "USD").toUpperCase()}
                </span>
              </div>
            ))}
          </div>
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
            <Field label="Beneficiary" value={dedupName(instr.bank_beneficiary_name)} mono={false} />
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function WireOnrampClient({ initialQuery = "" }: { initialQuery?: string }) {
  const searchParams = useSearchParams();
  const qp = new URLSearchParams(initialQuery || searchParams.toString());

  const sessionId = qp.get("session_id") ?? "";
  const shortLinkCode = qp.get("short_link_code") ?? "";
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
  const [cachedEmail, setCachedEmail] = useState("");
  const [accountIndex, setAccountIndex] = useState(0);
  const didAuto = useRef(false);

  const load = useCallback(async (email: string, options: { forceEmail?: boolean } = {}) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed && !sessionId && !shortLinkCode) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (options.forceEmail && trimmed) {
        params.set("email", trimmed);
      } else if (sessionId) {
        params.set("session_id", sessionId);
      } else if (trimmed) {
        params.set("email", trimmed);
      } else if (shortLinkCode) {
        params.set("short_link_code", shortLinkCode);
      }
      if (shortLinkCode) params.set("short_link_code", shortLinkCode);

      const res = await fetch(`/api/bridge/session/usd-account?${params}`, { cache: "no-store" });
      const json: ApiResponse = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) throw new Error(json.message || `HTTP ${res.status}`);
      setData(json);
      const nextEmail = (json.email ?? trimmed).trim().toLowerCase();
      setLoggedEmail(nextEmail);
      if (nextEmail) {
        setEmailInput(nextEmail);
        setCachedEmail(nextEmail);
        writeCachedEmail(nextEmail);
      }
      setStatus(json.has_account ? "ready" : "no_account");
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setStatus("error");
    }
  }, [sessionId, shortLinkCode]);

  const resetLogin = useCallback((clearCache = false) => {
    if (clearCache) {
      clearCachedEmail();
      setCachedEmail("");
      setEmailInput("");
    }
    setStatus("login");
    setData(null);
    setLoggedEmail("");
    setErrorMsg("");
  }, []);

  // Auto-load when session_id/email/short-link is in the URL, or when the browser has a cached email.
  useEffect(() => {
    if (didAuto.current) return;
    const stored = readCachedEmail();
    if (!emailParam && stored) {
      setEmailInput(stored);
      setCachedEmail(stored);
    }
    if (sessionId || emailParam || shortLinkCode || stored) {
      didAuto.current = true;
      load(emailParam || stored);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show all VAs returned by backend (already filtered to USD server-side)
  const usdAccounts = data?.virtual_accounts ?? [];
  const safeIndex = Math.max(0, Math.min(accountIndex, usdAccounts.length - 1));
  const activeVa = usdAccounts.length > 0 ? usdAccounts[safeIndex] : null;
  const beneficiaryName = activeVa?.source_deposit_instructions?.bank_beneficiary_name
    ? dedupName(activeVa.source_deposit_instructions.bank_beneficiary_name)
    : "";
  const totalReceived = usdAccounts.reduce((sum, va) => sum + Number(va.total_received_usd || 0), 0);

  // USDC balance available in Bridge custodial wallets (for manual sweep)
  const bridgeWallets = data?.bridge_wallets ?? [];
  const bridgeUsdcBalance = bridgeWallets.reduce(
    (sum, w) => sum + w.balances.filter(b => b.currency === 'USDC').reduce((s, b) => s + Number(b.amount || 0), 0),
    0,
  );

  // Manual send state
  const [sendAmount, setSendAmount] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [sendError, setSendError] = useState("");

  const handleSendToStellar = useCallback(async () => {
    const amountNum = Number(sendAmount);
    if (!amountNum || amountNum <= 0) return;
    const wallet = bridgeWallets[0];
    if (!wallet || !data?.customer_id || !data?.stellar_wallet?.public_key) return;
    setSendStatus("sending");
    setSendError("");
    try {
      const res = await fetch(
        `/api/bridge?_path=/customers/${encodeURIComponent(data.customer_id)}/wallets/${encodeURIComponent(wallet.id)}/transfer-to-stellar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: String(amountNum),
            stellar_address: data.stellar_wallet.public_key,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      setSendStatus("ok");
      setSendAmount("");
      // Refresh data after a short delay so balances update
      setTimeout(() => load(loggedEmail || emailInput), 3000);
    } catch (e: any) {
      setSendStatus("error");
      setSendError(e?.message ?? String(e));
    }
  }, [sendAmount, bridgeWallets, data, load, loggedEmail, emailInput]);

  // ── Login gate ─────────────────────────────────────────────────────────────

  if (status === "login") {
    return (
      <OperationalPage size="sm" centered>
        <OperationalHeader
          eyebrow="Bridge.xyz mainnet"
          title={L("Depositar em Dólar", "USD Deposit")}
          description={L(
            "Entre com o e-mail da conta Bridge que deve receber o depósito. Pode ser diferente do WhatsApp.",
            "Enter the Bridge account email that should receive the deposit. It can be different from WhatsApp."
          )}
        />
        <OperationalCard>
          {amount && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-tts-gold/30 bg-tts-gold-bg px-3 py-2">
              <ArrowDownToLine className="h-4 w-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                {L(`Valor: US$ ${amount}`, `Amount: US$ ${amount}`)}
              </span>
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); load(emailInput, { forceEmail: true }); }}
            className="space-y-3"
          >
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-tts-muted mb-2">
                {L("E-mail da conta", "Account email")}
              </label>
              <Input
                type="email"
                autoFocus
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@email.com"
                className="text-center"
              />
            </div>
            <Button
              type="submit"
              disabled={!emailInput.trim()}
              className="w-full"
            >
              {L("Continuar", "Continue")}
            </Button>
          </form>
          {cachedEmail && (
            <p className="mt-3 text-center text-xs text-tts-muted">
              {L("E-mail salvo neste navegador:", "Saved in this browser:")}{" "}
              <span className="font-mono text-tts-deep">{cachedEmail}</span>
            </p>
          )}
        </OperationalCard>
      </OperationalPage>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <OperationalPage size="sm" centered>
        <OperationalCard className="flex flex-col items-center gap-3 text-center text-tts-muted">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">{L("Carregando sua conta...", "Loading your account...")}</p>
        </OperationalCard>
      </OperationalPage>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (status === "error") {
    return (
      <OperationalPage size="sm" centered>
        <OperationalCard className="space-y-6 text-center">
          <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
          <div>
            <p className="font-semibold text-tts-deep">
              {L("Erro ao carregar", "Failed to load")}
            </p>
            <p className="mt-1 text-sm text-tts-muted">{errorMsg}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => load(emailInput, { forceEmail: Boolean(emailInput.trim()) })}
              className="w-full"
            >
              {L("Tentar novamente", "Try again")}
            </Button>
            <Button
              variant="outline"
              onClick={() => resetLogin()}
              className="w-full"
            >
              {L("Mudar e-mail", "Change email")}
            </Button>
          </div>
        </OperationalCard>
      </OperationalPage>
    );
  }

  // ── No account ─────────────────────────────────────────────────────────────

  if (status === "no_account") {
    return (
      <OperationalPage size="sm" centered>
        <OperationalCard className="space-y-6 text-center">
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
                "Não encontramos uma conta USD para esse e-mail. Digite o e-mail da conta Bridge que você quer usar; ele pode ser diferente do WhatsApp.",
                "We did not find a USD account for this email. Enter the Bridge account email you want to use; it can be different from WhatsApp."
              )}
            </p>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); load(emailInput, { forceEmail: true }); }}
            className="space-y-3"
          >
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-tts-muted mb-2">
                {L("E-mail da conta Bridge", "Bridge account email")}
              </label>
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@email.com"
                className="text-center"
              />
            </div>
            <Button type="submit" disabled={!emailInput.trim()} className="w-full">
              {L("Buscar por este e-mail", "Check this email")}
            </Button>
          </form>
          <Button
            variant="outline"
            onClick={() => resetLogin(true)}
            className="w-full"
          >
            {L("Limpar e-mail salvo", "Clear saved email")}
          </Button>
        </OperationalCard>
      </OperationalPage>
    );
  }

  // ── Ready ──────────────────────────────────────────────────────────────────

  return (
    <OperationalPage size="lg" frameClassName="max-w-4xl">
      <OperationalHeader
        eyebrow="Bridge.xyz mainnet"
        title={L("Depositar em Dólar", "USD Deposit")}
        description={L(
          "Use estes dados para enviar wire/ACH. A Bridge converte o depósito para USDC e envia para sua carteira Stellar.",
          "Use these details to send a wire/ACH deposit. Bridge converts the deposit to USDC and routes it to your Stellar wallet."
        )}
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-tts-muted">{L("Conectado como", "Signed in as")}</p>
              <p className="text-sm font-semibold text-tts-deep">{loggedEmail || emailInput}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => resetLogin(true)}>
              <LogOut className="mr-2 h-4 w-4" />
              {L("Trocar", "Change")}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <OperationalStat
          label="Customer"
          value={shortId(data?.customer_id)}
          detail={data?.customer_status || data?.kyc_status || "Loaded"}
          tone={data?.customer_id ? "confirm" : "default"}
        />
        <OperationalStat
          label="USD accounts"
          value={String(usdAccounts.length)}
          detail={data?.virtual_account_source === "db_cache" ? "Loaded from cache" : "Live Bridge API"}
          tone={usdAccounts.length ? "confirm" : "gold"}
        />
        <OperationalStat
          label="Received"
          value={`$${fmt(totalReceived)}`}
          detail="Bridge account activity"
          tone={totalReceived > 0 ? "confirm" : "default"}
        />
        <OperationalStat
          label="Destination"
          value={data?.stellar_wallet?.public_key ? shortId(data.stellar_wallet.public_key) : "-"}
          detail={data?.stellar_wallet ? "Stellar USDC" : "Wallet not linked"}
          tone={data?.stellar_wallet ? "confirm" : "gold"}
        />
      </div>

        {/* Amount hint */}
        {amount && (
          <div className="flex items-center gap-2 rounded-md border border-tts-gold/30 bg-tts-gold-bg px-4 py-3">
            <ArrowDownToLine className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
              {L(`Valor desejado: US$ ${amount}`, `Requested amount: US$ ${amount}`)}
            </span>
          </div>
        )}

      {/* Beneficiary name */}
      {beneficiaryName && (
        <OperationalCard>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-tts-muted shrink-0" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-tts-muted">
                {L("Titular da conta", "Account holder")}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-tts-deep">{beneficiaryName}</p>
            </div>
          </div>
        </OperationalCard>
      )}

      <OperationalCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-tts-muted">Bridge account</p>
            <p className="mt-1 text-sm text-tts-muted">
              {loggedEmail || emailInput}
              {data?.lookup_source ? <span className="ml-2 text-tts-muted/60">via {data.lookup_source}</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={data?.customer_status === "active" || data?.kyc_status === "approved" ? "confirm" : "gold"}>
              {data?.customer_status || data?.kyc_status || "customer loaded"}
            </StatusPill>
            {data?.virtual_account_source && (
              <StatusPill tone={data.virtual_account_source === "db_cache" ? "gold" : "confirm"}>
                {data.virtual_account_source === "db_cache" ? "cached VA" : "live VA"}
              </StatusPill>
            )}
          </div>
        </div>
      </OperationalCard>

        {/* VA cards */}
        {usdAccounts.length > 0 && activeVa ? (
          <>
            <VaCard key={activeVa.id} va={activeVa} />

            {usdAccounts.length > 1 && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAccountIndex((i) => (i - 1 + usdAccounts.length) % usdAccounts.length)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    {L("Anterior", "Prev")}
                  </Button>
                  <span className="text-xs font-mono text-tts-muted tabular-nums">
                    {safeIndex + 1} / {usdAccounts.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setAccountIndex((i) => (i + 1) % usdAccounts.length)}
                  >
                    {L("Próximo", "Next")}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                <OperationalCard>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-tts-muted">
                      {L("Total todas as contas", "Total all accounts")}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-tts-deep">
                      {fmt(totalReceived)} <span className="text-tts-muted font-medium">USD</span>
                    </span>
                  </div>
                </OperationalCard>
              </>
            )}

            {data?.stellar_wallet && (
              <OperationalCard>
                <div className="flex items-center gap-2.5 mb-4">
                  <Send className="h-5 w-5 text-tts-muted" />
                  <div>
                    <p className="text-sm font-bold text-tts-deep">
                      {L("Enviar para carteira Stellar", "Send to Stellar Wallet")}
                    </p>
                    <p className="text-[11px] text-tts-muted mt-0.5">
                      {L("Envie manualmente os fundos da Bridge para sua carteira", "Manually send Bridge funds to your wallet")}
                    </p>
                  </div>
                </div>

                {/* Available balance */}
                {bridgeUsdcBalance > 0 ? (
                  <div className="mb-4 rounded-lg bg-tts-bg/70 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-tts-muted">
                        {L("Saldo disponível na Bridge", "Available Bridge balance")}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-tts-deep">
                        {fmt(bridgeUsdcBalance)} USDC
                      </span>
                    </div>
                    {bridgeWallets.length > 0 && (
                      <p className="mt-1 text-[10px] text-tts-muted/60">
                        {L(
                          `Carteira Bridge: ${bridgeWallets[0].id.slice(0, 10)}...${bridgeWallets[0].id.slice(-6)}`,
                          `Bridge wallet: ${bridgeWallets[0].id.slice(0, 10)}...${bridgeWallets[0].id.slice(-6)}`,
                        )}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="mb-4 rounded-lg bg-amber-50/40 dark:bg-amber-900/10 px-3 py-2">
                    <p className="text-xs text-amber-700 dark:text-amber-400">
                      {L(
                        "Nenhum saldo disponível para envio. Os fundos podem ainda estar em processamento.",
                        "No balance available to send. Funds may still be processing."
                      )}
                    </p>
                  </div>
                )}

                {/* Send form */}
                {bridgeUsdcBalance > 0 && sendStatus !== "ok" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-tts-muted mb-1.5">
                        {L("Valor (USDC)", "Amount (USDC)")}
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max={bridgeUsdcBalance}
                          value={sendAmount}
                          onChange={(e) => setSendAmount(e.target.value)}
                          placeholder={`Máx: ${fmt(bridgeUsdcBalance)}`}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSendAmount(String(bridgeUsdcBalance))}
                          className="shrink-0 text-xs"
                        >
                          {L("Tudo", "Max")}
                        </Button>
                      </div>
                    </div>

                    <Button
                      onClick={handleSendToStellar}
                      disabled={sendStatus === "sending" || !sendAmount || Number(sendAmount) <= 0}
                      className="w-full"
                    >
                      {sendStatus === "sending" ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {L("Enviando...", "Sending...")}
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          {L("Enviar agora", "Send Now")}
                        </>
                      )}
                    </Button>

                    {sendStatus === "error" && (
                      <p className="text-xs text-red-500 text-center">{sendError}</p>
                    )}
                  </div>
                )}

                {sendStatus === "ok" && (
                  <div className="flex items-center gap-2 rounded-lg bg-tts-confirm/10 border border-tts-confirm/30 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-tts-confirm shrink-0" />
                    <p className="text-xs text-tts-confirm font-medium">
                      {L("Transferência iniciada! Atualizando saldos...", "Transfer started! Refreshing balances...")}
                    </p>
                  </div>
                )}

                {/* Destination */}
                <div className="mt-4 pt-4 border-t border-tts-border/40 space-y-2">
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
                        {L("Saldo Stellar atual", "Current Stellar balance")}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-tts-deep">
                        {fmt(Number(data.stellar_wallet.usdc_balance))} USDC
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-tts-border/40">
                  <div className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-tts-muted shrink-0 mt-0.5" />
                    <p className="text-xs text-tts-muted leading-relaxed">
                      {L(
                        "Esse envio transfere o saldo USDC da sua carteira Bridge para sua carteira Stellar. Use caso o roteamento automático não tenha ocorrido.",
                        "This sends your Bridge wallet USDC balance to your Stellar wallet. Use if auto-routing did not occur."
                      )}
                    </p>
                  </div>
                </div>
              </OperationalCard>
            )}
          </>
        ) : (
          <OperationalCard className="text-center">
            <Clock className="mx-auto h-8 w-8 text-tts-gold" />
            <p className="mt-3 font-semibold text-tts-deep">
              {L("Conta Bridge encontrada, sem conta USD listada", "Bridge account found, no USD account listed")}
            </p>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-tts-muted">
              {L(
                "Encontramos seu cliente Bridge, mas nenhuma conta USD foi retornada agora. Atualize para buscar novamente; se você acabou de criar a conta, a Bridge pode levar alguns minutos para expor as instruções.",
                "We found your Bridge customer, but no USD virtual account was returned right now. Refresh to check again; if the account was just created, Bridge can take a few minutes to expose the instructions."
              )}
            </p>
          </OperationalCard>
        )}

        {/* Refresh */}
        <Button
          variant="outline"
          onClick={() => load(loggedEmail || emailInput, { forceEmail: Boolean((loggedEmail || emailInput).trim()) })}
          className="w-full"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {L("Atualizar", "Refresh")}
        </Button>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-tts-muted/60 pb-4">
          <CheckCircle2 className="h-3 w-3" />
          <span>TalkToStellar · Powered by Stellar Network</span>
        </div>
    </OperationalPage>
  );
}
