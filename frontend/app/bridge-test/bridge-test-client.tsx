"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UserPlus,
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

const BRIDGE_BASE = "/api/bridge";
type JsonRecord = Record<string, unknown>;

type ApiResponse = JsonRecord & {
  success?: boolean;
  message?: string;
};

type CustomerData = {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  type?: string;
  status?: string;
  kyc_status?: string;
  country?: string;
  endorsements?: Array<{ name: string; status: string }>;
  created_at?: string;
};

type ExternalAccountData = {
  id?: string;
  currency?: string;
  account_type?: string;
  active?: boolean;
  account_owner_name?: string;
  pix_key?: { pix_key?: string; account_preview?: string };
  created_at?: string;
};

type LiquidationAddressData = {
  id?: string;
  payment_rail?: string;
  currency?: string;
  deposit_address?: string;
  created_at?: string;
};

type VirtualAccountData = {
  id?: string;
  status?: string;
  source_deposit_instructions?: JsonRecord;
  created_at?: string;
};

type ExchangeRateData = {
  midmarket_rate?: string;
  buy_rate?: string;
  sell_rate?: string;
};

type EstimateData = {
  source_amount?: string;
  source_currency?: string;
  destination_amount?: string;
  destination_currency?: string;
};

type ReadinessData = {
  status?: string;
  kyc_status?: string;
  endorsements?: string[];
  pix_ready?: boolean;
};

export default function BridgeTestClient() {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [log, setLog] = useState<string[]>([]);

  // Customer form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("BR");

  // Created customer
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);

  // PIX external account
  const [pixKey, setPixKey] = useState("");
  const [pixOwnerName, setPixOwnerName] = useState("");
  const [externalAccount, setExternalAccount] = useState<ExternalAccountData | null>(null);
  const [externalAccounts, setExternalAccounts] = useState<ExternalAccountData[]>([]);

  // Exchange rate
  const [rateFrom, setRateFrom] = useState("usd");
  const [rateTo, setRateTo] = useState("brl");
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateData | null>(null);
  const [estimateAmount, setEstimateAmount] = useState("100");
  const [estimate, setEstimate] = useState<EstimateData | null>(null);

  // Liquidation address
  const [liqExternalAccountId, setLiqExternalAccountId] = useState("");
  const [liquidationAddress, setLiquidationAddress] = useState<LiquidationAddressData | null>(null);
  const [liquidationAddresses, setLiquidationAddresses] = useState<LiquidationAddressData[]>([]);

  // Virtual account
  const [vaDestWallet, setVaDestWallet] = useState("");
  const [vaDestChain, setVaDestChain] = useState("stellar");
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccountData | null>(null);
  const [virtualAccounts, setVirtualAccounts] = useState<VirtualAccountData[]>([]);

  const addLog = (msg: string) => setLog((prev) => [...prev.slice(-49), `${new Date().toISOString().slice(11, 19)} ${msg}`]);

  const runApi = useCallback(async (method: string, path: string, body?: Record<string, unknown>) => {
    setBusy(`${method} ${path}`);
    setError("");
    try {
      const r = await fetch(BRIDGE_BASE, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-bridge-path": path,
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      });
      const payload: ApiResponse = await r.json().catch(() => ({}));
      addLog(`${method} ${path} → ${r.status} ${payload.success ? "OK" : payload.message || "FAIL"}`);
      if (!r.ok || payload.success === false) {
        throw new Error(payload.message || `${method} ${path} failed with HTTP ${r.status}`);
      }
      return payload;
    } catch (e: any) {
      const msg = e?.message || String(e);
      setError(msg);
      addLog(`ERROR: ${msg}`);
      throw e;
    } finally {
      setBusy("");
    }
  }, []);

  // ── Customer ──────────────────────────────────────

  async function createCustomer() {
    const payload = await runApi("POST", "/customers", {
      first_name: firstName,
      last_name: lastName,
      email,
      country,
      type: "individual",
    });
    setCustomer(payload.customer as CustomerData);
    if ((payload.customer as CustomerData)?.id) setCustomerId((payload.customer as CustomerData).id!);
  }

  async function loadCustomer() {
    const payload = await runApi("GET", `/customers/${encodeURIComponent(customerId)}`);
    setCustomer(payload.customer as CustomerData);
  }

  async function syncCustomer() {
    const payload = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/sync`);
    setCustomer(payload.customer as CustomerData);
  }

  async function checkReadiness() {
    const payload = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/readiness`);
    setReadiness(payload.readiness as ReadinessData);
  }

  async function getKycLink() {
    const payload = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/kyc-link`);
    addLog(`KYC link: ${JSON.stringify(payload.kyc_link)}`);
  }

  // ── PIX External Account ────────────────────────

  async function createPixAccount() {
    const payload = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/external-accounts/pix-key`, {
      pix_key: pixKey,
      account_owner_name: pixOwnerName || `${firstName} ${lastName}`,
    });
    setExternalAccount(payload.external_account as ExternalAccountData);
  }

  async function listExternalAccounts() {
    const payload = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/external-accounts`);
    setExternalAccounts((payload.external_accounts as ExternalAccountData[]) || []);
  }

  // ── Exchange Rate ────────────────────────────────

  async function getExchangeRate() {
    const payload = await runApi("GET", `/exchange-rates?from=${rateFrom}&to=${rateTo}`);
    setExchangeRate(payload.exchange_rate as ExchangeRateData);
  }

  async function estimatePayout() {
    const payload = await runApi("POST", "/estimate", {
      amount: estimateAmount,
      source_currency: rateFrom,
      destination_currency: rateTo,
    });
    setEstimate(payload.estimate as EstimateData);
  }

  // ── Liquidation Address ──────────────────────────

  async function createLiquidationAddress() {
    const payload = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/liquidation-addresses/pix`, {
      external_account_id: liqExternalAccountId || undefined,
      confirm_mainnet: true,
    });
    setLiquidationAddress(payload.liquidation_address as LiquidationAddressData);
  }

  async function listLiquidationAddresses() {
    const payload = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/liquidation-addresses`);
    setLiquidationAddresses((payload.liquidation_addresses as LiquidationAddressData[]) || []);
  }

  // ── Virtual Account ──────────────────────────────

  async function createVirtualAccount() {
    const payload = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/virtual-accounts/brl`, {
      destination_wallet: vaDestWallet,
      destination_chain: vaDestChain,
      confirm_mainnet: true,
    });
    setVirtualAccount(payload.virtual_account as VirtualAccountData);
  }

  async function listVirtualAccounts() {
    const payload = await runApi("GET", `/customers/${encodeURIComponent(customerId)}/virtual-accounts`);
    setVirtualAccounts((payload.virtual_accounts as VirtualAccountData[]) || []);
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text.slice(0, 30) + "...");
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <OperationalPage size="xl" frameClassName="max-w-5xl">
      <OperationalHeader
        eyebrow="Bridge.xyz mainnet"
        title="PIX on/off-ramp test"
        description="Create customers, PIX external accounts, liquidation addresses, and virtual accounts via Bridge.xyz API."
        actions={
          <StatusPill tone={customer ? "confirm" : "default"}>{customer ? "Customer ready" : "No customer"}</StatusPill>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <OperationalStat label="Customer" value={customer?.id?.slice(0, 12) || "-"} detail={customer?.status || customer?.kyc_status || "Not created"} tone={customer ? "confirm" : "default"} />
        <OperationalStat label="PIX account" value={externalAccount?.id?.slice(0, 12) || "-"} detail={externalAccount?.active ? "Active" : "Not created"} tone={externalAccount ? "confirm" : "default"} />
        <OperationalStat label="Rate USD→BRL" value={exchangeRate?.buy_rate || "-"} detail={exchangeRate ? "Live" : "Not fetched"} tone={exchangeRate ? "confirm" : "default"} />
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

      {/* 1. Customer Creation */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 1</p>
          <h2 className="text-lg font-bold text-tts-deep">Create Customer</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" />
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country (BR)" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={createCustomer} disabled={!!busy || !firstName} size="sm">
            {busy?.startsWith("POST /customers") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Create
          </Button>
          <Button variant="outline" size="sm" onClick={loadCustomer} disabled={!!busy || !customerId}>
            {busy?.startsWith("GET /customers") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Load
          </Button>
          <Button variant="outline" size="sm" onClick={syncCustomer} disabled={!!busy || !customerId}>
            <RefreshCw className="mr-2 h-4 w-4" /> Sync
          </Button>
          <Button variant="outline" size="sm" onClick={checkReadiness} disabled={!!busy || !customerId}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Readiness
          </Button>
          <Button variant="outline" size="sm" onClick={getKycLink} disabled={!!busy || !customerId}>
            <ExternalLink className="mr-2 h-4 w-4" /> KYC Link
          </Button>
        </div>
        {customer ? (
          <div className="mt-4 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono-financial text-xs text-tts-muted">{customer.id} <Copy className="inline h-3 w-3 cursor-pointer" onClick={() => handleCopy(customer.id!)} /></span>
              <StatusPill tone={customer.status === "verified" ? "confirm" : "gold"}>{customer.status || customer.kyc_status || "unknown"}</StatusPill>
            </div>
            <div className="mt-2 text-sm text-tts-deep">{customer.first_name} {customer.last_name} · {customer.email} · {customer.country}</div>
            {customer.endorsements?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {customer.endorsements.map((e) => (
                  <StatusPill key={e.name} tone={e.status === "complete" ? "confirm" : "gold"}>{e.name}</StatusPill>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {readiness ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <div className="flex items-center gap-2">
              <StatusPill tone={readiness.status === "ready" ? "confirm" : readiness.status === "needs_kyc" ? "gold" : "error"}>{readiness.status}</StatusPill>
              <span className="text-sm text-tts-muted">KYC: {readiness.kyc_status} · PIX: {readiness.pix_ready ? "Yes" : "No"}</span>
            </div>
          </div>
        ) : null}
      </OperationalCard>

      {/* 2. PIX External Account */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 2</p>
          <h2 className="text-lg font-bold text-tts-deep">PIX External Account</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="PIX key (email, CPF, phone)" />
          <Input value={pixOwnerName} onChange={(e) => setPixOwnerName(e.target.value)} placeholder="Account owner name" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={createPixAccount} disabled={!!busy || !customerId || !pixKey} size="sm">
            {busy?.startsWith("POST /customers") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add PIX key
          </Button>
          <Button variant="outline" size="sm" onClick={listExternalAccounts} disabled={!!busy || !customerId}>
            <Search className="mr-2 h-4 w-4" /> List accounts
          </Button>
        </div>
        {externalAccount ? (
          <div className="mt-4 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <span className="font-mono-financial text-xs text-tts-muted">{externalAccount.id} <Copy className="inline h-3 w-3 cursor-pointer" onClick={() => handleCopy(externalAccount.id!)} /></span>
            <div className="mt-1 text-sm text-tts-deep">{externalAccount.currency?.toUpperCase()} · {externalAccount.account_type} · {externalAccount.active ? "Active" : "Inactive"}</div>
            {externalAccount.pix_key?.account_preview ? <div className="text-sm text-tts-muted">{externalAccount.pix_key.account_preview}</div> : null}
          </div>
        ) : null}
        {externalAccounts.length > 0 && (
          <div className="mt-3 grid gap-2">
            {externalAccounts.map((ea) => (
              <div key={ea.id} className="rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs">
                <span className="font-mono text-tts-muted">{ea.id?.slice(0, 20)}...</span> · {ea.currency} · {ea.account_type} · <StatusPill tone={ea.active ? "confirm" : "error"}>{ea.active ? "Active" : "Inactive"}</StatusPill>
              </div>
            ))}
          </div>
        )}
      </OperationalCard>

      {/* 3. Exchange Rates */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 3</p>
          <h2 className="text-lg font-bold text-tts-deep">Exchange Rates & Estimate</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Input value={rateFrom} onChange={(e) => setRateFrom(e.target.value)} placeholder="From (usd)" className="text-xs" />
          <Input value={rateTo} onChange={(e) => setRateTo(e.target.value)} placeholder="To (brl)" className="text-xs" />
          <Input value={estimateAmount} onChange={(e) => setEstimateAmount(e.target.value)} placeholder="Amount" className="text-xs" />
          <div className="flex gap-2">
            <Button onClick={getExchangeRate} disabled={!!busy} size="sm" className="flex-1">
              <ArrowRightLeft className="mr-1 h-4 w-4" /> Rate
            </Button>
            <Button onClick={estimatePayout} disabled={!!busy} size="sm" variant="outline" className="flex-1">
              <Banknote className="mr-1 h-4 w-4" /> Estimate
            </Button>
          </div>
        </div>
        {exchangeRate ? (
          <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Midmarket</p>
              <p className="font-mono-financial font-bold text-tts-deep">{exchangeRate.midmarket_rate}</p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Buy Rate</p>
              <p className="font-mono-financial font-bold text-tts-confirm">{exchangeRate.buy_rate}</p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Sell Rate</p>
              <p className="font-mono-financial font-bold text-tts-gold">{exchangeRate.sell_rate}</p>
            </div>
          </div>
        ) : null}
        {estimate ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3 text-center">
            <span className="font-mono-financial text-lg font-bold text-tts-deep">{estimate.source_amount} {estimate.source_currency}</span>
            <span className="mx-2 text-tts-muted">→</span>
            <span className="font-mono-financial text-lg font-bold text-tts-confirm">{estimate.destination_amount} {estimate.destination_currency}</span>
            <p className="mt-1 text-xs text-tts-muted">Estimated — not a locked quote</p>
          </div>
        ) : null}
      </OperationalCard>

      {/* 4. Liquidation Address (USDC → PIX) */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 4</p>
          <h2 className="text-lg font-bold text-tts-deep">Liquidation Address (USDC → PIX)</h2>
        </div>
        <div className="flex gap-2">
          <Input value={liqExternalAccountId} onChange={(e) => setLiqExternalAccountId(e.target.value)} placeholder="External account ID (optional)" className="flex-1 text-xs" />
          <Button onClick={createLiquidationAddress} disabled={!!busy || !customerId} size="sm">
            {busy?.startsWith("POST /customers") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
            Create
          </Button>
          <Button variant="outline" size="sm" onClick={listLiquidationAddresses} disabled={!!busy || !customerId}>
            <Search className="mr-2 h-4 w-4" /> List
          </Button>
        </div>
        {liquidationAddress ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <span className="font-mono-financial text-xs text-tts-muted">{liquidationAddress.id}</span>
            <div className="mt-1 text-sm text-tts-deep">{liquidationAddress.payment_rail} · {liquidationAddress.currency}</div>
          </div>
        ) : null}
        {liquidationAddresses.length > 0 && (
          <div className="mt-3 grid gap-2">
            {liquidationAddresses.map((la) => (
              <div key={la.id} className="rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs">
                <span className="font-mono text-tts-muted">{la.id?.slice(0, 20)}...</span> · {la.payment_rail} · {la.currency}
              </div>
            ))}
          </div>
        )}
      </OperationalCard>

      {/* 5. Virtual Account (PIX → USDC) */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 5</p>
          <h2 className="text-lg font-bold text-tts-deep">Virtual Account (PIX → USDC)</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={vaDestWallet} onChange={(e) => setVaDestWallet(e.target.value)} placeholder="Destination wallet address" />
          <Input value={vaDestChain} onChange={(e) => setVaDestChain(e.target.value)} placeholder="Chain (stellar, base, ethereum)" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={createVirtualAccount} disabled={!!busy || !customerId || !vaDestWallet} size="sm">
            {busy?.startsWith("POST /customers") ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Create
          </Button>
          <Button variant="outline" size="sm" onClick={listVirtualAccounts} disabled={!!busy || !customerId}>
            <Search className="mr-2 h-4 w-4" /> List
          </Button>
        </div>
        {virtualAccount ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <span className="font-mono-financial text-xs text-tts-muted">{virtualAccount.id}</span>
            <div className="mt-1 text-sm text-tts-deep">
              <StatusPill tone={virtualAccount.status === "activated" ? "confirm" : "gold"}>{virtualAccount.status}</StatusPill>
            </div>
          </div>
        ) : null}
        {virtualAccounts.length > 0 && (
          <div className="mt-3 grid gap-2">
            {virtualAccounts.map((va) => (
              <div key={va.id} className="rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs">
                <span className="font-mono text-tts-muted">{va.id?.slice(0, 20)}...</span> · <StatusPill tone={va.status === "activated" ? "confirm" : "gold"}>{va.status}</StatusPill>
              </div>
            ))}
          </div>
        )}
      </OperationalCard>

      {/* Log */}
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
