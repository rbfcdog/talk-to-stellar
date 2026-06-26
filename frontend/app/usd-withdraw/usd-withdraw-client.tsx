"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpFromLine,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Landmark,
  Loader2,
  Plus,
  Zap,
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
import { BridgeAccessField, useBridgeAccess } from "@/components/shared/bridge-auth-gate";

// ── Types ────────────────────────────────────────────────────────────────────

type StellarWallet = { public_key: string; usdc_balance: string | null };
type BridgeWallet = { balances: Array<{ currency: string; amount: string }> };

type UsdAccountResponse = {
  has_account?: boolean;
  email?: string | null;
  customer_id?: string | null;
  message?: string;
  stellar_wallet?: StellarWallet | null;
  bridge_wallets?: BridgeWallet[];
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

type Status = "login" | "loading" | "ready" | "no_account" | "error";
type Rail = "ach" | "wire";

// ── Helpers ──────────────────────────────────────────────────────────────────

const CACHE_KEY = "tts_bridge_email";
function readCachedEmail() { try { return localStorage.getItem(CACHE_KEY) || ""; } catch { return ""; } }
function writeCachedEmail(v: string) { try { localStorage.setItem(CACHE_KEY, v); } catch { /* */ } }

function fmtUsd(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ────────────────────────────────────────────────────────────────

export default function UsdWithdrawClient({ initialQuery = "" }: { initialQuery?: string }) {
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

  // Destination accounts
  const [extAccounts, setExtAccounts] = useState<ExternalAccount[]>([]);
  const [extLoading, setExtLoading] = useState(false);
  const [selectedExtId, setSelectedExtId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Withdrawal
  const [amount, setAmount] = useState(amountParam);
  const [rail, setRail] = useState<Rail>("ach");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<{ id?: string; state?: string } | null>(null);

  // Available USD balance (USDC ≈ USD).
  const usdcFromStellar = Number(data?.stellar_wallet?.usdc_balance ?? 0) || 0;
  const usdcFromBridge = (data?.bridge_wallets ?? []).reduce(
    (sum, w) => sum + (w.balances ?? []).filter((b) => b.currency === "USDC").reduce((s, b) => s + (Number(b.amount) || 0), 0),
    0,
  );
  const availableUsd = usdcFromStellar + usdcFromBridge;
  const fromAddress = data?.stellar_wallet?.public_key || "";
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
      if (nextEmail) { setEmailInput(nextEmail); writeCachedEmail(nextEmail); }
      if (json.customer_id) loadExternalAccounts(json.customer_id);
      setStatus(json.has_account ? "ready" : "no_account");
    } catch (e: any) {
      setErrorMsg(e?.message ?? String(e));
      setStatus("error");
    }
  }, [sessionId, loadExternalAccounts]);

  useEffect(() => {
    if (!bridgeUnlocked) return;
    const stored = readCachedEmail();
    if (stored) setEmailInput(stored);
    if (sessionId || stored) load(stored);
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

  // ── Bridge access gate ──────────────────────────────────────────────────────
  if (bridgeChecked && !bridgeUnlocked) {
    return (
      <OperationalPage size="sm" centered>
        <OperationalHeader
          eyebrow="US$"
          title={L("Sacar para banco americano", "Withdraw to US bank")}
          description={L("Esta área é protegida. Entre com a senha de acesso.", "This area is protected. Enter the access password.")}
        />
        <BridgeAccessField
          onUnlock={unlockBridge}
          title={L("Saque em dólar — restrito", "USD withdrawal — restricted")}
          description={L("Senha de acesso necessária.", "Access password required.")}
        />
      </OperationalPage>
    );
  }

  // ── Login ───────────────────────────────────────────────────────────────────
  if (status === "login") {
    return (
      <OperationalPage size="sm" centered>
        <OperationalHeader
          eyebrow="USD"
          title={L("Sacar para banco americano", "Withdraw to US bank")}
          description={L("Entre com o e-mail da sua conta para sacar dólares para um banco nos EUA.", "Enter your account email to withdraw dollars to a US bank.")}
        />
        <OperationalCard>
          <form onSubmit={(e) => { e.preventDefault(); load(emailInput); }} className="space-y-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("E-mail da conta", "Account email")}</label>
            <Input type="email" autoFocus value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="you@email.com" className="text-center" />
            <Button type="submit" disabled={!emailInput.trim()} className="w-full">{L("Continuar", "Continue")}</Button>
          </form>
        </OperationalCard>
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
    <OperationalPage size="md" frameClassName="max-w-2xl">
      <OperationalHeader
        eyebrow="USD"
        title={L("Sacar para banco americano", "Withdraw to US bank")}
        description={L("Envie seus dólares para uma conta bancária nos EUA via ACH ou wire.", "Send your dollars to a US bank account via ACH or wire.")}
      />

      {/* Available balance */}
      <div className="grid gap-3 sm:grid-cols-2">
        <OperationalStat label={L("Disponível", "Available")} value={`$${fmtUsd(availableUsd)}`} detail="USD" tone={availableUsd > 0 ? "confirm" : "default"} />
        <OperationalStat label={L("Conta", "Account")} value={loggedEmail || "—"} detail={customerId ? "Loaded" : "—"} tone={customerId ? "confirm" : "gold"} />
      </div>

      {result ? (
        <OperationalCard className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
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
                      className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-colors ${on ? "border-tts-deep bg-tts-deep/5" : "border-tts-border bg-tts-surface hover:border-tts-deep/40"}`}
                    >
                      <div>
                        <p className="text-sm font-bold text-tts-deep">{a.bank_name || a.account_name || a.beneficiary_name || L("Banco americano", "US bank")}</p>
                        <p className="text-xs text-tts-muted">{a.account_type || "checking"}{last4 ? ` · ••${last4}` : ""}</p>
                      </div>
                      {on && <CheckCircle2 className="h-5 w-5 text-tts-deep" />}
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

          {/* Step 2 — amount */}
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

          {/* Step 3 — rail */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("3 · Velocidade", "3 · Speed")}</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "ach" as Rail, icon: Clock, title: "ACH", sub: L("1–2 dias · taxa menor", "1–2 days · lower fee") },
                { id: "wire" as Rail, icon: Zap, title: "Wire", sub: L("Mesmo dia · mais rápido", "Same-day · faster") },
              ]).map((r) => {
                const on = rail === r.id;
                const Icon = r.icon;
                return (
                  <button key={r.id} type="button" onClick={() => setRail(r.id)}
                    className={`flex flex-col items-start gap-1 rounded-xl border-2 px-4 py-3 text-left transition-colors ${on ? "border-tts-deep bg-tts-deep/5" : "border-tts-border bg-tts-surface hover:border-tts-deep/40"}`}>
                    <span className="flex items-center gap-1.5 text-sm font-bold text-tts-deep"><Icon className="h-4 w-4" /> {r.title}</span>
                    <span className="text-xs text-tts-muted">{r.sub}</span>
                  </button>
                );
              })}
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
