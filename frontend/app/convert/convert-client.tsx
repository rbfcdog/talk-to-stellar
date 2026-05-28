"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Coins,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { AccountStatusCard } from "@/components/shared/account-status";
import { normalizeLanguage, useLanguage, type AppLanguage } from "@/lib/i18n";
import { getClientSession } from "@/lib/session";
import ConfirmConversionClient from "../confirm-conversion/confirm-conversion-client";

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
    short: "R$",
    namePt: "Reais",
    nameEn: "Reais",
    promptPt: "reais",
    promptEn: "BRL",
    descriptionPt: "Saldo em reais da sua conta.",
    descriptionEn: "Reais balance in your account.",
    tone: "border-tts-gold/60 bg-tts-gold-bg text-tts-gold",
  },
  {
    code: "USDC",
    short: "USD",
    namePt: "Dólares",
    nameEn: "Dollars",
    promptPt: "dólares",
    promptEn: "dollars",
    descriptionPt: "Saldo em dólares da sua conta.",
    descriptionEn: "Dollar balance in your account.",
    tone: "border-tts-confirm/50 bg-tts-confirm/10 text-tts-confirm",
  },
  {
    code: "CETES",
    short: "MXN",
    namePt: "Opção México (teste)",
    nameEn: "Mexico option (test)",
    promptPt: "opção México",
    promptEn: "Mexico option",
    descriptionPt: "Opção de teste quando estiver disponível no ambiente.",
    descriptionEn: "Test option when available in this environment.",
    tone: "border-tts-border2 bg-tts-surface text-tts-muted",
  },
  {
    code: "XLM",
    short: "XLM",
    namePt: "XLM",
    nameEn: "XLM",
    promptPt: "XLM",
    promptEn: "XLM",
    descriptionPt: "Saldo XLM da conta para conversões internas.",
    descriptionEn: "Account XLM balance for internal conversions.",
    tone: "border-tts-border2 bg-tts-surface text-tts-deep",
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

function extractReviewTokenFromUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://talktostellar.local";
    const url = new URL(raw, base);
    return String(url.searchParams.get("token") || "").trim();
  } catch {
    return "";
  }
}

function accountAssetCode(code: string) {
  return code === "BRL" ? "TESOURO" : code;
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

function formatAssetAmount(amount: number, asset: AssetOption, language: AppLanguage) {
  if (asset.code === "BRL") return `R$ ${formatDecimal(amount, language, 2)}`;
  if (asset.code === "USDC") return `US$ ${formatDecimal(amount, language, 2)}`;
  return `${formatDecimal(amount, language, 7)} ${asset.short}`;
}

async function accountApi(path: string) {
  const response = await fetch(`/api/ramp/${path}`, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Não foi possível carregar os dados da conta.");
  }
  return payload;
}

export default function ConvertClient({ initialQuery = "" }: { initialQuery?: string }) {
  const { language, setLanguage } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const appliedInitialQueryRef = useRef(false);
  const [amount, setAmount] = useState("10");
  const [sourceCode, setSourceCode] = useState("USDC");
  const [destCode, setDestCode] = useState("BRL");
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [accountStatus, setAccountStatus] = useState<"loading" | "ready" | "signed-out">("loading");
  const [reviewStatus, setReviewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [reviewError, setReviewError] = useState("");
  const [embeddedReviewToken, setEmbeddedReviewToken] = useState("");
  const [embeddedReviewValidation, setEmbeddedReviewValidation] = useState<unknown | null>(null);

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
  }, [initialQuery, setLanguage]);

  useEffect(() => {
    let active = true;
    getClientSession()
      .then(async (sessionPayload) => {
        if (!sessionPayload.authenticated) return { sessionPayload, balancesPayload: [] };
        const accountPayload = await accountApi("etherfuse/wallet-balances").catch(() => ({ balances: [] }));
        return { sessionPayload, balancesPayload: Array.isArray(accountPayload?.balances) ? accountPayload.balances : [] };
      })
      .then((accountPayload) => {
        if (!active) return;
        setSession(accountPayload.sessionPayload);
        setBalances(accountPayload.balancesPayload);
        setAccountStatus(accountPayload.sessionPayload.authenticated ? "ready" : "signed-out");
      })
      .catch(() => {
        if (!active) return;
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
  const sourceBalanceDisplay = sourceBalance
    ? `${formatDecimal(Number(String(sourceBalance.balance || "0").replace(",", ".")), language, 7)} ${sourceAsset.short}`
    : accountStatus === "loading"
      ? L("Carregando saldo", "Loading balance")
      : session.authenticated
        ? L("Saldo não encontrado", "Balance not found")
        : L("Entre para consultar", "Sign in to check");
  const enoughBalance = hasEnoughBalance(sourceBalance, numericAmount);
  const sameAsset = sourceCode === destCode;
  const primaryLabel = L("Calcular e revisar", "Calculate and review");
  const routeTitle = L("Revisar conversão", "Review conversion");
  const routeDescription = L("Cotação, taxas e PIN aparecem aqui.", "Quote, fees, and PIN appear here.");
  const destinationValue = L("Calculado na revisão", "Calculated in review");
  const hasBlockingBalanceIssue = session.authenticated && Boolean(sourceBalance) && !enoughBalance;
  const canProceed = numericAmount > 0 && !sameAsset && !hasBlockingBalanceIssue;
  const securityValue = sameAsset
    ? L("Escolha moedas diferentes", "Choose different currencies")
    : !session.authenticated
      ? L("Entre para revisar", "Sign in to review")
      : canProceed
        ? L("Pronto para revisar", "Ready to review")
        : L("Revise o saldo", "Review balance");

  async function prepareConversionReview() {
    if (!session.authenticated) {
      window.location.href = buildUrl("/login", { next: "/convert", lang: language });
      return;
    }
    if (!canProceed || reviewStatus === "loading") return;
    setReviewStatus("loading");
    setReviewError("");
    try {
      const response = await fetch("/api/financial/conversion-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_amount: String(amount || "").trim(),
          source_asset_code: sourceCode,
          dest_asset_code: destCode,
          language,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || (!payload?.token && !payload?.url)) {
        throw new Error(payload?.message || L("Não foi possível preparar a revisão agora.", "Could not prepare review right now."));
      }
      const reviewToken = String(payload?.token || extractReviewTokenFromUrl(payload?.url) || "").trim();
      if (!reviewToken) {
        throw new Error(L("A revisão foi criada, mas o token de confirmação não veio na resposta.", "The review was created, but the confirmation token was missing."));
      }
      setEmbeddedReviewValidation(payload?.validation || null);
      setEmbeddedReviewToken(reviewToken);
      setReviewStatus("idle");
    } catch (error) {
      setReviewStatus("error");
      setReviewError(error instanceof Error ? error.message : L("Não foi possível preparar a revisão agora.", "Could not prepare review right now."));
    }
  }

  if (embeddedReviewToken) {
    return <ConfirmConversionClient initialToken={embeddedReviewToken} initialValidation={embeddedReviewValidation} />;
  }

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-tts-border pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 border border-tts-confirm bg-tts-confirm/10 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-tts-confirm">
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              {L("Conversão", "Conversion")}
            </div>
            <h1 className="max-w-2xl text-3xl font-black tracking-tight text-tts-deep md:text-4xl">
              {L("Converter", "Convert")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-tts-muted md:text-base">
              {L("Escolha origem, destino e valor. O PIN vem depois da revisão.", "Choose source, destination, and amount. PIN comes after review.")}
            </p>
          </div>
          <div className="md:min-w-[180px]">
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "pt-BR" : "en")}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {language === "en" ? "Português" : "English"}
            </button>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-3" aria-label={L("Resumo da conversão", "Conversion summary")}>
          <Metric label={L("Sai da conta", "Leaves account")} value={formatAssetAmount(numericAmount, sourceAsset, language)} detail={sourceBalanceDisplay} />
          <Metric label={L("Destino", "Destination")} value={destinationValue} detail={`${destAsset.short} · ${assetName(destAsset, language)}`} />
          <Metric
            label={L("Segurança", "Security")}
            value={securityValue}
            detail={L("Nada muda antes do PIN.", "Nothing changes before PIN.")}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="border border-tts-border bg-tts-surface p-5">
            <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
              <WalletCards className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
              {L("Sua conta", "Your account")}
            </h2>
            <AccountStatusCard
              state={accountStatus === "loading" ? "loading" : session.authenticated ? "connected" : "signed-out"}
              ctaHref="/login?next=/convert"
              compact
              className="mt-4"
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <MiniStat label={L("Saldo de origem", "Source balance")} value={sourceBalanceDisplay} />
              <MiniStat
                label={L("Status", "Status")}
                value={sourceBalance ? enoughBalance ? L("Saldo suficiente", "Enough balance") : L("Valor acima do saldo", "Amount above balance") : session.authenticated ? L("Saldo não encontrado", "Balance not found") : L("Entre para consultar", "Sign in to check")}
              />
            </div>
          </section>

          <section className="border border-tts-border bg-tts-surface p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                  <Coins className="h-5 w-5 text-tts-gold" aria-hidden="true" />
                  {L("Valor", "Amount")}
                </h2>
              </div>
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

            <div className="mt-5">
              <label className="block text-sm font-black text-tts-deep" htmlFor="convert-amount">
                {L("Valor que sai", "Amount leaving")}
              </label>
              <input
                id="convert-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d,.]/g, ""))}
                inputMode="decimal"
                className="mt-2 min-h-12 w-full border border-tts-border bg-tts-bg px-3 text-base font-bold text-tts-deep outline-none focus:border-tts-gold"
              />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <AssetPicker title={L("De", "From")} selectedCode={sourceCode} otherCode={destCode} onSelect={setSourceCode} />
              <AssetPicker title={L("Para", "To")} selectedCode={destCode} otherCode={sourceCode} onSelect={setDestCode} />
            </div>
          </section>
        </section>

        <section className="border border-tts-confirm bg-tts-confirm/10 p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                <ShieldCheck className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                {routeTitle}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-tts-muted">{routeDescription}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Step title={L("1. Valor", "1. Amount")} body={formatAssetAmount(numericAmount, sourceAsset, language)} />
              <Step title={L("2. Revisão", "2. Review")} body={L("Mostra a confirmação aqui", "Shows confirmation here")} />
              <Step title={L("3. PIN", "3. PIN")} body={L("Só depois da revisão", "Only after review")} />
            </div>
          </div>
            <div className="border border-tts-border bg-tts-surface p-4">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">{L("Próximo passo", "Next step")}</p>
              <p className="mt-2 text-lg font-black text-tts-deep">
                {formatAssetAmount(numericAmount, sourceAsset, language)} → {assetName(destAsset, language)}
              </p>
              {sameAsset ? (
                <p className="mt-3 text-sm leading-6 text-tts-muted">
                  {L("Escolha moedas diferentes para continuar.", "Choose different currencies to continue.")}
                </p>
              ) : !canProceed ? (
                <p className="mt-3 text-sm leading-6 text-tts-muted">
                  {L("O valor parece maior que o saldo disponível. Ajuste antes de revisar.", "The amount looks higher than the available balance. Adjust it before reviewing.")}
                </p>
              ) : (
                <p className="mt-3 text-sm leading-6 text-tts-muted">
                  {L("Vamos calcular a rota real e mostrar a confirmação aqui. Nada passa pelo chat.", "We will calculate the live route and show confirmation here. Nothing goes through chat.")}
                </p>
              )}
              {reviewStatus === "error" ? (
                <div className="mt-4 flex gap-2 border border-tts-error bg-tts-error/10 p-3 text-sm leading-6 text-tts-error">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{reviewError}</span>
                </div>
              ) : null}
              <button
                type="button"
                onClick={prepareConversionReview}
                disabled={!canProceed || reviewStatus === "loading"}
                className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 text-sm font-black transition ${canProceed ? "bg-tts-confirm text-tts-deep hover:bg-tts-confirm/90" : "bg-tts-border text-tts-muted"} disabled:cursor-not-allowed disabled:opacity-70`}
              >
                {reviewStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                {reviewStatus === "loading" ? L("Preparando revisão...", "Preparing review...") : primaryLabel}
              </button>
            </div>
          </div>
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
      <div className="mt-3 grid gap-2">
        {ASSETS.map((asset) => {
          const selected = asset.code === selectedCode;
          const paired = asset.code === otherCode;
          return (
            <button
              key={`${title}-${asset.code}`}
              type="button"
              onClick={() => onSelect(asset.code)}
              className={`min-h-[96px] border p-3 text-left transition ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"} ${paired && !selected ? "opacity-70" : ""}`}
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

function Step({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-tts-muted">{title}</p>
      <p className="mt-1 text-sm font-black text-tts-deep">{body}</p>
    </div>
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

function Metric({ label, value, detail }: { label: string; value: string; detail: ReactNode }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">{label}</p>
      <p className="mt-2 break-words text-xl font-black text-tts-deep">{value}</p>
      <p className="mt-1 text-sm leading-5 text-tts-muted">{detail}</p>
    </div>
  );
}
