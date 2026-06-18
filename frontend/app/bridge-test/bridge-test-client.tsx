"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
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

const MIGRATION_TABLES = [
  { table: "bridge_pix_ach_orders", purpose: "PIX → ACH atomic flow orders", exists: true, migration: "20260613_00_full_schema.sql" },
  { table: "bridge_customers", purpose: "Map users → Bridge customer IDs", exists: false, migration: "20260618_00_bridge_tables.sql" },
  { table: "bridge_external_accounts", purpose: "PIX keys, US banks, IBANs, CLABEs", exists: false, migration: "20260618_00_bridge_tables.sql" },
  { table: "bridge_liquidation_addresses", purpose: "USDC → fiat reusable deposit addresses", exists: false, migration: "20260618_00_bridge_tables.sql" },
  { table: "bridge_virtual_accounts", purpose: "Fiat → USDC on-ramp accounts", exists: false, migration: "20260618_00_bridge_tables.sql" },
  { table: "bridge_transfers", purpose: "One-time transfer records", exists: false, migration: "20260618_00_bridge_tables.sql" },
  { table: "bridge_webhook_events", purpose: "Webhook event log + idempotency", exists: false, migration: "20260618_00_bridge_tables.sql" },
  { table: "bridge_exchange_rate_estimates", purpose: "Exchange rate cache", exists: false, migration: "20260618_00_bridge_tables.sql" },
];

export default function BridgeTestClient() {
  // ── Session ──────────────────────────────────────────────────
  const [sessionEmail, setSessionEmail] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("tts-bridge-email") || "";
    return "";
  });
  const [loginInput, setLoginInput] = useState("");
  const didAutoLookup = useRef(false);
  const kycFetchedForId = useRef("");

  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [log, setLog] = useState<string[]>([]);

  // Customer form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [kycData, setKycData] = useState<Record<string, unknown> | null>(null);
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

  const addLog = (msg: string) =>
    setLog((prev) => [...prev.slice(-49), `${new Date().toISOString().slice(11, 19)} ${msg}`]);

  const runApi = useCallback(
    async (method: string, path: string, body?: Record<string, unknown>) => {
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
        const payload: any = await r.json().catch(() => ({}));
        addLog(
          `${method} ${path} → ${r.status} ${payload.success ? "OK" : JSON.stringify(payload).slice(0, 120)}`,
        );
        if (!r.ok || payload.success === false) {
          const details = [];
          if (payload.bridge_code) details.push(`code=${payload.bridge_code}`);
          if (payload.bridge_source?.key) details.push(`field=${payload.bridge_source.key}`);
          throw new Error(
            payload.message ||
              (details.length
                ? details.join(", ")
                : `${method} ${path} failed with HTTP ${r.status}`),
          );
        }
        return payload;
      } catch (e: any) {
        setError(e?.message || String(e));
        addLog(`ERROR: ${e?.message || String(e)}`);
        throw e;
      } finally {
        setBusy("");
      }
    },
    [],
  );

  // Auto-lookup customer when session email is present
  useEffect(() => {
    if (sessionEmail && !didAutoLookup.current) {
      didAutoLookup.current = true;
      runApi("GET", `/customers/by-email?email=${encodeURIComponent(sessionEmail)}`)
        .then((p) => {
          const c = p.customer as CustomerData;
          setCustomer(c);
          if (c?.id) setCustomerId(c.id);
        })
        .catch(() => {
          setError(""); // silently clear — customer may not exist yet
        });
    }
  }, [sessionEmail, runApi]);

  // Auto-fetch KYC link whenever a new customer is loaded
  useEffect(() => {
    if (customerId && customerId !== kycFetchedForId.current) {
      kycFetchedForId.current = customerId;
      runApi("POST", `/customers/${encodeURIComponent(customerId)}/kyc-link`)
        .then((p) => setKycData(p.kyc_link as Record<string, unknown>))
        .catch(() => setError(""));
    }
  }, [customerId, runApi]);

  // ── Session handlers ─────────────────────────────────────────

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const emailVal = loginInput.trim().toLowerCase();
    if (!emailVal) return;
    localStorage.setItem("tts-bridge-email", emailVal);
    didAutoLookup.current = false;
    setSessionEmail(emailVal);
  }

  function handleChangeEmail() {
    localStorage.removeItem("tts-bridge-email");
    setSessionEmail("");
    setLoginInput("");
    setCustomer(null);
    setCustomerId("");
    setReadiness(null);
    setKycData(null);
    setExternalAccount(null);
    setExternalAccounts([]);
    setLiquidationAddress(null);
    setLiquidationAddresses([]);
    setVirtualAccount(null);
    setVirtualAccounts([]);
    setError("");
    setLog([]);
    didAutoLookup.current = false;
    kycFetchedForId.current = "";
  }

  // ── Customer actions ──────────────────────────────────────────

  async function createCustomer() {
    const payload = await runApi("POST", "/customers", {
      first_name: firstName,
      last_name: lastName,
      email: sessionEmail,
      type: "individual",
    });
    setCustomer(payload.customer as CustomerData);
    if ((payload.customer as CustomerData)?.id) setCustomerId((payload.customer as CustomerData).id!);
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
    const payload = await runApi("POST", `/customers/${encodeURIComponent(customerId)}/kyc-link`);
    setKycData(payload.kyc_link as Record<string, unknown>);
  }

  // ── PIX External Account ──────────────────────────────────────

  async function createPixAccount() {
    const payload = await runApi(
      "POST",
      `/customers/${encodeURIComponent(customerId)}/external-accounts/pix-key`,
      {
        pix_key: pixKey,
        account_owner_name: pixOwnerName || `${firstName} ${lastName}`.trim() || sessionEmail,
      },
    );
    setExternalAccount(payload.external_account as ExternalAccountData);
  }

  async function listExternalAccounts() {
    const payload = await runApi(
      "GET",
      `/customers/${encodeURIComponent(customerId)}/external-accounts`,
    );
    setExternalAccounts((payload.external_accounts as ExternalAccountData[]) || []);
  }

  // ── Exchange Rate ─────────────────────────────────────────────

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

  // ── Liquidation Address ───────────────────────────────────────

  async function createLiquidationAddress() {
    const payload = await runApi(
      "POST",
      `/customers/${encodeURIComponent(customerId)}/liquidation-addresses/pix`,
      { external_account_id: liqExternalAccountId || undefined, confirm_mainnet: true },
    );
    setLiquidationAddress(payload.liquidation_address as LiquidationAddressData);
  }

  async function listLiquidationAddresses() {
    const payload = await runApi(
      "GET",
      `/customers/${encodeURIComponent(customerId)}/liquidation-addresses`,
    );
    setLiquidationAddresses((payload.liquidation_addresses as LiquidationAddressData[]) || []);
  }

  // ── Virtual Account ───────────────────────────────────────────

  async function createVirtualAccount() {
    const payload = await runApi(
      "POST",
      `/customers/${encodeURIComponent(customerId)}/virtual-accounts/brl`,
      { destination_wallet: vaDestWallet, destination_chain: vaDestChain, confirm_mainnet: true },
    );
    setVirtualAccount(payload.virtual_account as VirtualAccountData);
  }

  async function listVirtualAccounts() {
    const payload = await runApi(
      "GET",
      `/customers/${encodeURIComponent(customerId)}/virtual-accounts`,
    );
    setVirtualAccounts((payload.virtual_accounts as VirtualAccountData[]) || []);
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text.slice(0, 30) + "...");
    setTimeout(() => setCopied(""), 1500);
  }

  // ── Login gate ────────────────────────────────────────────────

  if (!sessionEmail) {
    return (
      <OperationalPage size="xl" frameClassName="max-w-sm mx-auto">
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-tts-gold">
              Bridge.xyz Mainnet
            </p>
            <h1 className="mt-3 text-3xl font-bold text-tts-deep">Continue with email</h1>
            <p className="mt-2 text-sm text-tts-muted">
              No password needed · Session saved in this browser
            </p>
          </div>
          <form onSubmit={handleLogin} className="w-full space-y-3">
            <Input
              type="email"
              autoFocus
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              placeholder="you@example.com"
              className="text-center"
            />
            <Button type="submit" disabled={!loginInput.trim()} className="w-full">
              Continue
            </Button>
          </form>
        </div>
      </OperationalPage>
    );
  }

  // ── Main UI ───────────────────────────────────────────────────

  return (
    <OperationalPage size="xl" frameClassName="max-w-5xl">
      <OperationalHeader
        eyebrow="Bridge.xyz mainnet"
        title="PIX on/off-ramp test"
        description="Create customers, PIX external accounts, liquidation addresses, and virtual accounts via Bridge.xyz API."
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-tts-muted">Signed in as</p>
              <p className="text-sm font-semibold text-tts-deep">{sessionEmail}</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleChangeEmail}>
              <LogOut className="mr-2 h-4 w-4" /> Change
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <OperationalStat
          label="Customer"
          value={customer?.id?.slice(0, 12) || "-"}
          detail={customer?.status || customer?.kyc_status || "Not created"}
          tone={customer ? "confirm" : "default"}
        />
        <OperationalStat
          label="PIX account"
          value={externalAccount?.id?.slice(0, 12) || "-"}
          detail={externalAccount?.active ? "Active" : "Not created"}
          tone={externalAccount ? "confirm" : "default"}
        />
        <OperationalStat
          label="Rate USD→BRL"
          value={exchangeRate?.buy_rate || "-"}
          detail={exchangeRate ? "Live" : "Not fetched"}
          tone={exchangeRate ? "confirm" : "default"}
        />
      </div>

      {error ? (
        <OperationalCard>
          <div className="flex items-start gap-3 rounded-md border border-tts-error/25 bg-tts-error/10 p-4 text-tts-error">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        </OperationalCard>
      ) : null}
      {copied ? (
        <div className="rounded-md border border-tts-confirm/25 bg-tts-confirm/10 p-2 text-sm font-semibold text-tts-confirm">
          Copied: {copied}
        </div>
      ) : null}

      {/* 1. Customer */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 1</p>
          <h2 className="text-lg font-bold text-tts-deep">Customer</h2>
          <p className="mt-0.5 text-sm text-tts-muted">
            Looking up <span className="font-semibold text-tts-deep">{sessionEmail}</span>
          </p>
        </div>

        {customer ? (
          <div className="mb-4 rounded-md border border-tts-confirm/25 bg-tts-confirm/5 p-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-tts-muted">
                {customer.id}{" "}
                <Copy
                  className="inline h-3 w-3 cursor-pointer"
                  onClick={() => handleCopy(customer.id!)}
                />
              </span>
              <StatusPill tone={customer.status === "verified" ? "confirm" : "gold"}>
                {customer.status || customer.kyc_status || "unknown"}
              </StatusPill>
            </div>
            <div className="mt-2 text-sm text-tts-deep">
              {customer.first_name} {customer.last_name} · {customer.email}
            </div>
            {customer.endorsements?.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {customer.endorsements.map((e) => (
                  <StatusPill key={e.name} tone={e.status === "complete" ? "confirm" : "gold"}>
                    {e.name}
                  </StatusPill>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          !busy && (
            <div className="mb-4 rounded-md border border-tts-border bg-tts-bg/30 p-3 text-sm text-tts-muted">
              No customer found for this email — create one below.
            </div>
          )
        )}

        {/* Create new */}
        <p className="mb-2 text-xs font-bold uppercase text-tts-muted">Create new customer</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First name"
          />
          <Input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Last name"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={createCustomer} disabled={!!busy || !firstName} size="sm">
            {busy?.startsWith("POST /customers") ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-2 h-4 w-4" />
            )}
            Create
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={syncCustomer}
            disabled={!!busy || !customerId}
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Sync
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={checkReadiness}
            disabled={!!busy || !customerId}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" /> Readiness
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={getKycLink}
            disabled={!!busy || !customerId}
          >
            <ExternalLink className="mr-2 h-4 w-4" /> KYC Link
          </Button>
        </div>
        {readiness ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <div className="flex items-center gap-2">
              <StatusPill
                tone={
                  readiness.status === "ready"
                    ? "confirm"
                    : readiness.status === "needs_kyc"
                      ? "gold"
                      : "error"
                }
              >
                {readiness.status}
              </StatusPill>
              <span className="text-sm text-tts-muted">
                KYC: {readiness.kyc_status} · PIX:{" "}
                {readiness.pix_ready ? "Ready" : "Not ready"}
              </span>
            </div>
          </div>
        ) : null}
      </OperationalCard>

      {/* KYC Links — always shown when a customer is loaded */}
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
                  <StatusPill tone="gold">{String(kycData.kyc_status || "-")}</StatusPill>
                  <StatusPill tone="default">
                    {String(kycData.persona_inquiry_type || "-")}
                  </StatusPill>
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
                  <StatusPill tone={kycData.tos_status === "approved" ? "confirm" : "gold"}>
                    {String(kycData.tos_status || "-")}
                  </StatusPill>
                </div>
              </div>
              <div className="text-xs text-tts-muted">
                ID: {String(kycData.id || "-")} · Created:{" "}
                {String(kycData.created_at || "-").slice(0, 19)}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-tts-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating KYC link…
            </div>
          )}
        </OperationalCard>
      ) : null}

      {/* 2. PIX External Account */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 2</p>
          <h2 className="text-lg font-bold text-tts-deep">PIX External Account</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={pixKey}
            onChange={(e) => setPixKey(e.target.value)}
            placeholder="PIX key (email, CPF, phone)"
          />
          <Input
            value={pixOwnerName}
            onChange={(e) => setPixOwnerName(e.target.value)}
            placeholder="Account owner name"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={createPixAccount}
            disabled={!!busy || !customerId || !pixKey}
            size="sm"
          >
            {busy?.startsWith("POST /customers") ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Add PIX key
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={listExternalAccounts}
            disabled={!!busy || !customerId}
          >
            <Search className="mr-2 h-4 w-4" /> List accounts
          </Button>
        </div>
        {externalAccount ? (
          <div className="mt-4 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <span className="font-mono text-xs text-tts-muted">
              {externalAccount.id}{" "}
              <Copy
                className="inline h-3 w-3 cursor-pointer"
                onClick={() => handleCopy(externalAccount.id!)}
              />
            </span>
            <div className="mt-1 text-sm text-tts-deep">
              {externalAccount.currency?.toUpperCase()} · {externalAccount.account_type} ·{" "}
              {externalAccount.active ? "Active" : "Inactive"}
            </div>
            {externalAccount.pix_key?.account_preview ? (
              <div className="text-sm text-tts-muted">
                {externalAccount.pix_key.account_preview}
              </div>
            ) : null}
          </div>
        ) : null}
        {externalAccounts.length > 0 && (
          <div className="mt-3 grid gap-2">
            {externalAccounts.map((ea) => (
              <div
                key={ea.id}
                className="rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs"
              >
                <span className="font-mono text-tts-muted">{ea.id?.slice(0, 20)}...</span> ·{" "}
                {ea.currency} · {ea.account_type} ·{" "}
                <StatusPill tone={ea.active ? "confirm" : "error"}>
                  {ea.active ? "Active" : "Inactive"}
                </StatusPill>
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
          <Input
            value={rateFrom}
            onChange={(e) => setRateFrom(e.target.value)}
            placeholder="From (usd)"
            className="text-xs"
          />
          <Input
            value={rateTo}
            onChange={(e) => setRateTo(e.target.value)}
            placeholder="To (brl)"
            className="text-xs"
          />
          <Input
            value={estimateAmount}
            onChange={(e) => setEstimateAmount(e.target.value)}
            placeholder="Amount"
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button onClick={getExchangeRate} disabled={!!busy} size="sm" className="flex-1">
              <ArrowRightLeft className="mr-1 h-4 w-4" /> Rate
            </Button>
            <Button
              onClick={estimatePayout}
              disabled={!!busy}
              size="sm"
              variant="outline"
              className="flex-1"
            >
              <Banknote className="mr-1 h-4 w-4" /> Estimate
            </Button>
          </div>
        </div>
        {exchangeRate ? (
          <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Midmarket</p>
              <p className="font-mono font-bold text-tts-deep">{exchangeRate.midmarket_rate}</p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Buy Rate</p>
              <p className="font-mono font-bold text-tts-confirm">{exchangeRate.buy_rate}</p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-2">
              <p className="text-xs text-tts-muted">Sell Rate</p>
              <p className="font-mono font-bold text-tts-gold">{exchangeRate.sell_rate}</p>
            </div>
          </div>
        ) : null}
        {estimate ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3 text-center">
            <span className="font-mono text-lg font-bold text-tts-deep">
              {estimate.source_amount} {estimate.source_currency}
            </span>
            <span className="mx-2 text-tts-muted">→</span>
            <span className="font-mono text-lg font-bold text-tts-confirm">
              {estimate.destination_amount} {estimate.destination_currency}
            </span>
            <p className="mt-1 text-xs text-tts-muted">Estimated — not a locked quote</p>
          </div>
        ) : null}
      </OperationalCard>

      {/* 4. Liquidation Address */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 4</p>
          <h2 className="text-lg font-bold text-tts-deep">Liquidation Address (USDC → PIX)</h2>
        </div>
        <div className="flex gap-2">
          <Input
            value={liqExternalAccountId}
            onChange={(e) => setLiqExternalAccountId(e.target.value)}
            placeholder="External account ID (optional)"
            className="flex-1 text-xs"
          />
          <Button
            onClick={createLiquidationAddress}
            disabled={!!busy || !customerId}
            size="sm"
          >
            {busy?.startsWith("POST /customers") ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wallet className="mr-2 h-4 w-4" />
            )}
            Create
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={listLiquidationAddresses}
            disabled={!!busy || !customerId}
          >
            <Search className="mr-2 h-4 w-4" /> List
          </Button>
        </div>
        {liquidationAddress ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <span className="font-mono text-xs text-tts-muted">{liquidationAddress.id}</span>
            <div className="mt-1 text-sm text-tts-deep">
              {liquidationAddress.payment_rail} · {liquidationAddress.currency}
            </div>
          </div>
        ) : null}
        {liquidationAddresses.length > 0 && (
          <div className="mt-3 grid gap-2">
            {liquidationAddresses.map((la) => (
              <div
                key={la.id}
                className="rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs"
              >
                <span className="font-mono text-tts-muted">{la.id?.slice(0, 20)}...</span> ·{" "}
                {la.payment_rail} · {la.currency}
              </div>
            ))}
          </div>
        )}
      </OperationalCard>

      {/* 5. Virtual Account */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Step 5</p>
          <h2 className="text-lg font-bold text-tts-deep">Virtual Account (PIX → USDC)</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            value={vaDestWallet}
            onChange={(e) => setVaDestWallet(e.target.value)}
            placeholder="Destination wallet address"
          />
          <Input
            value={vaDestChain}
            onChange={(e) => setVaDestChain(e.target.value)}
            placeholder="Chain (stellar, base, ethereum)"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={createVirtualAccount}
            disabled={!!busy || !customerId || !vaDestWallet}
            size="sm"
          >
            {busy?.startsWith("POST /customers") ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={listVirtualAccounts}
            disabled={!!busy || !customerId}
          >
            <Search className="mr-2 h-4 w-4" /> List
          </Button>
        </div>
        {virtualAccount ? (
          <div className="mt-3 rounded-md border border-tts-border bg-tts-bg/50 p-3">
            <span className="font-mono text-xs text-tts-muted">{virtualAccount.id}</span>
            <div className="mt-1 text-sm text-tts-deep">
              <StatusPill tone={virtualAccount.status === "activated" ? "confirm" : "gold"}>
                {virtualAccount.status}
              </StatusPill>
            </div>
          </div>
        ) : null}
        {virtualAccounts.length > 0 && (
          <div className="mt-3 grid gap-2">
            {virtualAccounts.map((va) => (
              <div
                key={va.id}
                className="rounded-md border border-tts-border bg-tts-bg/50 p-2 text-xs"
              >
                <span className="font-mono text-tts-muted">{va.id?.slice(0, 20)}...</span> ·{" "}
                <StatusPill tone={va.status === "activated" ? "confirm" : "gold"}>
                  {va.status}
                </StatusPill>
              </div>
            ))}
          </div>
        )}
      </OperationalCard>

      {/* Migrations */}
      <OperationalCard>
        <div className="mb-4 flex items-start gap-3">
          <Database className="mt-0.5 h-5 w-5 shrink-0 text-tts-gold" />
          <div>
            <p className="text-xs font-bold uppercase text-tts-gold">Infrastructure</p>
            <h2 className="text-lg font-bold text-tts-deep">Database Migrations</h2>
            <p className="mt-1 text-sm text-tts-muted">
              The current integration is pass-through (no local persistence). Run{" "}
              <code className="rounded bg-tts-bg px-1 font-mono text-xs">
                backend/migrations/20260618_00_bridge_tables.sql
              </code>{" "}
              to enable caching, webhook processing, and user-linked history.
            </p>
          </div>
        </div>
        <div className="grid gap-2">
          {MIGRATION_TABLES.map((m) => (
            <div
              key={m.table}
              className="flex items-center justify-between rounded-md border border-tts-border bg-tts-bg/50 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <StatusPill tone={m.exists ? "confirm" : "gold"}>
                  {m.exists ? "Exists" : "Pending"}
                </StatusPill>
                <code className="font-mono text-xs text-tts-deep">{m.table}</code>
              </div>
              <span className="hidden text-xs text-tts-muted sm:block">{m.purpose}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-tts-muted">
          Apply via Supabase SQL editor or:{" "}
          <code className="rounded bg-tts-bg px-1 font-mono">
            psql $DATABASE_URL -f backend/migrations/20260618_00_bridge_tables.sql
          </code>
        </p>
      </OperationalCard>

      {/* Activity log */}
      <OperationalCard>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold text-tts-deep">Activity log</h2>
          <Button variant="outline" size="sm" onClick={() => setLog([])}>
            Clear
          </Button>
        </div>
        <pre className="max-h-48 overflow-auto rounded-md border border-tts-border bg-tts-bg p-3 text-xs leading-5 text-tts-muted">
          {log.length ? log.join("\n") : "No activity yet."}
        </pre>
      </OperationalCard>
    </OperationalPage>
  );
}
