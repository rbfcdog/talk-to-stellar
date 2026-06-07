import { formatCustomerNumber } from "@/lib/customer-amount";

export type TargetAsset = string;
export type RampMode = "onramp" | "offramp";
export type RampResponse = Record<string, any>;

export type PostConversionState = {
  required: boolean;
  pending: boolean;
  failed: boolean;
  completed: boolean;
  sourceAmount: string;
  sourceAsset: string;
  destinationAmount: string;
  destinationAsset: string;
};

const DEFAULT_TTS_TRANSACTION_FEE_BPS = 30;
export const ETHERFUSE_TESTNET_FEE_BPS = 20;
export const ETHERFUSE_TESTNET_FEE_SAMPLE_AMOUNT_BRL = 0.2;
const TRADITIONAL_METHOD_ONRAMP_FEE_PCT = 0.0125;
const TRADITIONAL_METHOD_OFFRAMP_FEE_PCT = 0.0167;
const DEFAULT_TARGET_ASSETS: TargetAsset[] = ["BRL", "USDC", "CETES", "XLM"];
const FIAT_FORMAT_ASSETS = new Set(["BRL", "USD"]);
const ASSET_SYMBOLS: Record<string, string> = {
  BRL: "R$",
  USDC: "US$",
  USD: "US$",
  CETES: "CETES",
  XLM: "XLM",
};
const ASSET_ALIASES: Record<string, TargetAsset> = {
  TESOURO: "BRL",
  REAL: "BRL",
  REAIS: "BRL",
  R$: "BRL",
  USD: "USDC",
  DOLAR: "USDC",
  DOLARES: "USDC",
  DOLLAR: "USDC",
  DOLLARS: "USDC",
  EUR: "CETES",
  EURC: "CETES",
};

export function canonicalAssetCode(value: unknown, fallback = ""): TargetAsset {
  const normalized = String(value || "").trim().toUpperCase().split(":")[0];
  if (!normalized) return fallback;
  return ASSET_ALIASES[normalized] || normalized;
}

function parseConfiguredAssetList(value: unknown): TargetAsset[] {
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => canonicalAssetCode(item))
    .filter(Boolean);
}

function uniqueAssets(values: TargetAsset[]) {
  return Array.from(new Set(values.map((asset) => canonicalAssetCode(asset)).filter(Boolean)));
}

const CONFIGURED_TARGET_ASSETS = parseConfiguredAssetList(
  process.env.NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES ||
  process.env.NEXT_PUBLIC_VISIBLE_ASSET_CODES ||
  process.env.NEXT_PUBLIC_SUPPORTED_ASSET_CODES ||
  "",
);

export const TARGET_ASSETS: TargetAsset[] = uniqueAssets([...DEFAULT_TARGET_ASSETS, ...CONFIGURED_TARGET_ASSETS]);

export function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export function getPostConversionState(transaction?: RampResponse | null, fallbackAsset = ""): PostConversionState {
  const postConversion = transaction?.post_conversion || null;
  const status = String(postConversion?.status || "").toLowerCase();
  const required = Boolean(postConversion?.required);
  const destinationAmount = String(postConversion?.destination_amount || "");
  const sourceAmount = String(postConversion?.source_amount || "");
  const sourceAsset = canonicalAssetCode(postConversion?.source_asset_code || fallbackAsset, fallbackAsset);
  const destinationAsset = canonicalAssetCode(postConversion?.destination_asset_code || fallbackAsset, fallbackAsset);
  const completed = required && status === "completed" && Boolean(destinationAmount);
  const failed = required && status === "failed";

  return {
    required,
    pending: required && !completed && !failed,
    failed,
    completed,
    sourceAmount,
    sourceAsset,
    destinationAmount,
    destinationAsset,
  };
}

export function buildAppPath(path: string, params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) search.set(key, text);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function extractRampReceiptUrl(...sources: unknown[]): string {
  const visited = new Set<unknown>();
  const keys = [
    "receipt_url",
    "receiptUrl",
    "receipt",
    "receipt_link",
    "receiptLink",
    "comprovante_url",
    "comprovanteUrl",
  ];
  const nestedKeys = ["transaction", "completedTransaction", "result", "order", "payload", "context", "metadata", "quote"];

  const visit = (value: unknown, depth = 0): string => {
    if (!value || depth > 3) return "";
    if (typeof value === "string") {
      const trimmed = value.trim();
      return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : "";
    }
    if (typeof value !== "object" || visited.has(value)) return "";
    visited.add(value);
    const record = value as Record<string, unknown>;

    for (const key of keys) {
      const found = visit(record[key], depth + 1);
      if (found) return found;
    }

    for (const key of nestedKeys) {
      const found = visit(record[key], depth + 1);
      if (found) return found;
    }

    return "";
  };

  for (const source of sources) {
    const found = visit(source);
    if (found) return found;
  }
  return "";
}

export function buildRampReceiptFallbackUrl(reference: unknown): string {
  const raw = String(reference || "").trim();
  if (!raw || typeof window === "undefined") return "";
  return `${window.location.origin}/api/external/receipts/${encodeURIComponent(raw)}`;
}

export function safeInternalReturnPath(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || raw.startsWith("//")) return "";
  try {
    const url = new URL(raw, typeof window === "undefined" ? "https://talktostellar.local" : window.location.origin);
    if (typeof window !== "undefined" && url.origin !== window.location.origin) return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw.startsWith("/") ? raw : "";
  }
}

export function normalizeChannelSource(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "telegram" || normalized.includes("telegram")) return "telegram";
  if (
    normalized === "whatsapp" ||
    normalized === "phone" ||
    normalized === "evolution" ||
    normalized === "whatsapp_evolution" ||
    normalized === "whatsapp-evolution" ||
    normalized.includes("whatsapp")
  ) return "whatsapp";
  if (normalized === "web" || normalized === "browser" || normalized === "chat" || normalized === "chat_link") return "web";
  return normalized;
}

export function clientTtsTransactionFeeBps() {
  const parsed = Number(process.env.NEXT_PUBLIC_TALKTOSTELLAR_TRANSACTION_FEE_BPS || process.env.NEXT_PUBLIC_TTS_SPREAD_BPS || DEFAULT_TTS_TRANSACTION_FEE_BPS);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1000) : DEFAULT_TTS_TRANSACTION_FEE_BPS;
}

export function clientTtsTransactionMinBrl() {
  const parsed = Number(process.env.NEXT_PUBLIC_TALKTOSTELLAR_TRANSACTION_MIN_BRL || process.env.NEXT_PUBLIC_TTS_SPREAD_MIN_BRL || 0.05);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.05;
}

export function clientEtherfuseOnRampFeeBps() {
  const parsed = Number(process.env.NEXT_PUBLIC_ETHERFUSE_ONRAMP_FEE_BPS || process.env.NEXT_PUBLIC_ETHERFUSE_TESTNET_FEE_BPS || ETHERFUSE_TESTNET_FEE_BPS);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1000) : ETHERFUSE_TESTNET_FEE_BPS;
}

export function traditionalMethodFeePct(mode: RampMode) {
  return mode === "offramp" ? TRADITIONAL_METHOD_OFFRAMP_FEE_PCT : TRADITIONAL_METHOD_ONRAMP_FEE_PCT;
}

export function estimatePixOnRampGrossForBrlReceive(receiveBrl: number) {
  if (!Number.isFinite(receiveBrl) || receiveBrl <= 0) return 0;
  const providerFee = receiveBrl * (clientEtherfuseOnRampFeeBps() / 10000);
  const ttsFee = Math.max(receiveBrl * (clientTtsTransactionFeeBps() / 10000), clientTtsTransactionMinBrl());
  return Math.ceil((receiveBrl + providerFee + ttsFee - Number.EPSILON) * 100) / 100;
}

export function getStoredSession() {
  if (typeof window === "undefined") return { sessionId: "" };
  return {
    sessionId: "",
  };
}

export function formatMoney(value: unknown, currency = "BRL") {
  const numeric = parseHumanAmount(value);
  if (!Number.isFinite(numeric)) return `${value || "0"} ${currency}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(numeric);
}

export function formatPercentValue(value: number, language: "pt-BR" | "en") {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(language, {
    minimumFractionDigits: safe < 10 && safe > 0 ? 1 : 0,
    maximumFractionDigits: 1,
  }).format(safe);
}

export function toPositiveNumber(value: unknown, fallback = 0) {
  const numeric = parseHumanAmount(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function normalizeHumanAmount(value: unknown) {
  const raw = String(value || "").trim().replace(/\s+/g, "");
  const withoutSymbols = raw.replace(/[^\d.,-]/g, "");
  if (!withoutSymbols || withoutSymbols === "-" || withoutSymbols === "." || withoutSymbols === ",") return "";
  const negative = withoutSymbols.startsWith("-") ? "-" : "";
  const unsigned = withoutSymbols.replace(/^-/, "");
  if (unsigned.includes(",") && unsigned.includes(".")) return `${negative}${unsigned.replace(/\./g, "").replace(",", ".")}`;
  if (unsigned.includes(",")) return `${negative}${unsigned.replace(/\./g, "").replace(",", ".")}`;
  if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(unsigned)) return `${negative}${unsigned.replace(/\./g, "")}`;
  return `${negative}${unsigned}`;
}

export function parseHumanAmount(value: unknown) {
  const numeric = Number(normalizeHumanAmount(value));
  return Number.isFinite(numeric) ? numeric : NaN;
}

export function normalizeTargetAsset(value: unknown, fallback: TargetAsset = "BRL"): TargetAsset {
  return canonicalAssetCode(value, fallback);
}

export function resolveOnRampTargetAssetFromQuery(input: {
  amount?: string;
  asset?: string;
  currency?: string;
  requestedTargetAsset?: string;
}) {
  const requestedTargetAsset = normalizeTargetAsset(input.requestedTargetAsset || "", "");
  if (requestedTargetAsset) return requestedTargetAsset;
  const amountCurrency = normalizeTargetAsset(input.currency || "", "");
  if (input.amount && amountCurrency === "BRL") return "BRL";
  return normalizeTargetAsset(input.asset || amountCurrency, "BRL");
}

export function userFacingAssetCode(code: unknown, fallback: TargetAsset = "BRL") {
  return canonicalAssetCode(code, fallback);
}

export function settlementAssetCode(code: unknown, fallback: TargetAsset = "BRL") {
  const displayCode = userFacingAssetCode(code, fallback);
  return displayCode === "BRL" ? "TESOURO" : displayCode;
}

export function optionalSettlementAssetCode(code: unknown) {
  const raw = String(code || "").trim();
  return raw ? settlementAssetCode(raw) : undefined;
}

export function formatAsset(value: unknown, code = "BRL") {
  const numeric = parseHumanAmount(value);
  if (!Number.isFinite(numeric)) return `${value || "0"} ${code}`;
  return `${formatCustomerNumber(numeric)} ${code}`;
}

export function formatRampAsset(value: unknown, code = "BRL") {
  const displayCode = userFacingAssetCode(code);
  if (FIAT_FORMAT_ASSETS.has(displayCode)) return formatMoney(value, displayCode === "USD" ? "USD" : displayCode);
  return formatAsset(value, displayCode);
}

export function quoteCurrencyCode(value: unknown, fallback: TargetAsset = "BRL") {
  return canonicalAssetCode(value, fallback);
}

export function formatQuoteAmount(value: unknown, currency: TargetAsset = "BRL") {
  return formatRampAsset(value, currency);
}

export function formatApiAmount(value: unknown) {
  const numeric = parseHumanAmount(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return numeric.toFixed(7).replace(/\.?0+$/, "");
}

export function quoteBrlDestinationAmount(quote: RampResponse | null | undefined) {
  if (!quote) return NaN;
  const candidates = [
    quote.target_brl,
    quote.targetBrl,
    quote.destination_amount,
    quote.destinationAmount,
    quote.destinationAmountAfterFee,
    quote.toAmount,
    quote.quote?.target_brl,
    quote.quote?.destination_amount,
    quote.quote?.destinationAmount,
    quote.quote?.destinationAmountAfterFee,
    quote.quote?.toAmount,
  ];
  for (const candidate of candidates) {
    const parsed = parseHumanAmount(candidate);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return NaN;
}

export function estimatedBrlOffRampFeeParts(destinationBrl: number) {
  if (!Number.isFinite(destinationBrl) || destinationBrl <= 0) {
    return { providerFee: NaN, appFee: NaN, totalFee: NaN };
  }
  const providerFee = destinationBrl * (ETHERFUSE_TESTNET_FEE_BPS / 10000);
  const appFee = Math.max(destinationBrl * (clientTtsTransactionFeeBps() / 10000), clientTtsTransactionMinBrl());
  return {
    providerFee,
    appFee,
    totalFee: providerFee + appFee,
  };
}

export function buildRampFeeBridgeEstimate(mode: RampMode, quote: RampResponse | null | undefined) {
  if (!quote) return null;

  const sourceCurrency = quoteCurrencyCode(quote.fromCurrency, "BRL");
  const offRampTargetBrlRaw = mode === "offramp"
    ? (quote.target_brl || quote.targetBrl || quote.destination_amount || quote.destinationAmount || quote.destinationAmountAfterFee || quote.toAmount || "")
    : "";
  const finalConversionRequired = Boolean(quote.finalConversionRequired || quote.finalConversionSourceAmount);
  const hasFinalConversionAmount = Boolean(quote.finalAmountAfterFee || quote.userFacingToAmount || quote.requestedFinalAmount);
  const finalConversionPending = Boolean(finalConversionRequired && !hasFinalConversionAmount);
  const destinationCurrency = hasFinalConversionAmount
    ? quoteCurrencyCode(quote.finalCurrency || quote.userFacingToCurrency, "BRL")
    : finalConversionPending
      ? "BRL"
      : quoteCurrencyCode(quote.toCurrency, "BRL");
  const isTesouroOfframp = mode === "offramp" && /TESOURO/i.test(String(quote.fromCurrency || ""));
  const destinationBeforeRaw = offRampTargetBrlRaw
    ? offRampTargetBrlRaw
    : isTesouroOfframp
      ? (quote.fromAmount || "")
      : finalConversionPending
        ? (quote.anchorAmountBeforeFee || quote.destinationAmountBeforeFee || quote.destinationAmount || quote.fromAmount || "")
        : hasFinalConversionAmount
          ? (quote.finalAmountBeforeFee || quote.finalAmountAfterFee || quote.userFacingToAmount || "")
          : (quote.destinationAmountBeforeFee || quote.destinationAmount || "");
  const destinationAfterRaw = hasFinalConversionAmount
    ? (quote.finalAmountAfterFee || quote.userFacingToAmount || "")
    : finalConversionPending
      ? (quote.anchorAmountAfterFee || quote.finalConversionSourceAmount || quote.destinationAmountAfterFee || quote.toAmount || "")
      : offRampTargetBrlRaw
        ? offRampTargetBrlRaw
        : isTesouroOfframp
          ? (quote.fromAmount || "")
          : (quote.destinationAmountAfterFee || quote.toAmount || "");
  const sourceAmount = parseHumanAmount(quote.fromAmount);
  const destinationBefore = parseHumanAmount(destinationBeforeRaw);
  const destinationAfter = parseHumanAmount(destinationAfterRaw);
  const providerFeeRaw = quote.anchorProviderFeeAmount || quote.feeAmount || quote.fee || "";
  const explicitProviderFeeCurrency = quoteCurrencyCode(quote.anchorProviderFeeCurrency || quote.providerFeeCurrency || quote.feeCurrency, "BRL");
  const backendTotalFee = parseHumanAmount(quote.totalFeeAmount);
  const backendTtsFee = parseHumanAmount(quote.talkToStellarFeeAmount);
  const backendTtsFeeCurrency = quoteCurrencyCode(quote.talkToStellarFeeCurrency, sourceCurrency);
  const providerFee = parseHumanAmount(providerFeeRaw);
  const feeBps = parseHumanAmount(quote.feeBps || ETHERFUSE_TESTNET_FEE_BPS);
  const brlDestinationAmount = mode === "offramp" ? quoteBrlDestinationAmount(quote) : NaN;
  const brlOffRampFeeParts = mode === "offramp" ? estimatedBrlOffRampFeeParts(brlDestinationAmount) : null;
  const hasBackendFeeBridge = Number.isFinite(backendTotalFee) && backendTotalFee >= 0 && Number.isFinite(destinationAfter);
  const inferredDestinationFee = Number.isFinite(destinationBefore) && Number.isFinite(destinationAfter)
    ? Math.max(destinationBefore - destinationAfter, 0)
    : NaN;
  const providerFeeFromBps = mode === "offramp" && brlOffRampFeeParts && Number.isFinite(brlOffRampFeeParts.providerFee)
    ? brlOffRampFeeParts.providerFee
    : Number.isFinite(sourceAmount) && sourceAmount > 0 && Number.isFinite(feeBps) && feeBps > 0
      ? sourceAmount * (feeBps / 10000)
      : 0;
  const feeFromGrossToNet = Number.isFinite(sourceAmount) && Number.isFinite(destinationAfter) && sourceCurrency === destinationCurrency
    ? Math.max(sourceAmount - destinationAfter, 0)
    : NaN;
  const providerFeeAmount = hasBackendFeeBridge && Number.isFinite(providerFee)
    ? providerFee
    : Number.isFinite(inferredDestinationFee) && inferredDestinationFee > 0
      ? inferredDestinationFee
      : Number.isFinite(providerFee) && providerFee > 0
        ? providerFee
        : providerFeeFromBps;
  const providerFeeCurrency = mode === "offramp" && Number.isFinite(providerFeeFromBps) && providerFeeFromBps > 0
    ? "BRL"
    : Number.isFinite(providerFee) && providerFee > 0
      ? explicitProviderFeeCurrency
      : Number.isFinite(inferredDestinationFee) && inferredDestinationFee > 0
        ? destinationCurrency
        : explicitProviderFeeCurrency;
  const providerFeePct = Number.isFinite(feeBps) && feeBps > 0
    ? feeBps / 100
    : Number.isFinite(destinationBefore) && destinationBefore > 0
      ? (providerFeeAmount / destinationBefore) * 100
      : Number.isFinite(sourceAmount) && sourceAmount > 0
        ? (providerFeeAmount / sourceAmount) * 100
        : NaN;
  const ttsTransactionFeeBps = clientTtsTransactionFeeBps();
  const canEstimateTtsFee = sourceCurrency === "BRL" || sourceCurrency === "USDC";
  const hasBackendTtsFee = Number.isFinite(backendTtsFee) && backendTtsFee > 0;
  const ttsTransactionFeeAmount = hasBackendTtsFee
    ? backendTtsFee
    : Number.isFinite(feeFromGrossToNet) && feeFromGrossToNet > providerFeeAmount
      ? Math.max(feeFromGrossToNet - providerFeeAmount, 0)
      : mode === "offramp" && brlOffRampFeeParts && Number.isFinite(brlOffRampFeeParts.appFee)
        ? brlOffRampFeeParts.appFee
        : canEstimateTtsFee && Number.isFinite(sourceAmount) && sourceAmount > 0
          ? sourceAmount * (ttsTransactionFeeBps / 10000)
          : 0;
  const ttsTransactionFeePct = ttsTransactionFeeAmount > 0 ? ttsTransactionFeeBps / 100 : 0;
  const ttsTransactionFeeCurrency = hasBackendTtsFee
    ? backendTtsFeeCurrency
    : mode === "offramp" && brlOffRampFeeParts && Number.isFinite(brlOffRampFeeParts.appFee)
      ? "BRL"
      : sourceCurrency;
  const sameCurrencyBridge = sourceCurrency === destinationCurrency && Number.isFinite(sourceAmount) && sourceAmount > 0;
  const grossComparableAmount = sameCurrencyBridge
    ? sourceAmount
    : Number.isFinite(destinationBefore) && destinationBefore > 0
      ? destinationBefore
      : NaN;
  const providerFeeInDestination = sameCurrencyBridge && providerFeeCurrency === destinationCurrency
    ? providerFeeAmount
    : providerFeeAmount;
  const ttsFeeInDestination = sameCurrencyBridge ? ttsTransactionFeeAmount : 0;
  const netDestinationAmount = mode === "offramp" && Number.isFinite(brlDestinationAmount) && brlDestinationAmount > 0
    ? brlDestinationAmount
    : hasBackendFeeBridge && Number.isFinite(destinationAfter)
      ? destinationAfter
      : sameCurrencyBridge && Number.isFinite(grossComparableAmount)
        ? Math.max(0, grossComparableAmount - providerFeeInDestination - ttsFeeInDestination)
        : Number.isFinite(destinationAfter)
          ? destinationAfter
          : NaN;
  const totalRouteFeePct = (Number.isFinite(providerFeePct) ? providerFeePct : 0) + ttsTransactionFeePct;

  return {
    sourceCurrency,
    destinationCurrency,
    destinationBeforeRaw: sameCurrencyBridge && Number.isFinite(grossComparableAmount) ? formatApiAmount(grossComparableAmount) : destinationBeforeRaw,
    destinationAfterRaw: Number.isFinite(netDestinationAmount) ? formatApiAmount(netDestinationAmount) : destinationAfterRaw,
    providerFeeAmount,
    providerFeeCurrency,
    providerFeePct,
    ttsTransactionFeeAmount,
    ttsTransactionFeePct,
    ttsTransactionFeeCurrency,
    totalRouteFeePct,
    netDestinationAmount,
    sourceAmount,
    sameCurrencyBridge,
    finalConversionPending,
    finalConversionRequired,
    retainedPct: Number.isFinite(grossComparableAmount) && grossComparableAmount > 0 && Number.isFinite(netDestinationAmount)
      ? (netDestinationAmount / grossComparableAmount) * 100
      : NaN,
  };
}

export function friendlyAssetName(code: unknown, language: "pt-BR" | "en" = "pt-BR") {
  const displayCode = userFacingAssetCode(code);
  return ASSET_SYMBOLS[displayCode] || displayCode || (language === "pt-BR" ? "R$" : "BRL");
}
