"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Coins,
  Loader2,
  PiggyBank,
  QrCode,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { getClientSession } from "@/lib/session";

type ApiState = {
  loading: boolean;
  message: string;
  error: string;
};

type SessionState = {
  authenticated: boolean;
  sessionId?: string;
};

type BalanceLine = {
  asset_code: string;
  asset_type?: string;
  asset_issuer?: string;
  balance: string;
};

type RampConfig = {
  success?: boolean;
  provider?: string;
  sandbox?: boolean;
  available?: boolean;
  unavailable_reason?: string;
  asset?: {
    code?: string;
    issuer?: string;
    identifier?: string;
  };
};

type YieldOption = {
  asset_code: string;
  asset_issuer?: string;
  display_asset_code?: string;
  vault_address: string;
  label: string;
  network: string;
  apy?: Record<string, unknown>;
  apy_percent?: string;
  apy_period?: string;
  apy_error?: string;
};

type YieldStatus = {
  success?: boolean;
  runtime?: {
    configured?: boolean;
    api_key_configured?: boolean;
    network?: string;
    execution_enabled?: boolean;
    unavailable_reason?: string;
  };
  vaults?: YieldOption[];
};

type MoneyProfile = {
  name: string;
  short: string;
  description: string;
  tone: string;
};

const MONEY_PROFILES: Record<string, MoneyProfile> = {
  USDC: {
    name: "Dólares",
    short: "USD",
    description: "Para guardar em moeda forte.",
    tone: "border-tts-confirm/50 bg-tts-confirm/10 text-tts-confirm",
  },
  EURC: {
    name: "Euros",
    short: "EUR",
    description: "Para objetivos ligados à Europa.",
    tone: "border-tts-gold/60 bg-tts-gold-bg text-tts-gold",
  },
  TESOURO: {
    name: "Reais",
    short: "BRL",
    description: "Para entradas e saídas por PIX.",
    tone: "border-tts-border bg-tts-surface text-tts-deep",
  },
  BRL: {
    name: "Reais",
    short: "BRL",
    description: "Para entradas e saídas por PIX.",
    tone: "border-tts-border bg-tts-surface text-tts-deep",
  },
  XLM: {
    name: "Saldo operacional",
    short: "Operacional",
    description: "Usado pelo sistema para pequenas tarifas.",
    tone: "border-tts-border2 bg-tts-surface/[0.6] text-tts-muted",
  },
};

function moneyProfile(code?: string): MoneyProfile {
  const normalized = String(code || "").trim().toUpperCase();
  return MONEY_PROFILES[normalized] || {
    name: "Outra moeda",
    short: normalized || "Moeda",
    description: "Opção adicional da sua conta.",
    tone: "border-tts-border bg-tts-surface text-tts-deep",
  };
}

function optionCode(option?: YieldOption | null) {
  return String(option?.display_asset_code || option?.asset_code || "").trim().toUpperCase();
}

function optionTitle(option?: YieldOption | null) {
  const profile = moneyProfile(optionCode(option));
  if (profile.short === "BRL") return "Reserva em reais";
  if (profile.short === "USD") return "Reserva em dólares";
  if (profile.short === "EUR") return "Reserva em euros";
  return profile.name;
}

function formatAmount(value: unknown) {
  const parsed = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(parsed)) return String(value || "0");
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: parsed > 0 && parsed < 1 ? 4 : 2,
    maximumFractionDigits: 7,
  }).format(parsed);
}

function formatPercent(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(String(raw || "").replace("%", "").replace(",", "."));
  if (!Number.isFinite(parsed)) return "A consultar";
  return `${parsed.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")}%`;
}

function optionRate(option?: YieldOption | null) {
  return formatPercent(option?.apy_percent || option?.apy?.apyPercent || option?.apy?.apy_percent || option?.apy?.apy);
}

function sanitizeUiError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (!raw.trim()) return "Não foi possível concluir agora. Tente novamente.";
  if (/session|login|unauthor|auth|token|jwt/i.test(raw)) {
    return "Entre na sua conta para ver saldos e preparar rendimentos.";
  }
  if (/defindex|vault|xdr|horizon|stellar|mainnet|wallet|issuer|public key|secret|blockchain|crypto|cripto/i.test(raw)) {
    return "Ainda não foi possível carregar essa parte. Confira a configuração do serviço e tente novamente.";
  }
  return raw
    .replace(/Defindex/gi, "serviço de rendimento")
    .replace(/vault/gi, "opção")
    .replace(/wallet/gi, "conta")
    .replace(/asset/gi, "moeda");
}

async function financialApi(path: string, init?: RequestInit) {
  const response = await fetch(`/api/financial/mainnet/${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Não foi possível carregar os dados da conta.");
  }
  return payload;
}

async function rampConfigApi(): Promise<RampConfig> {
  const response = await fetch("/api/ramp/etherfuse/config", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Não foi possível carregar o status do PIX.");
  }
  return payload;
}

async function yieldApi(path: string, init?: RequestInit) {
  const response = await fetch(`/api/ramp/${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Não foi possível preparar a solicitação.");
  }
  return payload;
}

export default function RendimentosClient() {
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [rampConfig, setRampConfig] = useState<RampConfig | null>(null);
  const [yieldStatus, setYieldStatus] = useState<YieldStatus | null>(null);
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [selectedCode, setSelectedCode] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [variationBps, setVariationBps] = useState("100");
  const [pin, setPin] = useState("");
  const [yieldBalance, setYieldBalance] = useState<any | null>(null);
  const [yieldResult, setYieldResult] = useState<any | null>(null);
  const [apiState, setApiState] = useState<ApiState>({ loading: true, message: "", error: "" });

  const options = useMemo(() => Array.isArray(yieldStatus?.vaults) ? yieldStatus.vaults : [], [yieldStatus]);
  const selectedOption = useMemo(() => {
    return options.find((item) => optionCode(item) === selectedCode) || options[0] || null;
  }, [options, selectedCode]);
  const configured = Boolean(yieldStatus?.runtime?.configured);
  const confirmationEnabled = Boolean(yieldStatus?.runtime?.execution_enabled);
  const pixAvailable = Boolean(rampConfig?.available);
  const totalBalances = balances.length;
  const safeSelectedCode = optionCode(selectedOption) || selectedCode;
  const selectedProfile = moneyProfile(safeSelectedCode);
  const canPrepare = Boolean(session.authenticated && configured && selectedOption && Number(String(amount).replace(",", ".")) > 0);
  const balanceForSelected = balances.find((item) => String(item.asset_code || "").toUpperCase() === safeSelectedCode);

  async function refreshDashboard() {
    setApiState({ loading: true, message: "", error: "" });
    try {
      const [sessionPayload, rampPayload, statusPayload] = await Promise.all([
        getClientSession(),
        rampConfigApi().catch((error) => ({
          success: false,
          available: false,
          unavailable_reason: sanitizeUiError(error),
        })),
        yieldApi("defindex/yield/status").catch((error) => ({
          success: false,
          runtime: {
            configured: false,
            api_key_configured: false,
            execution_enabled: false,
            unavailable_reason: sanitizeUiError(error),
          },
          vaults: [],
        })),
      ]);

      setSession(sessionPayload);
      setRampConfig(rampPayload);
      setYieldStatus(statusPayload);

      const firstOption = Array.isArray(statusPayload?.vaults) ? statusPayload.vaults[0] : null;
      if (firstOption && !statusPayload.vaults.some((item: YieldOption) => optionCode(item) === selectedCode)) {
        setSelectedCode(optionCode(firstOption));
      }

      if (!sessionPayload.authenticated) {
        setBalances([]);
        setApiState({ loading: false, message: "Entre para ver seus saldos e preparar rendimentos.", error: "" });
        return;
      }

      const accountPayload = await financialApi("wallet").catch(() => ({ wallet: null }));
      if (accountPayload?.wallet?.public_key) {
        const balancePayload = await financialApi("balance").catch(() => ({ balances: [] }));
        setBalances(Array.isArray(balancePayload?.balances) ? balancePayload.balances : []);
      } else {
        setBalances([]);
      }

      setApiState({ loading: false, message: "Saldos e rendimentos atualizados.", error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error) });
    }
  }

  async function refreshYieldBalance() {
    if (!selectedOption) return;
    setApiState({ loading: true, message: "", error: "" });
    try {
      const payload = await yieldApi(`defindex/yield/balance?asset_code=${encodeURIComponent(selectedOption.asset_code)}&vault_address=${encodeURIComponent(selectedOption.vault_address)}`);
      setYieldBalance(payload);
      setApiState({ loading: false, message: "Saldo de rendimento atualizado.", error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error) });
    }
  }

  async function prepareYield() {
    if (!selectedOption) return;
    setApiState({ loading: true, message: "", error: "" });
    setYieldResult(null);
    try {
      const payload = await yieldApi("defindex/yield/prepare", {
        method: "POST",
        body: JSON.stringify({
          action,
          amount,
          asset_code: selectedOption.asset_code,
          vault_address: selectedOption.vault_address,
          slippage_bps: variationBps,
        }),
      });
      setYieldResult(payload);
      setApiState({ loading: false, message: "Solicitação pronta. Revise e confirme quando quiser.", error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error) });
    }
  }

  async function confirmYield() {
    if (!selectedOption) return;
    setApiState({ loading: true, message: "", error: "" });
    setYieldResult(null);
    try {
      const payload = await yieldApi("defindex/yield/execute", {
        method: "POST",
        body: JSON.stringify({
          action,
          amount,
          asset_code: selectedOption.asset_code,
          vault_address: selectedOption.vault_address,
          slippage_bps: variationBps,
          pin,
          wallet_pin: pin,
        }),
      });
      setYieldResult(payload);
      setPin("");
      setApiState({ loading: false, message: "Pedido confirmado. Vamos atualizar seus saldos em instantes.", error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error) });
    }
  }

  useEffect(() => {
    refreshDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-5 border-b border-tts-border pb-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 border border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-tts-gold">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              Rendimentos
            </div>
            <h1 className="max-w-3xl text-3xl font-black tracking-tight text-tts-deep md:text-5xl">
              Saldos que trabalham por você
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-tts-muted md:text-base">
              Veja seu dinheiro por moeda, escolha quanto quer deixar rendendo e confirme tudo com calma. A tela prioriza nomes simples, valores claros e ações reversíveis.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={refreshDashboard}
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
            >
              {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              Atualizar saldos
            </button>
            <a
              href="/chat"
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Acessar minha conta
            </a>
          </div>
        </header>

        {apiState.error ? (
          <div className="flex items-start gap-3 border border-tts-error bg-tts-error/10 p-4 text-sm text-tts-error" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-black">Precisa de atenção</p>
              <p className="mt-1">{apiState.error}</p>
            </div>
          </div>
        ) : null}

        {apiState.message ? (
          <div className="border border-tts-confirm bg-tts-confirm/10 p-4 text-sm font-semibold text-tts-confirm" aria-live="polite">
            {apiState.message}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4" aria-label="Resumo da conta">
          <Metric label="Moedas na conta" value={String(totalBalances || options.length || 0)} detail="Saldos disponíveis" />
          <Metric label="Opções rendendo" value={String(options.length)} detail={configured ? "Prontas para simular" : "Aguardando configuração"} />
          <Metric label="PIX" value={pixAvailable ? "Disponível" : "Pendente"} detail="Entrada e retirada em reais" />
          <Metric label="Confirmação" value={confirmationEnabled ? "Ativa" : "Em preparo"} detail={confirmationEnabled ? "PIN habilitado" : "Somente revisão"} />
        </section>

        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <BalancePanel balances={balances} options={options} selectedCode={safeSelectedCode} onSelect={setSelectedCode} />

          <section className="border border-tts-border bg-tts-surface p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                  <PiggyBank className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                  Plano de rendimento
                </h2>
                <p className="mt-2 text-sm leading-6 text-tts-muted">
                  Escolha uma moeda, informe o valor e revise antes de confirmar.
                </p>
              </div>
              <button
                type="button"
                aria-pressed={advancedOpen}
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {advancedOpen ? "Ocultar ajustes" : "Modo avançado"}
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Moeda para rendimento">
              {options.length ? options.map((option) => {
                const code = optionCode(option);
                const profile = moneyProfile(code);
                const selected = code === safeSelectedCode;
                return (
                  <button
                    key={`${option.asset_code}-${option.vault_address}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setSelectedCode(code);
                      setYieldBalance(null);
                      setYieldResult(null);
                    }}
                    className={`min-h-[128px] border p-4 text-left transition ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"}`}
                  >
                    <span className={`inline-flex border px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${profile.tone}`}>
                      {profile.short}
                    </span>
                    <span className="mt-3 block text-lg font-black text-tts-deep">{optionTitle(option)}</span>
                    <span className="mt-1 block text-sm text-tts-muted">{profile.description}</span>
                    <span className="mt-3 inline-flex items-center gap-2 text-sm font-black text-tts-confirm">
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      {optionRate(option)} ao ano
                    </span>
                  </button>
                );
              }) : (
                <div className="border border-tts-gold bg-tts-gold-bg p-4 text-sm text-tts-gold md:col-span-3">
                  As opções de rendimento ainda não foram configuradas para este ambiente.
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
              <div className="border border-tts-border bg-tts-bg p-4">
                <div className="grid grid-cols-2 gap-2 border border-tts-border bg-tts-surface p-1">
                  <button
                    type="button"
                    onClick={() => setAction("deposit")}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black whitespace-nowrap ${action === "deposit" ? "bg-tts-confirm text-tts-deep" : "text-tts-muted"}`}
                  >
                    <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction("withdraw")}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black whitespace-nowrap ${action === "withdraw" ? "bg-tts-gold text-tts-deep" : "text-tts-muted"}`}
                  >
                    <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                    Resgatar
                  </button>
                </div>

                <label className="mt-4 block text-sm font-black text-tts-deep" htmlFor="yield-amount">
                  Valor em {selectedProfile.name.toLowerCase()}
                </label>
                <input
                  id="yield-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d,.]/g, ""))}
                  inputMode="decimal"
                  className="mt-2 min-h-12 w-full border border-tts-border bg-tts-surface px-3 text-base font-bold text-tts-deep outline-none focus:border-tts-gold"
                  aria-describedby="yield-amount-help"
                />
                <p id="yield-amount-help" className="mt-2 text-xs leading-5 text-tts-muted">
                  Você pode revisar antes de confirmar. Nenhum valor sai sem PIN.
                </p>

                {advancedOpen ? (
                  <div className="mt-4 border-t border-tts-border pt-4">
                    <label className="block text-sm font-black text-tts-deep" htmlFor="yield-variation">
                      Margem de segurança
                    </label>
                    <select
                      id="yield-variation"
                      value={variationBps}
                      onChange={(event) => setVariationBps(event.target.value)}
                      className="mt-2 min-h-12 w-full border border-tts-border bg-tts-surface px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                    >
                      <option value="50">Baixa</option>
                      <option value="100">Padrão</option>
                      <option value="200">Alta</option>
                    </select>

                    <label className="mt-4 block text-sm font-black text-tts-deep" htmlFor="yield-pin">
                      PIN para confirmar
                    </label>
                    <input
                      id="yield-pin"
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                      inputMode="numeric"
                      type="password"
                      className="mt-2 min-h-12 w-full border border-tts-border bg-tts-surface px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                    />
                  </div>
                ) : null}

                <div className="mt-5 grid gap-2">
                  <button
                    type="button"
                    onClick={refreshYieldBalance}
                    disabled={!canPrepare || apiState.loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border px-3 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Ver saldo
                  </button>
                  <button
                    type="button"
                    onClick={prepareYield}
                    disabled={!canPrepare || apiState.loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    Revisar
                  </button>
                  <button
                    type="button"
                    onClick={confirmYield}
                    disabled={!canPrepare || !confirmationEnabled || pin.length < 4 || apiState.loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-gold px-3 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Confirmar
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                <ReviewPanel
                  action={action}
                  amount={amount}
                  profile={selectedProfile}
                  option={selectedOption}
                  balanceForSelected={balanceForSelected}
                  yieldBalance={yieldBalance}
                  result={yieldResult}
                  confirmationEnabled={confirmationEnabled}
                />
              </div>
            </div>
          </section>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <ActionLink href="/pix-on" icon={<QrCode className="h-4 w-4" aria-hidden="true" />} title="Adicionar por PIX" body="Coloque reais na conta e acompanhe o saldo aqui." />
          <ActionLink href="/pix-off" icon={<ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />} title="Retirar por PIX" body="Envie saldo para uma chave PIX escolhida por você." />
          <ActionLink href="/chat" icon={<Sparkles className="h-4 w-4" aria-hidden="true" />} title="Pedir ajuda" body="Use linguagem natural para saldo, PIX e rendimentos." />
        </section>

        <section className="border border-tts-border bg-tts-surface p-5">
          <h2 className="text-lg font-black text-tts-deep">Antes de confirmar</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoBlock title="Você escolhe a moeda" body="Dólares, euros e reais aparecem com nomes simples para reduzir erro de seleção." />
            <InfoBlock title="Nada é automático" body="A tela prepara a solicitação primeiro. A confirmação final depende do seu PIN." />
            <InfoBlock title="PIX fica separado" body="Entrada e retirada em reais continuam em botões próprios para ficar claro o caminho do dinheiro." />
          </div>
        </section>
      </section>
    </main>
  );
}

function BalancePanel({
  balances,
  options,
  selectedCode,
  onSelect,
}: {
  balances: BalanceLine[];
  options: YieldOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  const balanceItems: BalanceLine[] = balances.length
    ? balances
    : options.map((option) => ({
      asset_code: optionCode(option),
      balance: "0",
    }));

  return (
    <section className="border border-tts-border bg-tts-surface p-5">
      <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
        <Coins className="h-5 w-5 text-tts-gold" aria-hidden="true" />
        Seus saldos
      </h2>
      <p className="mt-2 text-sm leading-6 text-tts-muted">
        Toque em uma moeda para usar no plano de rendimento.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {balanceItems.length ? balanceItems.map((item) => {
          const code = String(item.asset_code || "").toUpperCase();
          const profile = moneyProfile(code);
          const selected = code === selectedCode;
          return (
            <button
              key={`${code}-${item.asset_issuer || "default"}`}
              type="button"
              onClick={() => onSelect(code)}
              className={`min-h-[128px] border p-4 text-left transition ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"}`}
            >
              <span className={`inline-flex border px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${profile.tone}`}>
                {profile.short}
              </span>
              <span className="mt-3 block text-2xl font-black text-tts-deep">{formatAmount(item.balance)}</span>
              <span className="mt-1 block text-sm font-bold text-tts-muted">{profile.name}</span>
              <span className="mt-3 block text-xs leading-5 text-tts-muted">{profile.description}</span>
            </button>
          );
        }) : (
          <div className="border border-tts-border bg-tts-bg p-4 text-sm leading-6 text-tts-muted sm:col-span-2">
            Entre na sua conta para carregar seus saldos.
          </div>
        )}
      </div>
    </section>
  );
}

function ReviewPanel({
  action,
  amount,
  profile,
  option,
  balanceForSelected,
  yieldBalance,
  result,
  confirmationEnabled,
}: {
  action: "deposit" | "withdraw";
  amount: string;
  profile: MoneyProfile;
  option: YieldOption | null;
  balanceForSelected?: BalanceLine;
  yieldBalance: any | null;
  result: any | null;
  confirmationEnabled: boolean;
}) {
  return (
    <section className="border border-tts-border bg-tts-bg p-4">
      <h3 className="text-base font-black text-tts-deep">Resumo antes do PIN</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniStat label="Ação" value={action === "deposit" ? "Guardar rendendo" : "Resgatar"} />
        <MiniStat label="Valor" value={`${formatAmount(amount)} ${profile.short}`} />
        <MiniStat label="Moeda" value={profile.name} />
        <MiniStat label="Rendimento" value={optionRate(option)} />
        <MiniStat label="Saldo na conta" value={balanceForSelected ? formatAmount(balanceForSelected.balance) : "A consultar"} />
        <MiniStat label="Saldo rendendo" value={yieldBalance?.balance ? formatAmount(yieldBalance.balance) : "A consultar"} />
      </div>

      <div className="mt-4 border border-tts-border bg-tts-surface p-4 text-sm leading-6 text-tts-muted">
        {result ? (
          <p className="font-bold text-tts-confirm">
            Solicitação preparada. Revise os valores e confirme apenas se estiver tudo certo.
          </p>
        ) : (
          <p>
            Primeiro revise a solicitação. Depois, se a confirmação estiver disponível, use seu PIN para concluir.
          </p>
        )}
      </div>

      {!confirmationEnabled ? (
        <div className="mt-3 border border-tts-gold bg-tts-gold-bg p-3 text-sm font-bold text-tts-gold">
          A confirmação final ainda está em preparo neste ambiente.
        </div>
      ) : null}
    </section>
  );
}

function ActionLink({ href, icon, title, body }: { href: string; icon: ReactNode; title: string; body: string }) {
  return (
    <a href={href} className="group border border-tts-border bg-tts-surface p-5 transition hover:border-tts-border2">
      <span className="inline-flex h-10 w-10 items-center justify-center bg-tts-deep text-tts-surface">
        {icon}
      </span>
      <span className="mt-4 block text-lg font-black text-tts-deep">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-tts-muted">{body}</span>
    </a>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">{label}</p>
      <p className="mt-2 text-xl font-black text-tts-deep">{value}</p>
      <p className="mt-1 text-sm leading-5 text-tts-muted">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-tts-muted">{label}</p>
      <p className="mt-1 text-sm font-black text-tts-deep">{value}</p>
    </div>
  );
}

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-tts-border bg-tts-bg p-4">
      <p className="font-black text-tts-deep">{title}</p>
      <p className="mt-2 text-sm leading-6 text-tts-muted">{body}</p>
    </div>
  );
}
