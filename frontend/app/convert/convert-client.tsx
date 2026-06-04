"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
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
import { currentPageSessionSource, getClientSession } from "@/lib/session";
import { resolveReturnTarget, type ReturnTarget } from "@/lib/return-target";
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

type ConvertMobileStage = "source" | "destination" | "review";

type BalanceLine = {
  asset_code: string;
  asset_type?: string;
  asset_issuer?: string;
  balance: string;
};

type ConversionRateCell = {
  pair: string;
  source_asset_code: string;
  destination_asset_code: string;
  sample_source_amount: string;
  destination_amount: string | null;
  rate: number | null;
  status: "available" | "same_asset" | "synthetic" | "unavailable";
  source: string;
  method: string;
  bridge_asset_code?: string;
  error?: string;
};

type ConversionRateMatrix = {
  assets: string[];
  generated_at: string;
  cells: ConversionRateCell[];
  matrix: Record<string, Record<string, ConversionRateCell>>;
  summary: {
    total_pairs: number;
    available_pairs: number;
    synthetic_pairs: number;
    unavailable_pairs: number;
  };
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
  if (code === "EUR" || code === "EURC") return "CETES";
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

function formatQueryDecimal(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  let text = value.toFixed(7);
  while (text.includes(".") && text.endsWith("0")) text = text.slice(0, -1);
  if (text.endsWith(".")) text = text.slice(0, -1);
  return text;
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

function formatAssetAmount(amount: number, asset: AssetOption, language: AppLanguage) {
  if (asset.code === "BRL") return `R$ ${formatDecimal(amount, language, 2)}`;
  if (asset.code === "USDC") return `US$ ${formatDecimal(amount, language, 2)}`;
  return `${formatDecimal(amount, language, 7)} ${asset.short}`;
}

function formatRateValue(cell: ConversionRateCell | undefined, language: AppLanguage) {
  if (!cell || !cell.rate || cell.status === "unavailable") return language === "pt-BR" ? "Indisponível" : "Unavailable";
  const rate = Number(cell.rate);
  const fractionDigits = rate > 100 ? 2 : rate >= 1 ? 4 : 8;
  return new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : "en-US", {
    minimumFractionDigits: rate < 1 ? Math.min(4, fractionDigits) : 2,
    maximumFractionDigits: fractionDigits,
  }).format(rate);
}

function rateStatusLabel(cell: ConversionRateCell | undefined, language: AppLanguage) {
  if (!cell) return language === "pt-BR" ? "carregando" : "loading";
  if (cell.status === "same_asset") return language === "pt-BR" ? "mesmo ativo" : "same asset";
  if (cell.status === "synthetic") return language === "pt-BR" ? `via ${cell.bridge_asset_code}` : `via ${cell.bridge_asset_code}`;
  if (cell.status === "available") return "Stellar";
  return language === "pt-BR" ? "sem rota" : "no route";
}

function scopedRampApiPath(path: string) {
  const source = typeof window === "undefined" ? "" : currentPageSessionSource();
  if (source !== "whatsapp" && source !== "telegram") return path;
  const [pathname, rawQuery = ""] = path.split("?");
  const params = new URLSearchParams(rawQuery);
  if (!params.get("source")) params.set("source", source);
  if (!params.get("session_scope")) params.set("session_scope", source);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

async function accountApi(path: string) {
  const response = await fetch(`/api/ramp/${scopedRampApiPath(path)}`, { cache: "no-store" });
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
  const [returnSource, setReturnSource] = useState("convert");
  const [returnTo, setReturnTo] = useState("");
  const [amountMode, setAmountMode] = useState<"send" | "receive">("send");
  const [mobileStage, setMobileStage] = useState<ConvertMobileStage>("source");
  const [rateMatrix, setRateMatrix] = useState<ConversionRateMatrix | null>(null);
  const [rateMatrixStatus, setRateMatrixStatus] = useState<"idle" | "loading" | "error">("idle");
  const [rateMatrixError, setRateMatrixError] = useState("");

  useEffect(() => {
    if (appliedInitialQueryRef.current) return;
    appliedInitialQueryRef.current = true;
    const params = new URLSearchParams(initialQuery || (typeof window !== "undefined" ? window.location.search : ""));
    const nextLanguage = params.get("lang") || params.get("language");
    if (nextLanguage) setLanguage(normalizeLanguage(nextLanguage));
    const queryAmountMode = String(params.get("amount_mode") || params.get("amountMode") || params.get("mode") || "").trim().toLowerCase();
    const queryDestAmount = params.get("dest_amount") || params.get("destAmount") || params.get("receive_amount") || params.get("receiveAmount") || "";
    const querySourceAmount = params.get("source_amount") || params.get("sourceAmount") || "";
    const queryAmount = queryAmountMode === "receive"
      ? (queryDestAmount || params.get("amount") || "")
      : (querySourceAmount || params.get("amount") || "");
    const querySource = params.get("source_asset") || params.get("source_asset_code") || params.get("from_asset") || "";
    const queryDest = params.get("dest_asset") || params.get("dest_asset_code") || params.get("to_asset") || "";
    const queryReturnSource = params.get("from") || params.get("origin") || params.get("source") || "";
    const queryReturnTo = params.get("return_to") || params.get("returnTo") || "";
    const pickerMode = ["1", "true", "yes"].includes(String(params.get("picker") || params.get("choose") || "").trim().toLowerCase());
    if (queryAmountMode === "receive" || queryDestAmount) setAmountMode("receive");
    if (pickerMode && !queryAmount) setAmount("");
    if (parseAmount(queryAmount) > 0) setAmount(queryAmount);
    if (querySource) setSourceCode(normalizeAssetCode(querySource));
    if (queryDest) setDestCode(normalizeAssetCode(queryDest));
    if (queryReturnSource) setReturnSource(queryReturnSource);
    if (queryReturnTo) setReturnTo(queryReturnTo);
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

  async function loadRateMatrix() {
    setRateMatrixStatus("loading");
    setRateMatrixError("");
    try {
      const response = await fetch("/api/financial/conversion-matrix?assets=BRL,USDC,CETES,XLM", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false || !Array.isArray(payload?.cells)) {
        throw new Error(payload?.message || L("Não foi possível carregar as taxas agora.", "Could not load rates right now."));
      }
      setRateMatrix(payload);
      setRateMatrixStatus("idle");
    } catch (error) {
      setRateMatrixStatus("error");
      setRateMatrixError(error instanceof Error ? error.message : L("Não foi possível carregar as taxas agora.", "Could not load rates right now."));
    }
  }

  useEffect(() => {
    let active = true;
    setRateMatrixStatus("loading");
    fetch("/api/financial/conversion-matrix?assets=BRL,USDC,CETES,XLM", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false || !Array.isArray(payload?.cells)) {
          throw new Error(payload?.message || "conversion matrix unavailable");
        }
        return payload as ConversionRateMatrix;
      })
      .then((payload) => {
        if (!active) return;
        setRateMatrix(payload);
        setRateMatrixStatus("idle");
      })
      .catch((error) => {
        if (!active) return;
        setRateMatrixStatus("error");
        setRateMatrixError(error instanceof Error ? error.message : L("Não foi possível carregar as taxas agora.", "Could not load rates right now."));
      });
    return () => {
      active = false;
    };
  }, [language]);

  const sourceAsset = getAsset(sourceCode);
  const destAsset = getAsset(destCode);
  const numericAmount = parseAmount(amount);
  const sourceBalance = balanceForAsset(balances, sourceCode);
  const sourceBalanceAmount = sourceBalance
    ? Number(String(sourceBalance.balance || "0").replace(",", "."))
    : 0;
  const normalizedSourceBalanceAmount = Number.isFinite(sourceBalanceAmount) ? sourceBalanceAmount : 0;
  const sourceBalanceDisplay = sourceBalance
    ? formatAssetAmount(normalizedSourceBalanceAmount, sourceAsset, language)
    : accountStatus === "loading"
      ? L("Carregando saldo", "Loading balance")
      : session.authenticated
        ? formatAssetAmount(0, sourceAsset, language)
        : L("Entre para consultar", "Sign in to check");
  const sameAsset = sourceCode === destCode;
  const primaryLabel = L("Calcular e confirmar", "Calculate and confirm");
  const routeTitle = L("Confirmar conversão", "Confirm conversion");
  const routeDescription = L("Cotação, taxas e PIN aparecem aqui.", "Quote, fees, and PIN appear here.");
  const destinationValue = L("Calculado na confirmação", "Calculated on confirmation");
  const selectedRateCell = rateMatrix?.matrix?.[sourceCode]?.[destCode];
  const sourceSummaryValue = amountMode === "receive"
    ? L("Calculado pela rota", "Calculated by route")
    : formatAssetAmount(numericAmount, sourceAsset, language);
  const destinationSummaryValue = amountMode === "receive"
    ? formatAssetAmount(numericAmount, destAsset, language)
    : selectedRateCell?.rate && numericAmount > 0
      ? formatAssetAmount(numericAmount * selectedRateCell.rate, destAsset, language)
      : destinationValue;
  const balanceCheckReady = amountMode === "send" && session.authenticated && accountStatus === "ready";
  const hasZeroSourceBalance = balanceCheckReady && normalizedSourceBalanceAmount <= 0;
  const hasAmountAboveSourceBalance = balanceCheckReady && numericAmount > 0 && normalizedSourceBalanceAmount > 0 && normalizedSourceBalanceAmount < numericAmount;
  const hasBlockingBalanceIssue = balanceCheckReady && numericAmount > 0 && normalizedSourceBalanceAmount < numericAmount;
  const missingSourceAmount = hasBlockingBalanceIssue ? Math.max(0, numericAmount - normalizedSourceBalanceAmount) : 0;
  const missingSourceDisplay = missingSourceAmount > 0 ? formatAssetAmount(missingSourceAmount, sourceAsset, language) : "";
  const conversionReturnHref = buildUrl("/convert", {
    amount,
    amount_mode: amountMode,
    source_asset: sourceCode,
    dest_asset: destCode,
    lang: language,
  });
  const sourceTopUpHref = buildUrl("/pix-on", {
    from: "convert",
    receive_amount: formatQueryDecimal(missingSourceAmount || numericAmount),
    receive_asset: sourceCode,
    target_asset: sourceCode,
    return_to: conversionReturnHref,
    lang: language,
  });
  const balanceNoticeTitle = hasZeroSourceBalance
    ? L(`Sem saldo em ${sourceAsset.short}`, `No ${sourceAsset.short} balance`)
    : hasAmountAboveSourceBalance
      ? L("Saldo insuficiente para converter", "Insufficient balance to convert")
      : L("Saldo disponível", "Available balance");
  const balanceNoticeBody = hasZeroSourceBalance
    ? L("Você não tem saldo nesta moeda. Adicione saldo ou escolha outra origem antes de continuar.", "You do not have balance in this asset. Add funds or choose another source before continuing.")
    : hasAmountAboveSourceBalance
      ? L(`Você tem ${sourceBalanceDisplay}. Falta ${missingSourceDisplay} para liberar esta conversão.`, `You have ${sourceBalanceDisplay}. You need ${missingSourceDisplay} more to unlock this conversion.`)
      : L(`${sourceBalanceDisplay} disponível para conversão.`, `${sourceBalanceDisplay} available for conversion.`);
  const showBalanceNotice = balanceCheckReady;
  const canProceed = numericAmount > 0 && !sameAsset && !hasBlockingBalanceIssue;
  const actionLabel = hasBlockingBalanceIssue ? L("Saldo insuficiente", "Insufficient balance") : primaryLabel;
  const securityValue = sameAsset
    ? L("Escolha moedas diferentes", "Choose different currencies")
    : !session.authenticated
      ? L("Entre para confirmar", "Sign in to confirm")
      : canProceed
        ? L("Pronto para confirmar", "Ready to confirm")
        : L("Confira o saldo", "Check balance");
  const returnTarget: ReturnTarget = resolveReturnTarget({
    language,
    returnTo,
    source: returnSource || "convert",
    fallbackSource: "convert",
  });
  const mobileStages: Array<{ key: ConvertMobileStage; label: string }> = [
    { key: "source", label: L("Origem", "Source") },
    { key: "destination", label: L("Destino", "Target") },
    { key: "review", label: L("Confirmar", "Review") },
  ];
  const currentMobileStageIndex = Math.max(0, mobileStages.findIndex((item) => item.key === mobileStage));
  const selectedRateLabel = selectedRateCell?.rate
    ? `1 ${sourceCode} = ${formatRateValue(selectedRateCell, language)} ${destCode}`
    : L("Cotação na confirmação", "Quote at confirmation");

  function setMobileStageAndScroll(stage: ConvertMobileStage) {
    setMobileStage(stage);
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

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
          ...(amountMode === "receive"
            ? { dest_amount: String(amount || "").trim() }
            : { source_amount: String(amount || "").trim() }),
          source_asset_code: sourceCode,
          dest_asset_code: destCode,
          language,
          from: returnSource || "convert",
          return_source: returnSource || "convert",
          return_to: returnTarget.href,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success || (!payload?.token && !payload?.url)) {
        throw new Error(payload?.message || L("Não foi possível preparar a confirmação agora.", "Could not prepare confirmation right now."));
      }
      const reviewToken = String(payload?.token || extractReviewTokenFromUrl(payload?.url) || "").trim();
      if (!reviewToken) {
        throw new Error(L("A confirmação foi criada, mas o token não veio na resposta.", "The confirmation was created, but the token was missing."));
      }
      setEmbeddedReviewValidation(payload?.validation || null);
      setEmbeddedReviewToken(reviewToken);
      setReviewStatus("idle");
    } catch (error) {
      setReviewStatus("error");
      setReviewError(error instanceof Error ? error.message : L("Não foi possível preparar a confirmação agora.", "Could not prepare confirmation right now."));
    }
  }

  if (embeddedReviewToken) {
    return <ConfirmConversionClient initialToken={embeddedReviewToken} initialValidation={embeddedReviewValidation} initialReturnTarget={returnTarget} />;
  }

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="hidden flex-col gap-4 border-b border-tts-border pb-5 pr-24 md:flex">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 border border-tts-confirm bg-tts-confirm/10 px-3 py-2 text-xs font-black uppercase tracking-normal text-tts-confirm">
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              {L("Conversão", "Conversion")}
            </div>
            <h1 className="max-w-2xl text-3xl font-black tracking-normal text-tts-deep md:text-4xl">
              {L("Converter", "Convert")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-tts-muted md:text-base">
              {L("Escolha origem, destino e valor. O PIN vem só no final.", "Choose source, destination, and amount. PIN comes only at the end.")}
            </p>
          </div>
        </header>

        <section className="md:hidden" aria-label={L("Conversão em etapas", "Step conversion")}>
          <div className="sticky top-0 z-20 -mx-4 border-b border-tts-border bg-tts-bg/95 px-4 py-3 backdrop-blur">
            <div className="grid grid-cols-3 gap-2">
              {mobileStages.map((stage, index) => {
                const active = stage.key === mobileStage;
                const done = index < currentMobileStageIndex;
                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => setMobileStageAndScroll(stage.key)}
                    className={`min-h-10 border px-2 text-xs font-black transition ${
                      active
                        ? "border-tts-confirm bg-tts-confirm text-tts-deep"
                        : done
                          ? "border-tts-confirm/50 bg-tts-confirm/10 text-tts-deep"
                          : "border-tts-border bg-tts-surface text-tts-muted"
                    }`}
                  >
                    <span className="block text-[10px]">{index + 1}</span>
                    <span className="block truncate">{stage.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {mobileStage === "source" ? (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-xs font-black uppercase tracking-normal text-tts-confirm">{L("1 de 3", "1 of 3")}</p>
                <h1 className="mt-2 text-3xl font-black text-tts-deep">{L("O que sai?", "What leaves?")}</h1>
              </div>

              <div className="border border-tts-border bg-tts-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-black text-tts-deep" htmlFor="convert-mobile-amount">
                    {amountMode === "receive" ? L("Quero receber", "I want to receive") : L("Vou converter", "I will convert")}
                  </label>
                  <div className="grid grid-cols-2 border border-tts-border bg-tts-bg p-1 text-xs font-black text-tts-muted">
                    <button
                      type="button"
                      onClick={() => setAmountMode("send")}
                      className={`px-3 py-2 transition ${amountMode === "send" ? "bg-tts-deep text-tts-surface" : "text-tts-muted"}`}
                    >
                      {L("Enviar", "Send")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountMode("receive")}
                      className={`px-3 py-2 transition ${amountMode === "receive" ? "bg-tts-deep text-tts-surface" : "text-tts-muted"}`}
                    >
                      {L("Receber", "Receive")}
                    </button>
                  </div>
                </div>
                <input
                  id="convert-mobile-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d,.]/g, ""))}
                  inputMode="decimal"
                  className="mt-3 min-h-14 w-full border border-tts-border bg-tts-bg px-3 text-2xl font-black text-tts-deep outline-none focus:border-tts-confirm"
                />
              </div>

              <AssetPicker title={L("Moeda de origem", "Source asset")} selectedCode={sourceCode} otherCode={destCode} onSelect={setSourceCode} compact />

              {showBalanceNotice ? (
                <BalanceAvailabilityCard
                  tone={hasBlockingBalanceIssue || hasZeroSourceBalance ? "error" : "ok"}
                  title={balanceNoticeTitle}
                  body={balanceNoticeBody}
                  currentLabel={L("Disponível", "Available")}
                  currentValue={sourceBalanceDisplay}
                  missingLabel={missingSourceDisplay ? L("Falta", "Missing") : undefined}
                  missingValue={missingSourceDisplay || undefined}
                  actionHref={hasBlockingBalanceIssue || hasZeroSourceBalance ? sourceTopUpHref : undefined}
                  actionLabel={L("Adicionar saldo", "Add money")}
                />
              ) : null}

              <button
                type="button"
                onClick={() => setMobileStageAndScroll("destination")}
                disabled={numericAmount <= 0}
                className="min-h-12 w-full bg-tts-confirm px-4 text-sm font-black text-tts-deep transition hover:bg-tts-confirm/90 disabled:cursor-not-allowed disabled:bg-tts-border disabled:text-tts-muted"
              >
                {L("Continuar", "Continue")}
              </button>
            </div>
          ) : null}

          {mobileStage === "destination" ? (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-xs font-black uppercase tracking-normal text-tts-confirm">{L("2 de 3", "2 of 3")}</p>
                <h1 className="mt-2 text-3xl font-black text-tts-deep">{L("Para onde vai?", "Where to?")}</h1>
                <p className="mt-2 text-sm font-bold text-tts-muted">{selectedRateLabel}</p>
              </div>

              <AssetPicker title={L("Moeda de destino", "Destination asset")} selectedCode={destCode} otherCode={sourceCode} onSelect={setDestCode} compact />

              {sameAsset ? (
                <div className="border border-tts-error bg-tts-error/10 p-3 text-sm font-bold leading-6 text-tts-error">
                  {L("Escolha moedas diferentes.", "Choose different currencies.")}
                </div>
              ) : null}

              <div className="grid grid-cols-[112px_1fr] gap-3">
                <button
                  type="button"
                  onClick={() => setMobileStageAndScroll("source")}
                  className="min-h-12 border border-tts-border bg-tts-surface px-4 text-sm font-black text-tts-deep"
                >
                  {L("Voltar", "Back")}
                </button>
                <button
                  type="button"
                  onClick={() => setMobileStageAndScroll("review")}
                  disabled={sameAsset}
                  className="min-h-12 bg-tts-confirm px-4 text-sm font-black text-tts-deep transition hover:bg-tts-confirm/90 disabled:cursor-not-allowed disabled:bg-tts-border disabled:text-tts-muted"
                >
                  {L("Continuar", "Continue")}
                </button>
              </div>
            </div>
          ) : null}

          {mobileStage === "review" ? (
            <div className="mt-5 space-y-5">
              <div>
                <p className="text-xs font-black uppercase tracking-normal text-tts-confirm">{L("3 de 3", "3 of 3")}</p>
                <h1 className="mt-2 text-3xl font-black text-tts-deep">{L("Conferir", "Review")}</h1>
              </div>

              <div className="divide-y divide-tts-border border border-tts-border bg-tts-surface">
                <MobileSummaryLine label={L("Sai", "Leaves")} value={sourceSummaryValue} />
                <MobileSummaryLine label={L("Recebe", "Receives")} value={destinationSummaryValue} />
                <MobileSummaryLine label={L("Saldo", "Balance")} value={sourceBalanceDisplay} />
                <MobileSummaryLine label={L("PIN", "PIN")} value={L("Só no final", "Only at the end")} />
              </div>

              {sameAsset ? (
                <div className="border border-tts-error bg-tts-error/10 p-3 text-sm font-bold leading-6 text-tts-error">
                  {L("Escolha moedas diferentes para continuar.", "Choose different currencies to continue.")}
                </div>
              ) : !canProceed ? (
                hasBlockingBalanceIssue ? (
                  <BalanceAvailabilityCard
                    tone="error"
                    title={balanceNoticeTitle}
                    body={balanceNoticeBody}
                    currentLabel={L("Disponível", "Available")}
                    currentValue={sourceBalanceDisplay}
                    missingLabel={L("Falta", "Missing")}
                    missingValue={missingSourceDisplay}
                    actionHref={sourceTopUpHref}
                    actionLabel={L("Adicionar saldo", "Add money")}
                  />
                ) : (
                  <div className="border border-tts-border bg-tts-surface p-3 text-sm font-bold leading-6 text-tts-muted">
                    {L("Confira o valor antes de continuar.", "Check the amount before continuing.")}
                  </div>
                )
              ) : null}

              {reviewStatus === "error" ? (
                <div className="flex gap-2 border border-tts-error bg-tts-error/10 p-3 text-sm leading-6 text-tts-error">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{reviewError}</span>
                </div>
              ) : null}

              <div className="grid grid-cols-[112px_1fr] gap-3">
                <button
                  type="button"
                  onClick={() => setMobileStageAndScroll("destination")}
                  className="min-h-12 border border-tts-border bg-tts-surface px-4 text-sm font-black text-tts-deep"
                >
                  {L("Voltar", "Back")}
                </button>
                <button
                  type="button"
                  onClick={prepareConversionReview}
                  disabled={!canProceed || reviewStatus === "loading"}
                  className={`inline-flex min-h-12 items-center justify-center gap-2 px-4 text-sm font-black transition ${
                    canProceed ? "bg-tts-confirm text-tts-deep hover:bg-tts-confirm/90" : "bg-tts-border text-tts-muted"
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  {reviewStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  {reviewStatus === "loading" ? L("Abrindo...", "Opening...") : hasBlockingBalanceIssue ? L("Saldo insuficiente", "Insufficient balance") : L("Confirmar", "Confirm")}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="hidden gap-3 md:grid lg:grid-cols-3" aria-label={L("Resumo da conversão", "Conversion summary")}>
          <Metric label={L("Sai da conta", "Leaves account")} value={sourceSummaryValue} detail={sourceBalanceDisplay} />
          <Metric
            label={L("Destino", "Destination")}
            value={destinationSummaryValue}
            detail={`${destAsset.short} · ${assetName(destAsset, language)}`}
          />
          <Metric
            label={L("Segurança", "Security")}
            value={securityValue}
            detail={L("Nada muda antes do PIN.", "Nothing changes before PIN.")}
          />
        </section>

        <section className="hidden border border-tts-border bg-tts-surface p-5 md:block" aria-label={L("Taxas dinâmicas", "Dynamic rates")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                <ArrowRightLeft className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                {L("Taxas dinâmicas", "Dynamic rates")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-tts-muted">
                {L(
                  "Matriz 4x4 carregada da rota Stellar, referência BRL/USDC e mercado quando a liquidez de teste está fora da faixa segura.",
                  "4x4 matrix loaded from Stellar routes, BRL/USDC reference, and market data when test liquidity is outside the safe range."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={loadRateMatrix}
              disabled={rateMatrixStatus === "loading"}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {rateMatrixStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {L("Atualizar", "Refresh")}
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MiniStat
              label={L("Par selecionado", "Selected pair")}
              value={`${sourceCode} -> ${destCode}`}
            />
            <MiniStat
              label={L("Taxa", "Rate")}
              value={selectedRateCell?.rate ? `1 ${sourceCode} = ${formatRateValue(selectedRateCell, language)} ${destCode}` : L("Carregando", "Loading")}
            />
            <MiniStat
              label={L("Origem", "Source")}
              value={rateStatusLabel(selectedRateCell, language)}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-tts-border bg-tts-bg p-4 sm:hidden">
            <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">
              {L("Cotação do par", "Pair quote")}
            </p>
            <p className="mt-2 text-lg font-black text-tts-deep">
              {selectedRateCell?.rate ? `1 ${sourceCode} = ${formatRateValue(selectedRateCell, language)} ${destCode}` : L("Carregando", "Loading")}
            </p>
            <p className="mt-1 text-xs font-bold text-tts-muted">
              {L("A tabela completa fica disponível em telas maiores.", "The full table is available on larger screens.")}
            </p>
          </div>

          {rateMatrixStatus === "error" ? (
            <div className="mt-4 flex gap-2 border border-tts-error bg-tts-error/10 p-3 text-sm leading-6 text-tts-error">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{rateMatrixError}</span>
            </div>
          ) : null}

          <div className="mt-4 hidden overflow-x-auto sm:block">
            <div className="min-w-[640px]">
              <div className="grid grid-cols-5 border-b border-tts-border text-[11px] font-black uppercase tracking-normal text-tts-muted">
                <div className="p-2">{L("De / Para", "From / To")}</div>
                {ASSETS.map((asset) => (
                  <div key={`head-${asset.code}`} className="p-2 text-right">{asset.code}</div>
                ))}
              </div>
              {ASSETS.map((source) => (
                <div key={`row-${source.code}`} className="grid grid-cols-5 border-b border-tts-border/70 text-sm">
                  <div className="p-2 font-black text-tts-deep">{source.code}</div>
                  {ASSETS.map((destination) => {
                    const cell = rateMatrix?.matrix?.[source.code]?.[destination.code];
                    const selected = source.code === sourceCode && destination.code === destCode;
                    return (
                      <div key={`${source.code}-${destination.code}`} className={`p-2 text-right ${selected ? "bg-tts-confirm/10 font-black text-tts-deep" : "text-tts-muted"}`}>
                        <span className="block">{formatRateValue(cell, language)}</span>
                        <span className="block text-[10px] uppercase tracking-normal">{rateStatusLabel(cell, language)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="hidden gap-5 md:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
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
                value={showBalanceNotice ? balanceNoticeTitle : session.authenticated ? L("Carregando saldo", "Loading balance") : L("Entre para consultar", "Sign in to check")}
              />
            </div>
            {showBalanceNotice ? (
              <div className="mt-4">
                <BalanceAvailabilityCard
                  tone={hasBlockingBalanceIssue || hasZeroSourceBalance ? "error" : "ok"}
                  title={balanceNoticeTitle}
                  body={balanceNoticeBody}
                  currentLabel={L("Disponível", "Available")}
                  currentValue={sourceBalanceDisplay}
                  missingLabel={missingSourceDisplay ? L("Falta", "Missing") : undefined}
                  missingValue={missingSourceDisplay || undefined}
                  actionHref={hasBlockingBalanceIssue || hasZeroSourceBalance ? sourceTopUpHref : undefined}
                  actionLabel={L("Adicionar saldo", "Add money")}
                />
              </div>
            ) : null}
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="block text-sm font-black text-tts-deep" htmlFor="convert-amount">
                  {amountMode === "receive" ? L("Valor que chega", "Amount receiving") : L("Valor que sai", "Amount leaving")}
                </label>
                <div className="grid grid-cols-2 rounded-full border border-tts-border bg-tts-bg p-1 text-xs font-black text-tts-muted">
                  <button
                    type="button"
                    onClick={() => setAmountMode("send")}
                    className={`rounded-full px-3 py-2 transition ${amountMode === "send" ? "bg-tts-deep text-tts-surface" : "hover:text-tts-deep"}`}
                  >
                    {L("Enviar", "Send")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountMode("receive")}
                    className={`rounded-full px-3 py-2 transition ${amountMode === "receive" ? "bg-tts-deep text-tts-surface" : "hover:text-tts-deep"}`}
                  >
                    {L("Receber", "Receive")}
                  </button>
                </div>
              </div>
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

        <section className="hidden border border-tts-confirm bg-tts-confirm/10 p-5 md:block">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                <ShieldCheck className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                {routeTitle}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-tts-muted">{routeDescription}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <Step title={L("1. Valor", "1. Amount")} body={amountMode === "receive" ? formatAssetAmount(numericAmount, destAsset, language) : formatAssetAmount(numericAmount, sourceAsset, language)} />
                <Step title={L("2. Confirmação", "2. Confirmation")} body={L("Mostra valores e taxas aqui", "Shows amounts and fees here")} />
                <Step title={L("3. PIN", "3. PIN")} body={L("Última etapa", "Final step")} />
              </div>
            </div>
            <div className="border border-tts-border bg-tts-surface p-4">
              <p className="text-xs font-black uppercase tracking-normal text-tts-muted">{L("Próximo passo", "Next step")}</p>
              <p className="mt-2 text-lg font-black text-tts-deep">
                {amountMode === "receive"
                  ? `${sourceAsset.short} → ${formatAssetAmount(numericAmount, destAsset, language)}`
                  : `${formatAssetAmount(numericAmount, sourceAsset, language)} → ${assetName(destAsset, language)}`}
              </p>
              {sameAsset ? (
                <p className="mt-3 text-sm leading-6 text-tts-muted">
                  {L("Escolha moedas diferentes para continuar.", "Choose different currencies to continue.")}
                </p>
              ) : !canProceed ? (
                hasBlockingBalanceIssue ? (
                  <div className="mt-4">
                    <BalanceAvailabilityCard
                      tone="error"
                      title={balanceNoticeTitle}
                      body={balanceNoticeBody}
                      currentLabel={L("Disponível", "Available")}
                      currentValue={sourceBalanceDisplay}
                      missingLabel={L("Falta", "Missing")}
                      missingValue={missingSourceDisplay}
                      actionHref={sourceTopUpHref}
                      actionLabel={L("Adicionar saldo", "Add money")}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-tts-muted">
                    {L("Confira os dados antes de confirmar.", "Check the details before confirming.")}
                  </p>
                )
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
              <div className="tts-mobile-action mt-4">
                <button
                  type="button"
                  onClick={prepareConversionReview}
                  disabled={!canProceed || reviewStatus === "loading"}
                  className={`inline-flex min-h-11 w-full items-center justify-center gap-2 px-4 py-2 text-sm font-black transition ${canProceed ? "bg-tts-confirm text-tts-deep hover:bg-tts-confirm/90" : "bg-tts-border text-tts-muted"} disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  {reviewStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  {reviewStatus === "loading" ? L("Preparando confirmação...", "Preparing confirmation...") : actionLabel}
                </button>
              </div>
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
  compact = false,
}: {
  title: string;
  selectedCode: string;
  otherCode: string;
  onSelect: (code: string) => void;
  compact?: boolean;
}) {
  const { language } = useLanguage();
  return (
    <div>
      <h3 className="text-sm font-black text-tts-deep">{title}</h3>
      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-1" : ""}`}>
        {ASSETS.map((asset) => {
          const selected = asset.code === selectedCode;
          const paired = asset.code === otherCode;
          return (
            <button
              key={`${title}-${asset.code}`}
              type="button"
              onClick={() => onSelect(asset.code)}
              className={`border text-left transition ${
                compact ? "flex min-h-14 items-center gap-3 px-3 py-2" : "min-h-[96px] p-3"
              } ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"} ${paired && !selected ? "opacity-70" : ""}`}
            >
              <span className={`inline-flex shrink-0 border px-2 py-1 text-[11px] font-black uppercase tracking-normal ${asset.tone}`}>
                {asset.short}
              </span>
              <span className={compact ? "block min-w-0" : "block"}>
                <span className={`${compact ? "mt-0" : "mt-3"} block truncate text-sm font-black text-tts-deep`}>{assetName(asset, language)}</span>
                <span className={`${compact ? "hidden" : "mt-1 block"} text-xs leading-5 text-tts-muted`}>{assetDescription(asset, language)}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileSummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 px-3 py-2">
      <p className="text-xs font-black uppercase tracking-normal text-tts-muted">{label}</p>
      <p className="min-w-0 break-words text-right text-sm font-black text-tts-deep">{value}</p>
    </div>
  );
}

function BalanceAvailabilityCard({
  tone,
  title,
  body,
  currentLabel,
  currentValue,
  missingLabel,
  missingValue,
  actionHref,
  actionLabel,
}: {
  tone: "ok" | "error";
  title: string;
  body: string;
  currentLabel?: string;
  currentValue?: string;
  missingLabel?: string;
  missingValue?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const isError = tone === "error";
  return (
    <div className={`border p-3 ${isError ? "border-tts-error bg-tts-error/10" : "border-tts-confirm/60 bg-tts-confirm/10"}`}>
      <div className="flex gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border ${isError ? "border-tts-error text-tts-error" : "border-tts-confirm text-tts-confirm"}`}>
          {isError ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <p className={`text-sm font-black ${isError ? "text-tts-error" : "text-tts-deep"}`}>{title}</p>
          <p className="mt-1 text-xs font-bold leading-5 text-tts-muted">{body}</p>
        </div>
      </div>
      {currentValue || missingValue ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {currentValue ? <MiniStat label={currentLabel || "Saldo"} value={currentValue} /> : null}
          {missingValue ? <MiniStat label={missingLabel || "Falta"} value={missingValue} /> : null}
        </div>
      ) : null}
      {actionHref && actionLabel ? (
        <a
          href={actionHref}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 border border-tts-confirm bg-tts-confirm px-4 py-2 text-sm font-black text-tts-deep transition hover:bg-tts-confirm/90"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}
    </div>
  );
}

function Step({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-3">
      <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">{title}</p>
      <p className="mt-1 text-sm font-black text-tts-deep">{body}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-tts-border bg-tts-bg p-3">
      <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-tts-deep">{value}</p>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: ReactNode }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-4">
      <p className="text-xs font-black uppercase tracking-normal text-tts-muted">{label}</p>
      <p className="mt-2 break-words text-xl font-black text-tts-deep">{value}</p>
      <p className="mt-1 text-sm leading-5 text-tts-muted">{detail}</p>
    </div>
  );
}
