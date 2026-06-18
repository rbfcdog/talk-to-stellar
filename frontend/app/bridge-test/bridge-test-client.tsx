"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Banknote,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Star,
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

// ── Constants ─────────────────────────────────────────────────────────

const BRIDGE_BASE = "/api/bridge";
const HORIZON = "https://horizon.stellar.org";

const ONRAMP_RAILS = [
  { id: "brl", label: "PIX", sublabel: "BRL", flag: "🇧🇷", endpoint: "brl" },
  { id: "usd", label: "ACH / Wire", sublabel: "USD", flag: "🇺🇸", endpoint: "usd" },
  { id: "eur", label: "SEPA", sublabel: "EUR", flag: "🇪🇺", endpoint: "eur" },
  { id: "mxn", label: "SPEI", sublabel: "MXN", flag: "🇲🇽", endpoint: "mxn" },
] as const;

const OFFRAMP_RAILS = [
  { id: "pix", label: "PIX", sublabel: "BRL", flag: "🇧🇷", path: "crypto-to-pix" },
  { id: "ach", label: "ACH", sublabel: "USD", flag: "🇺🇸", path: "crypto-to-ach" },
  { id: "wire", label: "Wire", sublabel: "USD", flag: "🇺🇸", path: "crypto-to-wire" },
  { id: "rtp", label: "RTP / FedNow", sublabel: "USD", flag: "🇺🇸", path: "crypto-to-rtp" },
  { id: "sepa", label: "SEPA", sublabel: "EUR", flag: "🇪🇺", path: "crypto-to-sepa" },
  { id: "spei", label: "SPEI", sublabel: "MXN", flag: "🇲🇽", path: "crypto-to-spei" },
] as const;

const EXT_TABS = [
  { id: "pix", label: "PIX" },
  { id: "us_bank", label: "US Bank" },
  { id: "iban", label: "IBAN" },
  { id: "clabe", label: "CLABE" },
] as const;

const MIGRATION_TABLES = [
  { table: "bridge_pix_ach_orders", purpose: "PIX → ACH atomic flow", exists: true },
  { table: "bridge_customers", purpose: "User → Bridge customer map", exists: false },
  { table: "bridge_external_accounts", purpose: "PIX/US/IBAN/CLABE accounts", exists: false },
  { table: "bridge_liquidation_addresses", purpose: "Reusable crypto→fiat addresses", exists: false },
  { table: "bridge_virtual_accounts", purpose: "Fiat→USDC on-ramp accounts", exists: false },
  { table: "bridge_transfers", purpose: "One-time transfer records", exists: false },
  { table: "bridge_webhook_events", purpose: "Webhook event log + idempotency", exists: false },
  { table: "bridge_exchange_rate_estimates", purpose: "Exchange rate cache", exists: false },
];

// ── Types ─────────────────────────────────────────────────────────────

type CustomerData = {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  status?: string;
  kyc_status?: string;
  endorsements?: Array<{ name: string; status: string }>;
};

type ExternalAccountData = {
  id?: string;
  currency?: string;
  account_type?: string;
  active?: boolean;
  account_owner_name?: string;
  pix_key?: { pix_key?: string; account_preview?: string };
  account?: { last_4?: string; routing_number?: string; checking_or_savings?: string };
  iban?: { iban?: string; bic?: string; last_4?: string };
  clabe?: { clabe?: string; last_4?: string };
  bank_name?: string;
  created_at?: string;
};

type VirtualAccountData = {
  id?: string;
  status?: string;
  source_deposit_instructions?: Record<string, unknown>;
  destination?: Record<string, unknown>;
  created_at?: string;
};

type LiquidationAddressData = {
  id?: string;
  payment_rail?: string;
  currency?: string;
  chain?: string;
  address?: string;
  external_account_id?: string;
  created_at?: string;
};

type TransferData = {
  id?: string;
  state?: string;
  amount?: string;
  source?: { payment_rail?: string; currency?: string; from_address?: string; amount?: string };
  destination?: { payment_rail?: string; currency?: string; amount?: string; external_account_id?: string };
  source_deposit_instructions?: Record<string, unknown>;
  receipt?: { initial_amount?: string; developer_fee?: string; exchange_fee?: string; final_amount?: string };
  created_at?: string;
};

type StellarBalance = { asset_type: string; asset_code?: string; balance: string };
type ReadinessData = { status?: string; kyc_status?: string; endorsements?: string[]; pix_ready?: boolean };
type ExchangeRateData = { midmarket_rate?: string; buy_rate?: string; sell_rate?: string };
type EstimateData = { source_amount?: string; source_currency?: string; destination_amount?: string; destination_currency?: string };

// ── Helpers ───────────────────────────────────────────────────────────

function DepositInstructions({ instr }: { instr: Record<string, unknown> }) {
  const fields: Array<[string, string]> = [];
  const add = (k: string, v: unknown) => { if (v) fields.push([k, String(v)]); };
  add("PIX key", instr.pix_key);
  add("Bank name", instr.bank_name);
  add("Routing number", instr.bank_routing_number);
  add("Account number", instr.bank_account_number);
  add("Beneficiary", instr.bank_beneficiary_name);
  add("IBAN", instr.iban);
  add("BIC / SWIFT", instr.bic);
  add("CLABE", instr.clabe);
  add("Reference / memo", instr.deposit_message || instr.wire_reference);
  add("Amount", instr.amount ? `${instr.amount} ${instr.currency || ""}` : undefined);
  add("Payment rail", instr.payment_rail);
  if (!fields.length) return null;
  return (
    <div className="mt-3 grid gap-1 rounded-md border border-tts-confirm/25 bg-tts-confirm/5 p-3">
      <p className="mb-1 text-xs font-bold uppercase text-tts-confirm">Deposit instructions</p>
      {fields.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 text-xs">
          <span className="shrink-0 text-tts-muted">{k}</span>
          <span className="break-all text-right font-mono font-semibold text-tts-deep">{v}</span>
        </div>
      ))}
    </div>
  );
}

function TransferCard({ t, onRefresh }: { t: TransferData; onRefresh: () => void }) {
  const stateTone = t.state === "completed" ? "confirm" : t.state === "failed" || t.state === "cancelled" ? "error" : "gold";
  return (
    <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-mono text-tts-muted">{t.id?.slice(0, 24)}…</span>
        <div className="flex items-center gap-2">
          <StatusPill tone={stateTone}>{t.state}</StatusPill>
          <button onClick={onRefresh} className="text-tts-muted hover:text-tts-deep"><RefreshCw className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-tts-muted">
        <span>{t.source?.payment_rail} {t.source?.currency}</span>
        <ArrowRightLeft className="h-3 w-3" />
        <span>{t.destination?.payment_rail} {t.destination?.currency}</span>
        {t.destination?.amount ? <span className="ml-auto font-semibold text-tts-deep">{t.destination.amount} {t.destination.currency}</span> : null}
      </div>
      {t.source_deposit_instructions && Object.keys(t.source_deposit_instructions).length > 0 ? (
        <DepositInstructions instr={t.source_deposit_instructions} />
      ) : null}
      {t.receipt?.final_amount ? (
        <div className="mt-1 text-tts-confirm">Final: {t.receipt.final_amount} · Fee: {t.receipt.developer_fee}</div>
      ) : null}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export default function BridgeTestClient() {
  // Session
  const [sessionEmail, setSessionEmail] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("tts-bridge-email") || "";
    return "";
  });
  const [loginInput, setLoginInput] = useState("");
  const didAutoLookup = useRef(false);
  const kycFetchedForId = useRef("");

  // Core
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [log, setLog] = useState<string[]>([]);

  // Customer
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [kycData, setKycData] = useState<Record<string, unknown> | null>(null);

  // Stellar wallet
  const [walletKey, setWalletKey] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("tts-bridge-wallet") || "";
    return "";
  });
  const [walletInput, setWalletInput] = useState("");
  const [walletBalances, setWalletBalances] = useState<StellarBalance[]>([]);
  const [walletBusy, setWalletBusy] = useState(false);

  // External accounts
  const [extTab, setExtTab] = useState<"pix" | "us_bank" | "iban" | "clabe">("pix");
  const [externalAccounts, setExternalAccounts] = useState<ExternalAccountData[]>([]);
  // PIX
  const [pixKey, setPixKey] = useState("");
  const [pixOwnerName, setPixOwnerName] = useState("");
  // US bank
  const [bankFirst, setBankFirst] = useState("");
  const [bankLast, setBankLast] = useState("");
  const [bankRouting, setBankRouting] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankType, setBankType] = useState<"checking" | "savings">("checking");
  const [bankStreet, setBankStreet] = useState("");
  const [bankCity, setBankCity] = useState("");
  const [bankState, setBankState] = useState("");
  const [bankZip, setBankZip] = useState("");
  // IBAN
  const [ibanFirst, setIbanFirst] = useState("");
  const [ibanLast, setIbanLast] = useState("");
  const [ibanValue, setIbanValue] = useState("");
  const [ibanBic, setIbanBic] = useState("");
  // CLABE
  const [clabeFirst, setClabeFirst] = useState("");
  const [clabeLast, setClabeLast] = useState("");
  const [clabeValue, setClabeValue] = useState("");

  // On-ramp
  const [onRampCurrency, setOnRampCurrency] = useState("brl");
  const [onRampChain, setOnRampChain] = useState("stellar");
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccountData[]>([]);
  const [newVA, setNewVA] = useState<VirtualAccountData | null>(null);

  // Liquidation addresses
  const [liqAddresses, setLiqAddresses] = useState<LiquidationAddressData[]>([]);
  const [newLiq, setNewLiq] = useState<LiquidationAddressData | null>(null);
  const [liqExtAccountId, setLiqExtAccountId] = useState("");
  const [liqRail, setLiqRail] = useState("pix");
  const [liqChain, setLiqChain] = useState("stellar");

  // Off-ramp
  const [offRailId, setOffRailId] = useState("pix");
  const [offAmount, setOffAmount] = useState("");
  const [offExtAccountId, setOffExtAccountId] = useState("");
  const [offTransfer, setOffTransfer] = useState<TransferData | null>(null);

  // Transfer history
  const [transfers, setTransfers] = useState<TransferData[]>([]);

  // Exchange rates
  const [rateFrom, setRateFrom] = useState("usd");
  const [rateTo, setRateTo] = useState("brl");
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null);
  const [estimateAmount, setEstimateAmount] = useState("100");
  const [estimate, setEstimate] = useState<EstimateData | null>(null);

  const addLog = (msg: string) =>
    setLog((p) => [...p.slice(-49), `${new Date().toISOString().slice(11, 19)} ${msg}`]);

  // ── API helper ────────────────────────────────────────────────

  const runApi = useCallback(async (method: string, path: string, body?: Record<string, unknown>) => {
    setBusy(`${method} ${path}`);
    setError("");
    try {
      const r = await fetch(BRIDGE_BASE, {
        method,
        headers: { "Content-Type": "application/json", "x-bridge-path": path },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const payload: any = await r.json().catch(() => ({}));
      addLog(`${method} ${path} → ${r.status} ${payload.success ? "OK" : JSON.stringify(payload).slice(0, 100)}`);
      if (!r.ok || payload.success === false) {
        throw new Error(payload.message || `HTTP ${r.status}`);
      }
      return payload;
    } catch (e: any) {
      setError(e?.message || String(e));
      addLog(`ERROR: ${e?.message}`);
      throw e;
    } finally {
      setBusy("");
    }
  }, []);

  // ── Auto-lookup customer on login ─────────────────────────────

  useEffect(() => {
    if (sessionEmail && !didAutoLookup.current) {
      didAutoLookup.current = true;
      runApi("GET", `/customers/by-email?email=${encodeURIComponent(sessionEmail)}`)
        .then((p) => {
          const c = p.customer as CustomerData;
          setCustomer(c);
          if (c?.id) setCustomerId(c.id);
        })
        .catch(() => setError(""));
    }
  }, [sessionEmail, runApi]);

  // Auto-fetch KYC link when customer loads
  useEffect(() => {
    if (customerId && customerId !== kycFetchedForId.current) {
      kycFetchedForId.current = customerId;
      runApi("POST", `/customers/${encodeURIComponent(customerId)}/kyc-link`)
        .then((p) => setKycData(p.kyc_link as Record<string, unknown>))
        .catch(() => setError(""));
    }
  }, [customerId, runApi]);

  // Pre-fill on-ramp dest wallet from saved key
  useEffect(() => {
    if (walletKey && !onRampChain) setOnRampChain("stellar");
  }, [walletKey, onRampChain]);

  // ── Session handlers ──────────────────────────────────────────

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const v = loginInput.trim().toLowerCase();
    if (!v) return;
    localStorage.setItem("tts-bridge-email", v);
    didAutoLookup.current = false;
    kycFetchedForId.current = "";
    setSessionEmail(v);
  }

  function handleLogout() {
    localStorage.removeItem("tts-bridge-email");
    setSessionEmail("");
    setLoginInput("");
    setCustomer(null);
    setCustomerId("");
    setReadiness(null);
    setKycData(null);
    setExternalAccounts([]);
    setVirtualAccounts([]);
    setLiqAddresses([]);
    setTransfers([]);
    setError("");
    setLog([]);
    didAutoLookup.current = false;
    kycFetchedForId.current = "";
  }

  // ── Customer ──────────────────────────────────────────────────

  async function createCustomer() {
    const p = await runApi("POST", "/customers", {
      first_name: firstName,
      last_name: lastName,
      email: sessionEmail,
      type: "individual",
    });
    setCustomer(p.customer as CustomerData);
    if (p.customer?.id) setCustomerId(p.customer.id);
  }

  async function syncCustomer() {
    const p = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/sync`);
    setCustomer(p.customer as CustomerData);
  }

  async function checkReadiness() {
    const p = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/readiness`);
    setReadiness(p.readiness as ReadinessData);
  }

  // ── Stellar wallet ────────────────────────────────────────────

  function saveWallet() {
    const v = walletInput.trim();
    if (!v) return;
    localStorage.setItem("tts-bridge-wallet", v);
    setWalletKey(v);
    setWalletInput("");
    fetchBalance(v);
  }

  async function fetchBalance(key?: string) {
    const pk = key || walletKey;
    if (!pk) return;
    setWalletBusy(true);
    try {
      const r = await fetch(`${HORIZON}/accounts/${encodeURIComponent(pk)}`);
      if (!r.ok) throw new Error("Account not found on Stellar network");
      const d = await r.json();
      setWalletBalances(d.balances || []);
      addLog(`Stellar balance fetched for ${pk.slice(0, 8)}…`);
    } catch (e: any) {
      addLog(`Stellar: ${e.message}`);
      setWalletBalances([]);
    } finally {
      setWalletBusy(false);
    }
  }

  // ── External accounts ─────────────────────────────────────────

  async function listExternalAccounts() {
    const p = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/external-accounts`);
    setExternalAccounts((p.external_accounts as ExternalAccountData[]) || []);
  }

  async function createPixAccount() {
    const p = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/external-accounts/pix-key`, {
      pix_key: pixKey,
      account_owner_name: pixOwnerName || sessionEmail,
    });
    setExternalAccounts((prev) => [p.external_account, ...prev].filter(Boolean));
  }

  async function createUsBankAccount() {
    const p = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/external-accounts/us-bank`, {
      first_name: bankFirst,
      last_name: bankLast,
      routing_number: bankRouting,
      account_number: bankAccount,
      checking_or_savings: bankType,
      street_line_1: bankStreet,
      city: bankCity,
      state: bankState,
      postal_code: bankZip,
    });
    setExternalAccounts((prev) => [p.external_account, ...prev].filter(Boolean));
  }

  async function createIbanAccount() {
    const p = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/external-accounts/iban`, {
      first_name: ibanFirst,
      last_name: ibanLast,
      iban: ibanValue,
      bic: ibanBic || undefined,
    });
    setExternalAccounts((prev) => [p.external_account, ...prev].filter(Boolean));
  }

  async function createClabeAccount() {
    const p = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/external-accounts/clabe`, {
      first_name: clabeFirst,
      last_name: clabeLast,
      clabe: clabeValue,
    });
    setExternalAccounts((prev) => [p.external_account, ...prev].filter(Boolean));
  }

  // ── On-ramp: virtual accounts ─────────────────────────────────

  async function createVirtualAccount() {
    const destWallet = walletKey;
    const p = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/virtual-accounts/${onRampCurrency}`, {
      destination_wallet: destWallet,
      destination_chain: onRampChain,
      confirm_mainnet: true,
    });
    setNewVA(p.virtual_account as VirtualAccountData);
    setVirtualAccounts((prev) => [p.virtual_account, ...prev].filter(Boolean));
  }

  async function listVirtualAccounts() {
    const p = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/virtual-accounts`);
    setVirtualAccounts((p.virtual_accounts as VirtualAccountData[]) || []);
  }

  // ── Liquidation addresses (reusable USDC → fiat) ──────────────

  async function createLiquidationAddress() {
    const p = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/liquidation-addresses`, {
      payment_rail: liqRail,
      currency: liqRail === "pix" ? "brl" : liqRail === "sepa" ? "eur" : liqRail === "spei" ? "mxn" : "usd",
      chain: liqChain,
      external_account_id: liqExtAccountId || undefined,
      confirm_mainnet: true,
    });
    setNewLiq(p.liquidation_address as LiquidationAddressData);
    setLiqAddresses((prev) => [p.liquidation_address, ...prev].filter(Boolean));
  }

  async function listLiquidationAddresses() {
    const p = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/liquidation-addresses`);
    setLiqAddresses((p.liquidation_addresses as LiquidationAddressData[]) || []);
  }

  // ── Off-ramp: one-time transfers ──────────────────────────────

  async function createOffRampTransfer() {
    const rail = OFFRAMP_RAILS.find((r) => r.id === offRailId)!;
    const p = await runApi("POST", `/transfers/${rail.path}`, {
      on_behalf_of: customerId,
      amount: offAmount,
      from_address: walletKey || undefined,
      external_account_id: offExtAccountId || undefined,
      confirm_mainnet: true,
    });
    setOffTransfer(p.transfer as TransferData);
    setTransfers((prev) => [p.transfer, ...prev].filter(Boolean));
  }

  async function refreshTransfer(id: string) {
    const p = await runApi("GET", `/transfers/${encodeURIComponent(id)}`);
    const updated = p.transfer as TransferData;
    setTransfers((prev) => prev.map((t) => (t.id === id ? updated : t)));
    if (offTransfer?.id === id) setOffTransfer(updated);
  }

  async function listCustomerTransfers() {
    const p = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/transfers`);
    setTransfers((p.transfers as TransferData[]) || []);
  }

  // ── Exchange rates ─────────────────────────────────────────────

  async function getExchangeRate() {
    const p = await runApi("GET", `/exchange-rates?from=${rateFrom}&to=${rateTo}`);
    setExchangeRate(p.exchange_rate as ExchangeRateData);
  }

  async function estimatePayout() {
    const p = await runApi("POST", "/estimate", {
      amount: estimateAmount,
      source_currency: rateFrom,
      destination_currency: rateTo,
    });
    setEstimate(p.estimate as EstimateData);
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text.slice(0, 30) + "…");
    setTimeout(() => setCopied(""), 1500);
  }

  // ── Login gate ────────────────────────────────────────────────

  if (!sessionEmail) {
    return (
      <OperationalPage size="xl" frameClassName="max-w-sm mx-auto">
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-tts-gold">Bridge.xyz Mainnet</p>
            <h1 className="mt-3 text-3xl font-bold text-tts-deep">Continue with email</h1>
            <p className="mt-2 text-sm text-tts-muted">No password needed · Session saved in this browser</p>
          </div>
          <form onSubmit={handleLogin} className="w-full space-y-3">
            <Input type="email" autoFocus value={loginInput} onChange={(e) => setLoginInput(e.target.value)} placeholder="you@example.com" className="text-center" />
            <Button type="submit" disabled={!loginInput.trim()} className="w-full">Continue</Button>
          </form>
        </div>
      </OperationalPage>
    );
  }

  const usdc = walletBalances.find((b) => b.asset_code === "USDC");
  const offRail = OFFRAMP_RAILS.find((r) => r.id === offRailId)!;

  // ── Main UI ───────────────────────────────────────────────────

  return (
    <OperationalPage size="xl" frameClassName="max-w-5xl">
      <OperationalHeader
        eyebrow="Bridge.xyz mainnet"
        title="On-ramp & Off-ramp testing"
        description="Full suite: wallets, external accounts, virtual accounts, liquidation addresses, and transfers."
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-tts-muted">Signed in as</p>
              <p className="text-sm font-semibold text-tts-deep">{sessionEmail}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" /> Change
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-4">
        <OperationalStat label="Customer" value={customer?.id?.slice(0, 10) || "-"} detail={customer?.status || customer?.kyc_status || "Not found"} tone={customer ? "confirm" : "default"} />
        <OperationalStat label="USDC balance" value={usdc ? `${parseFloat(usdc.balance).toFixed(2)}` : "-"} detail={usdc ? "USDC on Stellar" : "No wallet"} tone={usdc ? "confirm" : "default"} />
        <OperationalStat label="External accounts" value={String(externalAccounts.length)} detail={externalAccounts.length ? "Loaded" : "None yet"} tone={externalAccounts.length ? "confirm" : "default"} />
        <OperationalStat label="Transfers" value={String(transfers.length)} detail={transfers.length ? "Loaded" : "None yet"} tone={transfers.length ? "confirm" : "default"} />
      </div>

      {error ? (
        <OperationalCard>
          <div className="flex items-start gap-3 rounded-md border border-tts-error/25 bg-tts-error/10 p-4 text-tts-error">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        </OperationalCard>
      ) : null}
      {copied ? <div className="rounded-md border border-tts-confirm/25 bg-tts-confirm/10 p-2 text-sm font-semibold text-tts-confirm">Copied: {copied}</div> : null}

      {/* ── Step 1: Customer ─────────────────────────────────── */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 1</p>
          <h2 className="text-lg font-bold text-tts-deep">Customer</h2>
          <p className="mt-0.5 text-sm text-tts-muted">Linked to <span className="font-semibold text-tts-deep">{sessionEmail}</span></p>
        </div>

        {customer ? (
          <div className="mb-4 rounded-md border border-tts-confirm/25 bg-tts-confirm/5 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-tts-muted">
                {customer.id} <Copy className="inline h-3 w-3 cursor-pointer" onClick={() => handleCopy(customer.id!)} />
              </span>
              <StatusPill tone={customer.status === "active" ? "confirm" : "gold"}>{customer.status || customer.kyc_status || "unknown"}</StatusPill>
            </div>
            <div className="mt-1.5 text-sm text-tts-deep">{customer.first_name} {customer.last_name} · {customer.email}</div>
            {customer.endorsements?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {customer.endorsements.map((e) => (
                  <StatusPill key={e.name} tone={e.status === "complete" || e.status === "approved" ? "confirm" : "gold"}>{e.name}</StatusPill>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mb-4 rounded-md border border-tts-border bg-tts-bg/30 p-3">
            <p className="text-sm text-tts-muted">No customer found — create one:</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
            </div>
            <Button onClick={createCustomer} disabled={!!busy || !firstName} size="sm" className="mt-2">
              {busy?.includes("POST /customers") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create individual
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={syncCustomer} disabled={!!busy || !customerId}><RefreshCw className="mr-2 h-4 w-4" /> Sync</Button>
          <Button variant="outline" size="sm" onClick={checkReadiness} disabled={!!busy || !customerId}><CheckCircle2 className="mr-2 h-4 w-4" /> Readiness</Button>
        </div>
        {readiness ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3 text-sm">
            <StatusPill tone={readiness.status === "ready" ? "confirm" : readiness.status === "needs_kyc" ? "gold" : "error"}>{readiness.status}</StatusPill>
            <span className="ml-2 text-tts-muted">KYC: {readiness.kyc_status} · PIX ready: {readiness.pix_ready ? "Yes" : "No"}</span>
          </div>
        ) : null}
      </OperationalCard>

      {/* ── KYC section (auto-generated) ─────────────────────── */}
      {customerId ? (
        <OperationalCard>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-tts-muted">KYC & ToS Links</p>
            <h2 className="text-lg font-bold text-tts-deep">Complete verification</h2>
          </div>
          {kycData ? (
            <div className="grid gap-3">
              <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
                <p className="text-xs font-bold uppercase text-tts-muted">Persona KYC</p>
                <Button asChild variant="outline" size="sm" className="mt-2 w-full justify-start">
                  <a href={String(kycData.kyc_link || "#")} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Open KYC verification
                  </a>
                </Button>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusPill tone={kycData.kyc_status === "approved" ? "confirm" : "gold"}>{String(kycData.kyc_status || "-")}</StatusPill>
                  <StatusPill tone="default">{String(kycData.persona_inquiry_type || "-")}</StatusPill>
                </div>
              </div>
              <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
                <p className="text-xs font-bold uppercase text-tts-muted">Terms of Service</p>
                <Button asChild variant="outline" size="sm" className="mt-2 w-full justify-start">
                  <a href={String(kycData.tos_link || "#")} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Accept Terms of Service
                  </a>
                </Button>
                <div className="mt-2">
                  <StatusPill tone={kycData.tos_status === "approved" ? "confirm" : "gold"}>{String(kycData.tos_status || "-")}</StatusPill>
                </div>
              </div>
              <p className="text-xs text-tts-muted">ID: {String(kycData.id || "-")} · Created: {String(kycData.created_at || "-").slice(0, 19)}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-tts-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating KYC link…
            </div>
          )}
        </OperationalCard>
      ) : null}

      {/* ── Step 2: Stellar Wallet ────────────────────────────── */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 2</p>
          <h2 className="text-lg font-bold text-tts-deep">Stellar Wallet</h2>
          <p className="mt-0.5 text-sm text-tts-muted">Used as destination for on-ramp and source for off-ramp.</p>
        </div>

        {walletKey ? (
          <div className="mb-4 rounded-md border border-tts-confirm/25 bg-tts-confirm/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs text-tts-muted">Public key</p>
                <p className="break-all font-mono text-xs font-semibold text-tts-deep">
                  {walletKey}
                  <Copy className="ml-1 inline h-3 w-3 cursor-pointer" onClick={() => handleCopy(walletKey)} />
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { localStorage.removeItem("tts-bridge-wallet"); setWalletKey(""); setWalletBalances([]); }}>
                Clear
              </Button>
            </div>
            {walletBalances.length > 0 ? (
              <div className="mt-3 grid gap-1">
                {walletBalances.filter((b) => parseFloat(b.balance) > 0 || b.asset_type === "native").map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-tts-muted">{b.asset_code || "XLM"}</span>
                    <span className="font-mono font-bold text-tts-deep">{parseFloat(b.balance).toFixed(7)}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex gap-2">
          <Input
            value={walletInput}
            onChange={(e) => setWalletInput(e.target.value)}
            placeholder={walletKey ? "Enter a different public key…" : "G… Stellar public key"}
            className="flex-1 font-mono text-xs"
          />
          <Button onClick={saveWallet} disabled={!walletInput.trim()} size="sm">
            <Star className="mr-2 h-4 w-4" /> Save
          </Button>
        </div>
        {walletKey ? (
          <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchBalance()} disabled={walletBusy}>
            {walletBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh balance
          </Button>
        ) : null}
      </OperationalCard>

      {/* ── Step 3: External Accounts ─────────────────────────── */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 3</p>
          <h2 className="text-lg font-bold text-tts-deep">External Accounts</h2>
          <p className="mt-0.5 text-sm text-tts-muted">Off-ramp destinations — bank accounts, PIX keys, IBANs, CLABEs.</p>
        </div>

        {/* Tab selector */}
        <div className="mb-4 flex flex-wrap gap-2">
          {EXT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setExtTab(t.id as any)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                extTab === t.id
                  ? "border-tts-gold bg-tts-gold/10 text-tts-gold"
                  : "border-tts-border bg-tts-bg/40 text-tts-muted hover:border-tts-gold/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* PIX form */}
        {extTab === "pix" && (
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="PIX key (email, CPF, phone, random)" />
              <Input value={pixOwnerName} onChange={(e) => setPixOwnerName(e.target.value)} placeholder="Account owner name" />
            </div>
            <Button onClick={createPixAccount} disabled={!!busy || !customerId || !pixKey} size="sm" className="self-start">
              {busy?.includes("pix-key") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add PIX key
            </Button>
          </div>
        )}

        {/* US Bank form */}
        {extTab === "us_bank" && (
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={bankFirst} onChange={(e) => setBankFirst(e.target.value)} placeholder="First name" />
              <Input value={bankLast} onChange={(e) => setBankLast(e.target.value)} placeholder="Last name" />
              <Input value={bankRouting} onChange={(e) => setBankRouting(e.target.value)} placeholder="Routing number (9 digits)" />
              <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} placeholder="Account number" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBankType("checking")}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${bankType === "checking" ? "border-tts-gold bg-tts-gold/10 text-tts-gold" : "border-tts-border text-tts-muted"}`}
              >
                Checking
              </button>
              <button
                type="button"
                onClick={() => setBankType("savings")}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${bankType === "savings" ? "border-tts-gold bg-tts-gold/10 text-tts-gold" : "border-tts-border text-tts-muted"}`}
              >
                Savings
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={bankStreet} onChange={(e) => setBankStreet(e.target.value)} placeholder="Street address" />
              <Input value={bankCity} onChange={(e) => setBankCity(e.target.value)} placeholder="City" />
              <Input value={bankState} onChange={(e) => setBankState(e.target.value)} placeholder="State (e.g. CA)" />
              <Input value={bankZip} onChange={(e) => setBankZip(e.target.value)} placeholder="ZIP code" />
            </div>
            <Button onClick={createUsBankAccount} disabled={!!busy || !customerId || !bankRouting || !bankAccount} size="sm" className="self-start">
              {busy?.includes("us-bank") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add US bank
            </Button>
          </div>
        )}

        {/* IBAN form */}
        {extTab === "iban" && (
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={ibanFirst} onChange={(e) => setIbanFirst(e.target.value)} placeholder="First name" />
              <Input value={ibanLast} onChange={(e) => setIbanLast(e.target.value)} placeholder="Last name" />
              <Input value={ibanValue} onChange={(e) => setIbanValue(e.target.value)} placeholder="IBAN (e.g. DE89 3704…)" className="sm:col-span-2" />
              <Input value={ibanBic} onChange={(e) => setIbanBic(e.target.value)} placeholder="BIC / SWIFT (optional)" />
            </div>
            <Button onClick={createIbanAccount} disabled={!!busy || !customerId || !ibanValue} size="sm" className="self-start">
              {busy?.includes("iban") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add IBAN
            </Button>
          </div>
        )}

        {/* CLABE form */}
        {extTab === "clabe" && (
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={clabeFirst} onChange={(e) => setClabeFirst(e.target.value)} placeholder="First name" />
              <Input value={clabeLast} onChange={(e) => setClabeLast(e.target.value)} placeholder="Last name" />
              <Input value={clabeValue} onChange={(e) => setClabeValue(e.target.value)} placeholder="CLABE (18 digits)" className="sm:col-span-2" />
            </div>
            <Button onClick={createClabeAccount} disabled={!!busy || !customerId || !clabeValue} size="sm" className="self-start">
              {busy?.includes("clabe") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add CLABE
            </Button>
          </div>
        )}

        {/* List */}
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-tts-muted">Saved accounts ({externalAccounts.length})</p>
          <Button variant="outline" size="sm" onClick={listExternalAccounts} disabled={!!busy || !customerId}>
            <Search className="mr-2 h-3 w-3" /> Refresh list
          </Button>
        </div>
        {externalAccounts.length > 0 ? (
          <div className="mt-2 grid gap-2">
            {externalAccounts.map((ea) => (
              <div key={ea.id} className="flex items-center justify-between rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs">
                <div>
                  <span className="font-mono text-tts-muted">{ea.id?.slice(0, 20)}…</span>
                  <span className="ml-2 font-semibold text-tts-deep">{ea.account_type} · {ea.currency?.toUpperCase()}</span>
                  {ea.account_owner_name ? <span className="ml-2 text-tts-muted">{ea.account_owner_name}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={ea.active ? "confirm" : "error"}>{ea.active ? "Active" : "Inactive"}</StatusPill>
                  <button
                    className="rounded border border-tts-gold/40 px-2 py-0.5 text-xs text-tts-gold hover:bg-tts-gold/10"
                    onClick={() => { setOffExtAccountId(ea.id!); setLiqExtAccountId(ea.id!); }}
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </OperationalCard>

      {/* ── Step 4: On-Ramp (fiat → USDC) ───────────────────── */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 4</p>
          <h2 className="flex items-center gap-2 text-lg font-bold text-tts-deep">
            <ArrowDown className="h-5 w-5 text-tts-confirm" /> On-Ramp — Fiat → USDC
          </h2>
          <p className="mt-0.5 text-sm text-tts-muted">Virtual accounts receive fiat and auto-convert to USDC at your Stellar wallet.</p>
        </div>

        {!walletKey ? (
          <div className="mb-4 rounded-md border border-tts-gold/25 bg-tts-gold/5 p-3 text-sm text-tts-gold">
            Set your Stellar wallet in Step 2 first.
          </div>
        ) : null}

        {/* Rail selector */}
        <div className="mb-4 flex flex-wrap gap-2">
          {ONRAMP_RAILS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOnRampCurrency(r.id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                onRampCurrency === r.id
                  ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm"
                  : "border-tts-border bg-tts-bg/40 text-tts-muted hover:border-tts-confirm/50"
              }`}
            >
              {r.flag} {r.label} <span className="opacity-60">{r.sublabel}</span>
            </button>
          ))}
        </div>

        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-tts-muted">Destination wallet (Stellar)</p>
            <Input value={walletKey} readOnly className="font-mono text-xs" />
          </div>
          <div>
            <p className="mb-1 text-xs text-tts-muted">Destination chain</p>
            <Input value={onRampChain} onChange={(e) => setOnRampChain(e.target.value)} placeholder="stellar" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={createVirtualAccount} disabled={!!busy || !customerId || !walletKey} size="sm">
            {busy?.includes("virtual-accounts") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create {onRampCurrency.toUpperCase()} virtual account
          </Button>
          <Button variant="outline" size="sm" onClick={listVirtualAccounts} disabled={!!busy || !customerId}>
            <Search className="mr-2 h-4 w-4" /> List all
          </Button>
        </div>

        {/* New virtual account result */}
        {newVA ? (
          <div className="mt-4 rounded-md border border-tts-confirm/25 bg-tts-confirm/5 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-tts-muted">{newVA.id}</span>
              <StatusPill tone={newVA.status === "activated" ? "confirm" : "gold"}>{newVA.status}</StatusPill>
            </div>
            {newVA.source_deposit_instructions ? (
              <DepositInstructions instr={newVA.source_deposit_instructions} />
            ) : null}
          </div>
        ) : null}

        {/* All virtual accounts */}
        {virtualAccounts.filter((v) => v.id !== newVA?.id).length > 0 ? (
          <div className="mt-3 grid gap-2">
            {virtualAccounts.filter((v) => v.id !== newVA?.id).map((va) => (
              <div key={va.id} className="rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-tts-muted">{va.id?.slice(0, 24)}…</span>
                  <StatusPill tone={va.status === "activated" ? "confirm" : "gold"}>{va.status}</StatusPill>
                </div>
                {va.source_deposit_instructions ? (
                  <DepositInstructions instr={va.source_deposit_instructions} />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* Liquidation addresses (reusable crypto → fiat) */}
        <div className="mt-6 border-t border-tts-border pt-4">
          <p className="mb-3 text-xs font-bold uppercase text-tts-muted">Liquidation Addresses — Reusable USDC → Fiat</p>
          <p className="mb-3 text-xs text-tts-muted">Send USDC to a fixed address and Bridge auto-converts to fiat on every deposit.</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <div>
              <p className="mb-1 text-xs text-tts-muted">Rail</p>
              <Input value={liqRail} onChange={(e) => setLiqRail(e.target.value)} placeholder="pix / ach / sepa / spei" />
            </div>
            <div>
              <p className="mb-1 text-xs text-tts-muted">Source chain</p>
              <Input value={liqChain} onChange={(e) => setLiqChain(e.target.value)} placeholder="stellar / base / ethereum" />
            </div>
            <div>
              <p className="mb-1 text-xs text-tts-muted">External account ID</p>
              <Input value={liqExtAccountId} onChange={(e) => setLiqExtAccountId(e.target.value)} placeholder="Optional — auto-routes otherwise" className="text-xs" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={createLiquidationAddress} disabled={!!busy || !customerId} size="sm">
              {busy?.includes("liquidation") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
              Create liquidation address
            </Button>
            <Button variant="outline" size="sm" onClick={listLiquidationAddresses} disabled={!!busy || !customerId}>
              <Search className="mr-2 h-4 w-4" /> List
            </Button>
          </div>
          {newLiq ? (
            <div className="mt-3 rounded-md border border-tts-confirm/25 bg-tts-confirm/5 p-3 text-xs">
              <p className="text-tts-muted">Deposit address</p>
              <p className="break-all font-mono font-semibold text-tts-deep">
                {newLiq.address} <Copy className="ml-1 inline h-3 w-3 cursor-pointer" onClick={() => handleCopy(newLiq.address!)} />
              </p>
              <p className="mt-1 text-tts-muted">{newLiq.payment_rail} · {newLiq.currency} · chain: {newLiq.chain}</p>
            </div>
          ) : null}
          {liqAddresses.filter((l) => l.id !== newLiq?.id).length > 0 ? (
            <div className="mt-2 grid gap-2">
              {liqAddresses.filter((l) => l.id !== newLiq?.id).map((la) => (
                <div key={la.id} className="rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs">
                  <span className="font-mono text-tts-muted">{la.id?.slice(0, 20)}…</span> · {la.payment_rail} · {la.currency}
                  {la.address ? <span className="ml-1 text-tts-deep">→ {la.address.slice(0, 16)}…</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </OperationalCard>

      {/* ── Step 5: Off-Ramp (USDC → fiat) ──────────────────── */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 5</p>
          <h2 className="flex items-center gap-2 text-lg font-bold text-tts-deep">
            <ArrowUp className="h-5 w-5 text-tts-gold" /> Off-Ramp — USDC → Fiat
          </h2>
          <p className="mt-0.5 text-sm text-tts-muted">One-time transfer: Bridge gives you a USDC deposit address + memo to send funds to.</p>
        </div>

        {/* Rail selector */}
        <div className="mb-4 flex flex-wrap gap-2">
          {OFFRAMP_RAILS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setOffRailId(r.id)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                offRailId === r.id
                  ? "border-tts-gold bg-tts-gold/10 text-tts-gold"
                  : "border-tts-border bg-tts-bg/40 text-tts-muted hover:border-tts-gold/50"
              }`}
            >
              {r.flag} {r.label} <span className="opacity-60">{r.sublabel}</span>
            </button>
          ))}
        </div>

        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs text-tts-muted">Amount ({offRail.sublabel})</p>
            <Input value={offAmount} onChange={(e) => setOffAmount(e.target.value)} placeholder={offRail.id === "pix" ? "e.g. 50.00" : "e.g. 10.00"} />
          </div>
          <div>
            <p className="mb-1 text-xs text-tts-muted">External account ID</p>
            <Input value={offExtAccountId} onChange={(e) => setOffExtAccountId(e.target.value)} placeholder="From Step 3 (or click Select)" className="text-xs" />
          </div>
          <div>
            <p className="mb-1 text-xs text-tts-muted">Source wallet (Stellar)</p>
            <Input value={walletKey} readOnly className="font-mono text-xs" />
          </div>
        </div>

        <Button onClick={createOffRampTransfer} disabled={!!busy || !customerId || !offAmount} size="sm">
          {busy?.includes("crypto-to") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUp className="mr-2 h-4 w-4" />}
          Create {offRail.label} transfer
        </Button>

        {offTransfer ? (
          <div className="mt-4">
            <TransferCard t={offTransfer} onRefresh={() => refreshTransfer(offTransfer.id!)} />
          </div>
        ) : null}
      </OperationalCard>

      {/* ── Step 6: Transfer History ──────────────────────────── */}
      <OperationalCard>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-tts-gold">Step 6</p>
            <h2 className="text-lg font-bold text-tts-deep">Transfer History</h2>
          </div>
          <Button variant="outline" size="sm" onClick={listCustomerTransfers} disabled={!!busy || !customerId}>
            <RefreshCw className="mr-2 h-4 w-4" /> Load transfers
          </Button>
        </div>
        {transfers.length > 0 ? (
          <div className="grid gap-2">
            {transfers.map((t) => (
              <TransferCard key={t.id} t={t} onRefresh={() => refreshTransfer(t.id!)} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-tts-muted">No transfers loaded. Click "Load transfers" above.</p>
        )}
      </OperationalCard>

      {/* ── Step 7: Exchange Rates ────────────────────────────── */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 7</p>
          <h2 className="text-lg font-bold text-tts-deep">Exchange Rates</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} placeholder="From (usd)" className="text-xs" />
          <Input value={rateTo} onChange={(e) => setRateTo(e.target.value)} placeholder="To (brl)" className="text-xs" />
          <Input value={estimateAmount} onChange={(e) => setEstimateAmount(e.target.value)} placeholder="Amount" className="text-xs" />
          <div className="flex gap-2">
            <Button onClick={getExchangeRate} disabled={!!busy} size="sm" className="flex-1"><ArrowRightLeft className="mr-1 h-4 w-4" /> Rate</Button>
            <Button onClick={estimatePayout} disabled={!!busy} size="sm" variant="outline" className="flex-1"><Banknote className="mr-1 h-4 w-4" /> Estimate</Button>
          </div>
        </div>
        {exchangeRate ? (
          <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Midmarket</p>
              <p className="font-mono font-bold text-tts-deep">{exchangeRate.midmarket_rate}</p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Buy</p>
              <p className="font-mono font-bold text-tts-confirm">{exchangeRate.buy_rate}</p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Sell</p>
              <p className="font-mono font-bold text-tts-gold">{exchangeRate.sell_rate}</p>
            </div>
          </div>
        ) : null}
        {estimate ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3 text-center">
            <span className="font-mono text-lg font-bold text-tts-deep">{estimate.source_amount} {estimate.source_currency}</span>
            <span className="mx-2 text-tts-muted">→</span>
            <span className="font-mono text-lg font-bold text-tts-confirm">{estimate.destination_amount} {estimate.destination_currency}</span>
            <p className="mt-1 text-xs text-tts-muted">Estimated — not a locked quote</p>
          </div>
        ) : null}
      </OperationalCard>

      {/* ── Migrations ────────────────────────────────────────── */}
      <OperationalCard>
        <div className="mb-4 flex items-start gap-3">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-tts-gold" />
          <div>
            <p className="text-xs font-bold uppercase text-tts-gold">Infrastructure</p>
            <h2 className="text-lg font-bold text-tts-deep">Database Migrations</h2>
            <p className="mt-1 text-sm text-tts-muted">
              Run <code className="rounded bg-tts-bg px-1 font-mono text-xs">backend/migrations/20260618_00_bridge_tables.sql</code> to enable persistence and webhook processing.
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          {MIGRATION_TABLES.map((m) => (
            <div key={m.table} className="flex items-center justify-between rounded-md border border-tts-border bg-tts-bg/50 px-3 py-2">
              <div className="flex items-center gap-3">
                <StatusPill tone={m.exists ? "confirm" : "gold"}>{m.exists ? "Exists" : "Pending"}</StatusPill>
                <code className="font-mono text-xs text-tts-deep">{m.table}</code>
              </div>
              <span className="hidden text-xs text-tts-muted sm:block">{m.purpose}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-tts-muted">
          <code className="rounded bg-tts-bg px-1 font-mono">psql $DATABASE_URL -f backend/migrations/20260618_00_bridge_tables.sql</code>
        </p>
      </OperationalCard>

      {/* ── Activity log ─────────────────────────────────────── */}
      <OperationalCard>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold text-tts-deep">Activity log</h2>
          <Button variant="outline" size="sm" onClick={() => setLog([])}>Clear</Button>
        </div>
        <pre className="max-h-48 overflow-auto rounded-md border border-tts-border bg-tts-bg p-3 text-xs leading-5 text-tts-muted">
          {log.length ? log.join("\n") : "No activity yet."}
        </pre>
      </OperationalCard>
    </OperationalPage>
  );
}
