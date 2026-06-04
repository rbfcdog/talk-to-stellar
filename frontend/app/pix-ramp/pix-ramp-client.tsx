"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { AccountStatusCard } from "@/components/shared/account-status";
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback";
import { useLanguage } from "@/lib/i18n";
import { getClientSession } from "@/lib/session";
import { mapPublicError } from "@/lib/public-errors";
import { trackUserResearchEvent } from "@/lib/user-research";

type Step = "quote" | "checkout" | "success";
type TargetAsset = string;
type RampMode = "onramp" | "offramp";

type RampConfig = {
  sandbox?: boolean;
  available?: boolean;
  testnet_only?: boolean;
  network?: string;
  stellar_network_id?: "TESTNET" | "PUBLIC";
  unavailable_reason?: string;
  user_facing_mocks_allowed?: boolean;
  ops_mocks_allowed?: boolean;
  local_mock_fallback_allowed?: boolean;
  asset?: { code: string; issuer: string; identifier: string };
};

type BalanceItem = {
  asset_code: string;
  asset_issuer?: string;
  balance: string;
};

type BalanceDelta = {
  asset_code: string;
  asset_issuer?: string;
  before: string;
  after: string;
  delta: string;
};

type RampResponse = Record<string, any>;
type RampAuth = { session_id: string };
type ExternalBankAccount = {
  id: string;
  label: string;
  institution: string;
  branch: string;
  account_number: string;
  pix_key: string;
  pix_key_type?: string;
  provider_fiat_account_id?: string;
  providerFiatAccountId?: string;
  fiat_account_id?: string;
  fiatAccountId?: string;
  bank_account_id?: string;
  bankAccountId?: string;
  metadata?: Record<string, unknown>;
};
type LiveStepState = "done" | "active" | "pending" | "warning";
type LiveStep = {
  label: string;
  detail: string;
  state: LiveStepState;
};
type DebugLogEntry = {
  id: string;
  at: string;
  label: string;
  method: string;
  path: string;
  status?: number;
  durationMs?: number;
  request?: unknown;
  response?: unknown;
  error?: string;
};

const DEFAULT_TTS_TRANSACTION_FEE_BPS = 30;
const ETHERFUSE_TESTNET_FEE_BPS = 20;
const ETHERFUSE_TESTNET_FEE_SAMPLE_AMOUNT_BRL = 0.2;
const TRADITIONAL_METHOD_FEE_PCT = 0.035;
const RAMP_REQUEST_TIMEOUT_MS = 120000;
const RAMP_ONRAMP_REQUEST_TIMEOUT_MS = 60000;
const BASIC_TARGET_ASSETS: TargetAsset[] = ["BRL"];
const DEFAULT_ADVANCED_TARGET_ASSETS: TargetAsset[] = ["BRL", "USDC", "CETES", "XLM"];
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
  EURO: "CETES",
  EUROS: "CETES",
};

function canonicalAssetCode(value: unknown, fallback = ""): TargetAsset {
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

function buildAppPath(path: string, params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) search.set(key, text);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function extractRampReceiptUrl(...sources: unknown[]): string {
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

function buildRampReceiptFallbackUrl(reference: unknown): string {
  const raw = String(reference || "").trim();
  if (!raw || typeof window === "undefined") return "";
  return `${window.location.origin}/api/external/receipts/${encodeURIComponent(raw)}`;
}

function safeInternalReturnPath(value: unknown) {
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

function normalizeChannelSource(value: unknown) {
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

const CONFIGURED_TARGET_ASSETS = parseConfiguredAssetList(
  process.env.NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES ||
  process.env.NEXT_PUBLIC_VISIBLE_ASSET_CODES ||
  process.env.NEXT_PUBLIC_SUPPORTED_ASSET_CODES ||
  ""
);
const ADVANCED_TARGET_ASSETS: TargetAsset[] = uniqueAssets([...DEFAULT_ADVANCED_TARGET_ASSETS, ...CONFIGURED_TARGET_ASSETS]);

function isBasicAsset(asset: TargetAsset) {
  return BASIC_TARGET_ASSETS.includes(canonicalAssetCode(asset));
}

function isAdvancedAsset(asset: TargetAsset) {
  return !isBasicAsset(asset);
}

function clientTtsTransactionFeeBps() {
  const parsed = Number(process.env.NEXT_PUBLIC_TALKTOSTELLAR_TRANSACTION_FEE_BPS || process.env.NEXT_PUBLIC_TTS_SPREAD_BPS || DEFAULT_TTS_TRANSACTION_FEE_BPS);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1000) : DEFAULT_TTS_TRANSACTION_FEE_BPS;
}

function clientTtsTransactionMinBrl() {
  const parsed = Number(process.env.NEXT_PUBLIC_TALKTOSTELLAR_TRANSACTION_MIN_BRL || process.env.NEXT_PUBLIC_TTS_SPREAD_MIN_BRL || 0.05);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0.05;
}

function clientEtherfuseOnRampFeeBps() {
  const parsed = Number(process.env.NEXT_PUBLIC_ETHERFUSE_ONRAMP_FEE_BPS || process.env.NEXT_PUBLIC_ETHERFUSE_TESTNET_FEE_BPS || ETHERFUSE_TESTNET_FEE_BPS);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1000) : ETHERFUSE_TESTNET_FEE_BPS;
}

function estimatePixOnRampGrossForBrlReceive(receiveBrl: number) {
  if (!Number.isFinite(receiveBrl) || receiveBrl <= 0) return 0;
  const providerFee = receiveBrl * (clientEtherfuseOnRampFeeBps() / 10000);
  const ttsFee = Math.max(receiveBrl * (clientTtsTransactionFeeBps() / 10000), clientTtsTransactionMinBrl());
  return Math.ceil((receiveBrl + providerFee + ttsFee - Number.EPSILON) * 100) / 100;
}

function getStoredSession() {
  if (typeof window === "undefined") return { sessionId: "" };
  return {
    sessionId: "",
  };
}

function formatMoney(value: unknown, currency = "BRL") {
  const numeric = parseHumanAmount(value);
  if (!Number.isFinite(numeric)) return `${value || "0"} ${currency}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(numeric);
}

function toPositiveNumber(value: unknown, fallback = 0) {
  const numeric = parseHumanAmount(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalizeHumanAmount(value: unknown) {
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

function parseHumanAmount(value: unknown) {
  const numeric = Number(normalizeHumanAmount(value));
  return Number.isFinite(numeric) ? numeric : NaN;
}

function normalizeTargetAsset(value: unknown, fallback: TargetAsset = "BRL"): TargetAsset {
  return canonicalAssetCode(value, fallback);
}

function resolveOnRampTargetAssetFromQuery(input: {
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

function userFacingAssetCode(code: unknown, fallback: TargetAsset = "BRL") {
  return canonicalAssetCode(code, fallback);
}

function settlementAssetCode(code: unknown, fallback: TargetAsset = "BRL") {
  const displayCode = userFacingAssetCode(code, fallback);
  return displayCode === "BRL" ? "TESOURO" : displayCode;
}

function optionalSettlementAssetCode(code: unknown) {
  const raw = String(code || "").trim();
  return raw ? settlementAssetCode(raw) : undefined;
}

function formatAsset(value: unknown, code = "BRL") {
  const numeric = parseHumanAmount(value);
  if (!Number.isFinite(numeric)) return `${value || "0"} ${code}`;
  return `${numeric.toLocaleString("en-US", { maximumFractionDigits: 7 })} ${code}`;
}

function formatRampAsset(value: unknown, code = "BRL") {
  const displayCode = userFacingAssetCode(code);
  if (FIAT_FORMAT_ASSETS.has(displayCode)) return formatMoney(value, displayCode === "USD" ? "USD" : displayCode);
  return formatAsset(value, displayCode);
}

function quoteCurrencyCode(value: unknown, fallback: TargetAsset = "BRL") {
  return canonicalAssetCode(value, fallback);
}

function formatQuoteAmount(value: unknown, currency: TargetAsset = "BRL") {
  return formatRampAsset(value, currency);
}

function formatFeeParts(parts: Array<{ amount: number; currency: TargetAsset }>) {
  const grouped = new Map<TargetAsset, number>();
  for (const part of parts) {
    if (!Number.isFinite(part.amount) || part.amount <= 0) continue;
    grouped.set(part.currency, (grouped.get(part.currency) || 0) + part.amount);
  }
  return Array.from(grouped.entries())
    .map(([currency, amount]) => formatQuoteAmount(amount.toFixed(7), currency))
    .join(" + ");
}

function formatApiAmount(value: unknown) {
  const numeric = parseHumanAmount(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return numeric.toFixed(7).replace(/\.?0+$/, "");
}

function buildRampFeeBridgeEstimate(mode: RampMode, quote: RampResponse | null | undefined) {
  if (!quote) return null;

  const sourceCurrency = quoteCurrencyCode(quote.fromCurrency, "BRL");
  const finalConversionRequired = Boolean(quote.finalConversionRequired || quote.finalConversionSourceAmount);
  const hasFinalConversionAmount = Boolean(quote.finalAmountAfterFee || quote.userFacingToAmount || quote.requestedFinalAmount);
  const finalConversionPending = Boolean(finalConversionRequired && !hasFinalConversionAmount);
  const destinationCurrency = hasFinalConversionAmount
    ? quoteCurrencyCode(quote.finalCurrency || quote.userFacingToCurrency, "BRL")
    : finalConversionPending
      ? "BRL"
      : quoteCurrencyCode(quote.toCurrency, "BRL");
  const isTesouroOfframp = mode === "offramp" && /TESOURO/i.test(String(quote.fromCurrency || ""));
  const destinationBeforeRaw = isTesouroOfframp
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
    : isTesouroOfframp
      ? (quote.fromAmount || "") // TESOURO=BRL 1:1, source amount is the destination
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
  const hasBackendFeeBridge = Number.isFinite(backendTotalFee) && backendTotalFee >= 0 && Number.isFinite(destinationAfter);
  const inferredDestinationFee = Number.isFinite(destinationBefore) && Number.isFinite(destinationAfter)
    ? Math.max(destinationBefore - destinationAfter, 0)
    : NaN;
  const providerFeeFromBps = Number.isFinite(sourceAmount) && sourceAmount > 0 && Number.isFinite(feeBps) && feeBps > 0
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
  const providerFeeCurrency = Number.isFinite(providerFee) && providerFee > 0
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
  const ttsTransactionFeeAmount = Number.isFinite(backendTtsFee)
    ? backendTtsFee
    : Number.isFinite(feeFromGrossToNet) && feeFromGrossToNet > providerFeeAmount
      ? Math.max(feeFromGrossToNet - providerFeeAmount, 0)
    : canEstimateTtsFee && Number.isFinite(sourceAmount) && sourceAmount > 0
      ? sourceAmount * (ttsTransactionFeeBps / 10000)
      : 0;
  const ttsTransactionFeePct = ttsTransactionFeeAmount > 0 ? ttsTransactionFeeBps / 100 : 0;
  const ttsTransactionFeeCurrency = Number.isFinite(backendTtsFee) ? backendTtsFeeCurrency : sourceCurrency;
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
  const netDestinationAmount = hasBackendFeeBridge && Number.isFinite(destinationAfter)
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

function friendlyAssetName(code: unknown, language: "pt-BR" | "en" = "pt-BR") {
  const displayCode = userFacingAssetCode(code);
  return ASSET_SYMBOLS[displayCode] || displayCode || (language === "pt-BR" ? "R$" : "BRL");
}

function formatCountdown(ms: number, language: "pt-BR" | "en" = "pt-BR") {
  if (!Number.isFinite(ms) || ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseRampTimestamp(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  const parsed = Date.parse(raw);
  if (Number.isFinite(parsed)) return parsed;
  // Some APIs emit nanosecond precision; browsers only need milliseconds.
  return Date.parse(raw.replace(/\.(\d{3})\d+(Z|[+-]\d\d:\d\d)?$/, ".$1$2"));
}

function normalizeStatus(status: unknown) {
  return String(status || "pending").toLowerCase();
}

function isTerminalStatus(status: unknown) {
  return ["completed", "failed", "expired", "cancelled", "canceled", "refunded"].includes(normalizeStatus(status));
}

function isSuccessStatus(status: unknown) {
  return normalizeStatus(status) === "completed";
}

function isFailureStatus(status: unknown) {
  return ["failed", "expired", "cancelled", "canceled", "refunded"].includes(normalizeStatus(status));
}

function statusLabel(status: unknown, language: "pt-BR" | "en" = "pt-BR") {
  const normalized = normalizeStatus(status);
  const Ls = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  if (normalized === "completed") return Ls("Concluído", "Completed");
  if (normalized === "processing" || normalized === "funded") return Ls("Processando", "Processing");
  if (normalized === "pending") return Ls("Aguardando", "Waiting");
  if (normalized === "failed") return Ls("Falhou", "Failed");
  if (normalized === "expired") return Ls("Expirado", "Expired");
  if (normalized === "cancelled" || normalized === "canceled") return Ls("Cancelado", "Cancelled");
  if (normalized === "refunded") return Ls("Reembolsado", "Refunded");
  if (normalized === "cotação expirada" || normalized === "quote expired") return Ls("Estimativa expirada", "Estimate expired");
  if (normalized === "não iniciado" || normalized === "not started") return Ls("Não iniciado", "Not started");
  return normalized || Ls("Aguardando", "Waiting");
}

function balanceKey(balance: BalanceItem) {
  return `${balance.asset_code}:${balance.asset_issuer || "native"}`;
}

function calculateDeltas(before: BalanceItem[], after: BalanceItem[]): BalanceDelta[] {
  const keys = new Set([...before.map(balanceKey), ...after.map(balanceKey)]);
  return Array.from(keys).map((key) => {
    const previous = before.find((item) => balanceKey(item) === key);
    const next = after.find((item) => balanceKey(item) === key);
    const beforeValue = Number(previous?.balance || 0);
    const afterValue = Number(next?.balance || 0);
    const delta = afterValue - beforeValue;
    return {
      asset_code: next?.asset_code || previous?.asset_code || key.split(":")[0],
      asset_issuer: next?.asset_issuer || previous?.asset_issuer,
      before: previous?.balance || "0",
      after: next?.balance || "0",
      delta: Number.isFinite(delta) ? delta.toFixed(7).replace(/\.?0+$/, "") : "0",
    };
  });
}

function sumVisibleBalance(balances: BalanceItem[], assetCode: TargetAsset) {
  return balances
    .filter((balance) => userFacingAssetCode(balance.asset_code, assetCode) === assetCode)
    .reduce((total, balance) => {
      const parsed = parseHumanAmount(balance.balance);
      return total + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
}

function formatVisibleBalance(balances: BalanceItem[], assetCode: TargetAsset) {
  return formatRampAsset(sumVisibleBalance(balances, assetCode).toFixed(7), assetCode);
}

function visibleBalanceDelta(before: BalanceItem[], after: BalanceItem[], assetCode: TargetAsset) {
  if (!after.length) return 0;
  return sumVisibleBalance(after, assetCode) - sumVisibleBalance(before, assetCode);
}

function formatVisibleDelta(before: BalanceItem[], after: BalanceItem[], assetCode: TargetAsset, language: "pt-BR" | "en" = "pt-BR") {
  if (!after.length) return "Updating";
  const delta = visibleBalanceDelta(before, after, assetCode);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatRampAsset(delta.toFixed(7), assetCode)}`;
}

function isInsufficientBalanceText(value: unknown) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /saldo insuficiente|insufficient balance|not enough balance|complete o saldo/.test(normalized);
}

function assertSufficientVisibleBalance(balances: BalanceItem[], assetCode: TargetAsset, requestedValue: unknown) {
  const requested = parseHumanAmount(requestedValue);
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new Error("Enter a valid withdrawal amount.");
  }
  const available = sumVisibleBalance(balances, assetCode);
  if (available + 0.0000001 < requested) {
    throw new Error(
      `Insufficient balance. You have ${formatRampAsset(available.toFixed(7), assetCode)} available and tried to withdraw ${formatRampAsset(requested.toFixed(7), assetCode)}.`
    );
  }
}

function InlineSpinner({ tone = "emerald" }: { tone?: "emerald" | "cyan" | "amber" | "white" }) {
  const color = tone === "cyan"
    ? "border-tts-gold border-t-cyan-500"
    : tone === "amber"
      ? "border-tts-gold border-t-amber-600"
      : tone === "white"
        ? "border-tts-border border-t-white"
        : "border-tts-confirm border-t-emerald-600";
  return <span className={`inline-block h-4 w-4 animate-spin rounded-full border-2 ${color}`} aria-hidden="true" />;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function createLocalIntentNonce() {
  const randomId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return randomId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
}

function buildExternalBankAccount(seed: string, email: string): ExternalBankAccount {
  const hash = stableHash(`${seed || "talktostellar"}:${email || "account"}`);
  const digits = String(parseInt(hash.slice(0, 6), 16)).padStart(8, "0");
  const account = `${digits.slice(0, 5)}-${digits.slice(5, 6)}`;
  const branch = `${digits.slice(1, 5)}`;
  const pixAlias = email.includes("@") ? email : `pix-${hash.slice(0, 6)}@talktostellar.bank`;
  return {
    id: `bank-${hash}`,
    label: "Your PIX",
    institution: "Linked PIX destination",
    branch,
    account_number: account,
    pix_key: pixAlias,
  };
}

function normalizePixKeyInput(value: string) {
  return String(value || "").trim();
}

function inferPixKeyType(value: string) {
  const pixKey = normalizePixKeyInput(value);
  const digits = pixKey.replace(/\D+/g, "");
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pixKey)) return "email";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pixKey)) return "evp";
  if (digits.length === 11 && (/^\d{11}$/.test(pixKey) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(pixKey))) return "cpf";
  if (digits.length === 14 && (/^\d{14}$/.test(pixKey) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(pixKey))) return "cnpj";
  if (/^\+?\d[\d\s().-]{7,}$/.test(pixKey)) return "phone";
  return "evp";
}

function buildDynamicExternalBankAccount(seed: string, email: string, pixKey: string): ExternalBankAccount {
  const normalizedPixKey = normalizePixKeyInput(pixKey);
  const fallback = buildExternalBankAccount(seed, email);
  const hash = stableHash(`${seed || "talktostellar"}:${normalizedPixKey}`);
  const pixKeyType = inferPixKeyType(normalizedPixKey);
  return {
    ...fallback,
    id: `pix-destination-${hash}`,
    label: "PIX informado",
    institution: "Destino PIX informado",
    pix_key: normalizedPixKey,
    pix_key_type: pixKeyType,
    metadata: {
      ...(fallback.metadata || {}),
      pix_key_type: pixKeyType,
      user_entered_pix_key: true,
    },
  };
}

function getProviderFiatAccountId(account: ExternalBankAccount | null | undefined) {
  const metadata = account?.metadata || {};
  return String(
    account?.provider_fiat_account_id ||
    account?.providerFiatAccountId ||
    account?.fiat_account_id ||
    account?.fiatAccountId ||
    account?.bank_account_id ||
    account?.bankAccountId ||
    metadata.provider_fiat_account_id ||
    metadata.providerFiatAccountId ||
    metadata.fiat_account_id ||
    metadata.fiatAccountId ||
    metadata.bank_account_id ||
    metadata.bankAccountId ||
    "",
  ).trim();
}

function WalletPinInput({
  value,
  onChange,
  tone = "emerald",
  inputRef,
  placeholder = "Enter your PIN",
  clearLabel = "Clear",
}: {
  value: string;
  onChange: (next: string) => void;
  tone?: "emerald" | "cyan" | "amber";
  inputRef?: (node: HTMLInputElement | null) => void;
  placeholder?: string;
  clearLabel?: string;
}) {
  const border = tone === "cyan"
    ? "focus-within:border-tts-gold"
    : tone === "amber"
      ? "focus-within:border-tts-gold"
      : "focus-within:border-tts-confirm";

  return (
    <div className={`mt-2 rounded-2xl border border-tts-border bg-tts-bg transition ${border}`}>
      <div className="flex items-center gap-3">
        <input
          className="min-w-0 flex-1 bg-transparent px-4 py-4 text-xl font-black tracking-[0.35em] text-tts-deep outline-none placeholder:tracking-normal placeholder:text-tts-muted"
          ref={inputRef}
          value={value}
          inputMode="numeric"
          pattern="[0-9]*"
          type="text"
          name="wallet-pin-code"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          style={{ WebkitTextSecurity: "disc" } as any}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
        />
        <button
          type="button"
          className="mr-2 rounded-full border border-tts-border bg-tts-surface px-3 py-2 text-xs font-black text-tts-muted transition hover:text-tts-deep"
          onClick={() => onChange("")}
        >
          {clearLabel}
        </button>
      </div>
    </div>
  );
}

function sanitizeForDebug(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 8).map(sanitizeForDebug);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/token|secret|authorization|password|pin/i.test(key)) return [key, "[redacted]"];
    if (typeof item === "string" && item.length > 240) return [key, `${item.slice(0, 240)}...`];
    if (item && typeof item === "object") return [key, sanitizeForDebug(item)];
    return [key, item];
  }));
}

function hideInternalAssetNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hideInternalAssetNames);
  if (typeof value === "string") {
    return value
      .replace(/TESOURO:[A-Z2-7]{56}/g, "BRL")
      .replace(/\bTESOURO\b/g, "BRL");
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/tesouro|anchor_asset/i.test(key)) return [key, "[interno]"];
    return [key, hideInternalAssetNames(item)];
  }));
}

function getRampCustomerId(payload: RampResponse | null | undefined) {
  return String(
    payload?.customer?.id ||
    payload?.customer?.customerId ||
    payload?.customer_id ||
    payload?.customerId ||
    "",
  ).trim();
}

function getRampBankAccountId(payload: RampResponse | null | undefined) {
  return String(
    payload?.bank_account_id ||
    payload?.bankAccountId ||
    payload?.customer?.bankAccountId ||
    payload?.customer?.bank_account_id ||
    "",
  ).trim();
}

function mergeRampCustomerPayload(base: RampResponse | null | undefined, payload: RampResponse | null | undefined): RampResponse | null {
  const customerId = String(payload?.customer_id || payload?.customerId || payload?.customer?.id || "").trim();
  const bankAccountId = getRampBankAccountId(payload);
  const hasCustomerContext = Boolean(
    payload?.customer ||
    customerId ||
    bankAccountId ||
    payload?.kyc_url ||
    payload?.kycUrl ||
    payload?.programmatic_onboarding ||
    payload?.programmaticOnboarding
  );
  if (!hasCustomerContext) return base || null;
  return {
    ...(base || {}),
    ...(payload?.customer ? { customer: payload.customer } : {}),
    ...(customerId ? { customer_id: customerId } : {}),
    ...(bankAccountId ? { bank_account_id: bankAccountId } : {}),
    ...(payload?.kyc_url || payload?.kycUrl ? { kyc_url: payload.kyc_url || payload.kycUrl } : {}),
    ...(payload?.programmatic_onboarding || payload?.programmaticOnboarding ? { programmatic_onboarding: payload.programmatic_onboarding || payload.programmaticOnboarding } : {}),
  };
}

function formatDebugJson(value: unknown) {
  return JSON.stringify(hideInternalAssetNames(value || {}), null, 2);
}

function publicRampErrorMessage(error: unknown, language: "pt-BR" | "en") {
  const payload = (error as Error & { payload?: RampResponse })?.payload;
  const raw = String(payload?.message || (error instanceof Error ? error.message : String(error || "")));
  const code = String(payload?.code || "").toLowerCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (code === "pix_account_not_ready" || code === "pix_account_warming_up") {
    return language === "pt-BR"
      ? "Sua conta PIX está sendo preparada. Aguarde alguns segundos e toque em Gerar PIX novamente."
      : "Your PIX account is being prepared. Wait a few seconds and tap Generate PIX again.";
  }
  if (/uuid parsing|json deserialize error|accountregistration/.test(normalized)) {
    return language === "pt-BR"
      ? "Não consegui preparar seu PIX nesta tentativa. Toque em Ver valor final e tente confirmar novamente."
      : "I could not prepare your PIX on this attempt. Tap Show final amount and try confirming again.";
  }
  const mapped = mapPublicError(raw, language);
  const isTechnical =
    /session_id|session_token|internal authorization|backend|proxy|schema cache|could not find the table|relation .* does not exist|fetch failed|timeout|timed out|econn|etherfuse|provider/.test(normalized);
  if (isTechnical || mapped.code !== "temporary_unavailable") return mapped.message;
  return raw || mapped.message;
}

function publicPixPreparationTimeoutMessage(language: "pt-BR" | "en") {
  return language === "pt-BR"
    ? "Ainda estou preparando seu PIX. Aguarde alguns segundos e toque em Gerar PIX novamente."
    : "I am still preparing your PIX. Wait a few seconds and tap Generate PIX again.";
}

function publicLoadingLabel(value: string, language: "pt-BR" | "en") {
  const normalized = value.toLowerCase();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  if (!value) return "";
  if (normalized.includes("pix") && normalized.includes("checkout")) return L("Preparando PIX", "Preparing PIX");
  if (normalized.includes("confirming pix")) return L("Confirmando PIX", "Confirming PIX");
  if (normalized.includes("off-ramp") || normalized.includes("retirada")) return L("Calculando retirada", "Calculating withdrawal");
  if (normalized.includes("preview")) return L("Calculando taxa", "Calculating fee");
  if (normalized.includes("copy")) return L("Copiando", "Copying");
  if (normalized.includes("resolving")) return L("Localizando conta", "Finding account");
  if (normalized.includes("running")) return L("Processando", "Processing");
  return L("Processando", "Processing");
}

function isRecipientValidationMessage(value: unknown) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return (
    normalized.includes("destinatario") ||
    normalized.includes("recipient") ||
    normalized.includes("contato") ||
    normalized.includes("contact")
  ) && (
    normalized.includes("nao existe") ||
    normalized.includes("not exist") ||
    normalized.includes("not found") ||
    normalized.includes("saved") ||
    normalized.includes("salvo")
  );
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = RAMP_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("request timed out");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function PixRampClient({
  initialQuery = "",
  lockedMode,
}: {
  initialQuery?: string;
  lockedMode?: RampMode;
}) {
  const { language, t } = useLanguage();
  const queryString = initialQuery;
  const L = useCallback((pt: string, en: string) => language === "pt-BR" ? pt : en, [language]);
  const queryParams = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const debugEnabled = useMemo(() => queryParams.get("debug") === "1", [queryParams]);
  const queryAppliedRef = useRef(false);
  const autoStartedRef = useRef(false);
  const offRampAutoResolvedRef = useRef(false);
  const atomicActionRef = useRef(false);
  const pixFeedbackKeysRef = useRef<Set<string>>(new Set());
  const recipientValidationKeyRef = useRef("");
  const walletPinInputRef = useRef<HTMLInputElement | null>(null);
  const localIntentNonceRef = useRef("");
  if (!localIntentNonceRef.current) localIntentNonceRef.current = createLocalIntentNonce();
  const [sessionId, setSessionId] = useState("");
  const [rampEmail, setRampEmail] = useState("");
  const [resolvedWallet, setResolvedWallet] = useState<RampResponse | null>(null);
  const [config, setConfig] = useState<RampConfig | null>(null);
  const [rampMode, setRampMode] = useState<RampMode>("onramp");
  const [step, setStep] = useState<Step>("quote");
  const [amountBrl, setAmountBrl] = useState("100");
  const [targetAsset, setTargetAsset] = useState<TargetAsset>("BRL");
  const [desiredReceiveAmount, setDesiredReceiveAmount] = useState("");
  const [desiredReceiveAsset, setDesiredReceiveAsset] = useState<TargetAsset | "">("");
  const [postConversionAsset, setPostConversionAsset] = useState<TargetAsset | "">("");
  const [advancedAssetMode, setAdvancedAssetMode] = useState(false);
  const [receiveEstimateLoading, setReceiveEstimateLoading] = useState(false);
  const [receiveEstimateReady, setReceiveEstimateReady] = useState(false);
  const [customerPayload, setCustomerPayload] = useState<RampResponse | null>(null);
  const [quotePayload, setQuotePayload] = useState<RampResponse | null>(null);
  const [quoteReceivedAt, setQuoteReceivedAt] = useState(0);
  const [orderPayload, setOrderPayload] = useState<RampResponse | null>(null);
  const [generatedOnRampOrderKey, setGeneratedOnRampOrderKey] = useState("");
  const [statusPayload, setStatusPayload] = useState<RampResponse | null>(null);
  const [onRampBalancesBefore, setOnRampBalancesBefore] = useState<BalanceItem[]>([]);
  const [onRampBalancesAfter, setOnRampBalancesAfter] = useState<BalanceItem[]>([]);
  const [offRampBalancesBefore, setOffRampBalancesBefore] = useState<BalanceItem[]>([]);
  const [offRampBalancesAfter, setOffRampBalancesAfter] = useState<BalanceItem[]>([]);
  const [offRampAmount, setOffRampAmount] = useState("1");
  const [offRampFiatAmount, setOffRampFiatAmount] = useState("");
  const [offRampAmountLocked, setOffRampAmountLocked] = useState(false);
  const [offRampPixKey, setOffRampPixKey] = useState("");
  const [intentId, setIntentId] = useState("");
  const [operationLocked, setOperationLocked] = useState(false);
  const [walletPublicKey, setWalletPublicKey] = useState("");
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [programmaticOnboarding, setProgrammaticOnboarding] = useState<RampResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [walletPin, setWalletPin] = useState("");
  const [polling, setPolling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState("");
  const [autoRefreshingQuote, setAutoRefreshingQuote] = useState(false);
  const [error, setError] = useState("");
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [temporaryTestResult, setTemporaryTestResult] = useState<RampResponse | null>(null);
  const [temporaryOffRampTestResult, setTemporaryOffRampTestResult] = useState<RampResponse | null>(null);
  const [offRampPreviewPayload, setOffRampPreviewPayload] = useState<RampResponse | null>(null);
  const [queryReady, setQueryReady] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [transferFlow, setTransferFlow] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferRecipientKey, setTransferRecipientKey] = useState("");
  const [transferRecipientPublicKey, setTransferRecipientPublicKey] = useState("");
  const [verifiedTransferRecipient, setVerifiedTransferRecipient] = useState<RampResponse | null>(null);
  const [recipientVerificationLoading, setRecipientVerificationLoading] = useState(false);
  const [recipientVerificationError, setRecipientVerificationError] = useState("");
  const [autoPayAmount, setAutoPayAmount] = useState("");
  const [autoPayAsset, setAutoPayAsset] = useState<TargetAsset | "">("");
  const [pixFundedTransferResult, setPixFundedTransferResult] = useState<RampResponse | null>(null);
  const [pixFundedTransferError, setPixFundedTransferError] = useState("");
  const normalizedOffRampPixKey = normalizePixKeyInput(offRampPixKey);
  const offRampDestinationBankAccount = useMemo(
    () => normalizedOffRampPixKey
      ? buildDynamicExternalBankAccount(walletPublicKey || sessionId || rampEmail, rampEmail, normalizedOffRampPixKey)
      : null,
    [normalizedOffRampPixKey, walletPublicKey, sessionId, rampEmail]
  );
  const externalPixDestination = normalizedOffRampPixKey ? `PIX ${normalizedOffRampPixKey}` : L("PIX de destino", "Destination PIX");
  const atomicIntentKey = intentId || `local-${stableHash([
    localIntentNonceRef.current,
    queryString,
    sessionId,
    rampMode,
    amountBrl,
    offRampAmount,
    offRampFiatAmount,
    normalizedOffRampPixKey,
    targetAsset,
    desiredReceiveAmount,
    desiredReceiveAsset,
    postConversionAsset,
    transferRecipient,
    transferRecipientKey,
    transferRecipientPublicKey,
    autoPayAmount,
    autoPayAsset,
  ].join(":"))}`;
  const offRampInputAsset = rampMode === "offramp" ? targetAsset : "BRL";
  const offRampExactReceiveBrl = Boolean(rampMode === "offramp" && offRampInputAsset !== "BRL" && offRampFiatAmount.trim());
  const offRampInputValue = offRampExactReceiveBrl
    ? offRampFiatAmount
    : offRampInputAsset === "BRL" ? (offRampFiatAmount || offRampAmount) : offRampAmount;
  const offRampDisplayAmount = offRampExactReceiveBrl || offRampInputAsset === "BRL"
    ? formatMoney(offRampInputValue || "0")
    : formatRampAsset(offRampInputValue || "0", offRampInputAsset);
  const offRampInputPrefix = offRampExactReceiveBrl ? "R$" : friendlyAssetName(offRampInputAsset, language);
  const offRampInputUnit = offRampExactReceiveBrl ? "BRL" : offRampInputAsset;
  const offRampPixTargetAmount = String(
    temporaryOffRampTestResult?.target_brl ||
    temporaryOffRampTestResult?.destination_amount ||
    temporaryOffRampTestResult?.quote?.toAmount ||
    (offRampInputAsset === "BRL" ? (offRampFiatAmount || offRampAmount) : "")
  );
  const offRampPixTargetDisplay = offRampPixTargetAmount ? formatMoney(offRampPixTargetAmount) : "Calculando BRL";
  const exactOnRampReceiveTarget = Boolean(rampMode === "onramp" && desiredReceiveAsset && desiredReceiveAsset === targetAsset);
  const desiredFinalAmount = rampMode === "onramp"
    ? desiredReceiveAmount && desiredReceiveAsset === targetAsset
      ? desiredReceiveAmount
      : targetAsset === "BRL"
        ? normalizeHumanAmount(amountBrl)
        : ""
    : "";
  const desiredFinalAsset = desiredFinalAmount
    ? desiredReceiveAmount && desiredReceiveAsset === targetAsset
      ? desiredReceiveAsset
      : targetAsset
    : "";
  const hasPostOnRampConversion = Boolean(
    rampMode === "onramp" &&
      postConversionAsset &&
      desiredFinalAmount &&
      desiredFinalAsset &&
      postConversionAsset !== desiredFinalAsset
  );
  const showOnRampReceiveTargetInput = Boolean(rampMode === "onramp" && (targetAsset === "BRL" || exactOnRampReceiveTarget || desiredFinalAmount));
  const targetReceiveInputAmount = exactOnRampReceiveTarget ? desiredReceiveAmount : (targetAsset === "BRL" ? amountBrl : desiredFinalAmount);
  const targetReceiveInputAsset = exactOnRampReceiveTarget ? desiredReceiveAsset : (desiredFinalAsset || targetAsset);
  const autoPayDisplayAmount = autoPayAmount && autoPayAsset
    ? formatRampAsset(autoPayAmount, autoPayAsset)
    : (desiredFinalAmount && desiredFinalAsset ? formatRampAsset(desiredFinalAmount, desiredFinalAsset) : formatRampAsset(amountBrl, targetAsset));
  const requestedOnRampTargetDisplay = transferFlow && autoPayAmount && autoPayAsset
    ? formatRampAsset(autoPayAmount, autoPayAsset)
    : desiredFinalAmount && desiredFinalAsset
      ? formatRampAsset(desiredFinalAmount, desiredFinalAsset)
      : targetAsset === "BRL"
        ? formatMoney(amountBrl)
        : formatRampAsset(amountBrl || "0", targetAsset);
  const postConversionTargetDisplay = hasPostOnRampConversion && postConversionAsset
    ? friendlyAssetName(postConversionAsset, language)
    : "";
  const transferRecipientLabel = String(
    pixFundedTransferResult?.recipient_name ||
    verifiedTransferRecipient?.recipient_name ||
    verifiedTransferRecipient?.contact_name ||
    transferRecipient ||
    ""
  ).trim();
  const transferRecipientDisplayKey = String(
    pixFundedTransferResult?.recipient_key ||
    pixFundedTransferResult?.recipient_email ||
    pixFundedTransferResult?.recipient_pix_key ||
    verifiedTransferRecipient?.recipient_key ||
    verifiedTransferRecipient?.recipient_pix_key ||
    transferRecipientKey ||
    ""
  ).trim();
  const verifiedRecipientPublicKey = String(
    pixFundedTransferResult?.recipient_public_key ||
    verifiedTransferRecipient?.recipient_public_key ||
    ""
  ).trim();
  const transferRecipientVerified = Boolean(!transferFlow || verifiedTransferRecipient?.recipient_public_key || pixFundedTransferResult?.recipient_public_key);
  const safeTransferRecipientLabel = transferRecipientVerified ? transferRecipientLabel : "";
  const receiveEstimateRequired = Boolean(
    rampMode === "onramp" &&
      desiredFinalAmount &&
      desiredReceiveAsset
  );
  const receiveEstimateMissing = Boolean(receiveEstimateRequired && !receiveEstimateReady);
  const waitingForReceiveEstimate = Boolean(receiveEstimateRequired && receiveEstimateLoading);
  const exactOnRampValueContract = Boolean(
    rampMode === "onramp" &&
      (
        receiveEstimateRequired ||
        (transferFlow && (autoPayAmount || desiredFinalAmount) && (autoPayAsset || desiredFinalAsset || targetAsset))
      )
  );

  const launchedFromChat = useMemo(() => queryParams.get("from") === "chat", [queryParams]);
  const returnSource = useMemo(() => String(queryParams.get("return_source") || queryParams.get("from") || "").trim().toLowerCase(), [queryParams]);
  const returnToPath = useMemo(() => safeInternalReturnPath(queryParams.get("return_to") || ""), [queryParams]);
  const stayOpenAfterSuccess = useMemo(() => queryParams.get("stay_open") === "1" || Boolean(returnToPath), [queryParams, returnToPath]);
  const returnLabel = useMemo(() => {
    const explicit = String(queryParams.get("return_label") || "").trim();
    if (explicit) return explicit;
    if (returnSource === "rendimentos" || returnSource === "investimentos") {
      return L("Voltar aos investimentos", "Back to investments");
    }
    return L("Continuar", "Continue");
  }, [L, queryParams, returnSource]);
  const querySessionScope = normalizeChannelSource(
    queryParams.get("session_scope") ||
      queryParams.get("sessionScope") ||
      queryParams.get("provider") ||
      queryParams.get("channel") ||
      queryParams.get("external_provider") ||
      queryParams.get("externalProvider") ||
      queryParams.get("source") ||
      queryParams.get("from") ||
      ""
  );
  const scopedExternalSource = querySessionScope === "whatsapp" || querySessionScope === "telegram" ? querySessionScope : "";
  const externalProvider = String(queryParams.get("provider") || queryParams.get("external_provider") || scopedExternalSource || "").trim().toLowerCase();
  const externalProviderUserId = String(queryParams.get("provider_user_id") || "").trim();
  const externalSource = String(scopedExternalSource || queryParams.get("source") || externalProvider || "chat").trim().toLowerCase();
  const hasSession = Boolean(sessionReady && sessionId);
  const allowEmailAccountLookup = Boolean(debugEnabled && !launchedFromChat);
  const etherfuseRailUnavailable = Boolean(config && !config.available);
  const needsBrowserLoginForPix = Boolean(sessionReady && !hasSession && !allowEmailAccountLookup);
  const needsBrowserLoginForChatLink = Boolean(launchedFromChat && !hasSession);
  const canResolveWallet = Boolean(sessionReady && !etherfuseRailUnavailable && (hasSession || (allowEmailAccountLookup && rampEmail.trim())));
  const quote = quotePayload?.quote;
  const activeOnRampQuote = orderPayload?.quote || quote;
  const onRampFeeEstimate = buildRampFeeBridgeEstimate("onramp", activeOnRampQuote);
  const onRampConversionFeeSummary = useMemo(() => {
    if (rampMode !== "onramp") return "";

    const estimatedFromQuote = onRampFeeEstimate
      ? formatFeeParts([
          {
            amount: onRampFeeEstimate.providerFeeAmount,
            currency: onRampFeeEstimate.providerFeeCurrency,
          },
          {
            amount: onRampFeeEstimate.ttsTransactionFeeAmount,
            currency: onRampFeeEstimate.ttsTransactionFeeCurrency,
          },
        ])
      : "";
    if (estimatedFromQuote) {
      return L(`Taxa de conversão estimada: ${estimatedFromQuote}.`, `Estimated conversion fee: ${estimatedFromQuote}.`);
    }
    if (exactOnRampValueContract) {
      return L("Taxa calculada junto com a cotação final.", "Fee calculated with the final quote.");
    }

    const fallbackBase = toPositiveNumber(desiredFinalAmount || amountBrl, 0);
    if (!fallbackBase) return L("Calculando taxa de conversão.", "Calculating conversion fee.");

    const providerFee = fallbackBase * (clientEtherfuseOnRampFeeBps() / 10000);
    const appFee = Math.max(fallbackBase * (clientTtsTransactionFeeBps() / 10000), clientTtsTransactionMinBrl());
    const fallbackFee = providerFee + appFee;
    return L(`Taxa de conversão estimada: ${formatMoney(fallbackFee)}.`, `Estimated conversion fee: ${formatMoney(fallbackFee)}.`);
  }, [L, amountBrl, desiredFinalAmount, exactOnRampValueContract, onRampFeeEstimate, rampMode]);
  const feeAdjustedAutoPayAmount = transferFlow &&
    !autoPayAmount &&
    onRampFeeEstimate?.destinationCurrency === (autoPayAsset || targetAsset) &&
    Number.isFinite(onRampFeeEstimate.netDestinationAmount)
      ? formatApiAmount(onRampFeeEstimate.netDestinationAmount)
      : "";
  const feeAdjustedAutoPayAsset = feeAdjustedAutoPayAmount ? (autoPayAsset || targetAsset) : "";
  const feeAdjustedAutoPayDisplayAmount = feeAdjustedAutoPayAmount
    ? formatRampAsset(feeAdjustedAutoPayAmount, feeAdjustedAutoPayAsset)
    : autoPayDisplayAmount;
  const offRampQuote = temporaryOffRampTestResult?.quote || offRampPreviewPayload?.quote;
  const offRampInsufficientBalance = Boolean(rampMode === "offramp" && isInsufficientBalanceText(error));
  const offRampAlternativeAsset = useMemo(() => {
    const candidates = ["USDC", "CETES", "XLM", "BRL"].filter((asset) => asset !== offRampInputAsset);
    return candidates.find((asset) => sumVisibleBalance(offRampBalancesBefore, asset) > 0.0000001) || "";
  }, [offRampBalancesBefore, offRampInputAsset]);
  const offRampAlternativeBalance = offRampAlternativeAsset
    ? sumVisibleBalance(offRampBalancesBefore, offRampAlternativeAsset)
    : 0;
  const offRampConversionHref = buildAppPath("/convert", {
    amount: offRampInputValue,
    source_asset: offRampAlternativeAsset,
    dest_asset: "BRL",
    destination_pix_key: normalizedOffRampPixKey,
    next: "pix-off",
    from: "pix-off",
    lang: language,
  });
  const order = statusPayload?.transaction || orderPayload?.transaction;
  const operationId = String(orderPayload?.operation_id || "");
  const orderId = String(
    order?.id ||
    orderPayload?.order_id ||
    orderPayload?.orderId ||
    orderPayload?.id ||
    statusPayload?.order_id ||
    statusPayload?.orderId ||
    ""
  );
  const onRampOrderInputKey = stableHash(JSON.stringify([
    "onramp",
    amountBrl,
    targetAsset,
    desiredFinalAmount,
    desiredFinalAsset,
    postConversionAsset,
    transferFlow ? transferRecipientLabel : "",
    transferFlow ? transferRecipientDisplayKey : "",
    transferFlow ? feeAdjustedAutoPayAmount || autoPayAmount : "",
    transferFlow ? feeAdjustedAutoPayAsset || autoPayAsset : "",
  ]));
  const paymentInstructions = order?.paymentInstructions || {};
  const pixCode = String(paymentInstructions?.pixCode || "");
  const pixKey = String(paymentInstructions?.pixKey || "");
  const quotedOnRampPixPayAmount = String(
    paymentInstructions?.amount ||
    order?.fromAmount ||
    quote?.fromAmount ||
    ""
  );
  const hasExecutableOnRampPixPayAmount = Boolean(normalizeHumanAmount(quotedOnRampPixPayAmount));
  const effectiveOnRampPixPayAmount = String(quotedOnRampPixPayAmount || amountBrl || "");
  const effectiveOnRampPixPayDisplay = formatMoney(effectiveOnRampPixPayAmount);
  const onRampHeaderValueDisplay = exactOnRampValueContract
    ? requestedOnRampTargetDisplay
    : effectiveOnRampPixPayDisplay;
  const headerCurrencyAsset = rampMode === "onramp"
    ? exactOnRampValueContract
      ? (autoPayAsset || desiredFinalAsset || targetReceiveInputAsset || targetAsset)
      : "BRL"
    : targetAsset;
  const headerCurrencyName = friendlyAssetName(headerCurrencyAsset, language);
  const headerCurrencyDisplay = headerCurrencyName.toUpperCase() === headerCurrencyAsset
    ? headerCurrencyAsset
    : `${headerCurrencyName} ${headerCurrencyAsset}`;
  const isSandboxMockOrder = Boolean(order?.sandbox_mock);
  const localMockFallbackAllowed = Boolean(config?.local_mock_fallback_allowed);
  const opsMocksAllowed = Boolean(config?.ops_mocks_allowed);
  const displayPixKey = isSandboxMockOrder ? (pixKey || `pix-${orderId.slice(-8) || "checkout"}@talktostellar.local`) : pixKey;
  const technicalFinalAssetCode = String(order?.post_conversion?.destination_asset_code || order?.finalAsset?.code || order?.auto_conversion?.destination_asset_code || targetAsset).split(":")[0];
  const receivedCode = userFacingAssetCode(technicalFinalAssetCode, targetAsset);
  const onRampFinalAssetDelta = visibleBalanceDelta(onRampBalancesBefore, onRampBalancesAfter, receivedCode);
  const onRampFinalAssetDeltaAmount = onRampFinalAssetDelta > 0.0000001
    ? onRampFinalAssetDelta.toFixed(7)
    : "";
  const autoConversionFinalAmount = String(order?.post_conversion?.destination_amount || order?.auto_conversion?.destination_amount || "");
  const directBrlFinalAmount = receivedCode === "BRL"
    ? String(order?.finalAmount || order?.toAmount || quote?.userFacingToAmount || quote?.toAmount || desiredFinalAmount || "")
    : "";
  const finalReceivedAmount = String(
    autoConversionFinalAmount ||
    (receivedCode !== "BRL" ? onRampFinalAssetDeltaAmount : "") ||
    directBrlFinalAmount
  );
  const onRampReceivedDisplay = finalReceivedAmount
    ? formatRampAsset(finalReceivedAmount, receivedCode)
    : receivedCode === "BRL"
      ? formatMoney(order?.toAmount || quote?.userFacingToAmount || quote?.toAmount || desiredFinalAmount || amountBrl)
      : L(
          `Conversão para ${friendlyAssetName(receivedCode, language)} em processamento`,
          `Conversion to ${friendlyAssetName(receivedCode, language)} in progress`
        );
  const quoteCreatedAt = parseRampTimestamp(quote?.createdAt);
  const quoteExpiresAt = parseRampTimestamp(quote?.expiresAt);
  const quoteTtlMs = Number.isFinite(quoteCreatedAt) && Number.isFinite(quoteExpiresAt)
    ? Math.max(0, quoteExpiresAt - quoteCreatedAt)
    : 120000;
  const quoteDeadlineAt = quote && quoteReceivedAt ? quoteReceivedAt + quoteTtlMs : 0;
  const quoteTimeRemainingMs = quoteDeadlineAt ? quoteDeadlineAt - now : NaN;
  const quoteCountdown = quote ? formatCountdown(quoteTimeRemainingMs, language) : "not quoted";
  const quoteExpired = Boolean(quote && Number.isFinite(quoteTimeRemainingMs) && quoteTimeRemainingMs <= 0);
  const quoteStaleForOrder = Boolean(quote && (!Number.isFinite(quoteTimeRemainingMs) || quoteTimeRemainingMs <= 15000));
  const status = order ? normalizeStatus(order.status) : quoteExpired ? "quote expired" : "not started";
  const onRampComplete = Boolean(order && isSuccessStatus(status));
  const orderFailed = Boolean(order && isFailureStatus(status));
  const onRampPixCheckoutAvailable = Boolean(orderId && (pixCode || pixKey || Object.keys(paymentInstructions).length > 0 || isSandboxMockOrder));
  const onRampPixAlreadyGenerated = Boolean(
    rampMode === "onramp" &&
    onRampPixCheckoutAvailable &&
    !orderFailed &&
    generatedOnRampOrderKey === onRampOrderInputKey
  );
  const onRampPixGenerationBlocked = onRampPixAlreadyGenerated && !quoteExpired;
  const sandboxSimulationComplete = Boolean(isSandboxMockOrder && onRampComplete);
  const estimatedReceiveLabel = feeAdjustedAutoPayAmount
      ? feeAdjustedAutoPayDisplayAmount
      : targetAsset === "BRL"
        ? formatMoney(order?.toAmount || finalReceivedAmount || amountBrl)
      : desiredFinalAmount && desiredFinalAsset === targetAsset
        ? formatRampAsset(desiredFinalAmount, targetAsset)
      : onRampReceivedDisplay || L("Calculado na confirmação", "Calculated on confirmation");
  const quoteGrossLabel = quote ? effectiveOnRampPixPayDisplay : formatMoney(amountBrl);
  const quoteCostContext = transferFlow && transferRecipientLabel
    ? L("valor que será enviado", "amount that will be sent")
    : L("valor que entra na sua conta", "amount added to your account");
  const pixLoginRequiredMessage = needsBrowserLoginForChatLink
    ? L("Não consegui carregar a sessão do chat neste navegador. Volte ao WhatsApp e abra o link novamente, ou peça um novo link.", "I could not load the chat session in this browser. Return to WhatsApp and open the link again, or request a new link.")
    : L("Entre com PIN para continuar este PIX na sua conta.", "Sign in with PIN to continue this PIX in your account.");
  const transferRecipientBlocker = transferFlow && !transferRecipientVerified
    ? needsBrowserLoginForPix
      ? pixLoginRequiredMessage
      : recipientVerificationLoading
        ? L("Validando destinatário salvo...", "Validating saved recipient...")
        : recipientVerificationError || L("Escolha um contato salvo real antes de gerar o PIX.", "Choose a real saved contact before creating PIX.")
    : "";
  const canPrepareOnRampPix = Boolean(
    canResolveWallet &&
    !loading &&
    !operationLocked &&
    !receiveEstimateMissing &&
    !transferRecipientBlocker
  );
  const payablePixAvailable = Boolean(pixCode && !isSandboxMockOrder);
  const demoPixMode = Boolean(order && (isSandboxMockOrder || (config?.available && !payablePixAvailable)));
  const sandboxQrPayload = isSandboxMockOrder
    ? `talktostellar://pix-onramp?order=${encodeURIComponent(orderId)}&operation=${encodeURIComponent(operationId)}&amount=${encodeURIComponent(effectiveOnRampPixPayAmount)}&asset=${encodeURIComponent(targetAsset)}`
    : "";
  const loginHref = useMemo(() => {
    if (!needsBrowserLoginForPix) return "";
    if (needsBrowserLoginForChatLink) return "";
    const params = new URLSearchParams();
    if (externalProvider) params.set("provider", externalProvider);
    if (externalProviderUserId) params.set("provider_user_id", externalProviderUserId);
    if (externalSource) params.set("source", externalSource || externalProvider || "chat");
    if (rampEmail.includes("@")) params.set("email", rampEmail);
    params.set("next", `${rampMode === "offramp" ? "/pix-off" : "/pix-on"}?${queryString}`);
    params.set("lang", language);
    return `/login?${params.toString()}`;
  }, [externalProvider, externalProviderUserId, externalSource, language, needsBrowserLoginForChatLink, needsBrowserLoginForPix, queryString, rampEmail, rampMode]);
  const operationStorageKey = intentId ? `talk-to-stellar.pix-ramp.completed:${intentId}` : "";
  const buildIdempotencyKey = useCallback((action: string) => (
    `pix-ramp:${atomicIntentKey}:${action}`
  ), [atomicIntentKey]);
  const offRampAssetDeltas = useMemo(() => offRampBalancesAfter.length > 0 ? calculateDeltas(offRampBalancesBefore, offRampBalancesAfter) : [], [offRampBalancesBefore, offRampBalancesAfter]);
  const onRampReceiptBefore = formatVisibleBalance(onRampBalancesBefore, targetAsset);
  const onRampReceiptAfter = onRampBalancesAfter.length > 0 ? formatVisibleBalance(onRampBalancesAfter, targetAsset) : L("Atualizando", "Updating");
  const onRampReceiptDelta = formatVisibleDelta(onRampBalancesBefore, onRampBalancesAfter, targetAsset, language);
  const liveSteps = useMemo<LiveStep[]>(() => {
    const pixAccountPrepared = Boolean(programmaticOnboarding || customerPayload?.bank_account_id || customerPayload?.customer?.bankAccountId);
    if (rampMode === "offramp") {
      const hasTarget = Boolean(offRampFiatAmount.trim() || offRampAmount.trim());
      return [
        {
          label: L("Sua conta", "Your account"),
          detail: walletPublicKey
            ? L("Conta localizada.", "Account found.")
            : needsBrowserLoginForPix
              ? needsBrowserLoginForChatLink
                ? L("Sessão do chat não carregada. Reabra o link pelo WhatsApp ou peça um novo link.", "Chat session was not loaded. Reopen the link from WhatsApp or request a new link.")
                : L("Entre com PIN para continuar com sua conta.", "Sign in with PIN to continue with your account.")
              : hasSession
                ? L("Sessão detectada. Preparando sua conta PIX.", "Session detected. Preparing your PIX account.")
              : L("Digite o email para localizar sua conta.", "Enter the email to find your account."),
          state: walletPublicKey ? "done" : needsBrowserLoginForPix ? "warning" : loading === "Resolving account" ? "active" : "pending",
        },
        {
          label: L("Valor de saída", "Outgoing amount"),
          detail: offRampInputAsset === "BRL"
            ? L(`Alvo: ${offRampDisplayAmount} entrando no seu PIX.`, `Target: ${offRampDisplayAmount} arriving in your PIX.`)
            : L(`Saída do saldo: ${offRampDisplayAmount}. Chega em BRL no seu PIX.`, `Leaving your balance: ${offRampDisplayAmount}. Arrives in BRL in your PIX.`),
          state: hasTarget ? "done" : "pending",
        },
        {
          label: L("Valor em reais", "Amount in BRL"),
          detail: offRampPixTargetAmount
            ? L(`Saldo convertido para chegar em ${offRampPixTargetDisplay}.`, `Balance converted to arrive as ${offRampPixTargetDisplay}.`)
            : L("A tela converte automaticamente para BRL quando você confirma.", "The screen automatically converts to BRL when you confirm."),
          state: offRampQuote ? "done" : loading === "Previewing PIX withdrawal" || loading === "Confirming PIX withdrawal" ? "active" : "pending",
        },
        {
          label: L("Confirmação e saída", "Confirmation and withdrawal"),
          detail: temporaryOffRampTestResult?.submitted
            ? L("Saldo enviado para retirada.", "Balance sent for withdrawal.")
            : L("Aguardando seu PIN para mostrar o saldo saindo.", "Waiting for your PIN to move the balance out."),
          state: temporaryOffRampTestResult?.submitted ? "done" : loading === "Confirming PIX withdrawal" ? "active" : "pending",
        },
        {
          label: L("Seu PIX", "Your PIX"),
          detail: temporaryOffRampTestResult
            ? L(`${offRampPixTargetDisplay} chegou em ${externalPixDestination}.`, `${offRampPixTargetDisplay} arrived in ${externalPixDestination}.`)
            : L(`Destino final: ${externalPixDestination}.`, `Final destination: ${externalPixDestination}.`),
          state: temporaryOffRampTestResult ? "done" : "pending",
        },
      ];
    }

    return [
      {
        label: L("Sua conta", "Your account"),
          detail: walletPublicKey
            ? L("Conta localizada.", "Account found.")
            : needsBrowserLoginForPix
              ? needsBrowserLoginForChatLink
                ? L("Sessão do chat não carregada. Reabra o link pelo WhatsApp ou peça um novo link.", "Chat session was not loaded. Reopen the link from WhatsApp or request a new link.")
                : L("Entre com PIN para continuar este PIX na sua conta.", "Sign in with PIN to continue this PIX in your account.")
              : hasSession
                ? L("Sessão detectada. Preparando sua conta PIX.", "Session detected. Preparing your PIX account.")
              : L("Digite o email para localizar sua conta.", "Enter the email to find your account."),
        state: walletPublicKey ? "done" : needsBrowserLoginForPix ? "warning" : loading === "Resolving account" ? "active" : "pending",
      },
      {
        label: L("Conta PIX", "PIX account"),
        detail: pixAccountPrepared
          ? L("Conta preparada para continuar o PIX.", "Account ready to continue with PIX.")
          : customerPayload
            ? L("Preparando conta PIX.", "Preparing PIX account.")
            : L("Aguardando preparo do PIX.", "Waiting to prepare PIX."),
        state: pixAccountPrepared ? "done" : (loading.includes("Preparing") || loading.includes("quote")) ? "active" : "pending",
      },
      {
        label: L("Valor", "Amount"),
        detail: quote
          ? transferFlow && transferRecipientLabel
            ? L(`${effectiveOnRampPixPayDisplay} via PIX para enviar ${requestedOnRampTargetDisplay} a ${transferRecipientLabel}.`, `${effectiveOnRampPixPayDisplay} via PIX to send ${requestedOnRampTargetDisplay} to ${transferRecipientLabel}.`)
            : exactOnRampValueContract
              ? L(`${effectiveOnRampPixPayDisplay} via PIX para receber ${requestedOnRampTargetDisplay}.`, `${effectiveOnRampPixPayDisplay} via PIX to receive ${requestedOnRampTargetDisplay}.`)
              : L(`${effectiveOnRampPixPayDisplay} fica disponível como ${friendlyAssetName(targetAsset, language)}.`, `${effectiveOnRampPixPayDisplay} becomes available as ${friendlyAssetName(targetAsset, language)}.`)
          : receiveEstimateRequired && !receiveEstimateReady
            ? receiveEstimateLoading
              ? L("Calculando a cotação atual.", "Calculating the current quote.")
              : L("Aguardando cotação atual antes de gerar o PIX.", "Waiting for the current quote before creating PIX.")
          : transferFlow && transferRecipientLabel
            ? L(`Alvo: mandar ${requestedOnRampTargetDisplay} para ${transferRecipientLabel}.`, `Target: send ${requestedOnRampTargetDisplay} to ${transferRecipientLabel}.`)
            : exactOnRampValueContract
              ? L(`Alvo: receber ${requestedOnRampTargetDisplay} na conta.`, `Target: receive ${requestedOnRampTargetDisplay} in the account.`)
              : L(`Alvo: colocar ${formatMoney(amountBrl)} na conta.`, `Target: add ${formatMoney(amountBrl)} to the account.`),
        state: quote
          ? quoteExpired ? "warning" : "done"
          : receiveEstimateRequired
            ? receiveEstimateLoading ? "active" : receiveEstimateReady ? "done" : "warning"
            : (loading.includes("quote") || loading.includes("Preparing")) ? "active" : "pending",
      },
      {
        label: L("Checkout PIX", "PIX checkout"),
        detail: orderId
          ? L(`QR e referência prontos: ${orderId.slice(0, 18)}...`, `QR and reference ready: ${orderId.slice(0, 18)}...`)
          : L("A página cria a ordem e mostra QR, chave e botão de confirmação.", "The page creates the order and shows QR, key, and confirmation button."),
        state: orderId ? "done" : loading.includes("PIX") || loading.includes("Preparing") ? "active" : "pending",
      },
      {
        label: L("Confirmação do PIX", "PIX confirmation"),
        detail: onRampComplete
          ? L("PIX confirmado.", "PIX confirmed.")
          : orderId ? L("Clique em confirmar após fazer o PIX.", "Click confirm after making the PIX.") : L("Aguardando geração do checkout.", "Waiting for checkout creation."),
        state: onRampComplete ? "done" : orderId ? "active" : "pending",
      },
      {
        label: transferFlow ? L("Transferência para destinatário", "Transfer to recipient") : L("Saldo entregue", "Balance delivered"),
        detail: onRampComplete
          ? pixFundedTransferResult?.transaction_hash
            ? L(`${formatRampAsset(pixFundedTransferResult.amount || autoPayAmount || amountBrl, pixFundedTransferResult.asset_code || autoPayAsset || targetAsset)} enviado para ${transferRecipientLabel}.`, `${formatRampAsset(pixFundedTransferResult.amount || autoPayAmount || amountBrl, pixFundedTransferResult.asset_code || autoPayAsset || targetAsset)} sent to ${transferRecipientLabel}.`)
            : transferFlow && pixFundedTransferError
              ? L(`PIX confirmado. Envio automático pendente: ${pixFundedTransferError}`, `PIX confirmed. Automatic transfer pending: ${pixFundedTransferError}`)
              : transferFlow
                ? L(`PIX confirmado. Enviando ${autoPayDisplayAmount} para ${transferRecipientLabel || "destinatário"}.`, `PIX confirmed. Sending ${autoPayDisplayAmount} to ${transferRecipientLabel || "recipient"}.`)
                : L(`${onRampReceivedDisplay} entregue na conta.`, `${onRampReceivedDisplay} delivered to the account.`)
          : polling ? L("Atualizando status automaticamente.", "Updating status automatically.") : L(`Aguardando confirmação para entregar ${friendlyAssetName(targetAsset, language)}.`, `Waiting for confirmation to deliver ${friendlyAssetName(targetAsset, language)}.`),
        state: transferFlow ? pixFundedTransferResult?.transaction_hash ? "done" : pixFundedTransferError ? "warning" : onRampComplete ? "active" : polling ? "active" : "pending" : onRampComplete ? "done" : polling ? "active" : "pending",
      },
    ];
  }, [
    amountBrl,
    customerPayload,
    loading,
    offRampAmount,
    offRampFiatAmount,
    offRampDisplayAmount,
    offRampInputAsset,
    offRampPixTargetAmount,
    offRampPixTargetDisplay,
    externalPixDestination,
    order?.toAmount,
    orderId,
    polling,
    programmaticOnboarding,
    quote,
    quoteExpired,
    requestedOnRampTargetDisplay,
    exactOnRampValueContract,
    rampMode,
    receivedCode,
    onRampReceivedDisplay,
    onRampComplete,
    temporaryOffRampTestResult,
    offRampQuote,
    finalReceivedAmount,
    targetAsset,
    transferFlow,
    transferRecipient,
    transferRecipientLabel,
    autoPayDisplayAmount,
    autoPayAmount,
    autoPayAsset,
    pixFundedTransferResult,
    pixFundedTransferError,
    receiveEstimateLoading,
    receiveEstimateReady,
    receiveEstimateRequired,
    walletPublicKey,
    hasSession,
    needsBrowserLoginForPix,
    needsBrowserLoginForChatLink,
    L,
    language,
  ]);

  useEffect(() => {
    const stored = getStoredSession();
    setSessionId(stored.sessionId);
    setSessionReady(false);
    getClientSession()
      .then(({ sessionId: cookieSessionId, authenticated }) => {
        if (authenticated && cookieSessionId) {
          setSessionId(cookieSessionId);
        } else {
          setSessionId("");
        }
      })
      .catch(() => setSessionId(""))
      .finally(() => setSessionReady(true));
    const storedName = window.localStorage.getItem("talk-to-stellar.userName") || "";
    if (storedName.includes("@")) setRampEmail(storedName);
  }, []);

  useEffect(() => {
    if (queryAppliedRef.current) {
      setQueryReady(true);
      return;
    }
    queryAppliedRef.current = true;

    const params = new URLSearchParams(queryString);
    const mode = lockedMode || (params.get("mode") === "offramp" ? "offramp" : "onramp");
    const amount = normalizeHumanAmount(params.get("source_amount") || params.get("amount") || "");
    const fiatAmount = normalizeHumanAmount(params.get("fiat_amount") || params.get("target_brl") || params.get("to_amount") || "");
    const quoteAmount = normalizeHumanAmount(params.get("quote_amount") || "");
    const quoteAsset = String(params.get("quote_asset") || "").trim().toUpperCase();
    const receiveAmount = normalizeHumanAmount(params.get("receive_amount") || params.get("target_amount") || quoteAmount || "");
    const receiveAsset = String(params.get("receive_asset") || params.get("target_asset") || quoteAsset || "").trim().toUpperCase();
    const postConversionAssetParam = String(params.get("post_conversion_asset") || params.get("convert_to_asset") || params.get("dest_asset") || "").trim().toUpperCase();
    const asset = String(params.get("source_asset") || params.get("asset") || "").trim().toUpperCase();
    const currency = String(params.get("currency") || params.get("fiat_currency") || asset || "").trim().toUpperCase();
    const email = String(params.get("email") || "").trim().toLowerCase();
    const flow = String(params.get("flow") || "").trim().toLowerCase();
    const nextTransferFlow = flow === "fund_and_pay" || params.get("auto_pay_after_ramp") === "1";
    const recipient = String(params.get("recipient") || "").trim();
    const recipientKey = String(params.get("recipient_key") || params.get("recipient_email") || "").trim();
    const recipientPublicKey = String(params.get("recipient_public_key") || "").trim();
    const destinationPixKey = normalizePixKeyInput(
      params.get("pix_key") ||
      params.get("destination_pix_key") ||
      params.get("destination_pix") ||
      params.get("to_pix") ||
      ""
    );
    const payAmount = normalizeHumanAmount(params.get("pay_amount") || "");
    const payAsset = String(params.get("pay_asset") || "").trim().toUpperCase();
    const nextIntentId = String(params.get("intent_id") || params.get("operation_key") || params.get("intent") || "").trim();
    const offRampBrlAmount = mode === "offramp" && (
      fiatAmount ||
      (receiveAmount && receiveAsset === "BRL") ||
      (amount && (!currency || currency === "BRL" || asset === "BRL"))
    )
      ? (fiatAmount || (receiveAsset === "BRL" ? receiveAmount : "") || amount)
      : "";

    setRampMode(mode);
    if (nextIntentId) setIntentId(nextIntentId);
    const normalizedReceiveAsset = normalizeTargetAsset(receiveAsset, "USDC");
    const normalizedPostConversionAsset = postConversionAssetParam ? normalizeTargetAsset(postConversionAssetParam, "USDC") : "";
    if (isAdvancedAsset(normalizedReceiveAsset)) setAdvancedAssetMode(true);
    if (normalizedPostConversionAsset && isAdvancedAsset(normalizedPostConversionAsset)) setAdvancedAssetMode(true);
    if (normalizedPostConversionAsset && normalizedPostConversionAsset !== normalizedReceiveAsset) {
      setPostConversionAsset(normalizedPostConversionAsset);
    }
    const hasExactOnRampReceiveTarget = Boolean(mode === "onramp" && receiveAmount && normalizedReceiveAsset);
    const amountParamIsPixBrl = currency === "BRL" || asset === "BRL" || asset === "TESOURO";
    if (mode === "onramp" && receiveAmount) {
      setDesiredReceiveAmount(receiveAmount);
      setDesiredReceiveAsset(normalizedReceiveAsset);
      setTargetAsset(normalizedReceiveAsset);
      if (!amountParamIsPixBrl) {
        setAmountBrl("");
      }
      if (normalizedReceiveAsset === "BRL") {
        setAmountBrl(receiveAmount);
        setReceiveEstimateReady(false);
        setReceiveEstimateLoading(true);
      }
      if (normalizedReceiveAsset !== "BRL") {
        setReceiveEstimateReady(false);
        setReceiveEstimateLoading(normalizedReceiveAsset === "USDC");
      }
    }
    if (amount && !(hasExactOnRampReceiveTarget && !amountParamIsPixBrl)) {
      if (mode === "offramp") setOffRampAmount(amount);
      else setAmountBrl(amount);
    }
    if (offRampBrlAmount) {
      setOffRampFiatAmount(offRampBrlAmount);
      if (asset && asset !== "BRL" && asset !== "TESOURO") setOffRampAmount("");
      setOffRampAmountLocked(true);
    }
    if (mode === "offramp" && amount && (currency === "USDC" || asset === "USDC")) {
      setOffRampFiatAmount("");
      setOffRampAmountLocked(true);
    }
    if (!(mode === "onramp" && receiveAmount)) {
      const normalizedAsset = mode === "onramp"
        ? resolveOnRampTargetAssetFromQuery({
            amount,
            asset,
            currency,
            requestedTargetAsset: receiveAsset,
          })
        : normalizeTargetAsset(asset, "BRL");
      if (isAdvancedAsset(normalizedAsset)) setAdvancedAssetMode(true);
      setTargetAsset(normalizedAsset);
    }
    if (email.includes("@")) setRampEmail(email);
    if (nextTransferFlow) setTransferFlow(true);
    if (recipient) setTransferRecipient(recipient);
    if (recipientKey) setTransferRecipientKey(recipientKey);
    if (recipientPublicKey) setTransferRecipientPublicKey(recipientPublicKey);
    if (destinationPixKey) setOffRampPixKey(destinationPixKey);
    if (payAmount) setAutoPayAmount(payAmount);
    if (payAsset) {
      const normalizedPayAsset = normalizeTargetAsset(payAsset, "USDC");
      if (isAdvancedAsset(normalizedPayAsset)) setAdvancedAssetMode(true);
      setAutoPayAsset(normalizedPayAsset);
    }
    setQueryReady(true);
  }, [lockedMode, queryString]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (step !== "success") return;
    if (stayOpenAfterSuccess) return;
    closeIntermediatePage();
  }, [stayOpenAfterSuccess, step]);

  useEffect(() => {
    if (!operationStorageKey) return;
    try {
      if (window.localStorage.getItem(operationStorageKey) === "completed") {
        setOperationLocked(true);
      }
    } catch {}
  }, [operationStorageKey]);

  useEffect(() => {
    fetchWithTimeout("/api/ramp/etherfuse/config", { cache: "no-store" }, 15000)
      .then((response) => response.json())
      .then((payload) => setConfig(payload))
      .catch(() => setConfig({ sandbox: false, available: false, testnet_only: true, network: "Stellar Testnet" }));
  }, []);

  useEffect(() => {
    if (rampMode !== "offramp") return;
    if (!sessionId) return;
    loadExternalBankAccount({ session_id: sessionId }).catch(() => undefined);
  }, [rampMode, sessionId]);

  useEffect(() => {
    if (rampMode !== "offramp") return;
    if (offRampAutoResolvedRef.current) return;
    if (hasSession || !allowEmailAccountLookup || !rampEmail.trim() || loading) return;

    offRampAutoResolvedRef.current = true;
    void run("Resolving account", async () => {
      const auth = await resolveWalletFromEmail();
      await loadExternalBankAccount(auth).catch(() => undefined);
    });
  }, [allowEmailAccountLookup, hasSession, loading, rampEmail, rampMode]);

  const addDebugLog = useCallback((entry: Omit<DebugLogEntry, "id" | "at">) => {
    setDebugLogs((current) => [{
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toLocaleTimeString("en-US"),
      ...entry,
      request: sanitizeForDebug(entry.request),
      response: sanitizeForDebug(entry.response),
    }, ...current].slice(0, 40));
  }, []);

  useEffect(() => {
    if (rampMode !== "onramp") return;
    if (!desiredReceiveAmount || desiredReceiveAsset !== "BRL") return;
    const receiveBrl = toPositiveNumber(desiredReceiveAmount, 0);
    if (!receiveBrl) {
      setReceiveEstimateReady(false);
      setReceiveEstimateLoading(false);
      return;
    }

    const providerFeeBps = clientEtherfuseOnRampFeeBps();
    const ttsFeeBps = clientTtsTransactionFeeBps();
    const estimatedBrl = estimatePixOnRampGrossForBrlReceive(receiveBrl);
    setAmountBrl(estimatedBrl.toFixed(2));
    setReceiveEstimateReady(true);
    setReceiveEstimateLoading(false);
    setQuotePayload(null);
    setQuoteReceivedAt(0);
    setOrderPayload(null);
    setGeneratedOnRampOrderKey("");
    setStatusPayload(null);
    setError((current) => /calcular automaticamente|atualizar a cotação|estimativa/i.test(current) ? "" : current);
    addDebugLog({
      label: "PIX amount estimated from requested BRL receive amount",
      method: "LOCAL",
      path: "/pix-on",
      request: { receive_amount: desiredReceiveAmount, receive_asset: desiredReceiveAsset },
      response: { amount_brl: estimatedBrl.toFixed(2), provider_fee_bps: providerFeeBps, app_fee_bps: ttsFeeBps },
    });
  }, [addDebugLog, desiredReceiveAmount, desiredReceiveAsset, rampMode]);

  useEffect(() => {
    if (rampMode !== "onramp") return;
    if (!desiredReceiveAmount || desiredReceiveAsset !== "USDC") return;
    const receiveUsdc = toPositiveNumber(desiredReceiveAmount, 0);
    if (!receiveUsdc) {
      setReceiveEstimateReady(false);
      setReceiveEstimateLoading(false);
      return;
    }

    let cancelled = false;
    setReceiveEstimateLoading(true);
    setReceiveEstimateReady(false);
    fetchWithTimeout(`/api/financial/usdc-to-brl-preview?usdc_amount=${encodeURIComponent(receiveUsdc.toFixed(7))}&t=${Date.now()}`, { cache: "no-store" }, 20000)
      .then((response) => response.json())
      .then((payload) => {
        const brlPerUsdc = toPositiveNumber(payload?.quote?.brl_per_usdc, 0);
        if (!brlPerUsdc) {
          throw new Error(payload?.message || L("Estimativa BRL/USDC indisponível.", "BRL/USDC estimate unavailable."));
        }
        const estimatedBrl = toPositiveNumber(payload?.output?.required_brl, 0) ||
          (toPositiveNumber(payload?.output?.estimated_brl, 0) + Math.max(toPositiveNumber(payload?.fees?.total_fee_brl, 0), 0.01)) ||
          (receiveUsdc * brlPerUsdc);
        if (cancelled) return;
        setAmountBrl(estimatedBrl.toFixed(2));
        setReceiveEstimateReady(true);
        setQuotePayload(null);
        setQuoteReceivedAt(0);
        setOrderPayload(null);
        setGeneratedOnRampOrderKey("");
        setStatusPayload(null);
        setError((current) => /calcular automaticamente|atualizar a cotação|estimativa/i.test(current) ? "" : current);
        addDebugLog({
          label: "PIX amount estimated from requested receive amount",
          method: "GET",
          path: "/api/financial/usdc-to-brl-preview",
          request: { receive_amount: desiredReceiveAmount, receive_asset: desiredReceiveAsset },
          response: { amount_brl: estimatedBrl.toFixed(2), brl_per_usdc: brlPerUsdc },
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setReceiveEstimateReady(false);
          setError(L("Não consegui atualizar a cotação agora. Aguarde alguns segundos antes de gerar o PIX.", "I could not update the quote now. Wait a few seconds before generating PIX."));
          addDebugLog({
            label: "PIX amount estimate failed",
            method: "GET",
            path: "/api/financial/usdc-to-brl-preview",
            request: { receive_amount: desiredReceiveAmount, receive_asset: desiredReceiveAsset },
            response: {},
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setReceiveEstimateLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [addDebugLog, desiredReceiveAmount, desiredReceiveAsset, rampMode]);

  useEffect(() => {
    if (rampMode !== "onramp") return;
    if (!desiredReceiveAmount || !desiredReceiveAsset || desiredReceiveAsset === "BRL" || desiredReceiveAsset === "USDC") return;
    const receiveTarget = toPositiveNumber(desiredReceiveAmount, 0);
    if (!receiveTarget) {
      setReceiveEstimateReady(false);
      setReceiveEstimateLoading(false);
      return;
    }

    setReceiveEstimateReady(true);
    setReceiveEstimateLoading(false);
    setError((current) => /calcular automaticamente|atualizar a cotação|estimativa/i.test(current) ? "" : current);
    addDebugLog({
      label: "Exact non-BRL PIX target will be quoted by backend",
      method: "SERVER",
      path: "/api/ramp/etherfuse/quote",
      request: { receive_amount: desiredReceiveAmount, receive_asset: desiredReceiveAsset },
      response: { contract: "backend_strict_receive_quote" },
    });
  }, [addDebugLog, desiredReceiveAmount, desiredReceiveAsset, rampMode]);

  async function resolveWalletFromEmail(): Promise<RampAuth> {
    if (sessionId) {
      return { session_id: sessionId };
    }
    if (needsBrowserLoginForPix) {
      throw new Error(needsBrowserLoginForChatLink
        ? L("A sessão do chat não foi carregada neste navegador. Volte ao WhatsApp e abra o link novamente, ou peça um novo link.", "The chat session was not loaded in this browser. Return to WhatsApp and open the link again, or request a new link.")
        : L("Entre com PIN para continuar este PIX na sua conta.", "Sign in with PIN to continue this PIX in your account."));
    }

    const email = rampEmail.trim().toLowerCase();
    if (!email) {
      throw new Error(L("Digite o email da conta TalkToStellar para localizar sua conta.", "Enter the TalkToStellar account email to find your account."));
    }

    const startedAt = performance.now();
    const response = await fetchWithTimeout("/api/ramp/etherfuse/resolve-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }, 20000);
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: "Resolve TalkToStellar account by email",
      method: "POST",
      path: "/api/ramp/etherfuse/resolve-wallet",
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      request: { email },
      response: payload,
      error: !response.ok || payload?.success === false ? payload?.message || payload?.error : undefined,
    });
    if (!response.ok || payload?.success === false) {
      const publicMessage = publicRampErrorMessage(payload?.message || payload?.error || response.statusText, language);
      throw new Error(publicMessage || L("Não encontrei uma conta TalkToStellar ativa para este email.", "I could not find an active TalkToStellar account for this email."));
    }

    const nextSessionId = String(payload.session_id || "");
    if (!nextSessionId) {
      throw new Error(L("A conta foi encontrada, mas não retornou uma sessão válida para cotar.", "The account was found, but did not return a valid session for quoting."));
    }

    setSessionId(nextSessionId);
    setResolvedWallet(payload);
    setWalletPublicKey(String(payload.public_key || ""));
    window.localStorage.setItem("talk-to-stellar.userName", email);

    return { session_id: nextSessionId };
  }

  async function loadExternalBankAccount(authOverride?: RampAuth) {
    const auth = authOverride || { session_id: sessionId };
    if (!auth.session_id) return null;
    const externalContext: Record<string, unknown> = {
      ...(externalProvider ? { provider: externalProvider, external_provider: externalProvider } : {}),
      ...(externalProviderUserId ? { provider_user_id: externalProviderUserId, external_provider_user_id: externalProviderUserId } : {}),
      ...(externalSource ? { source: externalSource } : {}),
      ...(scopedExternalSource ? { session_scope: scopedExternalSource } : {}),
    };
    const startedAt = performance.now();
    const response = await fetchWithTimeout("/api/ramp/etherfuse/external-bank-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...auth, language, ...externalContext }),
    }, 25000);
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: "Load linked PIX destination",
      method: "POST",
      path: "/api/ramp/etherfuse/external-bank-account",
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      request: { ...auth, language, ...externalContext },
      response: payload,
      error: !response.ok || payload?.success === false ? payload?.message || payload?.error : undefined,
    });
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || payload?.error || L("Não consegui carregar seu PIX vinculado.", "I could not load your linked PIX destination."));
    }
    if (payload?.external_bank_account) {
      return payload.external_bank_account as ExternalBankAccount;
    }
    return null;
  }

  const callRamp = useCallback(async (path: string, body?: Record<string, unknown>, method = "POST", authOverride?: RampAuth, idempotencyKey?: string) => {
    const auth = authOverride || { session_id: sessionId };
    if (!auth.session_id) throw new Error(L("Digite o email da conta TalkToStellar para localizar sua conta.", "Enter the TalkToStellar account email to find your account."));
    const externalContext: Record<string, unknown> = {
      ...(externalProvider ? { provider: externalProvider, external_provider: externalProvider } : {}),
      ...(externalProviderUserId ? { provider_user_id: externalProviderUserId, external_provider_user_id: externalProviderUserId } : {}),
      ...(externalSource ? { source: externalSource } : {}),
      ...(scopedExternalSource ? { session_scope: scopedExternalSource } : {}),
    };
    const requestBody: Record<string, unknown> = { ...auth, language, ...externalContext, ...(body || {}) };
    const pin = typeof requestBody.pin === "string" ? requestBody.pin : "";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    if (pin) {
      headers["X-Wallet-Pin"] = pin;
      headers["X-TalkToStellar-Wallet-Pin"] = pin;
    }
    const init: RequestInit = { method, headers };
    if (method !== "GET") init.body = JSON.stringify(requestBody);
    const startedAt = performance.now();
    const timeoutMs = path.includes("/etherfuse/onramp")
      ? RAMP_ONRAMP_REQUEST_TIMEOUT_MS
      : RAMP_REQUEST_TIMEOUT_MS;
    const response = await fetchWithTimeout(path, init, timeoutMs);
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: path.includes("/customer") ? "PIX account setup" : path.includes("/quote") ? "PIX quote" : path.includes("/onramp") ? "PIX order request" : "Payment request",
      method,
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      request: requestBody,
      response: payload,
      error: !response.ok || payload?.success === false ? payload?.message || payload?.error : undefined,
    });
    if (!response.ok || payload?.success === false) {
      const requestError = new Error(payload?.message || payload?.error || `Ramp request failed: ${response.status}`) as Error & { payload?: RampResponse };
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }, [L, addDebugLog, externalProvider, externalProviderUserId, externalSource, language, scopedExternalSource, sessionId]);

  useEffect(() => {
    if (!queryReady || !transferFlow) {
      setVerifiedTransferRecipient(null);
      setRecipientVerificationError("");
      setRecipientVerificationLoading(false);
      recipientValidationKeyRef.current = "";
      return;
    }

    const recipient = transferRecipient.trim();
    if (!sessionReady) {
      setVerifiedTransferRecipient(null);
      setRecipientVerificationError("");
      setRecipientVerificationLoading(false);
      recipientValidationKeyRef.current = "";
      return;
    }
    if (!recipient || !hasSession) {
      setVerifiedTransferRecipient(null);
      setRecipientVerificationError(recipient ? pixLoginRequiredMessage : L("Destinatário não informado.", "Recipient missing."));
      setRecipientVerificationLoading(false);
      recipientValidationKeyRef.current = "";
      return;
    }

    const validationKey = [
      sessionId,
      recipient.toLowerCase(),
      transferRecipientKey.trim().toLowerCase(),
      transferRecipientPublicKey.trim(),
    ].join("|");
    if (recipientValidationKeyRef.current === validationKey && (verifiedTransferRecipient?.recipient_public_key || recipientVerificationError)) {
      setRecipientVerificationLoading(false);
      return;
    }
    recipientValidationKeyRef.current = validationKey;

    let cancelled = false;
    let timeoutId: number | null = null;
    setRecipientVerificationLoading(true);
    setRecipientVerificationError("");

    const validationRequest = callRamp("/api/ramp/etherfuse/sandbox/transfer-recipient", {
      recipient,
      recipient_name: recipient,
      recipient_key: transferRecipientKey || undefined,
      recipient_public_key: transferRecipientPublicKey || undefined,
    }, "POST");
    const timeoutRequest = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new Error(L("A validação do contato demorou demais. Tente novamente ou volte ao chat e peça seus contatos.", "Contact validation took too long. Try again or return to chat and ask for your contacts.")));
      }, 15000);
    });

    Promise.race([validationRequest, timeoutRequest])
      .then((payload) => {
        if (cancelled) return;
        const resolved = payload?.recipient || payload;
        const nextName = String(resolved?.recipient_name || resolved?.contact_name || "").trim();
        const nextKey = String(resolved?.recipient_key || resolved?.recipient_pix_key || "").trim();
        const nextPublicKey = String(resolved?.recipient_public_key || transferRecipientPublicKey || "").trim();
        if (!nextPublicKey) {
          throw new Error(L("Esse contato não tem conta de destino ativa.", "This contact does not have an active destination account."));
        }
        setVerifiedTransferRecipient({
          ...resolved,
          recipient_name: nextName || recipient,
          contact_name: nextName || recipient,
          recipient_key: nextKey,
          recipient_pix_key: String(resolved?.recipient_pix_key || nextKey || "").trim(),
          recipient_public_key: nextPublicKey,
        });
        setRecipientVerificationError("");
        setError((current) => isRecipientValidationMessage(current) ? "" : current);
      })
      .catch((requestError) => {
        if (cancelled) return;
        const fallbackPublicKey = transferRecipientPublicKey.trim();
        const fallbackKey = transferRecipientKey.trim();
        if (fallbackPublicKey) {
          setVerifiedTransferRecipient({
            recipient_name: recipient,
            contact_name: recipient,
            recipient_key: fallbackKey,
            recipient_pix_key: fallbackKey,
            recipient_public_key: fallbackPublicKey,
            source: "chat_link",
          });
          setRecipientVerificationError("");
          setError((current) => isRecipientValidationMessage(current) ? "" : current);
          addDebugLog({
            label: "Saved recipient validation used chat-link fallback",
            method: "POST",
            path: "/api/ramp/etherfuse/sandbox/transfer-recipient",
            request: { recipient, recipient_key: fallbackKey, has_recipient_public_key: true },
            response: { recipient_name: recipient, recipient_key: fallbackKey, recipient_public_key_tail: fallbackPublicKey.slice(-8) },
            error: requestError instanceof Error ? requestError.message : String(requestError),
          });
          return;
        }
        const message = requestError instanceof Error
          ? publicRampErrorMessage(requestError, language)
          : L("Esse destinatário não existe nos seus contatos salvos.", "This recipient does not exist in your saved contacts.");
        setVerifiedTransferRecipient(null);
        setRecipientVerificationError(message);
      })
      .finally(() => {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (!cancelled) setRecipientVerificationLoading(false);
      });

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [
    L,
    callRamp,
    hasSession,
    language,
    pixLoginRequiredMessage,
    queryReady,
    recipientVerificationError,
    sessionId,
    sessionReady,
    transferFlow,
    transferRecipient,
    transferRecipientKey,
    transferRecipientPublicKey,
    verifiedTransferRecipient,
  ]);

  const callRampGet = useCallback(async (path: string, params?: Record<string, string>, authOverride?: RampAuth) => {
    const auth = authOverride || { session_id: sessionId };
    if (!auth.session_id) throw new Error(L("Digite o email da conta TalkToStellar para localizar sua conta.", "Enter the TalkToStellar account email to find your account."));
    const externalContext: Record<string, string> = {
      ...(externalProvider ? { provider: externalProvider, external_provider: externalProvider } : {}),
      ...(externalProviderUserId ? { provider_user_id: externalProviderUserId, external_provider_user_id: externalProviderUserId } : {}),
      ...(externalSource ? { source: externalSource } : {}),
      ...(scopedExternalSource ? { session_scope: scopedExternalSource } : {}),
    };
    const search = new URLSearchParams({ ...auth, language, ...externalContext, ...(params || {}) });
    const startedAt = performance.now();
    const response = await fetchWithTimeout(`${path}?${search.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: path.includes("wallet-balances") ? "Account balances" : path.includes("/onramp/") ? "PIX status check" : "Payment status request",
      method: "GET",
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      request: { ...auth, language, ...externalContext, ...(params || {}) },
      response: payload,
      error: !response.ok || payload?.success === false ? payload?.message || payload?.error : undefined,
    });
    if (!response.ok || payload?.success === false) {
      const requestError = new Error(payload?.message || payload?.error || `Ramp request failed: ${response.status}`) as Error & { payload?: RampResponse };
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }, [L, addDebugLog, externalProvider, externalProviderUserId, externalSource, language, scopedExternalSource, sessionId]);

  const fetchBalances = useCallback(async (authOverride?: RampAuth) => {
    const payload = await callRampGet("/api/ramp/etherfuse/wallet-balances", undefined, authOverride);
    setWalletPublicKey(String(payload.public_key || ""));
    return Array.isArray(payload.balances) ? payload.balances as BalanceItem[] : [];
  }, [callRampGet]);

  useEffect(() => {
    const qrPayload = payablePixAvailable ? pixCode : sandboxQrPayload;
    if (!qrPayload) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(qrPayload, {
      width: 260,
      margin: 1,
      color: { dark: "#10231b", light: "#ffffff" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [payablePixAvailable, pixCode, sandboxQrPayload]);

  const refreshOrder = useCallback(async (notifyOnTerminal = true) => {
    if (!orderId) return null;
    const payload = await callRampGet(`/api/ramp/etherfuse/onramp/${encodeURIComponent(orderId)}`, {
      operation_id: operationId,
    });
    setStatusPayload(payload);
    const nextStatus = normalizeStatus(payload?.transaction?.status);
    if (isTerminalStatus(nextStatus)) {
      setPolling(false);
      const after = await fetchBalances();
      setOnRampBalancesAfter(after);
      if (isSuccessStatus(nextStatus) && !transferFlow && notifyOnTerminal) {
        markOperationCompleted();
        notifyChatAfterPixCompletion({ kind: "onramp", completedTransaction: payload?.transaction || null });
        setStep("success");
      } else if (isFailureStatus(nextStatus)) {
      setError(L("O PIX não foi concluído. Gere uma nova estimativa e tente novamente.", "PIX was not completed. Generate a new estimate and try again."));
      }
    }
    return payload;
  }, [callRampGet, fetchBalances, operationId, orderId, transferFlow]);

  useEffect(() => {
    if (!polling || !orderId) return;
    const timer = window.setInterval(() => {
      refreshOrder().catch((err) => {
        setPolling(false);
        setError(err instanceof Error ? err.message : String(err));
      });
    }, 3500);
    return () => window.clearInterval(timer);
  }, [orderId, polling, refreshOrder]);

	  async function run(label: string, fn: () => Promise<void>) {
	    setLoading(label);
	    setError("");
	    try {
	      await fn();
	    } catch (err) {
	      const payload = (err as Error & { payload?: RampResponse })?.payload;
	      const nextCustomerPayload = mergeRampCustomerPayload(customerPayload, payload);
	      if (nextCustomerPayload) {
	        setCustomerPayload(nextCustomerPayload);
	        setProgrammaticOnboarding(nextCustomerPayload?.programmatic_onboarding || null);
	      }
	      if (payload?.kyc_url && debugEnabled && !launchedFromChat) {
	        setOnboardingUrl(String(payload.kyc_url));
	      } else {
	        setOnboardingUrl("");
	      }
	      const rawMessage = err instanceof Error ? err.message : String(err || "");
	      const isPreparingPixTimeout = label === "Preparing PIX checkout" && /timed out|timeout|abort/i.test(rawMessage);
	      setError(isPreparingPixTimeout ? publicPixPreparationTimeoutMessage(language) : publicRampErrorMessage(err, language));
	    } finally {
	      setLoading("");
    }
  }

  function markOperationCompleted() {
    setOperationLocked(true);
    if (!operationStorageKey) return;
    try {
      window.localStorage.setItem(operationStorageKey, "completed");
    } catch {}
  }

  async function runAtomicAction(action: string, fn: () => Promise<void>) {
    if (operationLocked) {
      throw new Error(L("Esta operação PIX já foi concluída. O comprovante foi enviado no chat.", "This PIX operation is already complete. The receipt was sent in chat."));
    }
    if (atomicActionRef.current) {
      throw new Error(L(`Esta operação PIX já está em andamento (${action}).`, `This PIX operation is already in progress (${action}).`));
    }
    atomicActionRef.current = true;
    try {
      await fn();
    } finally {
      atomicActionRef.current = false;
    }
  }

  function notifyChatAfterPixCompletion(input: {
    kind: "onramp" | "offramp" | "funded-transfer";
    receiptUrl?: string;
    transferPayload?: RampResponse | null;
    completedTransaction?: RampResponse | null;
    offRampPayload?: RampResponse | null;
  }) {
    const completedAny = (input.completedTransaction || {}) as any;
    const transferAny = (input.transferPayload || {}) as any;
    const offRampAny = (input.offRampPayload || {}) as any;
    const transactionHash = String(
      completedAny.payment_hash ||
        completedAny.paymentHash ||
        completedAny.stellarTxHash ||
        completedAny.hash ||
        completedAny.id ||
        transferAny.payment_hash ||
        transferAny.paymentHash ||
        transferAny.hash ||
        transferAny.order_id ||
        offRampAny.payment_hash ||
        offRampAny.paymentHash ||
        offRampAny.hash ||
        offRampAny.order_id ||
        ""
    ).trim();
    const receiptUrl = extractRampReceiptUrl(
      input.receiptUrl,
      input.transferPayload,
      input.offRampPayload,
      input.completedTransaction,
      statusPayload,
      orderPayload,
      onRampReceiptUrl
    ) || buildRampReceiptFallbackUrl(transactionHash || operationId || orderId);
    const feedbackKey = `${input.kind}:${operationId || orderId || atomicIntentKey}:${receiptUrl}`;
    if (pixFeedbackKeysRef.current.has(feedbackKey)) return;
    pixFeedbackKeysRef.current.add(feedbackKey);
    const researchBase = {
      eventGroup: "PIX",
      status: "success" as const,
      evidenceUrl: receiptUrl || undefined,
      evidenceType: receiptUrl ? "receipt" : undefined,
      operationId: String(operationId || orderId || "").trim() || undefined,
      transactionHash: transactionHash || undefined,
      dedupeKey: `pix:${input.kind}:${operationId || orderId || atomicIntentKey || receiptUrl || transactionHash}`,
    };

    if (input.kind === "offramp") {
      trackUserResearchEvent({
        ...researchBase,
        eventName: "pix_offramp_completed",
        taskLabel: "Retirou saldo para uma chave PIX",
        metadata: {
          amount: offRampReceiptAmount,
          destination: externalPixDestination,
          pix_target: offRampPixTargetDisplay,
        },
      });
      enqueueWebChatFeedback([
        L("PIX enviado com sucesso.", "PIX sent successfully."),
        L(`Valor retirado: ${offRampReceiptAmount}`, `Withdrawn amount: ${offRampReceiptAmount}`),
        L(`Chegou no seu PIX: ${offRampPixTargetDisplay}`, `Arrived in your PIX: ${offRampPixTargetDisplay}`),
        L(`Destino: ${externalPixDestination}`, `Destination: ${externalPixDestination}`),
        L("Status: concluído", "Status: completed"),
        L(`Horário: ${new Date().toLocaleString("en-US")}`, `Time: ${new Date().toLocaleString("en-US")}`),
        receiptUrl ? L(`Comprovante: ${receiptUrl}`, `Receipt: ${receiptUrl}`) : "",
      ].filter(Boolean).join("\n"));
      return;
    }

    if (input.kind === "funded-transfer") {
      const transfer = input.transferPayload || {};
      const sentAmount = formatRampAsset(transfer.amount || autoPayAmount || amountBrl, transfer.asset_code || autoPayAsset || targetAsset);
      const recipient = String(transfer.recipient_name || transferRecipient || L("destinatário", "recipient")).trim();
      trackUserResearchEvent({
        ...researchBase,
        eventName: "pix_funded_transfer_completed",
        taskLabel: "Pagou PIX e enviou dinheiro para destinatario",
        metadata: {
          pix_paid: effectiveOnRampPixPayDisplay,
          transfer_amount: sentAmount,
          recipient,
        },
      });
      enqueueWebChatFeedback([
        L("PIX confirmado e transferência enviada.", "PIX confirmed and transfer sent."),
        L(`PIX pago: ${effectiveOnRampPixPayDisplay}`, `PIX paid: ${effectiveOnRampPixPayDisplay}`),
        L(`Transferência: ${sentAmount}`, `Transfer: ${sentAmount}`),
        L(`Destino: ${recipient}`, `Destination: ${recipient}`),
        L("Status: concluído", "Status: completed"),
        L(`Horário: ${new Date().toLocaleString("en-US")}`, `Time: ${new Date().toLocaleString("en-US")}`),
        receiptUrl ? L(`Comprovante: ${receiptUrl}`, `Receipt: ${receiptUrl}`) : "",
      ].filter(Boolean).join("\n"));
      return;
    }

    const postConversion = input.completedTransaction?.post_conversion || null;
    const postConversionPending = Boolean(
      postConversion?.required &&
      String(postConversion?.status || "").toLowerCase() !== "completed" &&
      !postConversion?.destination_amount
    );
    const postConversionSourceAsset = userFacingAssetCode(postConversion?.source_asset_code || targetAsset, targetAsset);
    const postConversionDestinationAsset = userFacingAssetCode(postConversion?.destination_asset_code || targetAsset, targetAsset);
    const finalAsset = postConversionPending
      ? postConversionSourceAsset
      : userFacingAssetCode(
          postConversion?.destination_asset_code ||
          input.completedTransaction?.finalAssetCode ||
          input.completedTransaction?.auto_conversion?.destination_asset_code ||
          input.completedTransaction?.toCurrency ||
          receivedCode ||
          targetAsset,
          targetAsset
        );
    const finalAmount = postConversionPending
      ? String(postConversion?.source_amount || input.completedTransaction?.finalAmount || input.completedTransaction?.toAmount || finalReceivedAmount || "")
      : finalAsset === "BRL"
        ? String(input.completedTransaction?.finalAmount || input.completedTransaction?.toAmount || order?.toAmount || quote?.toAmount || amountBrl)
        : String(postConversion?.destination_amount || input.completedTransaction?.auto_conversion?.destination_amount || finalReceivedAmount || "");
    const intermediateConversionLine = postConversion?.source_amount &&
      postConversion?.source_asset_code
      ? L(
          postConversionPending
            ? `Conversão em andamento: ${formatRampAsset(postConversion.source_amount, postConversionSourceAsset)} para ${postConversionDestinationAsset}`
            : `Recebido primeiro: ${formatRampAsset(postConversion.source_amount, postConversionSourceAsset)}`,
          postConversionPending
            ? `Conversion in progress: ${formatRampAsset(postConversion.source_amount, postConversionSourceAsset)} to ${postConversionDestinationAsset}`
            : `Received first: ${formatRampAsset(postConversion.source_amount, postConversionSourceAsset)}`
        )
      : "";
    const paidAmount = input.completedTransaction?.fromAmount
      ? formatMoney(input.completedTransaction.fromAmount)
      : effectiveOnRampPixPayDisplay;
    const receivedAmount = finalAmount
      ? formatRampAsset(finalAmount, finalAsset)
      : L(
          `Conversão para ${friendlyAssetName(finalAsset, language)} em processamento`,
          `Conversion to ${friendlyAssetName(finalAsset, language)} in progress`
        );
    trackUserResearchEvent({
      ...researchBase,
      eventName: "pix_onramp_completed",
      taskLabel: "Colocou saldo via PIX",
      metadata: {
        paid_amount: paidAmount,
        received_amount: receivedAmount,
        target_asset: finalAsset,
      },
    });
    enqueueWebChatFeedback([
      L("PIX confirmado com sucesso.", "PIX confirmed successfully."),
      L(`Valor pago: ${paidAmount}`, `Paid amount: ${paidAmount}`),
      intermediateConversionLine,
      L(`Valor recebido: ${receivedAmount}`, `Received amount: ${receivedAmount}`),
      L("Destino: sua conta TalkToStellar", "Destination: your TalkToStellar account"),
      postConversionPending
        ? L("Status: conversão em andamento", "Status: conversion in progress")
        : L("Status: concluído", "Status: completed"),
      L(`Horário: ${new Date().toLocaleString("en-US")}`, `Time: ${new Date().toLocaleString("en-US")}`),
      receiptUrl ? L(`Comprovante: ${receiptUrl}`, `Receipt: ${receiptUrl}`) : "",
    ].filter(Boolean).join("\n"));
  }

  function getValidatedWalletPin() {
    const inputValue = walletPinInputRef.current?.value || "";
    const pin = (inputValue || walletPin).replace(/\D/g, "").slice(0, 8);
    if (pin !== walletPin) setWalletPin(pin);
    if (!/^\d{4,8}$/.test(pin)) {
      throw new Error(L("Digite o PIN da conta com 4 a 8 dígitos antes de confirmar.", "Enter the 4 to 8 digit account PIN before confirming."));
    }
    return pin;
  }

  function updateWalletPin(next: string) {
    const pin = next.replace(/\D/g, "").slice(0, 8);
    setWalletPin(pin);
    if (/pin/i.test(error)) setError("");
  }

  function clearResolvedRampWallet(nextEmail = rampEmail) {
    setSessionId("");
    setResolvedWallet(null);
    setWalletPublicKey("");
    setCustomerPayload(null);
    setQuotePayload(null);
    setQuoteReceivedAt(0);
    setOrderPayload(null);
    setGeneratedOnRampOrderKey("");
    setStatusPayload(null);
    setTemporaryTestResult(null);
    setTemporaryOffRampTestResult(null);
    setOffRampPreviewPayload(null);
    setOffRampAmountLocked(false);
    setOnboardingUrl("");
    setProgrammaticOnboarding(null);
    setWalletPin("");
    setDebugLogs([]);
    setOnRampBalancesBefore([]);
    setOnRampBalancesAfter([]);
    setOffRampBalancesBefore([]);
    setOffRampBalancesAfter([]);
    setPolling(false);
    setStep("quote");
    setRampEmail(nextEmail);
  }

  function clearQuoteState() {
    setQuotePayload(null);
    setQuoteReceivedAt(0);
    setOrderPayload(null);
    setGeneratedOnRampOrderKey("");
    setStatusPayload(null);
    setOffRampPreviewPayload(null);
    setOnRampBalancesBefore([]);
    setOnRampBalancesAfter([]);
    setQrDataUrl("");
    setCopied(false);
    setWalletPin("");
    setTemporaryTestResult(null);
    setPixFundedTransferResult(null);
    setPixFundedTransferError("");
    setOperationLocked(false);
    setPolling(false);
    setStep("quote");
  }

  function updateOnRampReceiveTargetAmount(nextAmount: string) {
    if (exactOnRampReceiveTarget) {
      const hasAmount = toPositiveNumber(nextAmount, 0) > 0;
      setDesiredReceiveAmount(nextAmount);
      setReceiveEstimateReady(false);
      setReceiveEstimateLoading(hasAmount);
      if (transferFlow) {
        setAutoPayAmount(nextAmount);
        if (!autoPayAsset && targetReceiveInputAsset) setAutoPayAsset(targetReceiveInputAsset);
      }
    } else {
      setAmountBrl(nextAmount);
    }
    setError("");
    clearQuoteState();
  }

  async function requestQuote(options: { displayQuote?: boolean } = {}): Promise<{ auth: RampAuth; customerResult: RampResponse; quoteResult: RampResponse }> {
    const displayQuote = options.displayQuote !== false;
    setStep("quote");
    setOrderPayload(null);
    setGeneratedOnRampOrderKey("");
    setStatusPayload(null);
    setQuoteReceivedAt(0);
    setOnRampBalancesBefore([]);
    setOnRampBalancesAfter([]);
    setTemporaryTestResult(null);
    setWalletPin("");

    const auth = await resolveWalletFromEmail();
    const transferFinalAsset = transferFlow ? normalizeTargetAsset(autoPayAsset || targetAsset, targetAsset) : "";
    const requestedFinalAmount = transferFlow ? normalizeHumanAmount(autoPayAmount || "") : desiredFinalAmount;
    const requestedFinalAsset = requestedFinalAmount ? settlementAssetCode(transferFlow ? transferFinalAsset : desiredFinalAsset) : "";
    const customerResult = getRampCustomerId(customerPayload) && getRampBankAccountId(customerPayload) ? customerPayload : await callRamp("/api/ramp/etherfuse/customer", {
      country: "BR",
      email: rampEmail.trim().toLowerCase() || undefined,
    }, "POST", auth);
    const quoteCustomerId = getRampCustomerId(customerResult);
    setCustomerPayload(customerResult);
    setProgrammaticOnboarding(customerResult?.programmatic_onboarding || null);

    const quoteAmountBrl = targetAsset === "BRL" && requestedFinalAmount
      ? estimatePixOnRampGrossForBrlReceive(toPositiveNumber(requestedFinalAmount, 0)).toFixed(2)
      : amountBrl;
    const payload = await callRamp("/api/ramp/etherfuse/quote", {
      customer_id: quoteCustomerId || undefined,
      direction: "onramp",
      from_currency: "BRL",
      to_currency: "TESOURO",
      final_asset: settlementAssetCode(targetAsset),
      amount: quoteAmountBrl,
      desired_final_amount: requestedFinalAmount || undefined,
      desired_final_asset: requestedFinalAsset || undefined,
      post_conversion_asset: hasPostOnRampConversion ? settlementAssetCode(postConversionAsset) : undefined,
    }, "POST", auth);
    const nextCustomerPayload = mergeRampCustomerPayload(customerResult, payload);
    setCustomerPayload(nextCustomerPayload);
    setProgrammaticOnboarding(nextCustomerPayload?.programmatic_onboarding || customerResult?.programmatic_onboarding || payload?.programmatic_onboarding || null);
    if (displayQuote) {
      setQuotePayload(payload);
      setQuoteReceivedAt(Date.now());
    }
    return { auth, customerResult: nextCustomerPayload || customerResult, quoteResult: payload };
  }

  async function confirmQuoteAndCreatePix() {
    await runAtomicAction("preparar-pix", async () => {
      if (waitingForReceiveEstimate) throw new Error(L("Calculando o valor do PIX. Tente novamente em alguns segundos.", "Calculating the PIX amount. Try again in a few seconds."));
      if (transferFlow && !transferRecipientVerified) {
        throw new Error(transferRecipientBlocker || L("Escolha um contato salvo real antes de gerar o PIX.", "Choose a real saved contact before creating PIX."));
      }
      let quoteForOrder = quote;
      let customerForOrder = customerPayload;
      let authForOrder: RampAuth | undefined;
      const quoteNeedsCustomerRefresh = Boolean(quoteForOrder?.id && !getRampCustomerId(customerForOrder));
      if (!quoteForOrder?.id || quoteStaleForOrder || quoteNeedsCustomerRefresh) {
        addDebugLog({
          label: quoteNeedsCustomerRefresh ? "Quote has no customer context, refreshing" : quoteForOrder?.id ? "Quote too close to expiration before order, refreshing" : "No quote available, creating quote before order",
          method: "POST",
          path: "/api/ramp/etherfuse/quote",
          request: { amount: amountBrl, targetAsset, desiredFinalAmount, desiredFinalAsset },
          response: { reason: quoteNeedsCustomerRefresh ? "missing_customer_context" : quoteForOrder?.id ? "expiring_soon" : "missing", remaining_ms: quoteTimeRemainingMs },
        });
        const fresh = await requestQuote({ displayQuote: !exactOnRampValueContract });
        authForOrder = fresh.auth;
        quoteForOrder = fresh.quoteResult?.quote;
        customerForOrder = fresh.customerResult;
      }
      if (!quoteForOrder?.id) {
        addDebugLog({
          label: "Continuing PIX creation without client-side quote id",
          method: "POST",
          path: "/api/ramp/etherfuse/onramp",
          request: { amount: amountBrl, targetAsset, bank_account_id: getRampBankAccountId(customerForOrder) || undefined },
          response: { reason: "backend_will_create_fresh_quote" },
        });
      }
      const orderCustomerId = getRampCustomerId(customerForOrder);
      const orderBankAccountId = getRampBankAccountId(customerForOrder);
      authForOrder = authForOrder || await resolveWalletFromEmail();
      const before = await fetchBalances(authForOrder);
      setOnRampBalancesBefore(before);
      setOnRampBalancesAfter([]);
      const transferFinalAsset = transferFlow ? normalizeTargetAsset(autoPayAsset || targetAsset, targetAsset) : "";
      const requestedFinalAmount = transferFlow ? normalizeHumanAmount(autoPayAmount || "") : desiredFinalAmount;
      const requestedFinalAsset = requestedFinalAmount ? optionalSettlementAssetCode(transferFlow ? transferFinalAsset : desiredFinalAsset) : "";
      const quotedOrderAmountBrl = normalizeHumanAmount(quoteForOrder?.fromAmount || "");
      const orderAmountBrl = quotedOrderAmountBrl || (
        targetAsset === "BRL" && requestedFinalAmount
          ? estimatePixOnRampGrossForBrlReceive(toPositiveNumber(requestedFinalAmount, 0)).toFixed(2)
          : amountBrl
      );
      const createOnRampIdempotencyKey = buildIdempotencyKey(`create-onramp:${quoteForOrder?.id || "no-quote"}`);
      const payload = await callRamp("/api/ramp/etherfuse/onramp", {
        intent_id: atomicIntentKey,
        customer_id: orderCustomerId || undefined,
        bank_account_id: orderBankAccountId || undefined,
        quote_id: quoteForOrder?.id || undefined,
        amount: orderAmountBrl,
        expected_to_amount: quoteForOrder?.toAmount || undefined,
        from_currency: "BRL",
        to_currency: "TESOURO",
        final_asset: settlementAssetCode(targetAsset),
        desired_final_amount: requestedFinalAmount || undefined,
        desired_final_asset: requestedFinalAsset || undefined,
        post_conversion_asset: hasPostOnRampConversion ? settlementAssetCode(postConversionAsset) : undefined,
        auto_pay_after_ramp: transferFlow && Boolean(transferRecipient),
        auto_pay_recipient: transferRecipient || undefined,
        auto_pay_amount: feeAdjustedAutoPayAmount || autoPayAmount || undefined,
        auto_pay_asset_code: settlementAssetCode(autoPayAsset || targetAsset),
      }, "POST", authForOrder, createOnRampIdempotencyKey);
      if (payload?.quote) {
        setQuotePayload(payload);
        setQuoteReceivedAt(Date.now());
      }
      const nextCustomerPayload = mergeRampCustomerPayload(customerForOrder, payload);
      if (nextCustomerPayload) {
        setCustomerPayload(nextCustomerPayload);
        setProgrammaticOnboarding(nextCustomerPayload?.programmatic_onboarding || null);
      }
      setOnboardingUrl("");
      setOrderPayload(payload);
      setGeneratedOnRampOrderKey(onRampOrderInputKey);
      setStatusPayload(null);
      setWalletPin("");
      setStep("checkout");
      setPolling(true);
    });
  }

  useEffect(() => {
    if (rampMode !== "onramp") return;
    if (generatedOnRampOrderKey) return;
    if (!onRampPixCheckoutAvailable || orderFailed) return;
    setGeneratedOnRampOrderKey(onRampOrderInputKey);
  }, [generatedOnRampOrderKey, onRampOrderInputKey, onRampPixCheckoutAvailable, orderFailed, rampMode]);

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    if (params.get("autostart") !== "1") return;
    if (!queryReady) return;
    if (autoStartedRef.current) return;
    if (rampMode !== "onramp") return;
    if (operationLocked) return;
    if (!canResolveWallet || loading || order || quote || receiveEstimateMissing) return;
    if (transferFlow && (!transferRecipientVerified || recipientVerificationLoading || Boolean(recipientVerificationError))) return;

    autoStartedRef.current = true;
    void run("Preparing PIX checkout", confirmQuoteAndCreatePix);
  }, [canResolveWallet, loading, operationLocked, order, queryReady, queryString, quote, rampMode, receiveEstimateMissing, recipientVerificationError, recipientVerificationLoading, transferFlow, transferRecipientVerified]);

  useEffect(() => {
    if (!quote || order || !canResolveWallet || loading || autoRefreshingQuote) return;
    if (exactOnRampValueContract) return;
    if (!quoteDeadlineAt) return;

    const refreshAtMs = quoteDeadlineAt - 30000;
    const delayMs = Math.max(0, refreshAtMs - Date.now());
    const timer = window.setTimeout(() => {
      setAutoRefreshingQuote(true);
      requestQuote()
        .catch((err) => {
          addDebugLog({
            label: "Automatic quote refresh failed",
            method: "POST",
            path: "/api/ramp/etherfuse/quote",
            request: { amount: amountBrl, targetAsset, desiredFinalAmount, desiredFinalAsset },
            response: {},
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => setAutoRefreshingQuote(false));
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [addDebugLog, amountBrl, autoRefreshingQuote, canResolveWallet, desiredFinalAmount, desiredFinalAsset, exactOnRampValueContract, loading, order, quote, quoteDeadlineAt, targetAsset]);

  async function copyPixCode() {
    const sandboxReference = [
      "TalkToStellar PIX",
      `Order: ${orderId}`,
      `Operation: ${operationId || "not persisted"}`,
      `PIX key: ${displayPixKey}`,
      `${L("Valor", "Amount")}: ${effectiveOnRampPixPayDisplay}`,
      `${L("Entrega", "Delivery")}: ${onRampReceivedDisplay}`,
    ].join("\n");
    await navigator.clipboard.writeText(isSandboxMockOrder ? sandboxReference : pixCode || pixKey || orderId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function simulatePixPayment() {
    await runAtomicAction("confirmar-pix", async () => {
      if (!orderId) throw new Error(L("Prepare o PIX antes de confirmar o pagamento.", "Prepare the PIX before confirming payment."));
      if (isSandboxMockOrder && !localMockFallbackAllowed) {
        throw new Error(L("Este PIX expirou. Gere um novo PIX para continuar.", "This PIX expired. Create a new PIX to continue."));
      }
      const pin = getValidatedWalletPin();
      const payload = await callRamp("/api/ramp/etherfuse/sandbox/simulate-fiat", {
        intent_id: atomicIntentKey,
        order_id: orderId,
        operation_id: operationId,
        pin,
        wallet_pin: pin,
        walletPin: pin,
      }, "POST", undefined, buildIdempotencyKey("confirm-onramp"));
      if (payload?.transaction) setStatusPayload(payload);
      setPolling(true);
      const refreshed = await refreshOrder(false);
      const completedTransaction = refreshed?.transaction || payload?.transaction;
      let transferPayload: RampResponse | null = null;
      if (transferFlow && transferRecipient && isSuccessStatus(completedTransaction?.status)) {
        setPixFundedTransferError("");
        try {
          transferPayload = await submitPixFundedTransfer(completedTransaction);
        } catch (error) {
          setPixFundedTransferError(publicRampErrorMessage(error, language));
        }
      }
      if (isSuccessStatus(completedTransaction?.status)) {
        if (!transferFlow || transferPayload) markOperationCompleted();
        if (!transferFlow || transferPayload) {
          notifyChatAfterPixCompletion({
            kind: transferPayload ? "funded-transfer" : "onramp",
            receiptUrl: extractRampReceiptUrl(payload, refreshed),
            completedTransaction,
            transferPayload,
          });
        }
        setStep("success");
      }
    });
  }

  async function submitPixFundedTransfer(completedTransaction?: RampResponse) {
    const auth = await resolveWalletFromEmail();
    const pin = getValidatedWalletPin();
    if (!transferRecipientVerified || !verifiedRecipientPublicKey) {
      throw new Error(transferRecipientBlocker || L("Escolha um contato salvo real antes de enviar.", "Choose a real saved contact before sending."));
    }
    const requestedAutoPayAmount = feeAdjustedAutoPayAmount || (autoPayAmount && autoPayAsset ? autoPayAmount : "");
    const requestedAutoPayAsset = settlementAssetCode(feeAdjustedAutoPayAsset || autoPayAsset || targetAsset);
    const transferAmount = requestedAutoPayAmount || (targetAsset === "BRL"
      ? String(completedTransaction?.finalAmount || completedTransaction?.toAmount || amountBrl)
      : String(completedTransaction?.auto_conversion?.destination_amount || finalReceivedAmount || ""));
    if (!transferAmount) {
      throw new Error(L("A conversão final ainda não retornou valor suficiente para enviar automaticamente.", "The final conversion has not returned enough value to send automatically yet."));
    }
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/pix-funded-transfer", {
      intent_id: atomicIntentKey,
      recipient: transferRecipientLabel,
      recipient_name: transferRecipientLabel,
      recipient_key: transferRecipientDisplayKey || undefined,
      recipient_public_key: verifiedRecipientPublicKey,
      amount: transferAmount,
      asset_code: requestedAutoPayAsset,
      order_id: orderId,
      operation_id: operationId,
      pin,
      wallet_pin: pin,
      walletPin: pin,
    }, "POST", auth, buildIdempotencyKey("pix-funded-transfer"));
    setPixFundedTransferResult(payload);
    return payload;
  }

  async function runTemporaryEndpointTest() {
    if (!opsMocksAllowed) {
      throw new Error(L("Este atalho não está disponível agora. Use o fluxo PIX normal.", "This shortcut is not available now. Use the normal PIX flow."));
    }
    const auth = await resolveWalletFromEmail();
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/test-onramp", {
      intent_id: atomicIntentKey,
      amount: amountBrl,
      to_currency: "TESOURO",
      final_asset: settlementAssetCode(targetAsset),
      desired_final_amount: transferFlow ? undefined : desiredFinalAmount || undefined,
      desired_final_asset: transferFlow ? undefined : optionalSettlementAssetCode(desiredFinalAsset),
    }, "POST", auth, buildIdempotencyKey("test-onramp"));
    setTemporaryTestResult(payload);
    setWalletPublicKey(String(payload.wallet_public_key || ""));
    setOnRampBalancesBefore(Array.isArray(payload.balances_before) ? payload.balances_before : []);
    setOnRampBalancesAfter(Array.isArray(payload.balances_after) ? payload.balances_after : []);
  }

  async function previewOffRampFees() {
    const auth = await resolveWalletFromEmail();
    const customerResult = getRampCustomerId(customerPayload) ? customerPayload : await callRamp("/api/ramp/etherfuse/customer", {
      country: "BR",
      email: rampEmail.trim().toLowerCase() || undefined,
    }, "POST", auth);
    const previewCustomerId = getRampCustomerId(customerResult);
    setCustomerPayload(customerResult);
    const targetBrlAmount = normalizeHumanAmount(offRampFiatAmount.trim());
    const sourceAmount = normalizeHumanAmount(
      offRampExactReceiveBrl
        ? ""
        : offRampInputAsset === "BRL" ? (offRampFiatAmount.trim() || offRampAmount.trim()) : offRampAmount.trim()
    );
    const sourceAssetCode = settlementAssetCode(offRampInputAsset);
    const payload = await callRamp("/api/ramp/etherfuse/offramp-preview", {
      intent_id: atomicIntentKey,
      customer_id: previewCustomerId || undefined,
      amount: sourceAmount || targetBrlAmount,
      source_amount: sourceAmount || undefined,
      source_asset_code: sourceAssetCode,
      amount_currency: sourceAssetCode,
      fiat_amount: offRampInputAsset === "BRL" ? sourceAmount : targetBrlAmount || undefined,
      target_brl: offRampExactReceiveBrl ? targetBrlAmount : undefined,
      target_currency: "BRL",
    }, "POST", auth, buildIdempotencyKey("preview-offramp-fees"));
    const nextCustomerPayload = mergeRampCustomerPayload(customerResult, payload);
    if (nextCustomerPayload) setCustomerPayload(nextCustomerPayload);
    setOffRampPreviewPayload(payload);
  }

  async function runTemporaryOffRampEndpointTest() {
    await runAtomicAction("confirmar-retirada", async () => {
      const pin = getValidatedWalletPin();
      const auth = await resolveWalletFromEmail();
      if (!offRampDestinationBankAccount) {
        throw new Error(L("Informe a chave PIX de destino antes de confirmar a retirada.", "Enter the destination PIX key before confirming the withdrawal."));
      }
      const bankAccount = offRampDestinationBankAccount;
      const providerFiatAccountId = getProviderFiatAccountId(bankAccount);
      const targetBrlAmount = normalizeHumanAmount(offRampFiatAmount.trim());
      const initialSourceAmount = normalizeHumanAmount(
        offRampExactReceiveBrl
          ? ""
          : offRampInputAsset === "BRL" ? (offRampFiatAmount.trim() || offRampAmount.trim()) : offRampAmount.trim()
      );
      const sourceAssetCode = settlementAssetCode(offRampInputAsset);
      const balancesBefore = await fetchBalances(auth);
      setOffRampBalancesBefore(balancesBefore);
      if (initialSourceAmount) {
        assertSufficientVisibleBalance(balancesBefore, offRampInputAsset, initialSourceAmount);
      }
      let previewPayload = offRampPreviewPayload;
      if (!previewPayload?.quote?.id || !getRampCustomerId(previewPayload)) {
        previewPayload = await callRamp("/api/ramp/etherfuse/offramp-preview", {
          intent_id: atomicIntentKey,
          amount: initialSourceAmount || targetBrlAmount,
          source_amount: initialSourceAmount || undefined,
          source_asset_code: sourceAssetCode,
          amount_currency: sourceAssetCode,
          fiat_amount: offRampInputAsset === "BRL" ? initialSourceAmount : targetBrlAmount || undefined,
          target_brl: offRampExactReceiveBrl ? targetBrlAmount : undefined,
          target_currency: "BRL",
        }, "POST", auth, buildIdempotencyKey("preview-offramp-fees"));
        setOffRampPreviewPayload(previewPayload);
        const nextCustomerPayload = mergeRampCustomerPayload(customerPayload, previewPayload);
        if (nextCustomerPayload) setCustomerPayload(nextCustomerPayload);
      }
      const sourceAmount = normalizeHumanAmount(String(previewPayload?.source_amount || initialSourceAmount || ""));
      if (!sourceAmount) {
        throw new Error(L("Não consegui calcular quanto sai da conta para essa retirada.", "I could not calculate how much leaves the account for this withdrawal."));
      }
      assertSufficientVisibleBalance(balancesBefore, offRampInputAsset, sourceAmount);
      const customerId = getRampCustomerId(previewPayload);
      const quoteId = String(previewPayload?.quote?.id || "").trim();
      if (!customerId || !quoteId) {
        throw new Error(L("Não consegui preparar a retirada agora. Gere uma nova estimativa e tente novamente.", "I could not prepare the withdrawal now. Generate a new estimate and try again."));
      }
        addDebugLog({
          label: "PIX off-ramp client validation",
          method: "POST",
          path: "/api/ramp/etherfuse/offramp",
          request: {
            has_pin: true,
            pin_digits: pin.length,
            source_amount: sourceAmount,
            source_asset_code: sourceAssetCode,
            display_source_asset_code: offRampInputAsset,
            available_balance: formatRampAsset(sumVisibleBalance(balancesBefore, offRampInputAsset).toFixed(7), offRampInputAsset),
            fiat_amount: offRampInputAsset === "BRL" ? sourceAmount : targetBrlAmount || undefined,
            target_brl: offRampExactReceiveBrl ? targetBrlAmount : previewPayload?.target_brl,
            destination_currency: "BRL",
            destination_pix_key: bankAccount.pix_key,
            pix_key_type: bankAccount.pix_key_type,
            fiat_account_id: providerFiatAccountId || undefined,
            intent_id: atomicIntentKey,
          },
          response: { ready_to_submit: true },
        });
        const orderPayload = await callRamp("/api/ramp/etherfuse/offramp", {
          intent_id: atomicIntentKey,
          customer_id: customerId,
          quote_id: quoteId,
          amount: previewPayload?.amount_tesouro || sourceAmount,
          source_amount: sourceAmount,
          source_asset_code: sourceAssetCode,
          source_asset_issuer: previewPayload?.source_asset_issuer || undefined,
          amount_currency: sourceAssetCode,
          fiat_amount: offRampInputAsset === "BRL" ? sourceAmount : targetBrlAmount || undefined,
          target_brl: previewPayload?.target_brl || undefined,
          target_currency: "BRL",
          destination_pix_key: bankAccount.pix_key,
          pix_key_type: bankAccount.pix_key_type,
          fiat_account_id: providerFiatAccountId || undefined,
          external_bank_account: bankAccount,
        }, "POST", auth, buildIdempotencyKey("create-offramp"));
      setOrderPayload(orderPayload);
      setStatusPayload(null);
      const nextOrderId = String(orderPayload?.transaction?.id || "").trim();
      const nextOperationId = String(orderPayload?.operation_id || "").trim();
      if (!nextOrderId) {
        throw new Error(L("Não consegui criar a retirada agora. Tente novamente em alguns segundos.", "I could not create the withdrawal now. Try again in a few seconds."));
      }
      let statusPayload: RampResponse = orderPayload;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        statusPayload = await callRampGet(`/api/ramp/etherfuse/offramp/${encodeURIComponent(nextOrderId)}`, {
          operation_id: nextOperationId,
        }, auth);
        setStatusPayload(statusPayload);
        if (statusPayload?.ready_to_sign || isTerminalStatus(normalizeStatus(statusPayload?.transaction?.status))) break;
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      if (!statusPayload?.ready_to_sign) {
        throw new Error(L("A retirada ainda está sendo preparada. Tente confirmar novamente em alguns segundos.", "The withdrawal is still being prepared. Try confirming again in a few seconds."));
      }
      const submitPayload = await callRamp(`/api/ramp/etherfuse/offramp/${encodeURIComponent(nextOrderId)}/submit`, {
        order_id: nextOrderId,
        operation_id: nextOperationId,
        external_bank_account: bankAccount,
        pin,
        wallet_pin: pin,
        walletPin: pin,
      }, "POST", auth, buildIdempotencyKey("submit-offramp"));
      let finalStatusPayload: RampResponse = statusPayload;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        finalStatusPayload = await callRampGet(`/api/ramp/etherfuse/offramp/${encodeURIComponent(nextOrderId)}`, {
          operation_id: nextOperationId,
        }, auth);
        setStatusPayload(finalStatusPayload);
        if (isTerminalStatus(normalizeStatus(finalStatusPayload?.transaction?.status))) break;
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      const payload = {
        ...previewPayload,
        ...orderPayload,
        ready_to_sign: Boolean(statusPayload?.ready_to_sign),
        submitted: Boolean(submitPayload?.success),
        submit_result: submitPayload,
        receipt_url: submitPayload?.receipt_url,
        final_transaction: finalStatusPayload?.transaction || statusPayload?.transaction || orderPayload?.transaction,
        source_amount: sourceAmount,
        source_asset_code: sourceAssetCode,
        display_source_asset_code: offRampInputAsset,
        target_brl: previewPayload?.target_brl || previewPayload?.destination_amount,
        destination_amount: previewPayload?.destination_amount || previewPayload?.target_brl,
        destination_asset_code: "BRL",
        balances_before: balancesBefore,
      };
      setTemporaryOffRampTestResult(payload);
      setWalletPublicKey(String(payload.wallet_public_key || resolvedWallet?.public_key || ""));
      setOffRampBalancesBefore(Array.isArray(payload.balances_before) ? payload.balances_before : balancesBefore);
      const balancesAfter = await fetchBalances(auth);
      setOffRampBalancesAfter(balancesAfter);
      if (payload?.submitted || submitPayload?.success) {
        markOperationCompleted();
        notifyChatAfterPixCompletion({ kind: "offramp", offRampPayload: payload });
        setStep("success");
      }
    });
  }

  const offRampReceiptAmount = temporaryOffRampTestResult
    ? formatRampAsset(temporaryOffRampTestResult.source_amount || offRampInputValue, temporaryOffRampTestResult.source_asset_code || offRampInputAsset)
    : offRampDisplayAmount;
  const offRampReceiptReceived = temporaryOffRampTestResult
    ? offRampPixTargetDisplay
    : offRampDisplayAmount;
  const successTransaction = rampMode === "offramp"
    ? (temporaryOffRampTestResult?.final_transaction || temporaryOffRampTestResult?.transaction)
    : order;
  const onRampReceiptUrl = extractRampReceiptUrl(statusPayload, orderPayload);

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg px-4 py-8 text-tts-deep sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="overflow-hidden rounded-2xl border border-tts-border bg-tts-surface p-6 shadow-sm backdrop-blur md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className={`inline-flex w-fit rounded-full border px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] ${
                rampMode === "onramp"
                  ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm"
                  : "border-tts-gold bg-tts-gold-bg text-tts-gold"
              }`}>
                PIX
              </div>
            </div>
            <div className="space-y-4">
                <h1 className="max-w-xl text-2xl font-bold tracking-tight text-tts-deep md:text-3xl">
                  {rampMode === "onramp"
                    ? transferFlow && safeTransferRecipientLabel
                      ? L(`Pagar ${safeTransferRecipientLabel} com PIX`, `Pay ${safeTransferRecipientLabel} with PIX`)
                      : transferFlow
                        ? L("PIX para contato salvo", "PIX to saved contact")
                      : t("pix_add_title")
                    : t("pix_send_title")}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-tts-muted md:text-lg">
                  {rampMode === "onramp"
                    ? transferFlow && safeTransferRecipientLabel
                      ? t("pix_transfer_subtitle", { recipient: safeTransferRecipientLabel })
                      : transferFlow
                        ? L("Antes de gerar o PIX, validamos se o destinatário existe nos seus contatos salvos.", "Before creating PIX, we verify that the recipient exists in your saved contacts.")
                      : t("pix_add_subtitle")
                    : t("pix_off_subtitle")}
                </p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-3">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-tts-border bg-tts-bg p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-tts-muted">{t("pix_value")}</p>
                <p className="mt-2 text-sm text-tts-deep">
                  {rampMode === "onramp" ? onRampHeaderValueDisplay : offRampDisplayAmount}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-tts-border bg-tts-bg p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-tts-muted">{L("Moeda", "Currency")}</p>
                <p className="mt-2 text-sm font-black text-tts-deep">{headerCurrencyDisplay}</p>
              </div>
                <div className="min-w-0 overflow-hidden rounded-2xl border border-tts-border bg-tts-bg p-4">
                  <p className="text-sm uppercase tracking-[0.24em] text-tts-muted">{t("pix_destination")}</p>
                  <p className="mt-2 text-sm text-tts-deep">{transferFlow && transferRecipientLabel ? transferRecipientLabel : rampMode === "onramp" ? t("pix_my_account") : t("pix_your_pix")}</p>
                  {transferFlow && transferRecipientDisplayKey && (
                    <p className="mt-1 break-all text-xs text-tts-muted">{transferRecipientDisplayKey}</p>
                  )}
                  {transferFlow && !transferRecipientVerified && (
                    <div className="mt-3 min-h-5 text-xs font-bold">
                      {!sessionReady ? (
                        <p className="inline-flex items-center gap-2 text-tts-deep"><InlineSpinner />{L("Verificando sessão deste navegador...", "Checking this browser session...")}</p>
                      ) : needsBrowserLoginForPix ? (
                        <p className="text-tts-gold">{pixLoginRequiredMessage}</p>
                      ) : recipientVerificationLoading ? (
                        <p className="inline-flex items-center gap-2 text-tts-confirm"><InlineSpinner />{L("Validando contato salvo...", "Validating saved contact...")}</p>
                      ) : recipientVerificationError ? (
                        <button
                          type="button"
                          className="text-left text-tts-error underline decoration-tts-error/40 underline-offset-4"
                          onClick={() => {
                            recipientValidationKeyRef.current = "";
                            setRecipientVerificationError("");
                            setVerifiedTransferRecipient(null);
                          }}
                        >
                          {recipientVerificationError} {L("Validar novamente", "Validate again")}
                        </button>
                      ) : (
                        <p className="text-tts-deep">{L("Aguardando validação do contato.", "Waiting for contact validation.")}</p>
                      )}
                    </div>
                  )}
                </div>
            </div>
            <AccountStatusCard
              state={!sessionReady ? "loading" : hasSession ? "connected" : "signed-out"}
              ctaHref={loginHref || "/login"}
              detail={hasSession ? L("Sua conta está pronta para confirmar este PIX.", "Your account is ready to confirm this PIX.") : undefined}
              compact
              className="bg-tts-bg/70"
            />
          </section>
        </header>

        {!hasSession && rampMode === "onramp" && (
          <section className="mt-5 rounded-2xl border border-tts-gold bg-tts-gold-bg p-4 text-sm text-tts-gold">
            {needsBrowserLoginForPix
              ? needsBrowserLoginForChatLink
                ? L("Este PIX veio do chat, mas a sessão não foi carregada neste navegador. Volte ao WhatsApp e abra o link novamente, ou peça um novo link. O PIN será pedido somente na confirmação final.", "This PIX came from chat, but the session was not loaded in this browser. Return to WhatsApp and open the link again, or request a new link. The PIN will be requested only at final confirmation.")
                : L("Entre com PIN para continuar este PIX na sua conta.", "Sign in with PIN to continue this PIX in your account.")
              : t("pix_need_email")}
            {loginHref && (
              <a
                className="mt-3 inline-flex rounded-full bg-tts-gold px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-tts-deep transition hover:bg-tts-gold/90"
                href={loginHref}
              >
                {L("Entrar com PIN", "Sign in with PIN")}
              </a>
            )}
          </section>
        )}

        {error && (
          <section className="mt-5 rounded-2xl border border-tts-error bg-tts-error/10 p-4 text-sm text-tts-error">
            <p>{error}</p>
            {offRampInsufficientBalance && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <a
                  className="inline-flex min-h-10 items-center justify-center rounded-full bg-tts-error px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-tts-deep transition hover:bg-tts-error/90"
                  href={offRampConversionHref}
                >
                  {L("Converter outro ativo para R$", "Convert another asset to R$")}
                </a>
                {offRampAlternativeAsset ? (
                  <button
                    type="button"
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-tts-error px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-tts-error transition hover:bg-tts-error/10"
                    onClick={() => {
                      const currentAmount = parseHumanAmount(offRampInputValue);
                      const nextAmount = Number.isFinite(currentAmount) && currentAmount > 0
                        ? Math.min(currentAmount, offRampAlternativeBalance)
                        : offRampAlternativeBalance;
                      setTargetAsset(offRampAlternativeAsset);
                      setOffRampFiatAmount("");
                      setOffRampAmount(formatApiAmount(nextAmount || offRampAlternativeBalance));
                      setOffRampPreviewPayload(null);
                      setTemporaryOffRampTestResult(null);
                      setError("");
                    }}
                  >
                    {L(`Usar ${offRampAlternativeAsset} nesta retirada`, `Use ${offRampAlternativeAsset} for this withdrawal`)}
                  </button>
                ) : null}
              </div>
            )}
            {rampMode === "onramp" && !orderId && !operationLocked && /conta pix|pix account/i.test(error) && (
              <button
                className="mt-3 inline-flex rounded-full bg-tts-error px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-tts-deep transition hover:bg-tts-error/90 disabled:opacity-50"
                disabled={Boolean(loading) || Boolean(transferRecipientBlocker)}
                onClick={() => run("Preparing PIX checkout", confirmQuoteAndCreatePix)}
              >
                {loading ? L("Aguarde...", "Wait...") : L("Tentar gerar PIX novamente", "Try generating PIX again")}
              </button>
            )}
            {onboardingUrl && (
              <a
                className="mt-3 inline-flex rounded-full bg-tts-error px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-tts-deep"
                href={onboardingUrl}
                target="_blank"
                rel="noreferrer"
              >
                {L("Abrir cadastro PIX", "Open PIX setup")}
              </a>
            )}
          </section>
        )}

        {config && !config.available && (
          <section className="mt-5 rounded-2xl border border-tts-gold bg-tts-gold-bg p-4 text-sm text-tts-gold">
            <p className="font-black">
              {L("PIX está temporariamente indisponível.", "PIX is temporarily unavailable.")}
            </p>
            <p className="mt-2 leading-6 text-tts-gold">
              {L("Tente novamente em alguns instantes. Se o problema continuar, volte ao chat e peça um novo link.", "Try again in a moment. If it keeps happening, return to chat and request a new link.")}
            </p>
            <a
              className="mt-3 inline-flex rounded-full border border-tts-gold px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-tts-gold transition hover:bg-tts-gold-bg"
              href="/mainnet"
            >
              {L("Abrir seletor de rede", "Open network selector")}
            </a>
          </section>
        )}

        {operationLocked && step !== "success" && (
          <section className="mt-5 rounded-2xl border border-tts-confirm bg-tts-confirm/10 p-4 text-sm font-bold text-tts-confirm">
            {t("pix_done_sent_chat")}
          </section>
        )}

        <LiveRampPanel
          mode={rampMode}
          steps={liveSteps}
          loading={loading}
          status={statusLabel(status, language)}
          launchedFromChat={launchedFromChat}
          language={language}
          feeSummary={onRampConversionFeeSummary}
        />

        {!lockedMode && (
        <section className="mt-5 grid gap-3 rounded-lg border border-tts-border bg-tts-surface p-3 shadow-sm backdrop-blur sm:grid-cols-2">
          <button
            className={`rounded-lg px-5 py-4 text-left transition ${rampMode === "onramp" ? "bg-tts-confirm text-tts-deep shadow-lg" : "bg-tts-bg/60 text-tts-deep hover:bg-tts-bg"}`}
            onClick={() => {
              setRampMode("onramp");
              setError("");
            }}
          >
            <span className="block text-xs font-black uppercase tracking-[0.18em] opacity-70">{L("Adicionar saldo", "Add money")}</span>
            <span className="mt-1 block text-lg font-black">{L("PIX para saldo", "PIX to balance")}</span>
          </button>
          <button
            className={`rounded-lg px-5 py-4 text-left transition ${rampMode === "offramp" ? "bg-tts-gold text-tts-deep shadow-lg" : "bg-tts-bg/60 text-tts-deep hover:bg-tts-bg"}`}
            onClick={() => {
              setRampMode("offramp");
              setError("");
            }}
          >
            <span className="block text-xs font-black uppercase tracking-[0.18em] opacity-70">{L("Mandar para PIX", "Send to PIX")}</span>
            <span className="mt-1 block text-lg font-black">{L("Saldo para PIX", "Balance to PIX")}</span>
          </button>
        </section>
        )}

        {rampMode === "offramp" && (
          <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-lg border border-tts-border bg-tts-surface p-5 text-tts-deep shadow-sm sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-gold">PIX</p>
                <h2 className="mt-1 text-3xl font-black text-tts-deep">{L("Enviar para PIX", "Send to PIX")}</h2>

              <label className="mt-6 block text-sm font-bold text-tts-deep">
                {L("Valor", "Amount")}
              </label>
              <div className="mt-2 flex overflow-hidden rounded-lg border border-tts-border bg-tts-bg focus-within:border-tts-gold">
                <span className="flex min-w-[4.5rem] items-center justify-center whitespace-nowrap border-r border-tts-border bg-tts-surface px-4 text-sm font-black text-tts-muted">{offRampInputPrefix}</span>
                <input
                  className="min-w-0 w-full bg-transparent px-4 py-4 text-3xl font-black text-tts-deep outline-none disabled:text-tts-deep disabled:opacity-100"
                  value={offRampInputValue}
                  inputMode="decimal"
                  placeholder="100"
                  disabled={offRampAmountLocked}
                  title={offRampAmountLocked ? L("Valor definido pelo chat", "Amount set by chat") : undefined}
                  aria-label={offRampExactReceiveBrl
                    ? L("Valor em reais para receber via PIX", "Amount in BRL to receive through PIX")
                    : L(`Valor em ${offRampInputAsset} para retirar via PIX`, `Amount in ${offRampInputAsset} to withdraw through PIX`)}
                  onChange={(event) => {
                    const next = event.target.value;
                    setOffRampPreviewPayload(null);
                    setTemporaryOffRampTestResult(null);
                    if (offRampExactReceiveBrl) {
                      setOffRampFiatAmount(next);
                    } else if (offRampInputAsset === "BRL") {
                      setOffRampFiatAmount(next);
                      setOffRampAmount(next);
                    } else {
                      setOffRampAmount(next);
                    }
                  }}
                />
                <span className="flex min-w-[4.5rem] items-center justify-center whitespace-nowrap border-l border-tts-border bg-tts-surface px-4 text-sm font-black text-tts-muted">{offRampInputUnit}</span>
              </div>
              {offRampAmountLocked && (
                <p className="mt-2 text-xs font-bold text-tts-gold">{L("Valor definido pelo chat.", "Amount set by chat.")}</p>
              )}
              <label className="mt-6 block text-sm font-bold text-tts-deep">{L("Chave PIX", "PIX key")}</label>
              <div className="mt-2 overflow-hidden rounded-lg border border-tts-border bg-tts-bg focus-within:border-tts-gold">
                <input
                  className="w-full bg-transparent px-4 py-4 text-base font-black text-tts-deep outline-none placeholder:text-tts-muted"
                  value={offRampPixKey}
                  inputMode="text"
                  autoComplete="off"
                  placeholder={L("Email, CPF, telefone ou chave aleatória", "Email, CPF, phone, or random key")}
                  aria-label={L("Chave PIX de destino", "Destination PIX key")}
                  onChange={(event) => {
                    setOffRampPixKey(event.target.value);
                    setTemporaryOffRampTestResult(null);
                  }}
                />
              </div>
              <p className="mt-2 text-xs font-bold text-tts-gold">
                {normalizedOffRampPixKey
                  ? L(`Destino: PIX ${normalizedOffRampPixKey}`, `Destination: PIX ${normalizedOffRampPixKey}`)
                  : L("Digite a chave PIX que receberá a retirada.", "Enter the PIX key that will receive the withdrawal.")}
              </p>
              <div className="mt-5 rounded-lg border border-tts-gold bg-tts-gold-bg p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-gold">{L("Antes do PIN", "Before PIN")}</p>
                  </div>
                  <button
                    className="w-fit rounded-lg bg-tts-gold px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-tts-deep transition hover:bg-tts-gold disabled:opacity-50"
                    disabled={!canResolveWallet || Boolean(loading) || operationLocked}
                    onClick={() => run("Previewing PIX withdrawal", previewOffRampFees)}
                  >
                    {loading === "Previewing PIX withdrawal" ? <span className="inline-flex items-center gap-2"><InlineSpinner tone="cyan" />{L("Calculando", "Calculating")}</span> : L("Calcular", "Calculate")}
                  </button>
                </div>
                {offRampQuote ? (
                  <RampFeeBridge
                    mode="offramp"
                    quote={offRampQuote}
                    language={language}
                    sourceLabel={offRampDisplayAmount}
                    sourceCaption={L("valor inicial", "starting amount")}
                    destinationCaption={L("chega no seu PIX", "arrives in your PIX")}
                  />
                ) : (
                  <EtherfuseMeasuredFeeNotice
                    mode="offramp"
                    amount={offRampInputAsset === "BRL" ? offRampFiatAmount : offRampAmount}
                    language={language}
                  />
                )}
              </div>
              <label className="mt-6 block text-sm font-bold text-tts-deep">{L("PIN da conta", "Account PIN")}</label>
              <WalletPinInput
                value={walletPin}
                onChange={updateWalletPin}
                tone="cyan"
                placeholder={L("Digite seu PIN", "Enter your PIN")}
                clearLabel={L("Limpar", "Clear")}
                inputRef={(node) => {
                  walletPinInputRef.current = node;
                }}
              />
              <div className="mt-5 rounded-3xl border border-tts-gold bg-tts-gold-bg p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-gold">{L("Confirmação final", "Final confirmation")}</p>
                <p className="mt-2 text-sm font-bold leading-6 text-tts-gold">
                  {L("Este botão confirma a retirada e envia o valor para sua chave PIX.", "This button confirms the withdrawal and sends the amount to your PIX key.")}
                </p>
              </div>

              <button
                className="mt-4 w-full rounded-3xl bg-tts-gold px-5 py-5 text-base font-black text-tts-deep shadow-lg shadow-cyan-950/30 transition hover:bg-tts-gold disabled:opacity-50"
                disabled={!canResolveWallet || Boolean(loading) || walletPin.length < 4 || !normalizedOffRampPixKey || operationLocked}
                onClick={() => run("Confirming PIX withdrawal", runTemporaryOffRampEndpointTest)}
              >
                {operationLocked ? L("PIX concluído", "PIX complete") : loading === "Confirming PIX withdrawal" ? <span className="inline-flex items-center gap-2"><InlineSpinner tone="cyan" />{L("Confirmando...", "Confirming...")}</span> : L("Confirmar retirada para meu PIX agora", "Confirm withdrawal to my PIX now")}
              </button>
            </div>

            <div className="rounded-2xl border border-tts-border bg-tts-surface p-5 text-tts-deep shadow-sm sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-gold">{L("Seu PIX", "Your PIX")}</p>
              <h2 className="mt-1 text-2xl font-black">{L("Envio para PIX", "Send to PIX")}</h2>
              {!temporaryOffRampTestResult ? (
                <div className="mt-8 h-28 rounded-3xl border border-dashed border-tts-border bg-tts-bg/60" />
              ) : (
                <div className="mt-6 space-y-4">
                    <div className="rounded-3xl bg-tts-bg/60 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-tts-gold">Status</p>
                      <p className="mt-1 text-lg font-black">{temporaryOffRampTestResult.final_transaction?.status || "processing"}</p>
                    </div>
                    <div className="rounded-3xl bg-tts-bg/60 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-tts-gold">{L("Saiu da conta", "Left account")}</p>
                      <p className="mt-1 text-lg font-black">{formatRampAsset(temporaryOffRampTestResult.source_amount || offRampInputValue, temporaryOffRampTestResult.source_asset_code || offRampInputAsset)}</p>
                    </div>
                    <div className="rounded-3xl bg-tts-bg/60 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-tts-gold">{L("Entrou no seu PIX", "Arrived in your PIX")}</p>
                      <p className="mt-1 text-lg font-black">{offRampPixTargetDisplay}</p>
                      <p className="mt-1 text-sm font-bold text-tts-muted">{externalPixDestination}</p>
                    </div>
                    {temporaryOffRampTestResult.target_brl && (
                      <div className="rounded-3xl bg-tts-bg/60 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-tts-gold">{L("Conversão para BRL", "Conversion to BRL")}</p>
                        <p className="mt-1 text-sm font-bold text-tts-muted">
                          {L("O valor foi convertido na saída para chegar em BRL no PIX.", "The amount was converted on exit so BRL arrives in PIX.")}
                        </p>
                      </div>
                    )}
                  <div className="rounded-3xl border border-tts-confirm bg-tts-confirm/10 p-4 text-tts-confirm">
                    <p className="text-sm font-black">{L("Envio concluído para seu PIX.", "Send to your PIX completed.")}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {rampMode === "onramp" && (
        <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-2xl border border-tts-border bg-tts-surface p-5 text-tts-deep shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-confirm">PIX</p>
                <h2 className="mt-1 text-2xl font-black text-tts-deep">
                  {transferFlow && transferRecipientLabel
                    ? L(`Quanto você quer mandar para ${transferRecipientLabel}?`, `How much do you want to send to ${transferRecipientLabel}?`)
                    : L("Quanto você quer colocar?", "How much do you want to add?")}
                </h2>
              </div>
            </div>

            {!hasSession && allowEmailAccountLookup && (
            <div className="mt-6 rounded-3xl border border-tts-confirm bg-tts-confirm/10 p-4">
              <label className="block text-sm font-bold text-tts-confirm">{L("Email da conta", "Account email")}</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-tts-border bg-tts-bg px-4 py-3 text-sm font-bold text-tts-deep outline-none transition placeholder:text-tts-muted focus:border-tts-confirm"
                  type="email"
                  value={rampEmail}
                  placeholder="jorge@gmail.com"
                  disabled={Boolean(loading)}
                  onChange={(event) => {
                    clearResolvedRampWallet(event.target.value);
                  }}
                />
                <button
                  className="rounded-2xl bg-tts-confirm px-4 py-3 text-sm font-black text-tts-deep transition hover:bg-tts-confirm disabled:opacity-50"
                  disabled={!rampEmail.trim() || Boolean(loading)}
                  onClick={() => run("Resolving account", async () => {
                    await resolveWalletFromEmail();
                  })}
                >
                  {loading === "Resolving account" ? L("Localizando...", "Finding...") : L("Usar conta", "Use account")}
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold text-tts-confirm">
                {walletPublicKey
                  ? L("Conta localizada.", "Account found.")
                  : L("Digite o email da conta para localizar sua conta.", "Enter the account email to find your account.")}
              </p>
            </div>
            )}

            {showOnRampReceiveTargetInput ? (
              <>
                <label className="mt-6 block text-sm font-bold text-tts-deep">{L("Você quer receber", "You want to receive")}</label>
                <div className="mt-2 flex overflow-hidden rounded-2xl border border-tts-border bg-tts-bg focus-within:border-tts-confirm">
                  <span className="flex min-w-[4.5rem] items-center justify-center whitespace-nowrap border-r border-tts-border bg-tts-surface px-4 text-sm font-black text-tts-muted">{friendlyAssetName(targetReceiveInputAsset, language)}</span>
                  <input
                    aria-label={L("Valor que você quer receber", "Amount you want to receive")}
                    className="min-w-0 w-full bg-transparent px-4 py-4 text-3xl font-black text-tts-deep outline-none"
                    value={targetReceiveInputAmount}
                    inputMode="decimal"
                    onChange={(event) => updateOnRampReceiveTargetAmount(event.target.value)}
                  />
                  <span className="flex min-w-[4.5rem] items-center justify-center whitespace-nowrap border-l border-tts-border bg-tts-surface px-4 text-sm font-black text-tts-muted">{targetReceiveInputAsset}</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-tts-muted">
                  {L("Altere o valor para recalcular o PIX antes de gerar o QR.", "Change the amount to recalculate PIX before creating the QR.")}
                </p>
                <div className="mt-3 rounded-2xl border border-tts-confirm bg-tts-confirm/10 px-4 py-3 text-sm font-bold text-tts-confirm">
                  {hasExecutableOnRampPixPayAmount
                    ? L(`PIX final: ${effectiveOnRampPixPayDisplay}`, `Final PIX: ${effectiveOnRampPixPayDisplay}`)
                    : receiveEstimateLoading
                      ? <span className="inline-flex items-center gap-2"><InlineSpinner />{L("Calculando cotação exata...", "Calculating exact quote...")}</span>
                      : receiveEstimateReady
                        ? L("Cotação preparada. Gere o PIX para travar o valor final.", "Quote prepared. Generate PIX to lock the final amount.")
                        : L("O PIX final será calculado pela rota dinâmica antes de gerar o QR.", "The final PIX will be calculated by the dynamic route before creating the QR.")}
                </div>
              </>
            ) : (
              <>
                <label className="mt-6 block text-sm font-bold text-tts-deep">{L("Valor", "Amount")}</label>
                <div className="mt-2 flex overflow-hidden rounded-2xl border border-tts-border bg-tts-bg focus-within:border-tts-confirm">
                  <span className="flex min-w-[4.5rem] items-center justify-center whitespace-nowrap border-r border-tts-border bg-tts-surface px-4 text-sm font-black text-tts-muted">R$</span>
                  <input
                    className="min-w-0 w-full bg-transparent px-4 py-4 text-3xl font-black text-tts-deep outline-none"
                    value={amountBrl}
                    inputMode="decimal"
                    onChange={(event) => {
                      setAmountBrl(event.target.value);
                      clearQuoteState();
                    }}
                  />
                  <span className="flex min-w-[4.5rem] items-center justify-center whitespace-nowrap border-l border-tts-border bg-tts-surface px-4 text-sm font-black text-tts-muted">BRL</span>
                </div>
              </>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <label className="block text-sm font-bold text-tts-deep">{transferFlow ? L("Enviar como", "Send as") : L("Receber como", "Receive as")}</label>
              <button
                type="button"
                className={`rounded-2xl border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${advancedAssetMode ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" : "border-tts-border text-tts-muted hover:bg-tts-surface"}`}
                onClick={() => setAdvancedAssetMode((current) => {
                  const next = !current;
                  if (!next && isAdvancedAsset(targetAsset)) {
                    setTargetAsset("USDC");
                    setDesiredReceiveAmount("");
                    setDesiredReceiveAsset("");
                    clearQuoteState();
                  }
                  return next;
                })}
              >
                {L("Avançado", "Advanced")}
              </button>
            </div>
            <div className={`mt-2 grid gap-2 rounded-3xl border border-tts-border bg-tts-bg/60 p-2 ${advancedAssetMode ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2"}`}>
              {(advancedAssetMode ? ADVANCED_TARGET_ASSETS : BASIC_TARGET_ASSETS).map((asset) => (
                <button
                  key={asset}
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition ${targetAsset === asset ? "bg-tts-confirm text-tts-deep shadow-lg" : "text-tts-muted hover:bg-tts-surface"}`}
                    onClick={() => {
                    if (asset !== targetAsset) {
                      setTargetAsset(asset);
                      setDesiredReceiveAmount("");
                      setDesiredReceiveAsset("");
                      clearQuoteState();
                    }
                    }}
                >
                  {friendlyAssetName(asset, language)}
                </button>
              ))}
            </div>
            {!quote && !exactOnRampValueContract && (
              <EtherfuseMeasuredFeeNotice
                mode="onramp"
                amount={amountBrl}
                language={language}
              />
            )}
            {transferFlow && transferRecipientLabel && (
              <div className="mt-4 rounded-3xl border border-tts-confirm bg-tts-confirm/10 p-4 text-sm font-bold text-tts-confirm">
                {transferRecipientVerified ? (
                  <p className="text-xs text-tts-confirm">
                    {L(`Depois que você confirmar o PIX, enviaremos automaticamente ${feeAdjustedAutoPayDisplayAmount}.`, `After you confirm the PIX, we will automatically send ${feeAdjustedAutoPayDisplayAmount}.`)}
                  </p>
                ) : (
                  <p className="text-xs text-tts-error">
                    {transferRecipientBlocker}
                  </p>
                )}
              </div>
            )}
            {hasPostOnRampConversion && postConversionTargetDisplay && (
              <div className="mt-4 rounded-3xl border border-tts-border bg-tts-bg/70 p-4 text-sm text-tts-muted">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-deep">{L("Depois do PIX", "After PIX")}</p>
                <p className="mt-1 font-bold">
                  {L(
                    `Sua conta recebe ${requestedOnRampTargetDisplay} primeiro. Em seguida, convertemos esse saldo para ${postConversionTargetDisplay}.`,
                    `Your account receives ${requestedOnRampTargetDisplay} first. Then we convert that balance to ${postConversionTargetDisplay}.`
                  )}
                </p>
              </div>
            )}

            <button className="mt-6 w-full rounded-2xl bg-tts-confirm px-5 py-4 text-base font-bold text-tts-deep shadow-lg shadow-tts-confirm/15 transition hover:bg-tts-confirm/90 disabled:opacity-50" disabled={!canPrepareOnRampPix || onRampPixGenerationBlocked} onClick={() => run("Preparing PIX checkout", confirmQuoteAndCreatePix)}>
              {operationLocked
                ? L("PIX concluído", "PIX complete")
                : loading === "Preparing PIX checkout"
                  ? <span className="inline-flex items-center justify-center gap-2"><InlineSpinner />{L("Gerando PIX...", "Generating PIX...")}</span>
                : quoteExpired
                  ? L("Continuar", "Continue")
                : onRampPixAlreadyGenerated
                  ? L("PIX gerado para este valor", "PIX created for this amount")
                  : waitingForReceiveEstimate
                    ? <span className="inline-flex items-center justify-center gap-2"><InlineSpinner />{L("Atualizando cotação...", "Updating quote...")}</span>
                    : receiveEstimateMissing
                      ? L("Aguardando cotação atual", "Waiting for current quote")
                      : L("Gerar PIX", "Generate PIX")}
            </button>
            {transferRecipientBlocker && (
              <p className="mt-3 text-sm font-bold text-tts-error">{transferRecipientBlocker}</p>
            )}

            {quote && (
              <div className="mt-6 rounded-3xl border border-tts-confirm bg-tts-confirm/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-confirm">{L("Pronto", "Ready")}</p>
                    <h3 className="mt-1 text-2xl font-black text-tts-deep">{estimatedReceiveLabel}</h3>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-black ${quoteExpired ? "bg-tts-error text-tts-deep" : "bg-tts-confirm text-tts-deep"}`}>
                    {quoteCountdown}
                  </div>
                </div>
                <RampFeeBridge
                  mode="onramp"
                  quote={quote}
                  language={language}
                  sourceLabel={quoteGrossLabel}
                  sourceCaption={L("valor inicial", "starting amount")}
                  destinationCaption={quoteCostContext}
                />
                {quoteExpired && (
                  <div className="mt-4 rounded-2xl border border-tts-error bg-tts-error/10 p-4 text-sm font-bold text-tts-error sm:flex sm:items-center sm:justify-between sm:gap-4">
                    <p>{L("A estimativa expirou. Toque em continuar para preparar um novo PIX.", "The estimate expired. Tap continue to prepare a new PIX.")}</p>
                    <button
                      type="button"
                      className="mt-3 inline-flex w-full justify-center rounded-full bg-tts-error px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white transition hover:bg-tts-error/90 disabled:opacity-50 sm:mt-0 sm:w-auto"
                      disabled={!canPrepareOnRampPix}
                      onClick={() => run("Preparing PIX checkout", confirmQuoteAndCreatePix)}
                    >
                      {loading === "Preparing PIX checkout"
                        ? <span className="inline-flex items-center justify-center gap-2"><InlineSpinner />{L("Preparando...", "Preparing...")}</span>
                        : L("Continuar", "Continue")}
                    </button>
                  </div>
                )}
                {onboardingUrl && (
                  <div className="mt-4 rounded-2xl border border-tts-gold bg-tts-gold-bg p-4 text-sm text-tts-gold">
                    <p className="font-bold">{L("Precisamos concluir o cadastro PIX desta conta.", "We need to finish this account's PIX setup.")}</p>
                    <a className="mt-3 inline-flex rounded-full bg-tts-gold px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-tts-deep" href={onboardingUrl} target="_blank" rel="noreferrer">
                      {L("Abrir cadastro PIX", "Open PIX setup")}
                    </a>
                  </div>
                )}
                {programmaticOnboarding && !onboardingUrl && (
                  <div className="mt-4 rounded-2xl border border-tts-gold bg-tts-gold-bg p-4 text-sm text-tts-gold">
                    <p className="font-bold">{L("Cadastro PIX preparado.", "PIX setup ready.")}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-tts-border bg-tts-surface p-5 text-tts-deep shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-confirm">{L("Pagamento", "Payment")}</p>
                <h2 className="mt-1 text-2xl font-black">{L("Faça o PIX", "Make the PIX")}</h2>
              </div>
            </div>

            {!order ? (
              <div className="mt-8 rounded-3xl border border-dashed border-tts-border bg-tts-bg/60 p-8 text-center text-sm text-tts-muted">
                <p>
                  {quoteExpired
                      ? L("A estimativa expirou. Toque em continuar para preparar um novo PIX.", "The estimate expired. Tap continue to prepare a new PIX.")
                      : quote
                      ? L("Preparando o PIX.", "Preparing PIX.")
                      : L("Informe o valor e toque em continuar.", "Enter the amount and tap continue.")}
                </p>
              </div>
            ) : (
              <>
                    <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
                      <div className="rounded-3xl p-4" style={{ backgroundColor: "#ffffff", color: "#111827" }}>
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt="QR Code PIX"
                            className="h-auto w-full"
                          />
                        ) : (
                          <div className="grid aspect-square place-items-center rounded-2xl bg-tts-surface text-center text-xs font-bold text-tts-muted">{L("QR indisponível", "QR unavailable")}</div>
                        )}
                      </div>
                  <div className="space-y-3">
                    <div className="rounded-3xl bg-tts-bg/60 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-tts-confirm">{L("Recebedor", "Receiver")}</p>
                      <p className="mt-1 text-lg font-black">TalkToStellar</p>
                    </div>
                    <div className="rounded-3xl bg-tts-bg/60 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-tts-confirm">{L("Valor", "Amount")}</p>
                      <p className="mt-1 text-lg font-black">{effectiveOnRampPixPayDisplay}</p>
                    </div>
                    <div className="rounded-3xl bg-tts-bg/60 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-tts-confirm">{L("Expira em", "Expires in")}</p>
                      <p className="mt-1 text-lg font-black">{quoteCountdown}</p>
                    </div>
                  </div>
                </div>

                  {isSandboxMockOrder && !localMockFallbackAllowed ? (
                    <div className="mt-5 rounded-3xl border border-tts-error bg-tts-error/10 p-4 text-sm font-bold text-tts-error">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-error">{L("PIX expirado", "Expired PIX")}</p>
                      <p className="mt-2">
                        {L("Esse PIX não pode mais ser confirmado. Gere um novo PIX para continuar.", "This PIX can no longer be confirmed. Create a new PIX to continue.")}
                      </p>
                    </div>
                  ) : demoPixMode ? (
                    <div className="mt-5 rounded-3xl border border-tts-gold bg-tts-gold-bg p-4 text-sm font-bold text-tts-gold">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-gold">{L("Confirmação do PIX", "PIX confirmation")}</p>
                      <p className="mt-2">
                        {isSandboxMockOrder
                          ? L("Depois de pagar, confirme aqui para concluir a operação.", "After paying, confirm here to complete the operation.")
                          : L("Depois de pagar no app do seu banco, confirme aqui para continuar.", "After paying in your bank app, confirm here to continue.")}
                      </p>
                      <p className="mt-2 text-tts-gold">
                        {L("Você verá o valor final e o status da operação nesta mesma tela.", "You will see the final amount and operation status on this same page.")}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-3xl bg-tts-bg/60 p-4">
                      <p className="mb-3 rounded-2xl border border-tts-confirm bg-tts-confirm/10 p-3 text-sm font-black text-tts-confirm">
                        {L("PIX bancário integrado. Use o QR ou copie o código para pagar no seu app do banco.", "Bank PIX integrated. Use the QR or copy the code to pay in your bank app.")}
                      </p>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-tts-confirm">{L("Código PIX copia e cola", "Copy-and-paste PIX code")}</p>
                        <button className="rounded-full bg-tts-confirm px-3 py-1 text-xs font-bold text-tts-deep transition hover:bg-tts-confirm/90" onClick={() => run("Copying PIX code", copyPixCode)}>
                          {copied ? L("Copiado", "Copied") : L("Copiar código PIX", "Copy PIX code")}
                        </button>
                      </div>
                      <p className="mt-3 max-h-28 overflow-auto break-all rounded-2xl bg-tts-surface p-3 font-mono text-xs text-tts-deep">{pixCode || "PIX code not returned yet"}</p>
                      <p className="mt-3 text-sm text-tts-muted">{L("Chave PIX", "PIX key")}: <span className="font-mono text-tts-deep">{pixKey || L("indisponível", "unavailable")}</span></p>
                    </div>
                  )}

                  {orderFailed && (
                    <div className="mt-5 rounded-3xl border border-tts-error bg-tts-error/10 p-4 text-tts-error">
                      <p className="text-sm font-black">{L("Não foi possível concluir este PIX.", "This PIX could not be completed.")}</p>
                      <p className="mt-2 text-sm font-bold text-tts-error">{L("Gere um novo PIX e tente novamente.", "Create a new PIX and try again.")}</p>
                      <button
                        className="mt-4 rounded-2xl bg-tts-error px-4 py-3 text-xs font-black text-tts-deep"
                        onClick={clearQuoteState}
                      >
                        {L("Gerar novo PIX", "Create new PIX")}
                      </button>
                    </div>
                  )}

                  {config?.available && !orderFailed && !(isSandboxMockOrder && !localMockFallbackAllowed) && (
                    <div className="mt-5 rounded-3xl border-2 border-tts-gold bg-tts-gold-bg p-4 text-tts-gold shadow-lg shadow-amber-950/20">
                        {sandboxSimulationComplete ? (
                          <p className="mt-3 rounded-2xl border border-tts-confirm bg-tts-confirm/10 p-3 text-sm font-black text-tts-confirm">
                            {L("PIX confirmado.", "PIX confirmed.")} {transferFlow ? pixFundedTransferResult?.transaction_hash ? L("A transferência foi enviada.", "The transfer was sent.") : L("A transferência automática ainda está finalizando.", "The automatic transfer is still finishing.") : L(`${onRampReceivedDisplay} entrou na conta.`, `${onRampReceivedDisplay} arrived in the account.`)}
                          </p>
                        ) : (
                          <>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-gold">{L("Depois de pagar o PIX", "After paying PIX")}</p>
                            <p className="mt-2 text-sm font-bold leading-6 text-tts-gold">
                              {isSandboxMockOrder
                                ? L("Digite o PIN para concluir.", "Enter the PIN to complete.")
                                : L("Digite o PIN para confirmar e continuar.", "Enter the PIN to confirm and continue.")}
                            </p>
                            <label className="mt-4 block text-sm font-bold text-tts-gold">{L("PIN da conta", "Account PIN")}</label>
                            <WalletPinInput
                              value={walletPin}
                              onChange={updateWalletPin}
                              tone="amber"
                              placeholder={L("Digite seu PIN", "Enter your PIN")}
                              clearLabel={L("Limpar", "Clear")}
                              inputRef={(node) => {
                                walletPinInputRef.current = node;
                              }}
                            />
                            <button
                              className="mt-4 w-full rounded-3xl bg-tts-gold px-5 py-5 text-base font-black text-tts-deep shadow-lg shadow-amber-950/30 transition hover:bg-tts-gold/90 disabled:opacity-50"
                              disabled={Boolean(loading) || !orderId || walletPin.length < 4 || operationLocked}
                              onClick={() => run("Confirming PIX received", simulatePixPayment)}
                            >
                              {operationLocked ? L("PIX concluído", "PIX complete") : loading === "Confirming PIX received" ? <span className="inline-flex items-center justify-center gap-2"><InlineSpinner tone="amber" />{L("Confirmando...", "Confirming...")}</span> : L("Confirmar PIX", "Confirm PIX")}
                            </button>
                          </>
                        )}
                    </div>
                  )}
              </>
            )}
          </div>
        </section>
        )}

        {debugEnabled && rampMode === "offramp" && (
          <section className="mt-5">
            <AssetMovement title="Off-ramp account balances" before={offRampBalancesBefore} after={offRampBalancesAfter} deltas={offRampAssetDeltas} walletPublicKey={walletPublicKey} />
          </section>
        )}

        {debugEnabled && (
          <section className="mt-5">
            <DebugLogPanel logs={debugLogs} onClear={() => setDebugLogs([])} />
          </section>
        )}

        {debugEnabled && (
        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          {rampMode === "onramp" && (
            <TemporaryEndpointCard
              title="Teste interno de entrada PIX"
              endpoint="Fluxo interno de entrada PIX"
              description="Executa a preparação completa e retorna o status final da operação."
              disabled={!canResolveWallet || Boolean(loading) || !config?.available || !opsMocksAllowed || operationLocked}
              hidden={!config?.available || !opsMocksAllowed}
              onRun={() => run("Executando teste interno de entrada PIX", runTemporaryEndpointTest)}
              result={temporaryTestResult ? {
                order_id: temporaryTestResult.transaction?.id,
                final_status: temporaryTestResult.final_transaction?.status,
              } : null}
            />
          )}

          {rampMode === "offramp" && (
          <div className="rounded-2xl border border-tts-border bg-tts-surface p-5 shadow-sm shadow-black/30 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-error">Teste interno de retirada</p>
            <h2 className="mt-1 text-2xl font-black">Saldo para PIX</h2>
            <p className="mt-3 text-sm leading-6 text-tts-muted">
              Use apenas em verificações internas para conferir status, taxa e variação de saldo.
            </p>
            <label className="mt-5 block text-sm font-bold text-tts-muted">Valor do saldo para retirar</label>
            <input className="mt-2 w-full rounded-2xl border border-tts-border bg-tts-surface px-4 py-3 text-lg font-black outline-none ring-tts-error focus:ring-4" value={offRampAmount} inputMode="decimal" onChange={(event) => setOffRampAmount(event.target.value)} />
            {config?.available && opsMocksAllowed ? (
              <button className="mt-5 w-full rounded-2xl border border-tts-error bg-tts-error/10 px-5 py-3 text-sm font-bold text-tts-error transition hover:bg-tts-error/15 disabled:opacity-50" disabled={!canResolveWallet || Boolean(loading) || operationLocked} onClick={() => run("Executando teste interno de retirada PIX", runTemporaryOffRampEndpointTest)}>
                Testar retirada e variação de saldo
              </button>
            ) : (
              <div className="mt-5 rounded-2xl bg-tts-surface p-4 text-sm font-bold text-tts-muted">Teste interno desativado. Use o fluxo normal de retirada.</div>
            )}
            {temporaryOffRampTestResult && (
              <pre className="mt-5 max-h-80 overflow-auto rounded-2xl bg-tts-surface p-4 text-xs text-tts-confirm">{JSON.stringify({
                order_id: temporaryOffRampTestResult.transaction?.id,
                ready_to_sign: temporaryOffRampTestResult.ready_to_sign,
                submitted: temporaryOffRampTestResult.submitted,
                final_status: temporaryOffRampTestResult.final_transaction?.status,
                balance_delta: temporaryOffRampTestResult.balance_delta,
              }, null, 2)}</pre>
            )}
          </div>
          )}
        </section>
        )}

        {step === "success" && successTransaction && (
          <section className="mt-5 overflow-hidden rounded-2xl border border-tts-confirm bg-tts-surface text-tts-deep shadow-sm shadow-emerald-950/25">
            <div className="relative p-6 sm:p-8">
              {returnToPath && (
                <div className="relative mb-5 flex items-center justify-start receipt-top-return-cta">
                  <a
                    href={returnToPath}
                    className="inline-flex w-full items-center justify-center rounded-3xl bg-tts-deep px-5 py-4 text-sm font-black text-tts-surface transition hover:bg-tts-deep/90 sm:w-auto"
                  >
                    {returnLabel}
                  </a>
                </div>
              )}

              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-tts-confirm">{L("Comprovante PIX", "PIX receipt")}</p>
                  <div className="mt-5 flex items-center gap-4">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-tts-confirm text-3xl font-black text-tts-deep">✓</span>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
                        {rampMode === "offramp" ? L("Retirada confirmada", "Withdrawal confirmed") : transferFlow ? L("PIX e transferência confirmados", "PIX and transfer confirmed") : L("PIX confirmado", "PIX confirmed")}
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-tts-muted">
                        {rampMode === "offramp"
                          ? L("O saldo saiu da sua conta TalkToStellar e entrou no seu PIX.", "The balance left your TalkToStellar account and arrived in your PIX.")
                          : transferFlow
                          ? L("O PIX foi confirmado, o saldo foi convertido automaticamente e a transferência foi enviada.", "PIX was confirmed, the balance was automatically converted, and the transfer was sent.")
                          : L("O PIX foi confirmado e o saldo final entrou na sua conta.", "PIX was confirmed and the final balance arrived in your account.")}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-start gap-3 lg:items-end">
                  <span className="w-fit rounded-full border border-tts-confirm bg-tts-confirm/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-tts-confirm">
                    {L("Concluído", "Completed")}
                  </span>
                </div>
              </div>

              <div className="relative mt-8 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-2xl border border-tts-border bg-tts-bg/60 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-confirm">
                    {rampMode === "offramp" ? L("Valor retirado", "Amount withdrawn") : L("Valor recebido", "Amount received")}
                  </p>
                  <p className="mt-3 text-2xl font-bold tracking-tight text-tts-deep sm:text-5xl">
                    {rampMode === "offramp"
                      ? offRampReceiptAmount
                      : onRampReceivedDisplay}
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <ReceiptRow
                      label={rampMode === "offramp" ? L("Recebido no seu PIX", "Received in your PIX") : L("Pago via PIX", "Paid with PIX")}
                      value={rampMode === "offramp" ? offRampReceiptReceived : effectiveOnRampPixPayDisplay}
                    />
                    <ReceiptRow label={L("Status", "Status")} value={L("Concluído", "Completed")} />
                    {rampMode === "onramp" && <ReceiptRow label={L("Saldo antes", "Balance before")} value={onRampReceiptBefore} />}
                    {rampMode === "onramp" && <ReceiptRow label={L("Saldo depois", "Balance after")} value={onRampReceiptAfter} />}
                    {rampMode === "onramp" && <ReceiptRow label={L("Mudança no saldo", "Balance change")} value={onRampReceiptDelta} />}
                  </div>
                </div>

                <div className="rounded-2xl border border-tts-border bg-tts-bg/60 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-confirm">{L("Detalhes do comprovante", "Receipt details")}</p>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <ReceiptRow label={L("Destino", "Destination")} value={rampMode === "offramp" ? L("Seu PIX", "Your PIX") : L("Minha conta TalkToStellar", "My TalkToStellar account")} />
                    <ReceiptRow label={L("Ordem", "Order")} value={String(successTransaction?.id || temporaryOffRampTestResult?.submit_result?.order_id || "")} />
                    {rampMode === "offramp" && temporaryOffRampTestResult?.receipt_url && <ReceiptRow label={L("Comprovante", "Receipt")} value={String(temporaryOffRampTestResult.receipt_url)} />}
                    {rampMode === "onramp" && onRampReceiptUrl && <ReceiptRow label={L("Comprovante", "Receipt")} value={onRampReceiptUrl} />}
                    <ReceiptRow label={L("Data", "Date")} value={new Date().toLocaleString(language === "en" ? "en-US" : "pt-BR")} />
                  </dl>
                </div>
              </div>

              {transferFlow && (
                <div className={`relative mt-5 rounded-2xl border p-5 ${pixFundedTransferResult?.transaction_hash ? "border-tts-gold bg-tts-gold-bg" : "border-tts-gold bg-tts-gold-bg"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-gold">{L("Transferência após PIX", "Transfer after PIX")}</p>
                  {pixFundedTransferResult?.transaction_hash ? (
                    <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <ReceiptRow label={L("Enviado para", "Sent to")} value={transferRecipientLabel || "recipient"} />
                        {transferRecipientDisplayKey && <ReceiptRow label="Key" value={transferRecipientDisplayKey} />}
                        <ReceiptRow label={L("Valor transferido", "Transferred amount")} value={formatRampAsset(pixFundedTransferResult.amount || autoPayAmount || amountBrl, pixFundedTransferResult.asset_code || autoPayAsset || targetAsset)} />
                        {pixFundedTransferResult.receipt_url && <ReceiptRow label={L("Comprovante", "Receipt")} value={String(pixFundedTransferResult.receipt_url)} />}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={`mt-3 text-sm font-bold ${pixFundedTransferError ? "text-tts-error" : "text-tts-gold"}`}>
                        {pixFundedTransferError
                          ? L(`PIX confirmado. Não consegui concluir o envio automático agora: ${pixFundedTransferError}`, `PIX confirmed. I could not finish the automatic transfer now: ${pixFundedTransferError}`)
                          : L(`PIX confirmado. Enviando automaticamente ${autoPayDisplayAmount} para ${transferRecipientLabel || "destinatário"}...`, `PIX confirmed. Automatically sending ${autoPayDisplayAmount} to ${transferRecipientLabel || "recipient"}...`)}
                      </p>
                      {pixFundedTransferError && (
                        <p className="mt-2 text-xs font-semibold text-tts-muted">
                          {L("O PIX não precisa ser pago de novo. Aguarde alguns segundos e tente atualizar a operação.", "You do not need to pay PIX again. Wait a few seconds and try refreshing the operation.")}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {!returnToPath && !stayOpenAfterSuccess && (
                <p className="relative mt-4 text-xs font-semibold text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function TemporaryEndpointCard({ title, endpoint, description, disabled, hidden, onRun, result }: {
  title: string;
  endpoint: string;
  description: string;
  disabled: boolean;
  hidden: boolean;
  onRun: () => void;
  result: Record<string, unknown> | null;
}) {
  return (
    <div className="rounded-2xl border border-tts-border bg-tts-surface p-5 shadow-sm shadow-black/30 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-gold">Endpoint in frontend</p>
      <h2 className="mt-1 text-2xl font-black">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-tts-muted">{description}</p>
      <div className="mt-4 rounded-2xl bg-tts-bg/60 p-4 font-mono text-xs font-black text-tts-deep">{endpoint}</div>
      {hidden ? (
        <div className="mt-5 rounded-2xl bg-tts-bg/60 p-4 text-sm font-bold text-tts-muted">Hidden in production.</div>
      ) : (
        <button className="mt-5 w-full rounded-2xl bg-tts-confirm px-5 py-3 text-sm font-bold text-tts-deep transition hover:bg-tts-confirm/90 disabled:opacity-50" disabled={disabled} onClick={onRun}>
          Test whole flow and asset delta
        </button>
      )}
      {result && (
        <pre className="mt-5 max-h-80 overflow-auto rounded-2xl bg-tts-bg/60 p-4 text-xs text-tts-confirm">{JSON.stringify(result, null, 2)}</pre>
      )}
    </div>
  );
}

function EtherfuseMeasuredFeeNotice({
  mode,
  amount,
  language,
}: {
  mode: RampMode;
  amount: unknown;
  language: "pt-BR" | "en";
}) {
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const numericAmount = parseHumanAmount(amount);
  const estimatedProviderFee = Number.isFinite(numericAmount) && numericAmount > 0
    ? numericAmount * (ETHERFUSE_TESTNET_FEE_BPS / 10000)
    : ETHERFUSE_TESTNET_FEE_SAMPLE_AMOUNT_BRL;
  const ttsFeeBps = clientTtsTransactionFeeBps();
  const estimatedTtsFee = Number.isFinite(numericAmount) && numericAmount > 0
    ? numericAmount * (ttsFeeBps / 10000)
    : 0;
  const label = mode === "onramp"
    ? L("Antes de gerar o PIX", "Before creating PIX")
    : L("Antes do PIN", "Before PIN");
  const description = mode === "onramp"
    ? L("Taxas aparecem antes da confirmação.", "Fees appear before confirmation.")
    : L("Taxas aparecem antes da confirmação.", "Fees appear before confirmation.");

  return (
    <div className="mt-4 rounded-lg border border-tts-gold bg-tts-gold-bg p-4 text-tts-deep">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-gold">{label}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-tts-gold/30 bg-tts-surface p-3 text-tts-deep">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-tts-gold">
            {mode === "onramp" ? L("Taxa PIX", "PIX fee") : L("Taxa de retirada", "Withdrawal fee")}
          </p>
          <p className="mt-1 text-lg font-black">{formatMoney(estimatedProviderFee)}</p>
        </div>
        <div className="rounded-lg border border-tts-gold/30 bg-tts-surface p-3 text-tts-deep">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-tts-gold">{L("Taxa do app", "App fee")}</p>
          <p className="mt-1 text-lg font-black">{formatMoney(estimatedTtsFee)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-tts-muted">{description}</p>
    </div>
  );
}

function RampFeeBridge({
  mode,
  quote,
  language,
  sourceLabel,
  sourceCaption,
  destinationCaption,
}: {
  mode: RampMode;
  quote: RampResponse | null | undefined;
  language: "pt-BR" | "en";
  sourceLabel?: string;
  sourceCaption?: string;
  destinationCaption?: string;
}) {
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  if (!quote) return null;

  const estimate = buildRampFeeBridgeEstimate(mode, quote);
  if (!estimate) return null;

  const sourceCurrency = estimate.sourceCurrency;
  const destinationCurrency = estimate.destinationCurrency;
  const destinationAfterRaw = estimate.destinationAfterRaw;
  const feeAmount = estimate.providerFeeAmount;
  const feeCurrency = estimate.providerFeeCurrency;
  const ttsTransactionFeeAmount = estimate.ttsTransactionFeeAmount;
  const ttsTransactionFeeCurrency = estimate.ttsTransactionFeeCurrency;
  const sourceValue = sourceLabel || formatQuoteAmount(quote.fromAmount, sourceCurrency);
  const afterValue = destinationAfterRaw ? formatQuoteAmount(destinationAfterRaw, destinationCurrency) : formatQuoteAmount(quote.toAmount, destinationCurrency);
  const feeValue = formatQuoteAmount(feeAmount.toFixed(7), feeCurrency);
  const ttsFeeValue = formatQuoteAmount(ttsTransactionFeeAmount.toFixed(7), ttsTransactionFeeCurrency);
  const sameFeeCurrency = feeCurrency === ttsTransactionFeeCurrency;
  const mixedFeeCurrencies = !sameFeeCurrency && feeAmount > 0 && ttsTransactionFeeAmount > 0;
  const totalFeeDisplay = sameFeeCurrency
    ? `${formatQuoteAmount((feeAmount + ttsTransactionFeeAmount).toFixed(7), feeCurrency)}`
    : mode === "offramp"
      ? ttsFeeValue
      : `${feeValue} + ${ttsFeeValue}`;
  const actualOffRampFeeBrl = mode === "offramp"
    ? (feeCurrency === "BRL" ? feeAmount : 0) + (ttsTransactionFeeCurrency === "BRL" ? ttsTransactionFeeAmount : 0)
    : 0;
  const actualOnRampFeeBrl = mode === "onramp"
    ? (feeCurrency === "BRL" ? feeAmount : 0) + (ttsTransactionFeeCurrency === "BRL" ? ttsTransactionFeeAmount : 0)
    : 0;
  const offRampReceivedBrl = mode === "offramp" && destinationCurrency === "BRL"
    ? toPositiveNumber(destinationAfterRaw || quote.toAmount || quote.destinationAmountAfterFee || quote.destination_amount, 0)
    : 0;
  const onRampPaidBrl = mode === "onramp" && sourceCurrency === "BRL"
    ? toPositiveNumber(quote.fromAmount || quote.sourceAmount || quote.amount, 0)
    : 0;
  const traditionalFeeBrlFromQuote = toPositiveNumber(
    quote?.savings_estimate?.estimated_traditional_fee_brl ||
    quote?.savings?.estimated_traditional_fee ||
    quote?.estimated_traditional_fee_brl ||
    quote?.traditional_fee_brl,
    0,
  );
  const comparableAmountBrl = mode === "offramp" ? offRampReceivedBrl : onRampPaidBrl;
  const traditionalFeeBrl = traditionalFeeBrlFromQuote || (comparableAmountBrl > 0 ? comparableAmountBrl * TRADITIONAL_METHOD_FEE_PCT : 0);
  const savingsBrlFromQuote = toPositiveNumber(
    quote?.savings_estimate?.estimated_savings_brl ||
    quote?.savings?.estimated_savings ||
    quote?.estimated_savings_brl,
    0,
  );
  const actualFeeBrl = mode === "offramp" ? actualOffRampFeeBrl : actualOnRampFeeBrl;
  const estimatedSavingsBrl = savingsBrlFromQuote || Math.max(0, traditionalFeeBrl - actualFeeBrl);
  const showSavingsCard = mode === "onramp" || mode === "offramp"
    ? traditionalFeeBrl > 0 || actualFeeBrl > 0 || estimatedSavingsBrl > 0
    : false;
  const savingsTitle = mode === "onramp"
    ? L("Economia nesta rota", "Savings on this route")
    : L("Economia estimada", "Estimated savings");
  const savingsDescription = L(
    `Comparado a métodos tradicionais estimados em ${formatMoney(traditionalFeeBrl)}. Aqui a taxa estimada é ${formatMoney(actualFeeBrl)} antes do PIN.`,
    `Compared with traditional methods estimated at ${formatMoney(traditionalFeeBrl)}. Here the estimated fee is ${formatMoney(actualFeeBrl)} before PIN.`,
  );
  const feeTitle = mode === "onramp"
    ? L("Resumo do PIX", "PIX summary")
    : L("Resumo da retirada", "Withdrawal summary");
  const feeCaption = mode === "onramp"
    ? L("Veja quanto paga no PIX, a taxa por fora e quanto entra na conta.", "See how much you pay by PIX, the fee on top, and how much arrives in the account.")
    : L("Veja quanto sai da conta, a taxa do app e quanto chega no PIX.", "See how much leaves the account, the app fee, and how much arrives in PIX.");
  const destinationLabel = mode === "onramp"
    ? estimate.finalConversionPending
      ? L("Base para conversão", "Conversion base")
      : L("Entra na conta", "Arrives in account")
    : L("Chega no PIX", "Arrives in PIX");
  const finalConversionAsset = friendlyAssetName(quote.finalCurrency || quote.userFacingToCurrency || quote.requestedFinalAssetCode || "", language);
  const resolvedDestinationCaption = mode === "onramp" && estimate.finalConversionPending
    ? L(`BRL que será convertido para ${finalConversionAsset}.`, `BRL that will be converted to ${finalConversionAsset}.`)
    : destinationCaption || L("depois da taxa", "after the fee");

  return (
    <div className="mt-5 rounded-3xl border border-tts-border bg-tts-bg/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-muted">{L("Antes de confirmar", "Before confirming")}</p>
          <h3 className="mt-1 text-xl font-black text-tts-deep">{feeTitle}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-tts-muted">{feeCaption}</p>
        </div>
      </div>

      {showSavingsCard && (
        <div className="mt-4 rounded-2xl border border-tts-gold bg-tts-gold-bg p-3 text-tts-deep sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-tts-gold sm:text-xs sm:tracking-[0.14em]">
                {savingsTitle}
              </p>
              <p className="mt-1 text-xl font-black sm:text-2xl">{formatMoney(estimatedSavingsBrl)}</p>
            </div>
            <p className="max-w-sm text-[10px] font-semibold leading-4 text-tts-muted sm:text-[11px]">
              {savingsDescription}
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-tts-surface p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">{mode === "onramp" ? L("Você paga", "You pay") : L("Sai da conta", "Leaves account")}</p>
          <p className="mt-2 text-lg font-black text-tts-deep">{sourceValue}</p>
          <p className="mt-1 text-xs font-bold text-tts-muted">{sourceCaption || L("valor inicial", "starting amount")}</p>
        </div>
        <div className="rounded-2xl bg-tts-surface p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">{L("Taxa", "Fee")}</p>
          <p className="mt-2 text-lg font-black text-tts-deep">{totalFeeDisplay}</p>
          <p className="mt-1 text-xs font-bold text-tts-muted">
            {mixedFeeCurrencies && mode === "offramp"
              ? L("taxa do app; PIX já vem líquido", "app fee; PIX already arrives net")
              : mode === "onramp"
                ? L("cobrada por fora", "charged on top")
                : L("descontada nesta operação", "deducted in this operation")}
          </p>
        </div>
        <div className="rounded-2xl border border-tts-confirm bg-tts-confirm/10 p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-confirm">{destinationLabel}</p>
          <p className="mt-2 text-lg font-black text-tts-confirm">{afterValue}</p>
          <p className="mt-1 text-xs font-bold text-tts-confirm">{resolvedDestinationCaption}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 text-xs font-bold text-tts-deep lg:grid-cols-2">
        <div className="rounded-2xl border border-tts-gold bg-tts-gold-bg p-3 text-tts-deep">
          <span className="block uppercase tracking-[0.14em] text-tts-gold">
            {mode === "onramp" ? L("PIX", "PIX") : L("Retirada", "Withdrawal")}
          </span>
          <span className="mt-1 block text-sm font-black">{feeValue}</span>
        </div>
        <div className="rounded-2xl border border-tts-gold bg-tts-gold-bg p-3 text-tts-deep">
          <span className="block uppercase tracking-[0.14em] text-tts-gold">{L("App", "App")}</span>
          <span className="mt-1 block text-sm font-black">{ttsFeeValue}</span>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-tts-muted">
        {L(
          "Você vê tudo antes do PIN. Se não estiver de acordo, basta voltar sem confirmar.",
          "You see everything before the PIN. If you do not agree, just go back without confirming.",
        )}
      </p>
    </div>
  );
}

function LiveRampPanel({ mode, steps, loading, status, launchedFromChat, language, feeSummary }: {
  mode: RampMode;
  steps: LiveStep[];
  loading: string;
  status: string;
  launchedFromChat: boolean;
  language: "pt-BR" | "en";
  feeSummary?: string;
}) {
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const completed = steps.filter((step) => step.state === "done").length;
  const progress = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const activeStep = steps.find((step) => step.state === "active") || steps.find((step) => step.state === "warning");
  const panelDescription = mode === "onramp" && feeSummary
    ? feeSummary
    : launchedFromChat
      ? L("Acompanhe a confirmação.", "Track confirmation.")
      : L("Valor, taxas e confirmação em uma tela.", "Amount, fees, and confirmation in one screen.");

  return (
    <section className="mt-5 overflow-hidden rounded-lg border border-tts-border bg-tts-surface shadow-sm backdrop-blur">
      <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-tts-border bg-tts-bg p-5 text-tts-deep sm:p-6 lg:border-b-0 lg:border-r">
          <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">PIX</p>
          <h2 className="mt-2 text-3xl font-black">
            {mode === "onramp" ? L("Adicionar saldo", "Add money") : L("Enviar para PIX", "Send to PIX")}
          </h2>
          <p className="mt-3 text-sm font-bold opacity-75">
            {panelDescription}
          </p>
          <div className="mt-5 rounded-full bg-tts-bg/60 p-1">
            <div
              className={`h-3 rounded-full transition-all duration-700 ${mode === "onramp" ? "bg-tts-confirm" : "bg-tts-gold"}`}
              style={{ width: `${Math.max(6, progress)}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] opacity-70">
            <span>{completed}/{steps.length} {L("etapas", "steps")}</span>
	            <span className="inline-flex items-center gap-2">{loading ? <InlineSpinner tone="white" /> : null}{loading ? publicLoadingLabel(loading, language) : statusLabel(status, language)}</span>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:p-5">
          {activeStep && (
            <div className="rounded-lg border border-tts-border bg-tts-bg/60 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${activeStep.state === "warning" ? "bg-tts-gold" : "animate-pulse bg-tts-confirm"}`} />
                <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-muted">
                  {L("Agora", "Now")}
                </p>
              </div>
              <p className="mt-2 text-lg font-black text-tts-deep">{activeStep.label}</p>
              <p className="mt-1 text-sm font-bold text-tts-muted">{activeStep.detail}</p>
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            {steps.map((step, index) => (
              <div key={`${step.label}-${index}`} className="rounded-lg border border-tts-border bg-tts-bg/60 p-4">
                <div className="flex items-start gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${
                    step.state === "done"
                      ? "bg-tts-confirm text-tts-deep"
                      : step.state === "active"
                        ? "bg-tts-gold text-tts-deep"
                        : step.state === "warning"
                          ? "bg-tts-gold text-tts-deep"
                          : "bg-tts-surface text-tts-muted"
                  }`}>
                    {step.state === "done" ? "OK" : index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-black text-tts-deep">{step.label}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-tts-muted">{step.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DebugLogPanel({ logs, onClear }: { logs: DebugLogEntry[]; onClear: () => void }) {
  return (
    <div className="rounded-2xl bg-tts-surface p-5 text-tts-deep shadow-sm shadow-emerald-950/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
	          <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-confirm">Debug interno</p>
	          <h2 className="mt-1 text-2xl font-black">Registro de requisições</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-tts-muted">
            Mostra os detalhes tecnicos enviados para `/api/ramp/...` e o que voltou. Segredos e ativos internos ficam mascarados.
          </p>
        </div>
        <button className="w-fit rounded-full border border-tts-border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-tts-muted transition hover:text-tts-deep disabled:opacity-40" disabled={logs.length === 0} onClick={onClear}>
          Clear logs
        </button>
      </div>
      <div className="mt-5 grid gap-3">
        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-tts-border bg-tts-bg/60 p-5 text-sm font-bold text-tts-muted">
            Nenhuma chamada ainda. Use a tela para ver os requests mascarados.
          </div>
        ) : logs.map((log) => (
          <details key={log.id} className="rounded-2xl border border-tts-border bg-tts-bg/60 p-4" open={Boolean(log.error)}>
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black">{log.label}</p>
                  <p className="mt-1 font-mono text-xs text-tts-muted">{log.method} {log.path}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full bg-tts-surface px-3 py-1 text-tts-muted">{log.at}</span>
                  {typeof log.durationMs === "number" && <span className="rounded-full bg-tts-surface px-3 py-1 text-tts-muted">{log.durationMs}ms</span>}
                  {typeof log.status === "number" && (
                    <span className={`rounded-full px-3 py-1 ${log.status >= 200 && log.status < 300 ? "bg-tts-confirm text-tts-deep" : "bg-tts-error text-tts-deep"}`}>
                      HTTP {log.status}
                    </span>
                  )}
                </div>
              </div>
              {log.error && <p className="mt-3 rounded-xl bg-tts-error/10 p-3 text-sm font-bold text-tts-error">{log.error}</p>}
            </summary>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-tts-confirm">Request</p>
                <pre className="max-h-80 overflow-auto rounded-xl bg-tts-surface p-3 text-xs text-tts-confirm">{formatDebugJson(log.request)}</pre>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-tts-confirm">Response</p>
                <pre className="max-h-80 overflow-auto rounded-xl bg-tts-surface p-3 text-xs text-tts-confirm">{formatDebugJson(log.response)}</pre>
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function AssetMovement({ title, before, after, deltas }: {
  title: string;
  before: BalanceItem[];
  after: BalanceItem[];
  deltas: BalanceDelta[];
  walletPublicKey: string;
}) {
  const displayAsset = (code?: string) => String(code || "").toUpperCase() === "XLM" ? "Account balance" : String(code || "");

  return (
    <div className="rounded-2xl border border-tts-border bg-tts-surface p-5 text-tts-deep shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-gold">Account balances changing</p>
      <h2 className="mt-1 text-2xl font-black text-tts-deep">{title}</h2>
      <div className="mt-5 grid gap-3">
        {before.length > 0 && after.length === 0 ? (
          <>
            <div className="rounded-2xl border border-tts-gold bg-tts-gold-bg p-4 text-sm font-bold text-tts-gold">
              Snapshot inicial capturado. O delta so aparece quando o snapshot final existir, para nao mostrar saldo como zero antes da liquidacao.
            </div>
            {before.map((item) => (
              <div key={`${item.asset_code}:${item.asset_issuer || "native"}`} className="rounded-2xl border border-tts-border bg-tts-bg/60 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-tts-deep">{displayAsset(item.asset_code)}</p>
                  </div>
                  <span className="rounded-full bg-tts-surface px-3 py-1 text-xs font-black text-tts-deep">pending</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-tts-surface p-3"><span className="text-tts-muted">Before</span><p className="mt-1 font-black text-tts-deep">{item.balance}</p></div>
                  <div className="rounded-xl bg-tts-surface p-3"><span className="text-tts-muted">After</span><p className="mt-1 font-black text-tts-deep">waiting</p></div>
                </div>
              </div>
            ))}
          </>
        ) : deltas.length === 0 ? (
          <div className="rounded-2xl border border-tts-border bg-tts-bg/60 p-4 text-sm font-bold text-tts-muted">Gere um PIX para acompanhar seu saldo.</div>
        ) : deltas.map((item) => {
          const deltaNumber = Number(item.delta || 0);
          return (
            <div key={`${item.asset_code}:${item.asset_issuer || "native"}`} className="rounded-2xl border border-tts-border bg-tts-bg/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-tts-deep">{displayAsset(item.asset_code)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${deltaNumber > 0 ? "bg-tts-confirm text-tts-deep" : deltaNumber < 0 ? "bg-tts-error text-tts-deep" : "bg-tts-surface text-tts-deep"}`}>
                  {deltaNumber > 0 ? "+" : ""}{item.delta}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-tts-surface p-3"><span className="text-tts-muted">Before</span><p className="mt-1 font-black text-tts-deep">{item.before}</p></div>
                <div className="rounded-xl bg-tts-surface p-3"><span className="text-tts-muted">After</span><p className="mt-1 font-black text-tts-deep">{item.after}</p></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-tts-bg/60 p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-tts-confirm">{label}</dt>
      <dd className="mt-2 break-all font-black text-tts-deep">{value}</dd>
    </div>
  );
}
