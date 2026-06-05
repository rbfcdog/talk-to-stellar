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
import { SecurePinGate } from "@/components/shared/secure-pin-gate";
import { normalizeLanguage, useLanguage, type AppLanguage } from "@/lib/i18n";
import { currentPageSessionSource, getClientSession, normalizeClientSessionSource } from "@/lib/session";
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
  sessionSource?: string;
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

function scopedFinancialApiPath(path: string) {
  const source = typeof window === "undefined" ? "" : currentPageSessionSource();
  if (source !== "whatsapp" && source !== "telegram") return path;
  const [pathname, rawQuery = ""] = path.split("?");
  const params = new URLSearchParams(rawQuery);
  if (!params.get("source")) params.set("source", source);
  if (!params.get("session_scope")) params.set("session_scope", source);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function sessionSourceFromQueryString(rawQuery: string) {
  const params = new URLSearchParams(rawQuery || "");
  const candidates = [
    params.get("external_provider"),
    params.get("externalProvider"),
    params.get("provider"),
    params.get("channel"),
    params.get("session_source"),
    params.get("sessionSource"),
    params.get("external_source"),
    params.get("externalSource"),
    params.get("source"),
    params.get("session_scope"),
    params.get("from"),
    params.get("origin"),
  ];
  const normalized = candidates.map(normalizeClientSessionSource).filter(Boolean);
  return normalized.find((source) => source === "whatsapp" || source === "telegram") || normalized[0] || "";
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
  const [sourceCode, setSourceCode] = useState("BRL");
  const [destCode, setDestCode] = useState("USDC");
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [pinVerified, setPinVerified] = useState(false);
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [accountStatus, setAccountStatus] = useState<"loading" | "locked" | "ready" | "signed-out">("loading");
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
      .then((sessionPayload) => {
        if (!active) return;
        setSession(sessionPayload);
        setBalances([]);
        setPinVerified(false);
        setAccountStatus(sessionPayload.authenticated ? "locked" : "signed-out");
      })
      .catch(() => {
        if (!active) return;
        setSession({ authenticated: false });
        setPinVerified(false);
        setBalances([]);
        setAccountStatus("signed-out");
      });
    return () => {
      active = false;
    };
  }, []);

  async function loadAccountBalances() {
    setAccountStatus("loading");
    try {
      const accountPayload = await accountApi("etherfuse/wallet-balances");
      setBalances(Array.isArray(accountPayload?.balances) ? accountPayload.balances : []);
      setAccountStatus("ready");
    } catch {
      setBalances([]);
      setAccountStatus("ready");
    }
  }

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
      : session.authenticated && !pinVerified
        ? L("Digite o PIN", "Enter PIN")
      : session.authenticated
        ? formatAssetAmount(0, sourceAsset, language)
        : L("Entre para consultar", "Sign in to check");
  const sameAsset = sourceCode === destCode;
  const primaryLabel = L("Abrir confirmação", "Open confirmation");
  const routeTitle = L("Confirmar conversão", "Confirm conversion");
  const routeDescription = L(
    "Confira os valores e abra a confirmação. O PIN vem na próxima tela.",
    "Check the amounts and open confirmation. PIN comes on the next screen."
  );
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
  const balanceCheckReady = amountMode === "send" && session.authenticated && pinVerified && accountStatus === "ready";
  const hasZeroSourceBalance = balanceCheckReady && normalizedSourceBalanceAmount <= 0;
  const hasAmountAboveSourceBalance = balanceCheckReady && numericAmount > 0 && normalizedSourceBalanceAmount > 0 && normalizedSourceBalanceAmount < numericAmount;
  const hasBlockingBalanceIssue = balanceCheckReady && numericAmount > 0 && normalizedSourceBalanceAmount < numericAmount;
  const missingSourceAmount = hasBlockingBalanceIssue ? Math.max(0, numericAmount - normalizedSourceBalanceAmount) : 0;
  const missingSourceDisplay = missingSourceAmount > 0 ? formatAssetAmount(missingSourceAmount, sourceAsset, language) : "";
  const pageSessionSource = sessionSourceFromQueryString(initialQuery);
  const externalSessionScope = pageSessionSource === "whatsapp" || pageSessionSource === "telegram" ? pageSessionSource : "";
  const externalLinkContext = externalSessionScope ? { source: externalSessionScope, session_scope: externalSessionScope, provider: externalSessionScope } : {};
  const conversionReturnHref = buildUrl("/convert", {
    amount,
    amount_mode: amountMode,
    source_asset: sourceCode,
    dest_asset: destCode,
    ...externalLinkContext,
    lang: language,
  });
  const sourceTopUpHref = buildUrl("/pix-on", {
    from: "convert",
    receive_amount: formatQueryDecimal(missingSourceAmount || numericAmount),
    receive_asset: sourceCode,
    target_asset: sourceCode,
    ...externalLinkContext,
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
  const canProceed = pinVerified && numericAmount > 0 && !sameAsset && !hasBlockingBalanceIssue;
  const actionLabel = !pinVerified ? L("Digite o PIN", "Enter PIN") : hasBlockingBalanceIssue ? L("Saldo insuficiente", "Insufficient balance") : primaryLabel;
  const securityValue = sameAsset
    ? L("Escolha moedas diferentes", "Choose different currencies")
    : !session.authenticated
      ? L("Entre para confirmar", "Sign in to confirm")
      : !pinVerified
        ? L("PIN necessário", "PIN required")
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
    if (!pinVerified) {
      setReviewStatus("error");
      setReviewError(L("Digite seu PIN para abrir a conversão.", "Enter your PIN to open conversion."));
      return;
    }
    if (!canProceed || reviewStatus === "loading") return;
    setReviewStatus("loading");
    setReviewError("");
    try {
      const sessionScope = currentPageSessionSource();
      const response = await fetch(`/api/financial/${scopedFinancialApiPath("conversion-confirmation")}`, {
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
          ...(sessionScope === "whatsapp" || sessionScope === "telegram"
            ? { source: sessionScope, session_scope: sessionScope }
            : {}),
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
      <section className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col gap-0 px-4 py-3 md:gap-5 md:py-6 sm:px-6 lg:px-8">
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

        {session.authenticated && !pinVerified ? (
          <SecurePinGate
            sessionSource={session.sessionSource}
            title={L("Abrir conversão", "Open conversion")}
            detail={L("Digite seu PIN para consultar saldo e continuar.", "Enter your PIN to check balance and continue.")}
            disabled={!session.sessionId}
            onVerified={() => {
              setPinVerified(true);
              void loadAccountBalances();
            }}
          />
        ) : null}

        {!session.authenticated || pinVerified ? (
        <>
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden md:hidden" aria-label={L("Conversão em etapas", "Step conversion")}>
          <div className="-mx-4 border-b border-tts-border bg-tts-bg/95 px-4 py-2 backdrop-blur">
            <div className="grid grid-cols-3 gap-2">
              {mobileStages.map((stage, index) => {
                const active = stage.key === mobileStage;
                const done = index < currentMobileStageIndex;
                return (
                  <button
                    key={stage.key}
                    type="button"
                    onClick={() => setMobileStageAndScroll(stage.key)}
                    className={`min-h-9 border px-2 text-[11px] font-black transition ${
                      active
                        ? "border-tts-confirm bg-tts-confirm text-tts-deep"
                        : done
                          ? "border-tts-confirm/50 bg-tts-confirm/10 text-tts-deep"
                          : "border-tts-border bg-tts-surface text-tts-muted"
                    }`}
                  >
                    <span className="block truncate">{stage.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <MobileConversionGuide
            stage={mobileStage}
            language={language}
            amountMode={amountMode}
            sameAsset={sameAsset}
            hasBlockingBalanceIssue={hasBlockingBalanceIssue}
            reviewStatus={reviewStatus}
            numericAmount={numericAmount}
          />

          {mobileStage === "source" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 py-3">
              <div className="shrink-0">
                <p className="text-[11px] font-black uppercase tracking-normal text-tts-confirm">{L("1 de 3", "1 of 3")}</p>
                <h1 className="mt-1 text-2xl font-black text-tts-deep">{L("Valor e origem", "Amount and source")}</h1>
              </div>

              <div className="shrink-0 rounded-xl border border-tts-border bg-tts-surface p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <label className="tts-field-label text-xs font-black text-tts-deep" htmlFor="convert-mobile-amount">
                    {amountMode === "receive" ? L("Quero receber", "I want to receive") : L("Vou converter", "I will convert")}
                  </label>
                  <div className="grid grid-cols-2 border border-tts-border bg-tts-bg p-0.5 text-[11px] font-black text-tts-muted">
                    <button
                      type="button"
                      onClick={() => setAmountMode("send")}
                      className={`min-h-8 px-2 transition ${amountMode === "send" ? "bg-tts-deep text-tts-surface" : "text-tts-muted"}`}
                    >
                      {L("Enviar", "Send")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountMode("receive")}
                      className={`min-h-8 px-2 transition ${amountMode === "receive" ? "bg-tts-deep text-tts-surface" : "text-tts-muted"}`}
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
                  className="tts-fill-field mt-2 min-h-12 w-full rounded-xl border-2 border-tts-border bg-tts-bg px-3 text-2xl font-black text-tts-deep outline-none focus:border-tts-confirm"
                />
              </div>

              <AssetPicker title={L("Moeda de origem", "Source asset")} selectedCode={sourceCode} otherCode={destCode} onSelect={setSourceCode} compact />

              {showBalanceNotice && (hasBlockingBalanceIssue || hasZeroSourceBalance) ? (
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
                  compact
                />
              ) : null}

              <button
                type="button"
                onClick={() => setMobileStageAndScroll("destination")}
                disabled={numericAmount <= 0}
                className="mt-auto min-h-12 w-full shrink-0 bg-tts-confirm px-4 text-sm font-black text-tts-deep transition hover:bg-tts-confirm/90 disabled:cursor-not-allowed disabled:bg-tts-border disabled:text-tts-muted"
              >
                {L("Continuar para destino", "Continue to destination")}
              </button>
            </div>
          ) : null}

          {mobileStage === "destination" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 py-3">
              <div className="shrink-0">
                <p className="text-[11px] font-black uppercase tracking-normal text-tts-confirm">{L("2 de 3", "2 of 3")}</p>
                <h1 className="mt-1 text-2xl font-black text-tts-deep">{L("Moeda de destino", "Destination asset")}</h1>
                <p className="mt-1 truncate text-xs font-bold text-tts-muted">{selectedRateLabel}</p>
              </div>

              <AssetPicker title={L("Moeda de destino", "Destination asset")} selectedCode={destCode} otherCode={sourceCode} onSelect={setDestCode} compact />

              {sameAsset ? (
                <div className="border border-tts-error bg-tts-error/10 p-3 text-sm font-bold leading-6 text-tts-error">
                  {L("Escolha moedas diferentes.", "Choose different currencies.")}
                </div>
              ) : null}

              <div className="mt-auto grid shrink-0 grid-cols-[96px_1fr] gap-2">
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
                  {L("Continuar para conferir", "Continue to review")}
                </button>
              </div>
            </div>
          ) : null}

          {mobileStage === "review" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 py-3">
              <div className="shrink-0">
                <p className="text-[11px] font-black uppercase tracking-normal text-tts-confirm">{L("3 de 3", "3 of 3")}</p>
                <h1 className="mt-1 text-2xl font-black text-tts-deep">{L("Conferir e confirmar", "Review and confirm")}</h1>
              </div>

              <div className="shrink-0 divide-y divide-tts-border border border-tts-border bg-tts-surface">
                <MobileSummaryLine label={L("Sai", "Leaves")} value={sourceSummaryValue} />
                <MobileSummaryLine label={L("Recebe", "Receives")} value={destinationSummaryValue} />
                <MobileSummaryLine label={L("Saldo", "Balance")} value={sourceBalanceDisplay} />
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
                    compact
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

              <div className="mt-auto grid shrink-0 grid-cols-[96px_1fr] gap-2">
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
                  {reviewStatus === "loading" ? L("Abrindo confirmação...", "Opening confirmation...") : hasBlockingBalanceIssue ? L("Saldo insuficiente", "Insufficient balance") : L("Abrir confirmação", "Open confirmation")}
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

        <section className="hidden border border-tts-border bg-tts-surface p-5 md:block" aria-label={L("Cotação selecionada", "Selected quote")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                <ArrowRightLeft className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                {L("Cotação selecionada", "Selected quote")}
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-tts-muted">
                {L(
                  "Mostra só a taxa entre os dois ativos escolhidos. Atualize para buscar a rota mais recente antes de confirmar.",
                  "Shows only the rate between the two selected assets. Refresh to fetch the latest route before confirming."
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

          {rateMatrixStatus === "error" ? (
            <div className="mt-4 flex gap-2 border border-tts-error bg-tts-error/10 p-3 text-sm leading-6 text-tts-error">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{rateMatrixError}</span>
            </div>
          ) : null}
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
                <label className="tts-field-label block text-sm font-black text-tts-deep" htmlFor="convert-amount">
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
                className="tts-fill-field mt-2 min-h-12 w-full rounded-xl border-2 border-tts-border bg-tts-bg px-3 text-base font-bold text-tts-deep outline-none focus:border-tts-gold"
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
                  {reviewStatus === "loading" ? L("Abrindo confirmação...", "Opening confirmation...") : actionLabel}
                </button>
              </div>
            </div>
          </div>
        </section>
        </>
        ) : null}
      </section>
    </main>
  );
}

function MobileConversionGuide({
  stage,
  language,
  amountMode,
  sameAsset,
  hasBlockingBalanceIssue,
  reviewStatus,
  numericAmount,
}: {
  stage: ConvertMobileStage;
  language: AppLanguage;
  amountMode: "send" | "receive";
  sameAsset: boolean;
  hasBlockingBalanceIssue: boolean;
  reviewStatus: "idle" | "loading" | "error";
  numericAmount: number;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  let title = L("Agora", "Now");
  let body = L("Preencha o campo em destaque e avance.", "Fill the highlighted field and continue.");

  if (stage === "source") {
    title = L("Preencha valor e origem", "Fill amount and source");
    body =
      amountMode === "receive"
        ? L("Digite quanto quer receber, escolha a moeda de origem e toque em Continuar para destino.", "Enter how much you want to receive, choose the source asset, then continue to destination.")
        : L("Digite quanto vai sair da conta, escolha a moeda de origem e toque em Continuar para destino.", "Enter how much leaves the account, choose the source asset, then continue to destination.");
  } else if (stage === "destination") {
    title = sameAsset ? L("Escolha outra moeda", "Choose another asset") : L("Escolha o destino", "Choose destination");
    body = sameAsset
      ? L("A moeda de destino precisa ser diferente da origem.", "Destination must be different from source.")
      : L("Toque na moeda que vai receber e depois em Continuar para conferir.", "Tap the asset you will receive, then continue to review.");
  } else if (reviewStatus === "loading") {
    title = L("Preparando confirmação", "Preparing confirmation");
    body = L("Aguarde a tela segura abrir com os valores finais.", "Wait for the secure screen with final amounts.");
  } else if (hasBlockingBalanceIssue) {
    title = L("Saldo insuficiente", "Insufficient balance");
    body = L("Use o botão de adicionar saldo ou volte para ajustar valor e moeda.", "Use the add money button or go back to adjust amount and asset.");
  } else if (numericAmount <= 0) {
    title = L("Falta o valor", "Amount needed");
    body = L("Volte e digite um valor para liberar a confirmação.", "Go back and enter an amount to unlock confirmation.");
  } else {
    title = L("Confira e abra", "Review and open");
    body = L("Revise origem, destino e saldo. Depois toque em Abrir confirmação.", "Review source, destination, and balance. Then tap Open confirmation.");
  }

  return (
    <section className="tts-action-guide mt-3 shrink-0 rounded-xl border border-tts-border px-3 py-2 md:hidden" aria-live="polite">
      <p className="text-[11px] font-black uppercase tracking-normal text-tts-confirm">{title}</p>
      <p className="mt-1 text-xs font-bold leading-5 text-tts-muted">{body}</p>
    </section>
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
      <h3 className={compact ? "text-xs font-black text-tts-deep" : "text-sm font-black text-tts-deep"}>{title}</h3>
      <div className={`tts-choice-grid mt-2 grid gap-2 ${compact ? "grid-cols-2" : ""}`}>
        {ASSETS.map((asset) => {
          const selected = asset.code === selectedCode;
          const paired = asset.code === otherCode;
          return (
            <button
              key={`${title}-${asset.code}`}
              type="button"
              onClick={() => onSelect(asset.code)}
              aria-pressed={selected}
              className={`rounded-xl border text-left transition ${
                compact ? "flex min-h-[3.35rem] items-center gap-2 px-2 py-2" : "min-h-[96px] p-3"
              } ${selected ? "tts-choice-selected border-tts-confirm shadow-sm ring-2 ring-tts-confirm/40" : "tts-choice-idle border-tts-border bg-tts-bg hover:border-tts-border2"} ${paired && !selected ? "opacity-70" : ""}`}
            >
              <span className={`tts-choice-badge inline-flex shrink-0 border px-1.5 py-1 text-[10px] font-black uppercase tracking-normal ${asset.tone}`}>
                {asset.short}
              </span>
              <span className={compact ? "block min-w-0" : "block"}>
                <span className={`tts-choice-name ${compact ? "mt-0 text-xs" : "mt-3 text-sm"} block truncate font-black text-tts-deep`}>{assetName(asset, language)}</span>
                <span className={`tts-choice-description ${compact ? "hidden" : "mt-1 block"} text-xs leading-5 text-tts-muted`}>{assetDescription(asset, language)}</span>
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
    <div className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
      <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">{label}</p>
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
  compact = false,
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
  compact?: boolean;
}) {
  const isError = tone === "error";
  return (
    <div className={`border ${compact ? "p-2" : "p-3"} ${isError ? "border-tts-error bg-tts-error/10" : "border-tts-confirm/60 bg-tts-confirm/10"}`}>
      <div className="flex gap-3">
        <div className={`mt-0.5 flex shrink-0 items-center justify-center border ${compact ? "h-7 w-7" : "h-8 w-8"} ${isError ? "border-tts-error text-tts-error" : "border-tts-confirm text-tts-confirm"}`}>
          {isError ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <p className={`${compact ? "text-xs" : "text-sm"} font-black ${isError ? "text-tts-error" : "text-tts-deep"}`}>{title}</p>
          <p className={`${compact ? "mt-0.5 text-[11px] leading-4" : "mt-1 text-xs leading-5"} font-bold text-tts-muted`}>{body}</p>
        </div>
      </div>
      {currentValue || missingValue ? (
        <div className={`${compact ? "mt-2" : "mt-3"} grid grid-cols-2 gap-2`}>
          {currentValue ? <MiniStat label={currentLabel || "Saldo"} value={currentValue} compact={compact} /> : null}
          {missingValue ? <MiniStat label={missingLabel || "Falta"} value={missingValue} compact={compact} /> : null}
        </div>
      ) : null}
      {actionHref && actionLabel ? (
        <a
          href={actionHref}
          className={`${compact ? "mt-2 min-h-10 text-xs" : "mt-3 min-h-11 text-sm"} inline-flex w-full items-center justify-center gap-2 border border-tts-confirm bg-tts-confirm px-4 py-2 font-black text-tts-deep transition hover:bg-tts-confirm/90`}
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

function MiniStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={`border border-tts-border bg-tts-bg ${compact ? "p-2" : "p-3"}`}>
      <p className={`${compact ? "text-[10px]" : "text-[11px]"} font-black uppercase tracking-normal text-tts-muted`}>{label}</p>
      <p className={`${compact ? "mt-0.5 text-xs" : "mt-1 text-sm"} break-words font-black text-tts-deep`}>{value}</p>
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
