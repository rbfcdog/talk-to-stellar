"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
  Wallet,
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
  bridge_wallet_id?: string | null;
  destination_chain?: string | null;
  destination_address?: string | null;
};

type StellarWallet = {
  public_key: string;
  usdc_balance: string | null;
};

type DestinationWallet = {
  id: number;
  public_key: string;
  label: string | null;
  is_primary: boolean;
  is_funded: boolean;
  has_usdc_trustline: boolean;
  usdc_balance: string | null;
  exists_on_mainnet: boolean;
};

type BridgeWallet = {
  id: string;
  chain: string | null;
  address: string | null;
  balances: Array<{ currency: string; amount: string }>;
};

type MainnetWallet = {
  id: string;
  public_key: string;
  label: string;
  is_primary: boolean;
  last_balance?: Array<{ asset_code: string; balance: string; asset_type: string }>;
};

type PipelineWallet = {
  id: string;
  chain: string;
  address: string;
  initiation_required: boolean;
  created_at: string | null;
  tags: string[];
  usdc_balance: string;
  balances: Array<{ chain: string; currency: string; amount: string; contract_address: string | null }>;
};

type PipelineRoute = {
  id: string;
  status: string;
  destination_chain: string | null;
  destination_address: string | null;
  source_currency: string | null;
};

type Pipeline = {
  wallets: PipelineWallet[];
  virtual_account_routes: PipelineRoute[];
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
  mainnet_wallets?: MainnetWallet[];
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

  // Destination wallets (generated + stored by Bridge email)
  const [destWallets, setDestWallets] = useState<DestinationWallet[]>([]);
  const [selectedWalletKey, setSelectedWalletKey] = useState("");
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [genStatus, setGenStatus] = useState<"idle" | "generating" | "error">("idle");
  const [genError, setGenError] = useState("");
  const [activateStatus, setActivateStatus] = useState<"idle" | "activating" | "error">("idle");
  const [activateError, setActivateError] = useState("");
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [pipelineOpen, setPipelineOpen] = useState(true);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [selectedSourceWalletId, setSelectedSourceWalletId] = useState("");

  const [createWalletStatus, setCreateWalletStatus] = useState<"idle" | "creating" | "error">("idle");
  const [createWalletError, setCreateWalletError] = useState("");

  const loadPipeline = useCallback(async (customerId: string) => {
    if (!customerId) return;
    setPipelineLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch(`/api/bridge?_path=${encodeURIComponent(`/customers/${customerId}/transfer-pipeline`)}`, { cache: "no-store", signal: controller.signal });
      const json = await res.json().catch(() => ({}));
      if (json?.success) {
        const wallets: PipelineWallet[] = json.wallets ?? [];
        setPipeline({ wallets, virtual_account_routes: json.virtual_account_routes ?? [] });
        // Default the source to the wallet holding the most USDC (the funded one).
        setSelectedSourceWalletId((cur) => {
          if (cur && wallets.some((w) => w.id === cur)) return cur;
          const funded = [...wallets].sort((a, b) => Number(b.usdc_balance) - Number(a.usdc_balance))[0];
          return funded && Number(funded.usdc_balance) > 0 ? funded.id : (wallets[0]?.id ?? "");
        });
      }
    } catch {
      // non-critical
    } finally {
      clearTimeout(timer);
      setPipelineLoading(false);
    }
  }, []);

  const createBridgeWallet = useCallback(async (customerId: string, chain = "base") => {
    if (!customerId) return;
    setCreateWalletStatus("creating");
    setCreateWalletError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      // Use the dedicated bridge proxy (_path) — same route the transfer uses.
      const res = await fetch(`/api/bridge?_path=${encodeURIComponent(`/customers/${customerId}/wallets`)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      await loadPipeline(customerId);
    } catch (e: any) {
      setCreateWalletError(e?.name === "AbortError" ? "Request timed out. Try again." : (e?.message ?? String(e)));
      setCreateWalletStatus("error");
    } finally {
      clearTimeout(timer);
      // Always leave the "creating" state so the button can't spin forever.
      setCreateWalletStatus((s) => (s === "creating" ? "idle" : s));
    }
  }, [loadPipeline]);

  const loadDestWallets = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setWalletsLoading(true);
    try {
      const res = await fetch(`/api/bridge/stellar-wallets?email=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const wallets: DestinationWallet[] = Array.isArray(json?.wallets) ? json.wallets : [];
      setDestWallets(wallets);
      setSelectedWalletKey((cur) => {
        if (cur && wallets.some((w) => w.public_key === cur)) return cur;
        const primary = wallets.find((w) => w.is_primary) || wallets[0];
        return primary?.public_key || "";
      });
    } catch {
      // non-critical
    } finally {
      setWalletsLoading(false);
    }
  }, []);

  const generateDestWallet = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setGenStatus("generating");
    setGenError("");
    try {
      const res = await fetch(`/api/bridge/stellar-wallets/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      const wallet: DestinationWallet | undefined = json?.wallet;
      if (wallet?.public_key) {
        setDestWallets((cur) => [wallet, ...cur.filter((w) => w.public_key !== wallet.public_key)]);
        setSelectedWalletKey(wallet.public_key);
      }
      setGenStatus("idle");
      // Surface the funding instruction when the new wallet isn't funded yet.
      if (json?.needs_funding && json?.message) setGenError(json.message);
      else setGenError("");
      await loadDestWallets(trimmed);
    } catch (e: any) {
      setGenStatus("error");
      setGenError(e?.message ?? String(e));
    }
  }, [loadDestWallets]);

  const activateDestWallet = useCallback(async (email: string, publicKey: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !publicKey) return;
    setActivateStatus("activating");
    setActivateError("");
    try {
      const res = await fetch(`/api/bridge/stellar-wallets/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, public_key: publicKey }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      setActivateStatus("idle");
      await loadDestWallets(trimmed);
    } catch (e: any) {
      setActivateStatus("error");
      setActivateError(e?.message ?? String(e));
    }
  }, [loadDestWallets]);

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
        loadDestWallets(nextEmail);
      }
      if (json.customer_id) loadPipeline(json.customer_id);
      setStatus(json.has_account ? "ready" : "no_account");
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setStatus("error");
    }
  }, [sessionId, shortLinkCode, loadDestWallets, loadPipeline]);

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
  // Also include VA total_received as available (funds may be in VA, not yet in wallet)
  const vaAvailableBalance = activeVa?.total_received_usd ?? 0;
  // The selected source wallet's USDC drives the spendable amount.
  const selectedSourceWallet = pipeline?.wallets.find((w) => w.id === selectedSourceWalletId) || null;
  const sourceUsdcBalance = selectedSourceWallet ? Number(selectedSourceWallet.usdc_balance) : 0;
  const totalAvailableBalance = sourceUsdcBalance > 0 ? sourceUsdcBalance : (bridgeUsdcBalance > 0 ? bridgeUsdcBalance : vaAvailableBalance);

  // Destination = selected generated wallet, else the session's linked wallet
  const selectedDestWallet = destWallets.find((w) => w.public_key === selectedWalletKey) || null;
  const destinationAddress = selectedWalletKey || data?.stellar_wallet?.public_key || "";

  // Manual send state
  const [sendAmount, setSendAmount] = useState("");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [sendError, setSendError] = useState("");

  const handleSendToStellar = useCallback(async () => {
    const amountNum = Number(sendAmount);
    if (!amountNum || amountNum <= 0) {
      setSendStatus("error");
      setSendError(L("Informe um valor válido.", "Enter a valid amount."));
      return;
    }
    // Bridge requires a minimum of $1.00 per transfer.
    if (amountNum < 1) {
      setSendStatus("error");
      setSendError(L("O valor mínimo é US$ 1,00.", "Minimum amount is $1.00."));
      return;
    }
    if (!data?.customer_id || !destinationAddress) {
      setSendStatus("error");
      setSendError(L("Carteira de destino não encontrada. Gere uma carteira primeiro.", "Destination wallet not found. Generate a wallet first."));
      return;
    }
    // Use the wallet the user selected as the source; fall back sensibly.
    const fundedWallet = pipeline?.wallets ? [...pipeline.wallets].sort((a, b) => Number(b.usdc_balance) - Number(a.usdc_balance))[0] : undefined;
    const walletId =
      selectedSourceWalletId ||
      (fundedWallet && Number(fundedWallet.usdc_balance) > 0 ? fundedWallet.id : undefined) ||
      bridgeWallets[0]?.id || pipeline?.wallets?.[0]?.id || activeVa?.bridge_wallet_id;
    if (!walletId) {
      const destChain = activeVa?.destination_chain || "";
      if (destChain === "stellar") {
        setSendStatus("error");
        setSendError(L(
          "Esta conta envia direto para Stellar via Bridge. O envio automático deve ocorrer quando o depósito for processado. Se já foi recebido e não chegou, aguarde ou entre em contato pelo WhatsApp.",
          "This account routes directly to Stellar via Bridge. Auto-routing should happen when the deposit is processed. If received but not arrived, please wait or contact us on WhatsApp."
        ));
      } else {
        setSendStatus("error");
        setSendError(L(
          "Nenhuma carteira Bridge encontrada para esta conta. Entre em contato pelo WhatsApp para verificar.",
          "No Bridge wallet found for this account. Contact us on WhatsApp to check."
        ));
      }
      return;
    }
    setSendStatus("sending");
    setSendError("");
    try {
      const res = await fetch(
        `/api/bridge?_path=/customers/${encodeURIComponent(data.customer_id)}/wallets/${encodeURIComponent(walletId)}/transfer-to-stellar`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: String(amountNum),
            stellar_address: destinationAddress,
            destination_wallet: destinationAddress,
          }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // The real rejected field is nested under bridge_invalid_fields.key
        // (e.g. { from_address: "..." } or { "destination.blockchain_memo": "..." }).
        const inv = json?.bridge_invalid_fields;
        let detail = "";
        if (inv?.key && typeof inv.key === "object") {
          detail = " — " + Object.entries(inv.key).map(([k, v]) => `${k}: ${v}`).join("; ");
        } else if (inv && typeof inv === "object") {
          detail = ` (${Object.keys(inv).join(", ")})`;
        }
        throw new Error(`${json.message || `HTTP ${res.status}`}${detail}`);
      }
      setSendStatus("ok");
      setSendAmount("");
      // Bridge settles Base -> Stellar asynchronously (not instant), so poll a
      // few times over ~40s to catch the balance update without a manual refresh.
      const email = loggedEmail || emailInput;
      [3000, 8000, 15000, 25000, 40000].forEach((ms) =>
        setTimeout(() => {
          load(email);
          loadDestWallets(email);
          if (data?.customer_id) loadPipeline(data.customer_id);
        }, ms),
      );
    } catch (e: any) {
      setSendStatus("error");
      setSendError(e?.message ?? String(e));
    }
  }, [sendAmount, bridgeWallets, pipeline, selectedSourceWalletId, activeVa, data, destinationAddress, load, loadDestWallets, loadPipeline, loggedEmail, emailInput, L]);

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

        {/* Mainnet Stellar wallets (linked for Bridge routing) */}
        {data?.mainnet_wallets && data.mainnet_wallets.length > 0 && (
          <OperationalCard>
            <div className="flex items-center gap-2.5 mb-4">
              <Wallet className="h-5 w-5 text-tts-muted" />
              <div>
                <p className="text-sm font-bold text-tts-deep">
                  {L("Carteiras Mainnet vinculadas", "Linked Mainnet Wallets")}
                </p>
                <p className="text-[11px] text-tts-muted mt-0.5">
                  {L("Usadas como destino das contas Bridge", "Used as destination for Bridge accounts")}
                </p>
              </div>
            </div>
            <div className="space-y-2 border-t border-tts-border/40 pt-4">
              {data.mainnet_wallets.map((mw) => {
                const usdcLine = (mw.last_balance || []).find(
                  (b: any) => b.asset_code === 'USDC'
                );
                return (
                  <div key={mw.id} className="flex items-center justify-between rounded bg-tts-bg/70 px-3 py-2">
                    <div>
                      <span className="text-sm font-mono font-semibold text-tts-deep">
                        {mw.public_key.length > 12
                          ? `${mw.public_key.slice(0, 6)}...${mw.public_key.slice(-6)}`
                          : mw.public_key}
                      </span>
                      <span className="ml-2 text-[10px] text-tts-muted">{mw.label}</span>
                    </div>
                    <div className="text-right">
                      {usdcLine ? (
                        <span className="text-sm font-bold tabular-nums text-tts-deep">
                          {fmt(Number(usdcLine.balance))} USDC
                        </span>
                      ) : (
                        <span className="text-xs text-tts-muted">
                          {L("Saldo não sincronizado", "Balance not synced")}
                        </span>
                      )}
                      {mw.is_primary && (
                        <span className="ml-2 text-[10px] text-tts-confirm font-medium">
                          {L("Principal", "Primary")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-tts-border/40">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-tts-muted shrink-0 mt-0.5" />
                <p className="text-xs text-tts-muted leading-relaxed">
                  {L(
                    "Essas carteiras mainnet podem ser usadas como destino das suas contas Bridge. Para vincular uma nova, use o comando no chat.",
                    "These mainnet wallets can be used as destination for your Bridge accounts. To link a new one, use the chat command."
                  )}
                </p>
              </div>
            </div>
          </OperationalCard>
        )}

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

            {status === "ready" && (
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

                {/* Destination wallet selector + generator */}
                <div className="mb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">
                      {L("Carteira de destino", "Destination wallet")}
                    </label>
                    <button
                      type="button"
                      onClick={() => generateDestWallet(loggedEmail || emailInput)}
                      disabled={genStatus === "generating"}
                      className="flex items-center gap-1 rounded-md border border-tts-border px-2 py-1 text-[11px] font-bold text-tts-deep hover:bg-tts-bg disabled:opacity-50 transition-colors"
                    >
                      {genStatus === "generating" ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Wallet className="h-3 w-3" />
                      )}
                      {genStatus === "generating" ? L("Gerando...", "Generating...") : L("Gerar carteira", "Generate wallet")}
                    </button>
                  </div>

                  {walletsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-tts-muted px-1 py-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {L("Carregando carteiras...", "Loading wallets...")}
                    </div>
                  ) : destWallets.length > 0 ? (
                    <select
                      value={selectedWalletKey}
                      onChange={(e) => setSelectedWalletKey(e.target.value)}
                      className="w-full rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-sm font-mono text-tts-deep outline-none focus:border-tts-deep"
                    >
                      {data?.stellar_wallet?.public_key &&
                        !destWallets.some((w) => w.public_key === data.stellar_wallet!.public_key) && (
                          <option value={data.stellar_wallet.public_key}>
                            {`${data.stellar_wallet.public_key.slice(0, 6)}...${data.stellar_wallet.public_key.slice(-6)} · ${L("vinculada", "linked")}`}
                          </option>
                        )}
                      {destWallets.map((w) => (
                        <option key={w.public_key} value={w.public_key}>
                          {`${w.public_key.slice(0, 6)}...${w.public_key.slice(-6)}`}
                          {w.is_primary ? ` · ${L("principal", "primary")}` : ""}
                          {w.usdc_balance !== null ? ` · ${fmt(Number(w.usdc_balance))} USDC` : ""}
                          {!w.has_usdc_trustline ? ` · ${L("sem USDC", "no USDC")}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : data?.stellar_wallet?.public_key ? (
                    <div className="rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-sm font-mono text-tts-deep">
                      {`${data.stellar_wallet.public_key.slice(0, 6)}...${data.stellar_wallet.public_key.slice(-6)}`}
                      <span className="ml-2 text-[10px] font-sans text-tts-muted">{L("vinculada", "linked")}</span>
                    </div>
                  ) : (
                    <p className="rounded-lg bg-amber-50/40 dark:bg-amber-900/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                      {L("Nenhuma carteira ainda. Gere uma para receber seus dólares.", "No wallet yet. Generate one to receive your dollars.")}
                    </p>
                  )}

                  {genError && <p className="text-xs text-amber-600 dark:text-amber-400">{genError}</p>}

                  {/* When the selected wallet isn't fully ready, offer one-tap sponsored activation */}
                  {selectedDestWallet && (!selectedDestWallet.exists_on_mainnet || !selectedDestWallet.has_usdc_trustline) && (
                    <div className="rounded-lg border border-amber-400/40 bg-amber-50/40 dark:bg-amber-900/10 p-3 space-y-2.5">
                      <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                        {L("Carteira criada — falta ativar", "Wallet created — needs activation")}
                      </p>
                      <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 leading-relaxed">
                        {L(
                          "Ative para receber USDC. A ativação é patrocinada — você não precisa de XLM.",
                          "Activate to receive USDC. Activation is sponsored — you don't need any XLM.",
                        )}
                      </p>

                      <Button
                        onClick={() => activateDestWallet(loggedEmail || emailInput, selectedDestWallet.public_key)}
                        disabled={activateStatus === "activating"}
                        className="w-full"
                      >
                        {activateStatus === "activating" ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {L("Ativando...", "Activating...")}
                          </>
                        ) : (
                          <>
                            <BadgeCheck className="h-4 w-4 mr-2" />
                            {L("Ativar carteira (patrocinado)", "Activate wallet (sponsored)")}
                          </>
                        )}
                      </Button>

                      {activateError && <p className="text-[11px] text-red-500">{activateError}</p>}

                      {/* Fallback: fund the address manually if no sponsor is available */}
                      <details className="text-[11px] text-amber-700/70 dark:text-amber-400/70">
                        <summary className="cursor-pointer">{L("Ativar manualmente", "Activate manually")}</summary>
                        <p className="mt-1.5 leading-relaxed">
                          {L("Envie ≈2 XLM para este endereço, depois toque em Ativar.", "Send ≈2 XLM to this address, then tap Activate.")}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="flex-1 break-all rounded bg-tts-bg px-2 py-1.5 font-mono text-tts-deep">
                            {selectedDestWallet.public_key}
                          </code>
                          <CopyBtn value={selectedDestWallet.public_key} label="address" />
                        </div>
                      </details>
                    </div>
                  )}
                </div>

                {/* Pipeline diagnostics — where the money actually is */}
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => { setPipelineOpen((o) => !o); if (!pipeline && data?.customer_id) loadPipeline(data.customer_id); }}
                    className="flex w-full items-center justify-between rounded-lg border border-tts-border bg-tts-bg/60 px-3 py-2 text-xs font-bold text-tts-deep hover:bg-tts-bg"
                  >
                    <span className="flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-tts-muted" />
                      {L("Fluxo do dinheiro (diagnóstico)", "Money flow (pipeline)")}
                    </span>
                    {pipelineLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (pipelineOpen ? <ChevronLeft className="h-3.5 w-3.5 rotate-90" /> : <ChevronRight className="h-3.5 w-3.5 rotate-90" />)}
                  </button>

                  {pipelineOpen && pipeline && (() => {
                    const baseWalletUsdc = pipeline.wallets.reduce(
                      (sum, w) => sum + w.balances.filter((b) => b.currency?.toLowerCase() === "usdc").reduce((s, b) => s + Number(b.amount || 0), 0),
                      0,
                    );
                    const stellarUsdc = Number(selectedDestWallet?.usdc_balance ?? data?.stellar_wallet?.usdc_balance ?? 0);
                    const settling = totalReceived > 0 && baseWalletUsdc <= 0.000001;
                    const stage1Done = totalReceived > 0;
                    const stage2Done = baseWalletUsdc > 0.000001;
                    const stage3Done = stellarUsdc > 0.000001;

                    const Stage = ({ n, title, done, active, children }: { n: number; title: string; done: boolean; active?: boolean; children: ReactNode }) => (
                      <div className="flex gap-2.5">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-tts-confirm text-white" : active ? "bg-amber-400 text-white" : "border border-tts-border bg-tts-bg text-tts-muted"}`}>
                            {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
                          </div>
                          {n < 3 && <div className="my-0.5 h-full w-px flex-1 bg-tts-border/60" />}
                        </div>
                        <div className="flex-1 pb-3">
                          <p className="text-[11px] font-bold text-tts-deep">{title}</p>
                          <div className="mt-1">{children}</div>
                        </div>
                      </div>
                    );

                    return (
                      <div className="mt-2 rounded-lg border border-tts-border bg-tts-surface p-3">
                        <Stage n={1} title={L("Conta virtual · USD recebido", "Virtual account · USD received")} done={stage1Done} active={!stage1Done}>
                          <p className="text-sm font-bold tabular-nums text-tts-deep">{fmt(totalReceived)} <span className="text-xs font-medium text-tts-muted">USD</span></p>
                          {pipeline.virtual_account_routes.map((r) => (
                            <p key={r.id} className="text-[10px] font-mono text-tts-muted">
                              → {(r.destination_chain || "?").toUpperCase()}{r.destination_address ? ` · ${r.destination_address.slice(0, 6)}...${r.destination_address.slice(-4)}` : ""}
                            </p>
                          ))}
                        </Stage>

                        <Stage n={2} title={L("Carteira Base · USDC", "Base wallet · USDC")} done={stage2Done} active={settling}>
                          {pipeline.wallets.length === 0 ? (
                            <div className="rounded-lg border border-tts-border bg-tts-bg/60 p-2.5 space-y-2">
                              <p className="text-[11px] text-tts-muted leading-relaxed">
                                {L(
                                  "Nenhuma carteira conectada à conta virtual. Crie uma carteira Base para receber os dólares convertidos.",
                                  "No wallet connected to the virtual account. Create a Base wallet to receive the converted dollars.",
                                )}
                              </p>
                              <Button
                                onClick={() => data?.customer_id && createBridgeWallet(data.customer_id, "base")}
                                disabled={createWalletStatus === "creating"}
                                className="w-full"
                                size="sm"
                              >
                                {createWalletStatus === "creating" ? (
                                  <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />{L("Conectando...", "Connecting...")}</>
                                ) : (
                                  <><Wallet className="h-3.5 w-3.5 mr-2" />{L("Conectar carteira (Base)", "Connect wallet (Base)")}</>
                                )}
                              </Button>
                              {createWalletError && <p className="text-[10px] text-red-500">{createWalletError}</p>}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted">
                                {pipeline.wallets.length} {pipeline.wallets.length === 1 ? L("carteira", "wallet") : L("carteiras", "wallets")} · {L("toque para enviar desta", "tap to send from")}
                              </p>
                              {pipeline.wallets.map((w) => {
                                const nonZero = w.balances.filter((b) => Number(b.amount) > 0);
                                const selected = w.id === selectedSourceWalletId;
                                const hasFunds = Number(w.usdc_balance) > 0;
                                return (
                                  <div
                                    key={w.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setSelectedSourceWalletId(w.id)}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSourceWalletId(w.id); } }}
                                    className={`w-full cursor-pointer text-left rounded-lg border p-2.5 space-y-1.5 transition-colors ${selected ? "border-tts-deep bg-tts-deep/5 ring-1 ring-tts-deep" : "border-tts-border bg-tts-bg/60 hover:border-tts-deep/40"}`}
                                  >
                                    {/* header: chain + selected + USDC balance */}
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5">
                                        <span className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${selected ? "border-tts-deep bg-tts-deep" : "border-tts-muted/40"}`}>
                                          {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                        </span>
                                        <span className="rounded bg-tts-deep/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-tts-deep">{w.chain}</span>
                                        {w.initiation_required && (
                                          <span className="rounded bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-400" title="requires initiation">init</span>
                                        )}
                                        {selected && <span className="text-[9px] font-bold text-tts-deep">{L("origem", "source")}</span>}
                                      </span>
                                      <span className={`text-sm font-bold tabular-nums ${hasFunds ? "text-tts-deep" : "text-tts-muted"}`}>{fmt(Number(w.usdc_balance))} USDC</span>
                                    </div>
                                    {/* full address */}
                                    <div className="flex items-center gap-1">
                                      <code className="flex-1 truncate text-[10px] font-mono text-tts-muted" title={w.address}>{w.address}</code>
                                      <span onClick={(e) => e.stopPropagation()}>
                                        <CopyBtn value={w.address} label="address" />
                                      </span>
                                    </div>
                                    {/* all token balances */}
                                    {nonZero.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {nonZero.map((b) => (
                                          <span key={b.currency} className="rounded bg-tts-surface border border-tts-border px-1.5 py-0.5 text-[9px] font-mono text-tts-deep">
                                            {fmt(Number(b.amount))} {String(b.currency).toUpperCase()}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {/* meta: id + created */}
                                    <div className="flex items-center justify-between gap-2 text-[9px] text-tts-muted/70">
                                      <span className="font-mono truncate">id {w.id.slice(0, 8)}</span>
                                      {w.created_at && <span>{new Date(w.created_at).toLocaleDateString()}</span>}
                                    </div>
                                  </div>
                                );
                              })}
                              {/* connect another wallet */}
                              <button
                                type="button"
                                onClick={() => data?.customer_id && createBridgeWallet(data.customer_id, "base")}
                                disabled={createWalletStatus === "creating"}
                                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-tts-border py-2 text-[11px] font-bold text-tts-muted hover:bg-tts-bg disabled:opacity-50"
                              >
                                {createWalletStatus === "creating" ? (
                                  <><Loader2 className="h-3 w-3 animate-spin" />{L("Conectando...", "Connecting...")}</>
                                ) : (
                                  <><Wallet className="h-3 w-3" />{L("Conectar outra carteira (Base)", "Connect another wallet (Base)")}</>
                                )}
                              </button>
                              {createWalletError && <p className="text-[10px] text-red-500">{createWalletError}</p>}
                            </div>
                          )}
                          {settling && pipeline.wallets.length > 0 && (
                            <div className="mt-1.5 flex items-center gap-2 rounded bg-amber-50/50 dark:bg-amber-900/10 px-2 py-1.5">
                              <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                              <span className="text-[10px] text-amber-700 dark:text-amber-400">
                                {L("Convertendo de USD na conta virtual — pode levar 1–2 dias úteis. Atualize para verificar.", "Converting from USD in the virtual account — can take 1–2 business days. Refresh to check.")}
                              </span>
                            </div>
                          )}
                        </Stage>

                        <Stage n={3} title={L("Carteira Stellar · USDC", "Stellar wallet · USDC")} done={stage3Done} active={stage2Done && !stage3Done}>
                          <p className="text-sm font-bold tabular-nums text-tts-deep">{fmt(stellarUsdc)} <span className="text-xs font-medium text-tts-muted">USDC</span></p>
                          <p className="text-[10px] font-mono text-tts-muted break-all">
                            {destinationAddress ? `${destinationAddress.slice(0, 8)}...${destinationAddress.slice(-6)}` : L("nenhuma selecionada", "none selected")}
                          </p>
                          {stage2Done && !stage3Done && (
                            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">{L("Use o botão Enviar abaixo para mover Base → Stellar.", "Use the Send button below to move Base → Stellar.")}</p>
                          )}
                        </Stage>

                        <button
                          type="button"
                          onClick={() => data?.customer_id && loadPipeline(data.customer_id)}
                          className="flex items-center gap-1 text-[11px] text-tts-muted hover:text-tts-deep"
                        >
                          <RefreshCw className="h-3 w-3" /> {L("Atualizar fluxo", "Refresh flow")}
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Available balance */}
                {totalAvailableBalance > 0 ? (
                  <div className="mb-4 rounded-lg bg-tts-bg/70 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-tts-muted">
                        {L("Saldo disponível", "Available balance")}
                      </span>
                      <span className="text-sm font-bold tabular-nums text-tts-deep">
                        {fmt(totalAvailableBalance)} USDC
                      </span>
                    </div>
                    {selectedSourceWallet && (
                      <p className="mt-1 text-[10px] text-tts-muted/60">
                        {L("Enviando de", "Sending from")}: {selectedSourceWallet.address.slice(0, 8)}...{selectedSourceWallet.address.slice(-6)} ({selectedSourceWallet.chain})
                      </p>
                    )}
                    {bridgeUsdcBalance === 0 && vaAvailableBalance > 0 && (
                      <p className="mt-1 text-[10px] text-tts-muted/60">
                        {L("Saldo da conta virtual (pode precisar de sweep)", "Virtual account balance (may need sweep)")}
                      </p>
                    )}
                    {/* Show VA destination info for diagnostics */}
                    {activeVa?.destination_chain && (
                      <p className="mt-1 text-[10px] text-tts-muted/40">
                        {L(
                          `Rota: ${activeVa.destination_chain} → ${(activeVa.destination_address || '').slice(0, 8)}...`,
                          `Route: ${activeVa.destination_chain} → ${(activeVa.destination_address || '').slice(0, 8)}...`,
                        )}
                        {activeVa.bridge_wallet_id && (
                          <span>
                            {" "}· {L(
                              `Wallet: ${activeVa.bridge_wallet_id.slice(0, 8)}...`,
                              `Wallet: ${activeVa.bridge_wallet_id.slice(0, 8)}...`,
                            )}
                          </span>
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
                {totalAvailableBalance > 0 && sendStatus !== "ok" && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-tts-muted mb-1.5">
                        {L("Valor (USDC) · mín US$ 1,00", "Amount (USDC) · min $1.00")}
                      </label>
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="1"
                          max={totalAvailableBalance}
                          value={sendAmount}
                          onChange={(e) => setSendAmount(e.target.value)}
                          placeholder={`Mín 1 · Máx ${fmt(totalAvailableBalance)}`}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSendAmount(String(totalAvailableBalance))}
                          className="shrink-0 text-xs"
                        >
                          {L("Tudo", "Max")}
                        </Button>
                      </div>
                    </div>

                    <Button
                      onClick={handleSendToStellar}
                      disabled={sendStatus === "sending" || !sendAmount || Number(sendAmount) <= 0 || !destinationAddress}
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

                    {/* Settlement-time disclaimer */}
                    <p className="text-[11px] text-tts-muted/70 text-center leading-relaxed">
                      {L(
                        "A transferência pode levar de alguns minutos a algumas horas para chegar na carteira Stellar.",
                        "Transfers can take from a few minutes up to a few hours to arrive in the Stellar wallet.",
                      )}
                    </p>
                  </div>
                )}

                {sendStatus === "ok" && (
                  <div className="flex items-start gap-2 rounded-lg bg-tts-confirm/10 border border-tts-confirm/30 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-tts-confirm shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-tts-confirm font-medium">
                        {L("Transferência iniciada!", "Transfer started!")}
                      </p>
                      <p className="text-[11px] text-tts-muted mt-0.5 leading-relaxed">
                        {L(
                          "Pode levar de alguns minutos a algumas horas para chegar. O saldo atualiza automaticamente — você pode fechar esta tela.",
                          "It can take from a few minutes up to a few hours to arrive. The balance updates automatically — you can close this screen.",
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Destination */}
                {destinationAddress && (
                  <div className="mt-4 pt-4 border-t border-tts-border/40 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-tts-muted">
                        {L("Destino", "Destination")}
                      </span>
                      <span className="text-sm font-mono font-semibold text-tts-deep">
                        {destinationAddress.length > 12
                          ? `${destinationAddress.slice(0, 6)}...${destinationAddress.slice(-6)}`
                          : destinationAddress}
                      </span>
                    </div>
                    {(selectedDestWallet?.usdc_balance ?? data?.stellar_wallet?.usdc_balance) != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-tts-muted">
                          {L("Saldo Stellar atual", "Current Stellar balance")}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-tts-deep">
                          {fmt(Number(selectedDestWallet?.usdc_balance ?? data?.stellar_wallet?.usdc_balance ?? 0))} USDC
                        </span>
                      </div>
                    )}
                  </div>
                )}

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
