"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRightLeft,
  Coins,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { normalizeLanguage, useLanguage, type AppLanguage } from "@/lib/i18n";
import { getClientSession } from "@/lib/session";

type AssetOption = {
  code: string;
  short: string;
  namePt: string;
  nameEn: string;
  promptPt: string;
  promptEn: string;
  descriptionPt: string;
  descriptionEn: string;
  tone: string;
  demoBrl: number;
  annualRate: number;
};

type YieldStatus = {
  vaults?: Array<{
    asset_code?: string;
    display_asset_code?: string;
    apy_percent?: string;
    apy?: Record<string, unknown>;
  }>;
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

const ASSETS: AssetOption[] = [
  {
    code: "BRL",
    short: "BRL",
    namePt: "Reais",
    nameEn: "Reais",
    promptPt: "reais",
    promptEn: "BRL",
    descriptionPt: "Saldo em reais da sua conta.",
    descriptionEn: "Reais balance in your account.",
    tone: "border-tts-border bg-tts-surface text-tts-deep",
    demoBrl: 1,
    annualRate: 0.105,
  },
  {
    code: "USDC",
    short: "USD",
    namePt: "Dólares",
    nameEn: "Dollars",
    promptPt: "dólares",
    promptEn: "dollars",
    descriptionPt: "Para guardar em moeda forte.",
    descriptionEn: "For holding money in dollars.",
    tone: "border-tts-confirm/50 bg-tts-confirm/10 text-tts-confirm",
    demoBrl: 5.2,
    annualRate: 0.045,
  },
  {
    code: "CETES",
    short: "CETES",
    namePt: "Rendimento México",
    nameEn: "Mexico yield",
    promptPt: "CETES",
    promptEn: "CETES",
    descriptionPt: "Opção testnet disponível para rendimento.",
    descriptionEn: "Testnet option available for earning.",
    tone: "border-tts-gold/60 bg-tts-gold-bg text-tts-gold",
    demoBrl: 0.3,
    annualRate: 0.0875,
  },
  {
    code: "XLM",
    short: "XLM",
    namePt: "Reserva da conta",
    nameEn: "Account reserve",
    promptPt: "XLM",
    promptEn: "XLM",
    descriptionPt: "Usado para manter a conta funcionando.",
    descriptionEn: "Used to keep the account working.",
    tone: "border-tts-border2 bg-tts-surface text-tts-muted",
    demoBrl: 0.7,
    annualRate: 0,
  },
];

function localCopy(language: AppLanguage, pt: string, en: string) {
  return language === "pt-BR" ? pt : en;
}

function normalizeAssetCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase().split(":")[0];
  if (!code || code === "USD" || code === "DOLLAR" || code === "DOLLARS") return "USDC";
  if (code === "EUR" || code === "EURC" || code === "EURO" || code === "EUROS") return "CETES";
  if (code === "TESOURO" || code === "REAL" || code === "REAIS" || code === "R$") return "BRL";
  return ASSETS.some((asset) => asset.code === code) ? code : "USDC";
}

function parseAmount(value: unknown) {
  const raw = String(value || "0").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatDecimal(value: number, language: AppLanguage, maximumFractionDigits = 2) {
  return new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : "en-US", {
    minimumFractionDigits: value > 0 && value < 1 ? Math.min(4, maximumFractionDigits) : 2,
    maximumFractionDigits,
  }).format(value);
}

function assetName(asset: AssetOption, language: AppLanguage) {
  return localCopy(language, asset.namePt, asset.nameEn);
}

function assetPromptName(asset: AssetOption, language: AppLanguage) {
  return localCopy(language, asset.promptPt, asset.promptEn);
}

function assetDescription(asset: AssetOption, language: AppLanguage) {
  return localCopy(language, asset.descriptionPt, asset.descriptionEn);
}

function getAsset(code: string) {
  return ASSETS.find((asset) => asset.code === code) || ASSETS[1];
}

function buildUrl(path: string, params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) search.set(key, text);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function accountAssetCode(code: string) {
  if (code === "BRL") return "TESOURO";
  return code;
}

function balanceForAsset(balances: BalanceLine[], code: string) {
  const accountCode = accountAssetCode(code);
  return balances.find((item) => String(item.asset_code || "").trim().toUpperCase() === accountCode);
}

function hasEnoughBalance(balance: BalanceLine | undefined, amount: number) {
  if (!balance || amount <= 0) return false;
  const available = Number(String(balance.balance || "0").replace(",", "."));
  return Number.isFinite(available) && available >= amount;
}

async function financialApi(path: string) {
  const response = await fetch(`/api/financial/mainnet/${path}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Não foi possível carregar os dados da conta.");
  }
  return payload;
}

function rateFromYieldOption(option: any) {
  const raw = option?.apy_percent || option?.apy?.apyPercent || option?.apy?.apy_percent || option?.apy?.apy;
  const text = Array.isArray(raw) ? String(raw[0] || "") : String(raw || "");
  const parsed = Number(text.replace("%", "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed / 100 : null;
}

function buildProjectionData(amount: number, annualRate: number, language: AppLanguage) {
  const monthlyRate = annualRate / 12;
  return Array.from({ length: 13 }, (_, month) => {
    const balance = amount * Math.pow(1 + monthlyRate, month);
    return {
      month,
      label: month === 0 ? localCopy(language, "Hoje", "Today") : `${month}m`,
      balance: Number(balance.toFixed(2)),
      earned: Number(Math.max(0, balance - amount).toFixed(2)),
    };
  });
}

export default function ConvertClient({ initialQuery = "" }: { initialQuery?: string }) {
  const { language, setLanguage } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const appliedInitialQueryRef = useRef(false);
  const [amount, setAmount] = useState("500");
  const [sourceCode, setSourceCode] = useState("BRL");
  const [destCode, setDestCode] = useState("USDC");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [safetyMode, setSafetyMode] = useState("balanced");
  const [yieldStatus, setYieldStatus] = useState<YieldStatus | null>(null);
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [accountStatus, setAccountStatus] = useState<"loading" | "ready" | "signed-out">("loading");

  useEffect(() => {
    if (appliedInitialQueryRef.current) return;
    appliedInitialQueryRef.current = true;
    const params = new URLSearchParams(initialQuery || (typeof window !== "undefined" ? window.location.search : ""));
    const nextLanguage = params.get("lang") || params.get("language");
    if (nextLanguage) setLanguage(normalizeLanguage(nextLanguage));
    const queryAmount = params.get("amount") || params.get("source_amount") || "";
    const querySource = params.get("source_asset") || params.get("source_asset_code") || params.get("from_asset") || "";
    const queryDest = params.get("dest_asset") || params.get("dest_asset_code") || params.get("to_asset") || "";
    if (parseAmount(queryAmount) > 0) setAmount(queryAmount);
    if (querySource) setSourceCode(normalizeAssetCode(querySource));
    if (queryDest) setDestCode(normalizeAssetCode(queryDest));
    if (params.get("advanced") === "1" || params.get("advanced") === "true") setAdvancedOpen(true);
  }, [initialQuery, setLanguage]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/ramp/defindex/yield/status", { cache: "no-store" })
        .then((response) => response.json())
        .catch(() => null),
      getClientSession()
        .then(async (sessionPayload) => {
          if (!sessionPayload.authenticated) return { sessionPayload, balancesPayload: [] };
          const accountPayload = await financialApi("wallet").catch(() => ({ wallet: null }));
          if (!accountPayload?.wallet?.public_key) return { sessionPayload, balancesPayload: [] };
          const balancePayload = await financialApi("balance").catch(() => ({ balances: [] }));
          return { sessionPayload, balancesPayload: Array.isArray(balancePayload?.balances) ? balancePayload.balances : [] };
        })
        .catch(() => ({ sessionPayload: { authenticated: false }, balancesPayload: [] })),
    ])
      .then(([yieldPayload, accountPayload]) => {
        if (!active) return;
        setYieldStatus(yieldPayload);
        setSession(accountPayload.sessionPayload);
        setBalances(accountPayload.balancesPayload);
        setAccountStatus(accountPayload.sessionPayload.authenticated ? "ready" : "signed-out");
      })
      .catch(() => {
        if (!active) return;
        setYieldStatus(null);
        setSession({ authenticated: false });
        setBalances([]);
        setAccountStatus("signed-out");
      });
    return () => {
      active = false;
    };
  }, []);

  const sourceAsset = getAsset(sourceCode);
  const destAsset = getAsset(destCode);
  const numericAmount = parseAmount(amount);
  const sourceBalance = balanceForAsset(balances, sourceCode);
  const sourceBalanceDisplay = sourceBalance ? `${formatDecimal(Number(String(sourceBalance.balance || "0").replace(",", ".")), language, 7)} ${sourceAsset.short}` : L("A consultar", "Pending");
  const enoughBalance = hasEnoughBalance(sourceBalance, numericAmount);
  const estimatedDestination = numericAmount > 0
    ? (numericAmount * sourceAsset.demoBrl) / destAsset.demoBrl
    : 0;
  const destinationYieldRate = useMemo(() => {
    const option = (yieldStatus?.vaults || []).find((item) => {
      const code = normalizeAssetCode(item.display_asset_code || item.asset_code);
      return code === destAsset.code;
    });
    return rateFromYieldOption(option as any) ?? destAsset.annualRate;
  }, [destAsset, yieldStatus]);
  const projectionData = useMemo(
    () => buildProjectionData(estimatedDestination, destinationYieldRate, language),
    [destinationYieldRate, estimatedDestination, language]
  );
  const earnedAfterYear = projectionData[projectionData.length - 1]?.earned || 0;
  const conversionPrompt = language === "pt-BR"
    ? `converter ${amount || "0"} ${assetPromptName(sourceAsset, language)} para ${assetPromptName(destAsset, language)}`
    : `convert ${amount || "0"} ${assetPromptName(sourceAsset, language)} to ${assetPromptName(destAsset, language)}`;
  const chatUrl = buildUrl("/chat", { prompt: conversionPrompt, lang: language });
  const confirmReviewUrl = chatUrl;
  const yieldUrl = buildUrl("/yield", {
    asset: destAsset.code,
    amount: estimatedDestination > 0 ? estimatedDestination.toFixed(2) : amount,
    advanced: "1",
    from: "convert",
    lang: language,
  });
  const conversionRows = [
    { label: L("Você troca", "You convert"), value: `${formatDecimal(numericAmount, language, 7)} ${sourceAsset.short}` },
    { label: L("Você recebe", "You receive"), value: `${formatDecimal(estimatedDestination, language, 7)} ${destAsset.short}` },
    { label: L("Pode render em 12 meses", "May earn in 12 months"), value: `${formatDecimal(earnedAfterYear, language, 7)} ${destAsset.short}` },
  ];

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-tts-border pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 border border-tts-confirm bg-tts-confirm/10 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-tts-confirm">
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              {L("Conversão de saldos", "Balance conversion")}
            </div>
            <h1 className="max-w-2xl text-3xl font-black tracking-tight text-tts-deep md:text-4xl">
              {L("Converter dentro da conta", "Convert inside your account")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-tts-muted md:text-base">
              {L(
                "Escolha o saldo de origem, a moeda de destino e revise o impacto antes de confirmar.",
                "Choose the source balance, destination currency, and review the impact before confirming."
              )}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 md:min-w-[320px]">
            <a
              href={confirmReviewUrl}
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {L("Revisar conversão", "Review conversion")}
            </a>
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "pt-BR" : "en")}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {language === "en" ? "Português" : "English"}
            </button>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-3" aria-label={L("Resumo da conversão", "Conversion summary")}>
          {conversionRows.map((row) => (
            <Metric key={row.label} label={row.label} value={row.value} detail={L("Prévia antes da confirmação", "Preview before confirmation")} />
          ))}
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="grid gap-6">
            <section className="border border-tts-border bg-tts-surface p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                    <Coins className="h-5 w-5 text-tts-gold" aria-hidden="true" />
                    {L("Saldos da conta", "Account balances")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-tts-muted">
                    {L("Escolha origem e destino. A revisão final usa cotação real antes do PIN.", "Choose source and destination. Final review uses a live quote before PIN.")}
                  </p>
                </div>
                <span className={`inline-flex w-fit border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${session.authenticated ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" : "border-tts-gold bg-tts-gold-bg text-tts-gold"}`}>
                  {accountStatus === "loading" ? L("Carregando", "Loading") : session.authenticated ? L("Conectada", "Connected") : L("Sem conta", "No account")}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MiniStat label={L("Saldo de origem", "Source balance")} value={sourceBalanceDisplay} />
                <MiniStat label={L("Estado", "Status")} value={sourceBalance ? enoughBalance ? L("Saldo suficiente", "Enough balance") : L("Revise o valor", "Review amount") : session.authenticated ? L("Saldo não encontrado", "Balance not found") : L("Entre para consultar", "Sign in to check")} />
              </div>

              <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setSourceCode(destCode);
                    setDestCode(sourceCode);
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
                >
                  <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                  {L("Inverter", "Swap")}
                </button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <AssetPicker
                  title={L("Converter de", "Convert from")}
                  selectedCode={sourceCode}
                  otherCode={destCode}
                  onSelect={setSourceCode}
                />
                <AssetPicker
                  title={L("Converter para", "Convert to")}
                  selectedCode={destCode}
                  otherCode={sourceCode}
                  onSelect={setDestCode}
                />
              </div>
            </section>

            <section className="border border-tts-border bg-tts-surface p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                    <ShieldCheck className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                    {L("Revisão da conversão", "Conversion review")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-tts-muted">
                    {L("Edite o valor e confira a troca antes de abrir a confirmação.", "Edit the amount and review the swap before opening confirmation.")}
                  </p>
                </div>
                <button
                  type="button"
                  aria-pressed={advancedOpen}
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
                >
                  <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  {advancedOpen ? L("Ocultar ajustes", "Hide settings") : L("Modo avançado", "Advanced mode")}
                </button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
                <div>
                  <label className="block text-sm font-black text-tts-deep" htmlFor="convert-amount">
                    {L("Valor de origem", "Source amount")}
                  </label>
                  <input
                    id="convert-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(/[^\d,.]/g, ""))}
                    inputMode="decimal"
                    className="mt-2 min-h-12 w-full border border-tts-border bg-tts-bg px-3 text-base font-bold text-tts-deep outline-none focus:border-tts-gold"
                  />
                  {advancedOpen ? (
                    <div className="mt-4">
                      <label className="block text-sm font-black text-tts-deep" htmlFor="convert-safety">
                        {L("Preferência de execução", "Execution preference")}
                      </label>
                      <select
                        id="convert-safety"
                        value={safetyMode}
                        onChange={(event) => setSafetyMode(event.target.value)}
                        className="mt-2 min-h-12 w-full border border-tts-border bg-tts-bg px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                      >
                        <option value="balanced">{L("Equilibrada", "Balanced")}</option>
                        <option value="strict">{L("Mais conservadora", "More conservative")}</option>
                        <option value="fast">{L("Mais rápida", "Faster")}</option>
                      </select>
                    </div>
                  ) : null}
                </div>

                <div className="border border-tts-border bg-tts-bg p-4">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">{L("Pedido preparado", "Prepared request")}</p>
                  <p className="mt-2 break-words text-lg font-black text-tts-deep">{conversionPrompt}</p>
                  <p className="mt-3 text-sm leading-6 text-tts-muted">
                    {L(
                      "A próxima etapa recalcula a rota real e só confirma depois do PIN.",
                      "The next step recalculates the live route and only confirms after PIN."
                    )}
                  </p>
                  <div className="mt-4 grid gap-2">
                    <a href={confirmReviewUrl} className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-confirm px-4 py-2 text-sm font-black text-tts-deep transition hover:bg-tts-confirm/90">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {L("Revisar conversão", "Review conversion")}
                    </a>
                    <a href={yieldUrl} className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2">
                      <PiggyBank className="h-4 w-4" aria-hidden="true" />
                      {L("Usar em rendimento", "Use for yield")}
                    </a>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="grid gap-6">
            <section className="border border-tts-border bg-tts-surface p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                    <Sparkles className="h-5 w-5 text-tts-gold" aria-hidden="true" />
                    {L("Impacto do destino", "Destination impact")}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
                    {L(
                      "Veja o valor estimado no destino e o potencial se decidir manter esse saldo rendendo.",
                      "See the estimated destination value and the potential if you keep that balance earning."
                    )}
                  </p>
                </div>
                <span className="inline-flex w-fit border border-tts-border bg-tts-bg px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-tts-muted">
                  {destAsset.short} · {assetName(destAsset, language)}
                </span>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <ProjectionChart
                  title={L("Saldo projetado", "Projected balance")}
                  data={projectionData}
                  dataKey="balance"
                  color="var(--tts-confirm)"
                  asset={destAsset.short}
                />
                <ProjectionChart
                  title={L("Rendimento acumulado", "Accumulated yield")}
                  data={projectionData.slice(1)}
                  dataKey="earned"
                  color="var(--tts-gold)"
                  asset={destAsset.short}
                  bar
                />
              </div>
            </section>

            <section className="border border-tts-border bg-tts-surface p-5">
              <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                <WalletCards className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                {L("Depois de revisar", "After review")}
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <ActionLink href={confirmReviewUrl} title={L("Confirmar conversão", "Confirm conversion")} body={L("Recalcula a rota real e abre a confirmação com PIN.", "Recalculates the live route and opens PIN confirmation.")} icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} />
                <ActionLink href={yieldUrl} title={L("Manter rendendo", "Keep earning")} body={L("Use o destino da conversão como plano de rendimento.", "Use the conversion destination as the yield plan.")} icon={<PiggyBank className="h-4 w-4" aria-hidden="true" />} />
              </div>
            </section>
          </section>
        </section>
      </section>
    </main>
  );
}

function AssetPicker({
  title,
  selectedCode,
  otherCode,
  onSelect,
}: {
  title: string;
  selectedCode: string;
  otherCode: string;
  onSelect: (code: string) => void;
}) {
  const { language } = useLanguage();
  return (
    <div>
      <h3 className="text-sm font-black text-tts-deep">{title}</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {ASSETS.map((asset) => {
          const selected = asset.code === selectedCode;
          const paired = asset.code === otherCode;
          return (
            <button
              key={`${title}-${asset.code}`}
              type="button"
              onClick={() => onSelect(asset.code)}
              className={`min-h-[112px] border p-3 text-left transition ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"} ${paired && !selected ? "opacity-70" : ""}`}
            >
              <span className={`inline-flex border px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${asset.tone}`}>
                {asset.short}
              </span>
              <span className="mt-3 block text-sm font-black text-tts-deep">{assetName(asset, language)}</span>
              <span className="mt-1 block text-xs leading-5 text-tts-muted">{assetDescription(asset, language)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProjectionChart({
  title,
  data,
  dataKey,
  color,
  asset,
  bar = false,
}: {
  title: string;
  data: Array<{ label: string; balance: number; earned: number }>;
  dataKey: "balance" | "earned";
  color: string;
  asset: string;
  bar?: boolean;
}) {
  const { language } = useLanguage();
  const formatter = (value: unknown) => [`${formatDecimal(Number(value), language, 7)} ${asset}`, title];
  return (
    <div className="border border-tts-border bg-tts-bg p-4">
      <h3 className="text-base font-black text-tts-deep">{title}</h3>
      <div className="mt-3 h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {bar ? (
            <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--tts-border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} tickFormatter={(value) => formatDecimal(Number(value), language, 2)} />
              <Tooltip formatter={formatter} />
              <Bar dataKey={dataKey} fill={color} name={dataKey} radius={[3, 3, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--tts-border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} tickFormatter={(value) => formatDecimal(Number(value), language, 2)} />
              <Tooltip formatter={formatter} />
              <Area type="monotone" dataKey={dataKey} stroke={color} fill={color} fillOpacity={0.16} strokeWidth={2} name={dataKey} />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ActionLink({ href, icon, title, body }: { href: string; icon: ReactNode; title: string; body: string }) {
  return (
    <a href={href} className="group border border-tts-border bg-tts-bg p-4 transition hover:border-tts-border2">
      <span className="inline-flex h-9 w-9 items-center justify-center bg-tts-deep text-tts-surface">
        {icon}
      </span>
      <span className="mt-3 block text-base font-black text-tts-deep">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-tts-muted">{body}</span>
    </a>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-tts-border bg-tts-bg p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-tts-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-tts-deep">{value}</p>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">{label}</p>
      <p className="mt-2 break-words text-xl font-black text-tts-deep">{value}</p>
      <p className="mt-1 text-sm leading-5 text-tts-muted">{detail}</p>
    </div>
  );
}
