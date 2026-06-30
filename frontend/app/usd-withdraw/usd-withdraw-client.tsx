"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpFromLine,
  Banknote,
  Building2,
  CheckCircle2,
  Landmark,
  Loader2,
  Plus,
} from "lucide-react";
import {
  OperationalCard,
  OperationalHeader,
  OperationalPage,
  StatusPill,
} from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { BridgeAccountLogin, useBridgeAccess } from "@/components/shared/bridge-auth-gate";

// ── Types ────────────────────────────────────────────────────────────────────

type StellarWallet = { public_key: string; usdc_balance: string | null };
type BridgeWallet = { id: string; chain: string | null; balances: Array<{ currency: string; amount: string }> };
type MainnetWallet = { public_key: string; label?: string | null; is_primary?: boolean; last_balance?: Array<{ asset_code: string; balance: string }> };
type VirtualAccount = { id: string; status?: string; currency?: string; total_received_usd?: number };

type UsdAccountResponse = {
  has_account?: boolean;
  email?: string | null;
  customer_id?: string | null;
  message?: string;
  stellar_wallet?: StellarWallet | null;
  bridge_wallets?: BridgeWallet[];
  mainnet_wallets?: MainnetWallet[];
  virtual_accounts?: VirtualAccount[];
};

type ExternalAccount = {
  id: string;
  account_name?: string;
  bank_name?: string;
  account_type?: string;
  currency?: string;
  last_4?: string;
  account?: { last_4?: string; routing_number?: string };
  beneficiary_name?: string;
};

type BridgeStellarWallet = { public_key: string; label?: string | null; is_primary?: boolean; usdc_balance?: string | null };

type Status = "login" | "loading" | "ready" | "no_account" | "error";
type Rail = "ach" | "wire";

// ── Helpers ──────────────────────────────────────────────────────────────────

const CACHE_KEY = "tts:dollars:email";
function readCachedEmail() { try { return localStorage.getItem(CACHE_KEY) || ""; } catch { return ""; } }
function writeCachedEmail(v: string) { try { localStorage.setItem(CACHE_KEY, v); } catch { /* */ } }

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function UsdWithdrawClient({ initialQuery = "", modeSwitcher }: { initialQuery?: string; modeSwitcher?: ReactNode }) {
  const searchParams = useSearchParams();
  const qp = new URLSearchParams(initialQuery || searchParams.toString());
  const sessionId = qp.get("session_id") ?? "";
  const amountParam = qp.get("amount") ?? "";
  const lang = qp.get("lang") ?? "pt-BR";
  const isEn = lang === "en";
  const L = (pt: string, en: string) => (isEn ? en : pt);

  const { unlocked: bridgeUnlocked, checked: bridgeChecked, unlock: unlockBridge } = useBridgeAccess();

  const [status, setStatus] = useState<Status>("login");
  const [emailInput, setEmailInput] = useState("");
  const [loggedEmail, setLoggedEmail] = useState("");
  const [data, setData] = useState<UsdAccountResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // The Bridge Stellar wallets for this email — these ARE the mainnet wallets
  // that hold the dollars and are the source of the withdrawal.
  const [bridgeWallets, setBridgeWallets] = useState<BridgeStellarWallet[]>([]);
  // Invested (yield) USDC per wallet — auto-redeemed on withdrawal, so it counts
  // toward the available balance.
  const [investedByWallet, setInvestedByWallet] = useState<Record<string, number>>({});

  // Destination accounts
  const [extAccounts, setExtAccounts] = useState<ExternalAccount[]>([]);
  const [extLoading, setExtLoading] = useState(false);
  const [selectedExtId, setSelectedExtId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Withdrawal
  const [amount, setAmount] = useState(amountParam);
  const [rail] = useState<Rail>("ach");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<{ id?: string; state?: string } | null>(null);

  // The withdrawal is sent from ONE source account, so the available cap must be
  // that single account's balance — not the sum of every account (otherwise
  // "Withdraw all" fills more than the source can cover and Bridge rejects it).
  // Balance = idle USDC + invested (yield) USDC, since the backend auto-redeems
  // from yield when the withdrawal runs. Pick the account with the most total.
  const walletTotal = (w: BridgeStellarWallet) => (Number(w.usdc_balance) || 0) + (investedByWallet[w.public_key] || 0);
  const sourceBridge =
    [...bridgeWallets].sort((a, b) => walletTotal(b) - walletTotal(a))[0]
    || bridgeWallets.find((w) => w.is_primary)
    || null;
  const availableUsd = sourceBridge ? walletTotal(sourceBridge) : 0;
  const fromAddress = sourceBridge?.public_key || "";
  const customerId = data?.customer_id || "";

  const amountNum = Math.max(0, Number(amount) || 0);
  const overBalance = amountNum > availableUsd + 1e-7;
  const canSubmit = Boolean(
    customerId && fromAddress && selectedExtId && amountNum > 0 && !overBalance && !submitting && bridgeUnlocked,
  );

  const loadExternalAccounts = useCallback(async (cid: string) => {
    if (!cid) return;
    setExtLoading(true);
    try {
      const res = await fetch(`/api/bridge/customers/${encodeURIComponent(cid)}/external-accounts`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const list: ExternalAccount[] = (json.external_accounts ?? json.data ?? []).filter(Boolean);
      // US bank accounts only (off-ramp to USD).
      const usd = list.filter((a) => !a.currency || a.currency.toLowerCase() === "usd");
      setExtAccounts(usd.length ? usd : list);
      if (!selectedExtId && usd.length) setSelectedExtId(usd[0].id);
      if (!usd.length) setShowAddForm(true);
    } catch { /* non-blocking */ }
    finally { setExtLoading(false); }
  }, [selectedExtId]);

  // The associated mainnet (Bridge Stellar) wallets, found by email.
  const loadBridgeWallets = useCallback(async (email: string) => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    try {
      const res = await fetch(`/api/bridge/stellar-wallets?email=${encodeURIComponent(e)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const list: BridgeStellarWallet[] = (json.wallets ?? []).filter(Boolean);
      setBridgeWallets(list);
      // Money lives in yield by default, so the withdrawable balance is idle
      // USDC PLUS what's invested (the backend auto-redeems from yield when the
      // withdrawal runs). Pull each wallet's invested position so "Available"
      // and "Withdraw all" reflect the full balance, not just idle funds.
      Promise.all(
        list.map(async (w) => {
          try {
            const r = await fetch(`/api/bridge/stellar-wallets/positions?email=${encodeURIComponent(e)}&public_key=${encodeURIComponent(w.public_key)}&t=${Date.now()}`, { cache: "no-store" });
            const j = await r.json().catch(() => ({}));
            return [w.public_key, j?.success ? Number(j.total_invested_usdc) || 0 : 0] as const;
          } catch { return [w.public_key, 0] as const; }
        }),
      ).then((entries) => setInvestedByWallet(Object.fromEntries(entries)));
    } catch { /* non-blocking */ }
  }, []);

  const load = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed && !sessionId) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const params = new URLSearchParams();
      if (trimmed) params.set("email", trimmed);
      else if (sessionId) params.set("session_id", sessionId);
      const res = await fetch(`/api/bridge/session/usd-account?${params}`, { cache: "no-store" });
      const json: UsdAccountResponse = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 404) throw new Error(json.message || `HTTP ${res.status}`);
      setData(json);
      const nextEmail = (json.email ?? trimmed).trim().toLowerCase();
      setLoggedEmail(nextEmail);
      if (nextEmail) { setEmailInput(nextEmail); writeCachedEmail(nextEmail); loadBridgeWallets(nextEmail); }
      if (json.customer_id) loadExternalAccounts(json.customer_id);
      setStatus(json.has_account ? "ready" : "no_account");
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setStatus("error");
    }
  }, [sessionId, loadExternalAccounts, loadBridgeWallets]);

  const didAuto = useRef(false);
  useEffect(() => {
    if (!bridgeUnlocked || didAuto.current) return;
    const stored = readCachedEmail();
    if (stored) setEmailInput(stored);
    if (sessionId || stored) { didAuto.current = true; load(stored); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeUnlocked]);

  async function submitWithdrawal() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError("");
    setResult(null);
    try {
      const res = await fetch(`/api/bridge/transfers/crypto-to-${rail}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          on_behalf_of: customerId,
          amount: String(amountNum),
          from_address: fromAddress,
          external_account_id: selectedExtId,
          confirm_mainnet: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.message || `HTTP ${res.status}`);
      const t = json.transfer ?? {};
      setResult({ id: t.id, state: t.state });
      setAmount("");
    } catch (e: any) {
      setSubmitError(e?.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Bridge account login (email + access password) ──────────────────────────
  if (bridgeChecked && (!bridgeUnlocked || status === "login")) {
    return (
      <OperationalPage size="sm" centered>
        <OperationalHeader
          eyebrow="US$"
          title={L("Sacar para banco americano", "Withdraw to US bank")}
          description={L("Entre com o e-mail e a senha da sua conta em dólar.", "Sign in with your dollar-account email and password.")}
        />
        {modeSwitcher}
        <BridgeAccountLogin
          defaultEmail={emailInput}
          title={L("Conta em dólar", "Dollar account")}
          description={L("E-mail e senha de acesso da conta.", "Account email and access password.")}
          emailLabel={L("E-mail da conta", "Account email")}
          passwordLabel={L("Senha de acesso", "Access password")}
          submitLabel={L("Entrar", "Sign in")}
          onAuthenticated={(em) => { didAuto.current = true; setEmailInput(em); unlockBridge(); load(em); }}
        />
      </OperationalPage>
    );
  }

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <OperationalPage size="sm" centered>
        <OperationalCard className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-tts-muted" />
        </OperationalCard>
      </OperationalPage>
    );
  }

  // ── Error / no account ──────────────────────────────────────────────────────
  if (status === "error" || status === "no_account") {
    return (
      <OperationalPage size="sm" centered>
        <OperationalCard className="space-y-5 text-center">
          <Building2 className="mx-auto h-10 w-10 text-tts-muted" />
          <p className="font-semibold text-tts-deep">
            {status === "no_account" ? L("Conta não encontrada", "Account not found") : L("Erro ao carregar", "Failed to load")}
          </p>
          {errorMsg && <p className="text-sm text-tts-muted">{errorMsg}</p>}
          <Button variant="outline" className="w-full" onClick={() => { setStatus("login"); setData(null); }}>
            {L("Trocar e-mail", "Change email")}
          </Button>
        </OperationalCard>
      </OperationalPage>
    );
  }

  // ── Ready ───────────────────────────────────────────────────────────────────
  return (
    <OperationalPage size="lg" frameClassName="max-w-4xl">
      <OperationalHeader
        eyebrow="USD"
        title={L("Sacar para banco americano", "Withdraw to US bank")}
        description={L("Envie seus dólares para uma conta bancária nos EUA via ACH ou wire.", "Send your dollars to a US bank account via ACH or wire.")}
      />
      {modeSwitcher}

      {/* Wallet money — the balance available to withdraw, on top */}
      <OperationalCard className="space-y-1 border-2 border-tts-confirm/40 bg-tts-confirm/[0.06]">
        <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("Saldo disponível para saque", "Money available to withdraw")}</p>
        <p className="text-3xl font-extrabold text-tts-deep">
          <AnimatedNumber value={availableUsd} format={(n) => `$${fmtUsd(n)}`} />
        </p>
        <p className="text-xs text-tts-muted">{loggedEmail || "—"}</p>
      </OperationalCard>

      {result ? (
        <OperationalCard className="space-y-4 text-center duration-500 animate-in fade-in zoom-in-95">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500 duration-700 animate-in zoom-in-50" />
          <div>
            <p className="font-bold text-tts-deep">{L("Saque enviado!", "Withdrawal sent!")}</p>
            <p className="mt-1 text-sm text-tts-muted">
              {L("O dólar chega na conta bancária em 1–2 dias úteis (ACH) ou no mesmo dia (wire).", "Funds arrive at the bank in 1–2 business days (ACH) or same-day (wire).")}
            </p>
          </div>
          {result.id && (
            <div className="rounded-lg border border-tts-border bg-tts-surface px-4 py-2 text-left">
              <p className="text-[11px] font-bold uppercase text-tts-muted">{L("Comprovante", "Reference")}</p>
              <p className="font-mono text-xs text-tts-deep break-all">{result.id}</p>
              {result.state && <StatusPill tone="gold" className="mt-1">{result.state}</StatusPill>}
            </div>
          )}
          <Button variant="outline" className="w-full" onClick={() => setResult(null)}>{L("Fazer outro saque", "Make another withdrawal")}</Button>
        </OperationalCard>
      ) : (
        <OperationalCard className="space-y-5">
          {/* Step 1 — destination */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-tts-muted">
              <Landmark className="h-3.5 w-3.5" /> {L("1 · Conta de destino", "1 · Destination account")}
            </p>
            {extLoading ? (
              <div className="flex items-center gap-2 text-sm text-tts-muted"><Loader2 className="h-4 w-4 animate-spin" /> {L("Carregando contas…", "Loading accounts…")}</div>
            ) : extAccounts.length ? (
              <div className="space-y-2">
                {extAccounts.map((a) => {
                  const last4 = a.last_4 || a.account?.last_4;
                  const on = selectedExtId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedExtId(a.id)}
                      className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-colors ${on ? "border-amber-500 bg-amber-500" : "border-tts-border bg-tts-surface hover:border-tts-deep/40"}`}
                    >
                      <div>
                        <p className={`text-sm font-bold ${on ? "text-stone-950" : "text-tts-deep"}`}>{a.bank_name || a.account_name || a.beneficiary_name || L("Banco americano", "US bank")}</p>
                        <p className={`text-xs ${on ? "text-stone-900/80" : "text-tts-muted"}`}>{a.account_type || "checking"}{last4 ? ` · ••${last4}` : ""}</p>
                      </div>
                      {on && <CheckCircle2 className="h-5 w-5 text-stone-950" />}
                    </button>
                  );
                })}
                <button type="button" onClick={() => setShowAddForm((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold text-tts-deep hover:underline">
                  <Plus className="h-3.5 w-3.5" /> {L("Adicionar outra conta", "Add another account")}
                </button>
              </div>
            ) : (
              <p className="text-sm text-tts-muted">{L("Nenhuma conta bancária cadastrada ainda.", "No bank account saved yet.")}</p>
            )}
            {showAddForm && <AddUsBankForm customerId={customerId} language={lang} onAdded={(acct) => { setExtAccounts((p) => [acct, ...p]); setSelectedExtId(acct.id); setShowAddForm(false); }} />}
          </div>

          {/* Step 3 — amount */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-tts-muted">
              <Banknote className="h-3.5 w-3.5" /> {L("2 · Valor", "2 · Amount")}
            </p>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-tts-muted">$</span>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="pl-7 text-lg font-bold" />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <button type="button" onClick={() => setAmount(String(Math.floor(availableUsd * 100) / 100))} className="text-xs font-bold text-tts-deep hover:underline">
                {L("Sacar tudo", "Withdraw all")} (${fmtUsd(availableUsd)})
              </button>
              {overBalance && <span className="text-xs font-semibold text-tts-error">{L("Acima do saldo", "Over balance")}</span>}
            </div>
          </div>

          {submitError && <p className="text-sm font-semibold text-tts-error">{submitError}</p>}

          <Button onClick={submitWithdrawal} disabled={!canSubmit} className="w-full">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="mr-2 h-4 w-4" />}
            {submitting ? L("Enviando…", "Sending…") : L(`Sacar $${amount || "0"}`, `Withdraw $${amount || "0"}`)}
          </Button>
          <p className="text-center text-[11px] text-tts-muted">
            {L("A taxa de saque é mostrada pelo banco e pode variar alguns centavos.", "The withdrawal fee is set by the bank and may vary by a few cents.")}
          </p>
        </OperationalCard>
      )}
    </OperationalPage>
  );
}

// ── Add US bank account form ─────────────────────────────────────────────────

function AddUsBankForm({ customerId, language, onAdded }: { customerId: string; language: string; onAdded: (a: ExternalAccount) => void }) {
  const isEn = language === "en";
  const L = (pt: string, en: string) => (isEn ? en : pt);
  const [f, setF] = useState({ first_name: "", last_name: "", routing_number: "", account_number: "", checking_or_savings: "checking", street_line_1: "", city: "", state: "", postal_code: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const ready = f.first_name && f.last_name && f.routing_number && f.account_number && f.street_line_1 && f.city && f.state && f.postal_code;

  async function save() {
    if (!ready || saving) return;
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/bridge/customers/${encodeURIComponent(customerId)}/external-accounts/us-bank`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.message || `HTTP ${res.status}`);
      const acct = json.external_account ?? json.data;
      if (acct?.id) onAdded(acct);
      else throw new Error(L("Conta criada mas sem ID retornado.", "Account created but no ID returned."));
    } catch (e: any) { setErr(e?.message ?? String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-tts-border bg-tts-bg p-3">
      <p className="text-[11px] font-bold uppercase text-tts-muted">{L("Nova conta bancária (EUA)", "New US bank account")}</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder={L("Nome", "First name")} value={f.first_name} onChange={set("first_name")} />
        <Input placeholder={L("Sobrenome", "Last name")} value={f.last_name} onChange={set("last_name")} />
        <Input placeholder={L("Routing number", "Routing number")} value={f.routing_number} onChange={set("routing_number")} />
        <Input placeholder={L("Número da conta", "Account number")} value={f.account_number} onChange={set("account_number")} />
        <Input placeholder={L("Rua", "Street")} value={f.street_line_1} onChange={set("street_line_1")} className="col-span-2" />
        <Input placeholder={L("Cidade", "City")} value={f.city} onChange={set("city")} />
        <Input placeholder={L("Estado (ex: NY)", "State (e.g. NY)")} value={f.state} onChange={set("state")} />
        <Input placeholder={L("CEP / ZIP", "ZIP code")} value={f.postal_code} onChange={set("postal_code")} className="col-span-2" />
      </div>
      {err && <p className="text-xs font-semibold text-tts-error">{err}</p>}
      <Button onClick={save} disabled={!ready || saving} className="w-full" size="sm">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {L("Salvar conta", "Save account")}
      </Button>
    </div>
  );
}
