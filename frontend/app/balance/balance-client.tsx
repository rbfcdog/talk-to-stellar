"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Eye, Loader2, RefreshCw, Wallet2 } from "lucide-react";
import { AccountStatusCard } from "@/components/shared/account-status";
import { SecurePinGate } from "@/components/shared/secure-pin-gate";
import { calculateAssetDistribution } from "@/lib/asset-distribution";
import { formatCustomerNumber } from "@/lib/customer-amount";
import { getClientSession } from "@/lib/session";

type BalanceLine = {
  asset_code?: string | null;
  asset?: string | null;
  balance?: string | null;
};

const ORDERED_ASSETS = ["BRL", "USDC", "CETES", "XLM"];

function normalizeAsset(value?: string | null) {
  const code = String(value || "").trim().toUpperCase().replace(/^USD$/, "USDC");
  if (code === "TESOURO" || code === "REAL" || code === "REAIS" || code === "R$") return "BRL";
  if (code === "EUR" || code === "EURC") return "CETES";
  return code;
}

function toNumber(value?: string | null) {
  const parsed = Number(String(value || "0").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAssetAmount(value: number, asset: string) {
  const display = formatCustomerNumber(value, "pt-BR");
  if (asset === "BRL") return `R$ ${display}`;
  if (asset === "USDC") return `US$ ${display}`;
  if (asset === "CETES") return `${display} CETES`;
  if (asset === "XLM") return `${display} XLM`;
  return `${display} ${asset}`;
}

function scopedPath(path: string, source?: string) {
  const cleanPath = path.replace(/^\/+/, "");
  const normalizedSource = String(source || "").trim().toLowerCase();
  const params = new URLSearchParams();
  if (normalizedSource) {
    params.set("source", normalizedSource);
    params.set("session_scope", normalizedSource);
  }
  const qs = params.toString();
  return `/api/ramp/${cleanPath}${qs ? `?${qs}` : ""}`;
}

function buildBalanceRows(input: BalanceLine[]) {
  const byAsset = new Map<string, number>();
  for (const item of input) {
    const asset = normalizeAsset(item.asset_code || item.asset);
    if (!asset) continue;
    byAsset.set(asset, (byAsset.get(asset) || 0) + toNumber(item.balance));
  }

  const assets = [
    ...ORDERED_ASSETS,
    ...Array.from(byAsset.keys()).filter((asset) => !ORDERED_ASSETS.includes(asset)).sort(),
  ];

  return assets.map((asset) => ({
    asset,
    value: byAsset.get(asset) || 0,
  }));
}

export default function BalanceClient() {
  const [sessionId, setSessionId] = useState("");
  const [sessionSource, setSessionSource] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [pinVerified, setPinVerified] = useState(false);
  const [status, setStatus] = useState<"checking" | "locked" | "loading" | "ready" | "error">("checking");
  const [message, setMessage] = useState("");
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    getClientSession().then(({ sessionId: sid, authenticated: isAuthenticated, sessionSource: source }) => {
      setSessionId(sid);
      setSessionSource(source);
      setAuthenticated(Boolean(isAuthenticated));
      setStatus(isAuthenticated && sid ? "locked" : "error");
      if (!sid || !isAuthenticated) setMessage("Entre na conta para ver seu saldo.");
    });
  }, []);

  async function loadBalances(source = sessionSource) {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(scopedPath("etherfuse/wallet-balances", source), { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Não foi possível carregar o saldo.");
      }
      setBalances(Array.isArray(payload?.balances) ? payload.balances : []);
      setUpdatedAt(new Date().toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }));
      setStatus("ready");
    } catch (error) {
      setBalances([]);
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Falha ao carregar saldo.");
    }
  }

  const rows = useMemo(() => buildBalanceRows(balances), [balances]);
  const distributionRows = useMemo(() => calculateAssetDistribution(rows), [rows]);

  return (
    <main className="min-h-screen bg-[#070707] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-black uppercase tracking-normal text-white/55">
              <Eye className="h-4 w-4" aria-hidden="true" />
              Saldo da conta
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-normal text-white sm:text-4xl">Sua conta</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/58">
              Digite seu PIN para ver saldo, XLM e outros ativos.
            </p>
          </div>
          {status === "ready" ? (
            <button
              type="button"
              onClick={() => void loadBalances()}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white transition hover:bg-white/[0.1]"
              aria-label="Atualizar saldo"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </header>

        <AccountStatusCard
          state={status === "checking" ? "loading" : authenticated ? "connected" : "signed-out"}
          title={authenticated ? "Conta conectada" : undefined}
          detail={authenticated ? "Digite seu PIN para ver os valores." : "Entre para abrir sua conta."}
          ctaHref="/login?next=/balance"
          ctaLabel="Entrar"
          className="border-white/10 bg-white/[0.06] text-white [&_*]:!text-white"
        />

        {authenticated && !pinVerified ? (
          <SecurePinGate
            sessionSource={sessionSource}
            title="Desbloquear saldo"
            detail="Use seu PIN para ver o saldo desta sessão. Nada é mostrado no chat."
            disabled={!sessionId}
            onVerified={() => {
              setPinVerified(true);
              void loadBalances();
            }}
          />
        ) : null}

        {pinVerified ? (
          <section className="rounded-3xl border border-white/10 bg-[#101010] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            {status === "loading" ? (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <Loader2 className="h-7 w-7 animate-spin text-white/55" aria-hidden="true" />
                <p className="mt-3 text-sm font-black text-white">Carregando saldo</p>
                <p className="mt-1 text-xs text-white/45">Buscando valores atuais da sua conta.</p>
              </div>
            ) : null}

            {status === "error" ? (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <p className="text-base font-black text-white">Não foi possível carregar</p>
                <p className="mt-1 max-w-sm text-sm leading-6 text-white/55">{message || "Tente novamente em alguns segundos."}</p>
                <button
                  type="button"
                  onClick={() => void loadBalances()}
                  className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-black text-black"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Tentar de novo
                </button>
              </div>
            ) : null}

            {status === "ready" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-normal text-white/45">Atualizado</p>
                    <p className="mt-1 text-sm font-bold text-white/72">{updatedAt || "agora"}</p>
                  </div>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black">
                    <Wallet2 className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {rows.map((row) => (
                    <div key={row.asset} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <p className="text-xs font-black uppercase tracking-normal text-white/42">{row.asset === "USDC" ? "USD" : row.asset}</p>
                      <p className="mt-2 text-xl font-black text-white">{formatAssetAmount(row.value, row.asset)}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black text-white">Distribuição</p>
                    <p className="text-xs font-bold text-white/42">{distributionRows.length || 0} ativos com saldo</p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {distributionRows.length === 0 ? (
                      <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm font-bold text-white/45">
                        Sem saldo para distribuir.
                      </p>
                    ) : distributionRows.map((row) => (
                      <div key={`bar-${row.asset}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)_4rem] items-center gap-3">
                        <span className="text-xs font-black text-white/55">{row.asset === "USDC" ? "USD" : row.asset}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-white/10">
                          <span className="block h-full rounded-full bg-white" style={{ width: `${row.barPercent}%` }} />
                        </span>
                        <span className="text-right text-xs font-bold text-white/45">{row.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <a href="/pix-on" className="inline-flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white transition hover:bg-white/[0.1]">
                    Colocar dinheiro
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                  <a href="/transactions" className="inline-flex min-h-12 items-center justify-between rounded-2xl border border-white/10 bg-white/[0.06] px-4 text-sm font-black text-white transition hover:bg-white/[0.1]">
                    Ver histórico
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
