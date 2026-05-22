"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ExternalLink,
  Landmark,
  Loader2,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { getClientSession } from "@/lib/session";

type ApiState = {
  loading: boolean;
  message: string;
  error: string;
};

type MainnetStatus = {
  success?: boolean;
  mode?: string;
  network?: {
    label?: string;
    horizon_url?: string;
    explorer_url?: string;
  };
  controls?: {
    enabled?: boolean;
    runtime_network?: string;
    signer_mode?: string;
    mutations_available?: boolean;
    require_manual_approval?: boolean;
    max_payment_usdc?: string | null;
  };
  readiness?: {
    configuration_ready?: boolean;
    safe_for_current_testnet_runtime?: boolean;
    blockers?: string[];
    warnings?: string[];
    checks?: Array<{ key: string; status: string; detail: string }>;
  };
};

type MainnetWallet = {
  id: string;
  public_key: string;
  label: string;
  explorer_url?: string;
  last_synced_at?: string | null;
  last_balance?: Array<BalanceLine>;
};

type BalanceLine = {
  asset_code: string;
  asset_type?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
};

type OperationLine = {
  id: string;
  type: string;
  created_at?: string;
  transaction_hash?: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_code?: string;
  explorer_tx_url?: string;
};

type NetworkMode = "testnet" | "mainnet";

type RampConfig = {
  success?: boolean;
  provider?: string;
  sandbox?: boolean;
  available?: boolean;
  testnet_only?: boolean;
  network?: string;
  stellar_network_id?: "TESTNET" | "PUBLIC";
  base_url?: string;
  unavailable_reason?: string;
  asset?: {
    code?: string;
    issuer?: string;
    identifier?: string;
  };
};

function compactKey(value?: string | null) {
  const key = String(value || "").trim();
  if (key.length <= 16) return key || "-";
  return `${key.slice(0, 8)}...${key.slice(-8)}`;
}

function formatAmount(value: unknown) {
  const parsed = Number(String(value || "0"));
  if (!Number.isFinite(parsed)) return String(value || "0");
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: parsed > 0 && parsed < 1 ? 4 : 2,
    maximumFractionDigits: 7,
  }).format(parsed);
}

function isValidPublicKey(value: string) {
  return /^G[A-Z2-7]{55}$/.test(value.trim());
}

async function financialApi(path: string, init?: RequestInit) {
  const response = await fetch(`/api/financial/mainnet/${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Mainnet request failed.");
  }
  return payload;
}

async function rampConfigApi(): Promise<RampConfig> {
  const response = await fetch("/api/ramp/etherfuse/config", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Could not load Etherfuse status.");
  }
  return payload;
}

export default function MainnetClient() {
  const [networkMode, setNetworkMode] = useState<NetworkMode>("testnet");
  const [session, setSession] = useState({ authenticated: false, sessionId: "" });
  const [status, setStatus] = useState<MainnetStatus | null>(null);
  const [rampConfig, setRampConfig] = useState<RampConfig | null>(null);
  const [wallet, setWallet] = useState<MainnetWallet | null>(null);
  const [balance, setBalance] = useState<any | null>(null);
  const [operations, setOperations] = useState<OperationLine[]>([]);
  const [publicKey, setPublicKey] = useState("");
  const [walletLabel, setWalletLabel] = useState("Mainnet wallet");
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("1");
  const [assetCode, setAssetCode] = useState("USDC");
  const [preview, setPreview] = useState<any | null>(null);
  const [apiState, setApiState] = useState<ApiState>({ loading: true, message: "", error: "" });

  const balances: BalanceLine[] = useMemo(() => {
    if (Array.isArray(balance?.balances)) return balance.balances;
    if (Array.isArray(wallet?.last_balance)) return wallet.last_balance;
    return [];
  }, [balance, wallet]);

  const hasWallet = Boolean(wallet?.public_key);
  const canAttach = isValidPublicKey(publicKey);
  const etherfuseAvailable = Boolean(rampConfig?.available);
  const currentNetworkLabel = networkMode === "testnet" ? "Stellar Testnet" : "Stellar Mainnet";

  async function refreshAll() {
    setApiState({ loading: true, message: "", error: "" });
    try {
      const [sessionPayload, statusPayload, rampPayload] = await Promise.all([
        getClientSession(),
        financialApi("status"),
        rampConfigApi().catch((error) => ({
          success: false,
          available: false,
          testnet_only: true,
          network: "Stellar Testnet",
          stellar_network_id: "TESTNET" as const,
          unavailable_reason: error instanceof Error ? error.message : String(error),
        })),
      ]);

      setSession(sessionPayload);
      setStatus(statusPayload);
      setRampConfig(rampPayload);

      if (!sessionPayload.authenticated) {
        setWallet(null);
        setBalance(null);
        setOperations([]);
        setApiState({
          loading: false,
          message: "Network console loaded. Sign in to attach Mainnet wallets or run authenticated Testnet flows.",
          error: "",
        });
        return;
      }

      const walletPayload = await financialApi("wallet");
      setWallet(walletPayload.wallet || null);

      if (walletPayload.wallet?.public_key) {
        const [balancePayload, operationsPayload] = await Promise.all([
          financialApi("balance"),
          financialApi("operations?limit=10"),
        ]);
        setBalance(balancePayload);
        setOperations(Array.isArray(operationsPayload.operations) ? operationsPayload.operations : []);
      } else {
        setBalance(null);
        setOperations([]);
      }

      setApiState({ loading: false, message: "Mainnet console refreshed.", error: "" });
    } catch (error) {
      setApiState({
        loading: false,
        message: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function attachWallet() {
    if (!canAttach) {
      setApiState({ loading: false, message: "", error: "Paste a valid Stellar Mainnet public key beginning with G." });
      return;
    }

    setApiState({ loading: true, message: "", error: "" });
    try {
      const payload = await financialApi("wallet", {
        method: "POST",
        body: JSON.stringify({
          public_key: publicKey.trim(),
          label: walletLabel.trim() || "Mainnet wallet",
        }),
      });
      setWallet(payload.wallet || null);
      setPublicKey("");
      await refreshAll();
      setApiState({ loading: false, message: "Mainnet wallet attached in read-only mode.", error: "" });
    } catch (error) {
      setApiState({
        loading: false,
        message: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function refreshBalance() {
    setApiState({ loading: true, message: "", error: "" });
    try {
      const [balancePayload, operationsPayload] = await Promise.all([
        financialApi("balance"),
        financialApi("operations?limit=10"),
      ]);
      setBalance(balancePayload);
      setOperations(Array.isArray(operationsPayload.operations) ? operationsPayload.operations : []);
      setApiState({ loading: false, message: "Mainnet balance updated from Horizon.", error: "" });
    } catch (error) {
      setApiState({
        loading: false,
        message: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function previewPayment() {
    setApiState({ loading: true, message: "", error: "" });
    setPreview(null);
    try {
      const payload = await financialApi("payment-preview", {
        method: "POST",
        body: JSON.stringify({
          destination,
          amount,
          asset_code: assetCode,
        }),
      });
      setPreview(payload);
      setApiState({ loading: false, message: "Mainnet interaction preview created. No transaction was submitted.", error: "" });
    } catch (error) {
      setApiState({
        loading: false,
        message: "",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  return (
    <main className="min-h-screen bg-black text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-amber-200">
              <ShieldCheck className="h-4 w-4" />
              Network toggle
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              Stellar network console
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">
              Switch between the Testnet product rail and the guarded Mainnet wallet view. Etherfuse PIX stays Testnet-only;
              Mainnet is opt-in, public-key based and read-only unless operational gates are explicitly enabled.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:min-w-[320px]">
            <div className="grid grid-cols-2 border border-white/10 bg-white/[0.03] p-1">
              <button
                type="button"
                onClick={() => setNetworkMode("testnet")}
                className={`min-h-11 px-3 text-sm font-black ${networkMode === "testnet" ? "bg-white text-black" : "text-slate-300 hover:bg-white/10"}`}
              >
                Testnet
              </button>
              <button
                type="button"
                onClick={() => setNetworkMode("mainnet")}
                className={`min-h-11 px-3 text-sm font-black ${networkMode === "mainnet" ? "bg-amber-200 text-black" : "text-slate-300 hover:bg-white/10"}`}
              >
                Mainnet
              </button>
            </div>
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-white/15 bg-white px-4 py-2 text-sm font-black text-black hover:bg-slate-200"
            >
              {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh {currentNetworkLabel}
            </button>
          </div>
        </header>

        {apiState.error ? (
          <div className="flex items-start gap-3 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">Needs attention</p>
              <p className="mt-1 text-red-100/85">{apiState.error}</p>
            </div>
          </div>
        ) : null}

        {apiState.message ? (
          <div className="border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm font-semibold text-emerald-100">
            {apiState.message}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4">
          <Metric label="Selected rail" value={networkMode === "testnet" ? "Testnet" : "Mainnet"} detail={currentNetworkLabel} />
          <Metric label="Etherfuse PIX" value={etherfuseAvailable ? "Testnet on" : "Off"} detail={rampConfig?.testnet_only ? "Testnet-only rail" : "Provider status"} />
          <Metric label="Mainnet mutations" value={status?.controls?.mutations_available ? "Guarded" : "Off"} detail="Read-only unless gated" />
          <Metric label="Runtime" value={status?.controls?.runtime_network || "-"} detail="Default product runtime" />
        </section>

        {networkMode === "testnet" ? (
          <TestnetRailPanel
            sessionAuthenticated={session.authenticated}
            rampConfig={rampConfig}
            etherfuseAvailable={etherfuseAvailable}
          />
        ) : (
          <>
        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className="border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-white">
                  <Wallet2 className="h-5 w-5 text-cyan-200" />
                  Mainnet wallet
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Attach only a public key. Secret keys, seed phrases and signing credentials must never be pasted here.
                </p>
              </div>
              <span className="border border-white/10 px-2 py-1 text-xs font-black uppercase tracking-[0.16em] text-slate-300">
                Read only
              </span>
            </div>

            {!session.authenticated ? (
              <div className="mt-5 border border-white/10 bg-black p-4 text-sm text-slate-300">
                Browser login is required before attaching a Mainnet wallet.
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href="/chat" className="inline-flex min-h-10 items-center justify-center bg-white px-4 py-2 text-sm font-black text-black">
                    Open chat
                  </a>
                  <a href="/login" className="inline-flex min-h-10 items-center justify-center border border-white/15 px-4 py-2 text-sm font-black text-white">
                    Browser login
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-3">
                  <label className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Public Mainnet key
                  </label>
                  <input
                    value={publicKey}
                    onChange={(event) => setPublicKey(event.target.value.trim())}
                    placeholder="G..."
                    className="min-h-12 w-full border border-white/10 bg-black px-3 font-mono text-sm text-white outline-none focus:border-cyan-300"
                  />
                  <label className="block text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                    Wallet label
                  </label>
                  <input
                    value={walletLabel}
                    onChange={(event) => setWalletLabel(event.target.value)}
                    className="min-h-12 w-full border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-cyan-300"
                  />
                  <button
                    type="button"
                    onClick={attachWallet}
                    disabled={!canAttach || apiState.loading}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-cyan-200 px-4 py-2 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
                  >
                    {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Attach read-only wallet
                  </button>
                  {!canAttach && publicKey ? (
                    <p className="text-xs font-semibold text-amber-200">
                      The key must be a Stellar public key beginning with G and 56 characters long.
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 border border-white/10 bg-black p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Attached wallet</p>
                  {hasWallet ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-lg font-black text-white">{wallet?.label || "Mainnet wallet"}</p>
                      <p className="break-all font-mono text-xs text-slate-300">{wallet?.public_key}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={refreshBalance}
                          className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-3 py-2 text-sm font-black text-white"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Sync balance
                        </button>
                        {wallet?.explorer_url ? (
                          <a
                            href={wallet.explorer_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-3 py-2 text-sm font-black text-white"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Explorer
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">
                      No Mainnet wallet attached yet. Every new TalkToStellar account can attach one here without changing the testnet product wallet.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="border border-white/10 bg-white/[0.03] p-5">
            <h2 className="flex items-center gap-2 text-lg font-black text-white">
              <Activity className="h-5 w-5 text-emerald-200" />
              Mainnet balance
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Live read from Stellar Public Network Horizon. This can show real XLM and issued assets held by the attached wallet.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {balances.length ? balances.map((item) => (
                <div key={`${item.asset_code}-${item.asset_issuer || "native"}`} className="border border-white/10 bg-black p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{item.asset_code}</p>
                      <p className="mt-2 text-2xl font-black text-white">{formatAmount(item.balance)}</p>
                    </div>
                    <span className="border border-white/10 px-2 py-1 text-xs font-bold text-slate-300">
                      {item.asset_type === "native" ? "native" : "issued"}
                    </span>
                  </div>
                  {item.asset_issuer ? (
                    <p className="mt-3 break-all font-mono text-[11px] text-slate-500">{item.asset_issuer}</p>
                  ) : null}
                </div>
              )) : (
                <div className="border border-white/10 bg-black p-4 text-sm text-slate-400 sm:col-span-2">
                  {hasWallet ? "No funded Mainnet balance found yet." : "Attach a public Mainnet wallet to show balances."}
                </div>
              )}
            </div>

            <div className="mt-5 border border-white/10 bg-black p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Account status</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <MiniStat label="Funded" value={balance?.funded === false ? "No" : balance?.funded ? "Yes" : "-"} />
                <MiniStat label="Sequence" value={balance?.sequence ? compactKey(balance.sequence) : "-"} />
                <MiniStat label="Synced" value={balance?.last_synced_at ? new Date(balance.last_synced_at).toLocaleTimeString() : "-"} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="border border-white/10 bg-white/[0.03] p-5">
            <h2 className="flex items-center gap-2 text-lg font-black text-white">
              <Send className="h-5 w-5 text-violet-200" />
              Guarded interaction preview
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Validate a Mainnet payment shape without submitting. Real submission stays disabled unless signer, limits and manual approval are configured.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px]">
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value.trim())}
                placeholder="Destination G..."
                className="min-h-12 border border-white/10 bg-black px-3 font-mono text-sm text-white outline-none focus:border-violet-300"
              />
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="1"
                className="min-h-12 border border-white/10 bg-black px-3 text-sm text-white outline-none focus:border-violet-300"
              />
              <select
                value={assetCode}
                onChange={(event) => setAssetCode(event.target.value)}
                className="min-h-12 border border-white/10 bg-black px-3 text-sm font-black text-white outline-none focus:border-violet-300"
              >
                <option value="USDC">USDC</option>
                <option value="XLM">XLM</option>
              </select>
              <button
                type="button"
                onClick={previewPayment}
                disabled={!hasWallet || !isValidPublicKey(destination) || apiState.loading}
                className="inline-flex min-h-12 items-center justify-center gap-2 bg-violet-200 px-4 py-2 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40"
              >
                Preview
              </button>
            </div>
            {preview ? (
              <div className="mt-5 border border-white/10 bg-black p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Preview result</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MiniStat label="Mode" value={preview.preview?.mode || preview.mode || "-"} />
                  <MiniStat label="Can submit" value={preview.preview?.can_submit ? "Yes" : "No"} />
                  <MiniStat label="Amount" value={`${preview.preview?.amount || "-"} ${preview.preview?.asset_code || ""}`} />
                  <MiniStat label="Destination" value={compactKey(preview.preview?.destination_public_key)} />
                </div>
                <p className="mt-3 text-sm text-slate-400">{preview.preview?.warning || preview.message}</p>
              </div>
            ) : null}
          </div>

          <div className="border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black text-white">Recent public operations</h2>
            <p className="mt-2 text-sm text-slate-400">
              Public Mainnet activity from the attached wallet. Nothing here changes the account.
            </p>
            <div className="mt-5 space-y-3">
              {operations.length ? operations.map((operation) => (
                <div key={operation.id} className="border border-white/10 bg-black p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-white">{operation.type || "operation"}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {operation.amount ? `${formatAmount(operation.amount)} ${operation.asset_code || ""}` : "No amount"}
                      </p>
                    </div>
                    {operation.explorer_tx_url ? (
                      <a href={operation.explorer_tx_url} target="_blank" rel="noreferrer" className="text-cyan-200">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <p>From: <span className="font-mono">{compactKey(operation.from)}</span></p>
                    <p>To: <span className="font-mono">{compactKey(operation.to)}</span></p>
                    <p>Tx: <span className="font-mono">{compactKey(operation.transaction_hash)}</span></p>
                    <p>{operation.created_at ? new Date(operation.created_at).toLocaleString() : "-"}</p>
                  </div>
                </div>
              )) : (
                <div className="border border-white/10 bg-black p-4 text-sm text-slate-400">
                  {hasWallet ? "No recent Mainnet operations found." : "Attach a wallet to inspect operations."}
                </div>
              )}
            </div>
          </div>
        </section>

          </>
        )}

        <section className="border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-lg font-black text-white">Network policy</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoBlock title="Default remains Testnet" body="Existing TalkToStellar wallet, PIX, quote and chat flows stay on the configured testnet runtime." />
            <InfoBlock title="Etherfuse is Testnet-only" body="PIX/TESOURO routes use Etherfuse only on the Testnet rail. Mainnet never runs Etherfuse PIX helpers." />
            <InfoBlock title="Mainnet is opt-in" body="Users can attach a public Mainnet wallet after login. Transaction submission remains gated by backend signer and approval settings." />
          </div>
        </section>
      </section>
    </main>
  );
}

function TestnetRailPanel({
  sessionAuthenticated,
  rampConfig,
  etherfuseAvailable,
}: {
  sessionAuthenticated: boolean;
  rampConfig: RampConfig | null;
  etherfuseAvailable: boolean;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-white">
              <QrCode className="h-5 w-5 text-emerald-200" />
              Testnet PIX rail
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              This is the active TalkToStellar product rail for PIX, Etherfuse sandbox, BRL/TESOURO settlement and testnet wallet flows.
            </p>
          </div>
          <span className={`border px-2 py-1 text-xs font-black uppercase tracking-[0.16em] ${etherfuseAvailable ? "border-emerald-300/30 text-emerald-200" : "border-amber-300/30 text-amber-200"}`}>
            {etherfuseAvailable ? "Ready" : "Check env"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <MiniStat label="Provider" value={rampConfig?.provider || "etherfuse"} />
          <MiniStat label="Network" value={rampConfig?.network || "Stellar Testnet"} />
          <MiniStat label="Mode" value={rampConfig?.sandbox ? "Sandbox/devnet" : "Unavailable"} />
          <MiniStat label="Asset" value={rampConfig?.asset?.code || "TESOURO"} />
        </div>

        {!etherfuseAvailable ? (
          <div className="mt-5 border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100">
            <p className="font-black">Etherfuse is intentionally Testnet-only here.</p>
            <p className="mt-2 leading-6">
              {rampConfig?.unavailable_reason || "Use STELLAR_NETWORK=TESTNET with Etherfuse sandbox credentials for PIX flows."}
            </p>
          </div>
        ) : (
          <div className="mt-5 border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100">
            <p className="font-black">Etherfuse PIX is available on the Testnet rail.</p>
            <p className="mt-2 leading-6">
              Mainnet wallet viewing stays separate and never routes through Etherfuse.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/pix-on" className="inline-flex min-h-11 items-center justify-center gap-2 bg-emerald-200 px-4 py-2 text-sm font-black text-black">
            <QrCode className="h-4 w-4" />
            PIX in
          </a>
          <a href="/pix-off" className="inline-flex min-h-11 items-center justify-center border border-white/15 px-4 py-2 text-sm font-black text-white">
            PIX out
          </a>
          <a href="/chat" className="inline-flex min-h-11 items-center justify-center border border-white/15 px-4 py-2 text-sm font-black text-white">
            Chat
          </a>
        </div>
      </div>

      <div className="border border-white/10 bg-white/[0.03] p-5">
        <h2 className="flex items-center gap-2 text-lg font-black text-white">
          <Landmark className="h-5 w-5 text-cyan-200" />
          What the toggle means
        </h2>
        <div className="mt-5 space-y-3">
          <InfoBlock
            title="Testnet is operational"
            body="Use this mode for PIX, Etherfuse sandbox, chat payments, quotes, conversions and demo flows that move through the current TalkToStellar app wallet."
          />
          <InfoBlock
            title="Mainnet is isolated"
            body="Switch to Mainnet only to attach a public wallet, read real balances and preview guarded interactions. It does not enable Etherfuse."
          />
          <InfoBlock
            title="No accidental real rail"
            body="If the backend runtime is changed to Stellar Public, Etherfuse endpoints refuse PIX/TESOURO operations instead of silently using a real-value network."
          />
        </div>
        {!sessionAuthenticated ? (
          <div className="mt-5 border border-white/10 bg-black p-4 text-sm text-slate-300">
            Sign in to use authenticated Testnet flows and attach a Mainnet public wallet.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-white" title={value}>{value}</p>
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-white/10 bg-black p-4">
      <p className="font-black text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
    </div>
  );
}
