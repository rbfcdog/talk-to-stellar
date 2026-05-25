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
    throw new Error(payload?.message || "Could not load PIX status.");
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
  const currentNetworkLabel = networkMode === "testnet" ? "Conta de validação" : "Mainnet";

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
    <main className="min-h-screen bg-black text-tts-surface">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-tts-border pb-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 border border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-tts-gold">
              <ShieldCheck className="h-4 w-4" />
              Ambiente da conta
            </div>
            <h1 className="text-3xl font-black tracking-tight text-tts-surface md:text-5xl">
              Carteira e saldo
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-tts-deep md:text-base">
              Alterne entre a conta de validação do produto e a visualização Mainnet. PIX fica separado do saldo real;
              Mainnet é opt-in, usa apenas chave pública e permanece em leitura até liberações operacionais.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:min-w-[320px]">
            <div className="grid grid-cols-2 border border-tts-border bg-tts-surface/[0.03] p-1">
              <button
                type="button"
                onClick={() => setNetworkMode("testnet")}
                className={`min-h-11 px-3 text-sm font-black ${networkMode === "testnet" ? "bg-tts-surface text-tts-deep" : "text-tts-deep hover:bg-tts-surface"}`}
              >
                Validação
              </button>
              <button
                type="button"
                onClick={() => setNetworkMode("mainnet")}
                className={`min-h-11 px-3 text-sm font-black ${networkMode === "mainnet" ? "bg-tts-gold text-tts-deep" : "text-tts-deep hover:bg-tts-surface"}`}
              >
                Mainnet
              </button>
            </div>
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep hover:bg-tts-surface"
            >
              {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh {currentNetworkLabel}
            </button>
          </div>
        </header>

        {apiState.error ? (
          <div className="flex items-start gap-3 border border-tts-error bg-tts-error/10 p-4 text-sm text-tts-error">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-black">Needs attention</p>
              <p className="mt-1 text-tts-error">{apiState.error}</p>
            </div>
          </div>
        ) : null}

        {apiState.message ? (
          <div className="border border-tts-confirm bg-tts-confirm/10 p-4 text-sm font-semibold text-tts-confirm">
            {apiState.message}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4">
          <Metric label="Modo selecionado" value={networkMode === "testnet" ? "Validação" : "Mainnet"} detail={currentNetworkLabel} />
          <Metric label="PIX" value={etherfuseAvailable ? "Ativo" : "Indisponível"} detail={rampConfig?.testnet_only ? "Somente validação" : "Status do pagamento"} />
          <Metric label="Envios Mainnet" value={status?.controls?.mutations_available ? "Protegido" : "Desligado"} detail="Leitura até liberação" />
          <Metric label="Ambiente padrão" value={status?.controls?.runtime_network || "-"} detail="Conta usada no produto" />
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
          <div className="border border-tts-border bg-tts-surface/[0.03] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black text-tts-surface">
                  <Wallet2 className="h-5 w-5 text-tts-gold" />
                  Mainnet wallet
                </h2>
                <p className="mt-2 text-sm text-tts-muted">
                  Attach only a public key. Secret keys, seed phrases and signing credentials must never be pasted here.
                </p>
              </div>
              <span className="border border-tts-border px-2 py-1 text-xs font-black uppercase tracking-[0.16em] text-tts-deep">
                Read only
              </span>
            </div>

            {!session.authenticated ? (
              <div className="mt-5 border border-tts-border bg-black p-4 text-sm text-tts-deep">
                Browser login is required before attaching a Mainnet wallet.
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href="/chat" className="inline-flex min-h-10 items-center justify-center bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep">
                    Open chat
                  </a>
                  <a href="/login" className="inline-flex min-h-10 items-center justify-center border border-tts-border px-4 py-2 text-sm font-black text-tts-surface">
                    Browser login
                  </a>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-3">
                  <label className="block text-xs font-black uppercase tracking-[0.16em] text-tts-muted">
                    Public Mainnet key
                  </label>
                  <input
                    value={publicKey}
                    onChange={(event) => setPublicKey(event.target.value.trim())}
                    placeholder="G..."
                    className="min-h-12 w-full border border-tts-border bg-black px-3 font-mono text-sm text-tts-surface outline-none focus:border-tts-gold"
                  />
                  <label className="block text-xs font-black uppercase tracking-[0.16em] text-tts-muted">
                    Wallet label
                  </label>
                  <input
                    value={walletLabel}
                    onChange={(event) => setWalletLabel(event.target.value)}
                    className="min-h-12 w-full border border-tts-border bg-black px-3 text-sm text-tts-surface outline-none focus:border-tts-gold"
                  />
                  <button
                    type="button"
                    onClick={attachWallet}
                    disabled={!canAttach || apiState.loading}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 bg-tts-gold px-4 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:bg-tts-surface disabled:text-tts-surface/40"
                  >
                    {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    Attach read-only wallet
                  </button>
                  {!canAttach && publicKey ? (
                    <p className="text-xs font-semibold text-tts-gold">
                      The key must be a Stellar public key beginning with G and 56 characters long.
                    </p>
                  ) : null}
                </div>

                <div className="mt-6 border border-tts-border bg-black p-4">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-muted">Attached wallet</p>
                  {hasWallet ? (
                    <div className="mt-3 space-y-3">
                      <p className="text-lg font-black text-tts-surface">{wallet?.label || "Mainnet wallet"}</p>
                      <p className="break-all font-mono text-xs text-tts-deep">{wallet?.public_key}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={refreshBalance}
                          className="inline-flex min-h-10 items-center gap-2 border border-tts-border px-3 py-2 text-sm font-black text-tts-surface"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Sync balance
                        </button>
                        {wallet?.explorer_url ? (
                          <a
                            href={wallet.explorer_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-10 items-center gap-2 border border-tts-border px-3 py-2 text-sm font-black text-tts-surface"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Explorer
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-tts-muted">
                      Nenhuma carteira Mainnet anexada ainda. Cada conta TalkToStellar pode anexar uma chave pública aqui sem alterar a conta de validação do produto.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="border border-tts-border bg-tts-surface/[0.03] p-5">
            <h2 className="flex items-center gap-2 text-lg font-black text-tts-surface">
              <Activity className="h-5 w-5 text-tts-confirm" />
              Mainnet balance
            </h2>
            <p className="mt-2 text-sm text-tts-muted">
              Leitura pública da rede Stellar. Esta tela mostra saldos reais da carteira anexada sem mover fundos.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {balances.length ? balances.map((item) => (
                <div key={`${item.asset_code}-${item.asset_issuer || "native"}`} className="border border-tts-border bg-black p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-muted">{item.asset_code}</p>
                      <p className="mt-2 text-2xl font-black text-tts-surface">{formatAmount(item.balance)}</p>
                    </div>
                    <span className="border border-tts-border px-2 py-1 text-xs font-bold text-tts-deep">
                      {item.asset_type === "native" ? "native" : "issued"}
                    </span>
                  </div>
                  {item.asset_issuer ? (
                    <p className="mt-3 break-all font-mono text-[11px] text-tts-muted">{item.asset_issuer}</p>
                  ) : null}
                </div>
              )) : (
                <div className="border border-tts-border bg-black p-4 text-sm text-tts-muted sm:col-span-2">
                  {hasWallet ? "No funded Mainnet balance found yet." : "Attach a public Mainnet wallet to show balances."}
                </div>
              )}
            </div>

            <div className="mt-5 border border-tts-border bg-black p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-muted">Account status</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <MiniStat label="Funded" value={balance?.funded === false ? "No" : balance?.funded ? "Yes" : "-"} />
                <MiniStat label="Sequence" value={balance?.sequence ? compactKey(balance.sequence) : "-"} />
                <MiniStat label="Synced" value={balance?.last_synced_at ? new Date(balance.last_synced_at).toLocaleTimeString() : "-"} />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="border border-tts-border bg-tts-surface/[0.03] p-5">
            <h2 className="flex items-center gap-2 text-lg font-black text-tts-surface">
              <Send className="h-5 w-5 text-tts-gold" />
              Guarded interaction preview
            </h2>
            <p className="mt-2 text-sm text-tts-muted">
              Validate a Mainnet payment shape without submitting. Real submission stays disabled unless signer, limits and manual approval are configured.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_120px]">
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value.trim())}
                placeholder="Destination G..."
                className="min-h-12 border border-tts-border bg-black px-3 font-mono text-sm text-tts-surface outline-none focus:border-tts-gold"
              />
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="1"
                className="min-h-12 border border-tts-border bg-black px-3 text-sm text-tts-surface outline-none focus:border-tts-gold"
              />
              <select
                value={assetCode}
                onChange={(event) => setAssetCode(event.target.value)}
                className="min-h-12 border border-tts-border bg-black px-3 text-sm font-black text-tts-surface outline-none focus:border-tts-gold"
              >
                <option value="USDC">USDC</option>
                <option value="EURC">EURC</option>
                <option value="XLM">XLM</option>
              </select>
              <button
                type="button"
                onClick={previewPayment}
                disabled={!hasWallet || !isValidPublicKey(destination) || apiState.loading}
                className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-gold px-4 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:bg-tts-surface disabled:text-tts-surface/40"
              >
                Preview
              </button>
            </div>
            {preview ? (
              <div className="mt-5 border border-tts-border bg-black p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-muted">Preview result</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MiniStat label="Mode" value={preview.preview?.mode || preview.mode || "-"} />
                  <MiniStat label="Can submit" value={preview.preview?.can_submit ? "Yes" : "No"} />
                  <MiniStat label="Amount" value={`${preview.preview?.amount || "-"} ${preview.preview?.asset_code || ""}`} />
                  <MiniStat label="Destination" value={compactKey(preview.preview?.destination_public_key)} />
                </div>
                <p className="mt-3 text-sm text-tts-muted">{preview.preview?.warning || preview.message}</p>
              </div>
            ) : null}
          </div>

          <div className="border border-tts-border bg-tts-surface/[0.03] p-5">
            <h2 className="text-lg font-black text-tts-surface">Recent public operations</h2>
            <p className="mt-2 text-sm text-tts-muted">
              Public Mainnet activity from the attached wallet. Nothing here changes the account.
            </p>
            <div className="mt-5 space-y-3">
              {operations.length ? operations.map((operation) => (
                <div key={operation.id} className="border border-tts-border bg-black p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-tts-surface">{operation.type || "operation"}</p>
                      <p className="mt-1 text-sm text-tts-muted">
                        {operation.amount ? `${formatAmount(operation.amount)} ${operation.asset_code || ""}` : "No amount"}
                      </p>
                    </div>
                    {operation.explorer_tx_url ? (
                      <a href={operation.explorer_tx_url} target="_blank" rel="noreferrer" className="text-tts-gold">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-tts-muted sm:grid-cols-2">
                    <p>From: <span className="font-mono">{compactKey(operation.from)}</span></p>
                    <p>To: <span className="font-mono">{compactKey(operation.to)}</span></p>
                    <p>Tx: <span className="font-mono">{compactKey(operation.transaction_hash)}</span></p>
                    <p>{operation.created_at ? new Date(operation.created_at).toLocaleString() : "-"}</p>
                  </div>
                </div>
              )) : (
                <div className="border border-tts-border bg-black p-4 text-sm text-tts-muted">
                  {hasWallet ? "No recent Mainnet operations found." : "Attach a wallet to inspect operations."}
                </div>
              )}
            </div>
          </div>
        </section>

          </>
        )}

        <section className="border border-tts-border bg-tts-surface/[0.03] p-5">
          <h2 className="text-lg font-black text-tts-surface">Política de uso</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoBlock title="Conta principal protegida" body="PIX, cotações e chat continuam no ambiente controlado do produto." />
            <InfoBlock title="PIX separado da Mainnet" body="Operações PIX não usam a carteira Mainnet anexada nesta tela." />
            <InfoBlock title="Mainnet é opcional" body="Usuários podem anexar uma carteira pública após login. Envio de transações continua bloqueado até liberação operacional." />
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
      <div className="border border-tts-border bg-tts-surface/[0.03] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-tts-surface">
              <QrCode className="h-5 w-5 text-tts-confirm" />
              PIX da conta de validação
            </h2>
            <p className="mt-2 text-sm leading-6 text-tts-muted">
              Este é o ambiente usado para PIX, cotações, pagamentos por chat e conferência de saldo antes de operações reais.
            </p>
          </div>
          <span className={`border px-2 py-1 text-xs font-black uppercase tracking-[0.16em] ${etherfuseAvailable ? "border-tts-confirm text-tts-confirm" : "border-tts-gold text-tts-gold"}`}>
            {etherfuseAvailable ? "Ready" : "Check env"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <MiniStat label="Pagamento" value={etherfuseAvailable ? "Ativo" : "Indisponível"} />
          <MiniStat label="Ambiente" value={rampConfig?.network ? "Validação" : "Pendente"} />
          <MiniStat label="Modo" value={rampConfig?.sandbox ? "Teste controlado" : "Indisponível"} />
          <MiniStat label="Saldo" value={rampConfig?.asset?.code || "BRL"} />
        </div>

        {!etherfuseAvailable ? (
          <div className="mt-5 border border-tts-gold bg-tts-gold-bg p-4 text-sm text-tts-gold">
            <p className="font-black">PIX está separado da Mainnet.</p>
            <p className="mt-2 leading-6">
              Confira as configurações do serviço de pagamento para usar PIX.
            </p>
          </div>
        ) : (
          <div className="mt-5 border border-tts-confirm bg-tts-confirm/10 p-4 text-sm text-tts-confirm">
            <p className="font-black">PIX está disponível na conta de validação.</p>
            <p className="mt-2 leading-6">
              A visualização Mainnet fica separada e não interfere nos pagamentos por PIX.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/pix-on" className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-confirm px-4 py-2 text-sm font-black text-tts-deep">
            <QrCode className="h-4 w-4" />
            PIX in
          </a>
          <a href="/pix-off" className="inline-flex min-h-11 items-center justify-center border border-tts-border px-4 py-2 text-sm font-black text-tts-surface">
            PIX out
          </a>
          <a href="/chat" className="inline-flex min-h-11 items-center justify-center border border-tts-border px-4 py-2 text-sm font-black text-tts-surface">
            Chat
          </a>
        </div>
      </div>

      <div className="border border-tts-border bg-tts-surface/[0.03] p-5">
        <h2 className="flex items-center gap-2 text-lg font-black text-tts-surface">
          <Landmark className="h-5 w-5 text-tts-gold" />
          What the toggle means
        </h2>
        <div className="mt-5 space-y-3">
          <InfoBlock
            title="Conta de validação ativa"
            body="Use este modo para PIX, pagamentos por chat, cotações e conversões na conta atual do TalkToStellar."
          />
          <InfoBlock
            title="Mainnet is isolated"
            body="Use Mainnet apenas para anexar uma carteira pública, ler saldos reais e pré-visualizar interações protegidas."
          />
          <InfoBlock
            title="Sem mistura de saldos"
            body="PIX e carteira Mainnet ficam isolados para evitar operações no ambiente errado."
          />
        </div>
        {!sessionAuthenticated ? (
          <div className="mt-5 border border-tts-border bg-black p-4 text-sm text-tts-deep">
            Entre na conta para usar PIX e anexar uma carteira pública Mainnet.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface/[0.03] p-4">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-muted">{label}</p>
      <p className="mt-2 text-xl font-black text-tts-surface">{value}</p>
      <p className="mt-1 text-sm text-tts-muted">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface/[0.03] p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.14em] text-tts-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-tts-surface" title={value}>{value}</p>
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-tts-border bg-black p-4">
      <p className="font-black text-tts-surface">{title}</p>
      <p className="mt-2 text-sm leading-6 text-tts-muted">{body}</p>
    </div>
  );
}
