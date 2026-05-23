"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback";
import { useLanguage } from "@/lib/i18n";
import { getClientSession } from "@/lib/session";
import { mapPublicError } from "@/lib/public-errors";

type Step = "quote" | "checkout" | "success";
type TargetAsset = "BRL" | "USDC";
type RampMode = "onramp" | "offramp";

type RampConfig = {
  sandbox?: boolean;
  available?: boolean;
  testnet_only?: boolean;
  network?: string;
  stellar_network_id?: "TESTNET" | "PUBLIC";
  unavailable_reason?: string;
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
const TRADITIONAL_FX_FEE_PCT = 3.5;

function clientTtsTransactionFeeBps() {
  const parsed = Number(process.env.NEXT_PUBLIC_TALKTOSTELLAR_TRANSACTION_FEE_BPS || process.env.NEXT_PUBLIC_TTS_SPREAD_BPS || DEFAULT_TTS_TRANSACTION_FEE_BPS);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1000) : DEFAULT_TTS_TRANSACTION_FEE_BPS;
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

function userFacingAssetCode(code: unknown, fallback: TargetAsset | "BRL" | "USDC" = "BRL") {
  const normalized = String(code || "").trim().toUpperCase().split(":")[0];
  if (normalized === "USDC") return "USDC";
  if (normalized === "BRL" || normalized === "TESOURO") return fallback === "USDC" ? "USDC" : "BRL";
  return fallback;
}

function formatAsset(value: unknown, code = "BRL") {
  const numeric = parseHumanAmount(value);
  if (!Number.isFinite(numeric)) return `${value || "0"} ${code}`;
  return `${numeric.toLocaleString("en-US", { maximumFractionDigits: 7 })} ${code}`;
}

function formatRampAsset(value: unknown, code = "BRL") {
  const displayCode = userFacingAssetCode(code);
  return displayCode === "BRL" ? formatMoney(value, "BRL") : formatAsset(value, displayCode);
}

function quoteCurrencyCode(value: unknown, fallback: TargetAsset | "BRL" | "USDC" | "TESOURO" = "BRL") {
  const normalized = String(value || "").trim().toUpperCase().split(":")[0];
  if (normalized === "USDC") return "USDC";
  if (normalized === "BRL") return "BRL";
  if (normalized === "TESOURO") return "TESOURO";
  return fallback;
}

function formatQuoteAmount(value: unknown, currency: TargetAsset | "BRL" | "USDC" | "TESOURO" = "BRL") {
  if (currency === "TESOURO") return formatAsset(value, "TESOURO");
  return currency === "BRL" ? formatMoney(value, "BRL") : formatRampAsset(value, currency);
}

function formatApiAmount(value: unknown) {
  const numeric = parseHumanAmount(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return numeric.toFixed(7).replace(/\.?0+$/, "");
}

function buildRampFeeBridgeEstimate(mode: RampMode, quote: RampResponse | null | undefined) {
  if (!quote) return null;

  const sourceCurrency = quoteCurrencyCode(quote.fromCurrency, "BRL");
  const hasFinalConversionAmount = Boolean(quote.finalAmountAfterFee || quote.userFacingToAmount);
  const destinationCurrency = hasFinalConversionAmount
    ? quoteCurrencyCode(quote.finalCurrency || quote.userFacingToCurrency, "BRL")
    : quoteCurrencyCode(quote.toCurrency, "BRL");
  const destinationBeforeRaw = hasFinalConversionAmount
    ? (quote.finalAmountBeforeFee || quote.finalAmountAfterFee || quote.userFacingToAmount || "")
    : (quote.destinationAmountBeforeFee || quote.destinationAmount || "");
  const destinationAfterRaw = hasFinalConversionAmount
    ? (quote.finalAmountAfterFee || quote.userFacingToAmount || "")
    : (quote.destinationAmountAfterFee || quote.toAmount || "");
  const sourceAmount = parseHumanAmount(quote.fromAmount);
  const destinationBefore = parseHumanAmount(destinationBeforeRaw);
  const destinationAfter = parseHumanAmount(destinationAfterRaw);
  const providerFeeRaw = quote.anchorProviderFeeAmount || quote.feeAmount || quote.fee || "";
  const backendTotalFee = parseHumanAmount(quote.totalFeeAmount);
  const backendTtsFee = parseHumanAmount(quote.talkToStellarFeeAmount);
  const providerFee = parseHumanAmount(providerFeeRaw);
  const feeBps = parseHumanAmount(quote.feeBps);
  const hasBackendFeeBridge = Number.isFinite(backendTotalFee) && backendTotalFee >= 0 && Number.isFinite(destinationAfter);
  const inferredDestinationFee = Number.isFinite(destinationBefore) && Number.isFinite(destinationAfter)
    ? Math.max(destinationBefore - destinationAfter, 0)
    : NaN;
  const providerFeeFromBps = Number.isFinite(sourceAmount) && sourceAmount > 0 && Number.isFinite(feeBps) && feeBps > 0
    ? sourceAmount * (feeBps / 10000)
    : 0;
  const providerFeeAmount = hasBackendFeeBridge && Number.isFinite(providerFee)
    ? providerFee
    : Number.isFinite(inferredDestinationFee) && inferredDestinationFee > 0
    ? inferredDestinationFee
    : Number.isFinite(providerFee) && providerFee > 0
      ? providerFee
      : providerFeeFromBps;
  const providerFeeCurrency = Number.isFinite(inferredDestinationFee) && inferredDestinationFee > 0
    ? destinationCurrency
    : sourceCurrency;
  const providerFeePct = Number.isFinite(feeBps) && feeBps > 0
    ? feeBps / 100
    : Number.isFinite(destinationBefore) && destinationBefore > 0
      ? (providerFeeAmount / destinationBefore) * 100
      : Number.isFinite(sourceAmount) && sourceAmount > 0
        ? (providerFeeAmount / sourceAmount) * 100
        : NaN;
  const ttsTransactionFeeBps = clientTtsTransactionFeeBps();
  const ttsTransactionFeePct = ttsTransactionFeeBps / 100;
  const ttsTransactionFeeAmount = hasBackendFeeBridge && Number.isFinite(backendTtsFee)
    ? backendTtsFee
    : Number.isFinite(sourceAmount) && sourceAmount > 0
      ? sourceAmount * (ttsTransactionFeeBps / 10000)
      : 0;
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
    totalRouteFeePct,
    netDestinationAmount,
    sourceAmount,
    sameCurrencyBridge,
    retainedPct: Number.isFinite(grossComparableAmount) && grossComparableAmount > 0 && Number.isFinite(netDestinationAmount)
      ? (netDestinationAmount / grossComparableAmount) * 100
      : NaN,
    estimatedTraditionalFee: Number.isFinite(sourceAmount) && sourceAmount > 0
      ? sourceAmount * (TRADITIONAL_FX_FEE_PCT / 100)
      : 0,
    estimatedSavingsVsTraditional: Number.isFinite(sourceAmount) && sourceAmount > 0
      ? sourceAmount * (Math.max(0, TRADITIONAL_FX_FEE_PCT - totalRouteFeePct) / 100)
      : 0,
  };
}

function friendlyAssetName(code: unknown, language: "pt-BR" | "en" = "pt-BR") {
  const displayCode = userFacingAssetCode(code);
  if (displayCode === "USDC") return "digital dollar";
  return "digital real";
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

function formatVisibleDelta(before: BalanceItem[], after: BalanceItem[], assetCode: TargetAsset, language: "pt-BR" | "en" = "pt-BR") {
  if (!after.length) return "Updating";
  const delta = sumVisibleBalance(after, assetCode) - sumVisibleBalance(before, assetCode);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatRampAsset(delta.toFixed(7), assetCode)}`;
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
    ? "border-cyan-100 border-t-cyan-500"
    : tone === "amber"
      ? "border-amber-100 border-t-amber-600"
      : tone === "white"
        ? "border-white/40 border-t-white"
        : "border-emerald-100 border-t-emerald-600";
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

function buildExternalBankAccount(seed: string, email: string) {
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
    ? "focus-within:border-cyan-300/70"
    : tone === "amber"
      ? "focus-within:border-amber-200/70"
      : "focus-within:border-emerald-300/70";

  return (
    <div className={`mt-2 rounded-3xl border border-white/10 bg-black/20 transition ${border}`}>
      <div className="flex items-center gap-3">
        <input
          className="min-w-0 flex-1 bg-transparent px-4 py-4 text-xl font-black tracking-[0.35em] text-white outline-none placeholder:tracking-normal placeholder:text-white/30"
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
          className="mr-2 rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white/75 transition hover:bg-white/15"
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

function mergeRampCustomerPayload(base: RampResponse | null | undefined, payload: RampResponse | null | undefined): RampResponse | null {
  if (!payload?.customer && !payload?.customer_id && !payload?.customerId) return base || null;
  const customerId = String(payload.customer_id || payload.customerId || payload.customer?.id || "").trim();
  return {
    ...(base || {}),
    ...(payload.customer ? { customer: payload.customer } : {}),
    ...(customerId ? { customer_id: customerId } : {}),
  };
}

function formatDebugJson(value: unknown) {
  return JSON.stringify(hideInternalAssetNames(value || {}), null, 2);
}

function publicRampErrorMessage(error: unknown, language: "pt-BR" | "en") {
  const raw = error instanceof Error ? error.message : String(error || "");
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const isTechnical =
    /internal authorization|backend|proxy|schema cache|could not find the table|relation .* does not exist|fetch failed|timeout|timed out|econn|etherfuse|provider/.test(normalized);
  if (isTechnical) return mapPublicError(raw, language).message;
  return raw || mapPublicError(raw, language).message;
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
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const queryParams = useMemo(() => new URLSearchParams(queryString), [queryString]);
  const debugEnabled = useMemo(() => queryParams.get("debug") === "1", [queryParams]);
  const queryAppliedRef = useRef(false);
  const autoStartedRef = useRef(false);
  const offRampAutoResolvedRef = useRef(false);
  const atomicActionRef = useRef(false);
  const pixFeedbackKeysRef = useRef<Set<string>>(new Set());
  const walletPinInputRef = useRef<HTMLInputElement | null>(null);
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
  const [receiveEstimateLoading, setReceiveEstimateLoading] = useState(false);
  const [customerPayload, setCustomerPayload] = useState<RampResponse | null>(null);
  const [quotePayload, setQuotePayload] = useState<RampResponse | null>(null);
  const [quoteReceivedAt, setQuoteReceivedAt] = useState(0);
  const [orderPayload, setOrderPayload] = useState<RampResponse | null>(null);
  const [statusPayload, setStatusPayload] = useState<RampResponse | null>(null);
  const [onRampBalancesBefore, setOnRampBalancesBefore] = useState<BalanceItem[]>([]);
  const [onRampBalancesAfter, setOnRampBalancesAfter] = useState<BalanceItem[]>([]);
  const [offRampBalancesBefore, setOffRampBalancesBefore] = useState<BalanceItem[]>([]);
  const [offRampBalancesAfter, setOffRampBalancesAfter] = useState<BalanceItem[]>([]);
  const [offRampAmount, setOffRampAmount] = useState("1");
  const [offRampFiatAmount, setOffRampFiatAmount] = useState("");
  const [offRampAmountLocked, setOffRampAmountLocked] = useState(false);
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
  const [transferFlow, setTransferFlow] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState("");
  const [transferRecipientKey, setTransferRecipientKey] = useState("");
  const [transferRecipientPublicKey, setTransferRecipientPublicKey] = useState("");
  const [verifiedTransferRecipient, setVerifiedTransferRecipient] = useState<RampResponse | null>(null);
  const [recipientVerificationLoading, setRecipientVerificationLoading] = useState(false);
  const [recipientVerificationError, setRecipientVerificationError] = useState("");
  const [recipientDetailsOpen, setRecipientDetailsOpen] = useState(false);
  const [autoPayAmount, setAutoPayAmount] = useState("");
  const [autoPayAsset, setAutoPayAsset] = useState<TargetAsset | "">("");
  const [pixFundedTransferResult, setPixFundedTransferResult] = useState<RampResponse | null>(null);
  const fallbackExternalBankAccount = useMemo(
    () => buildExternalBankAccount(walletPublicKey || sessionId || rampEmail, rampEmail),
    [walletPublicKey, sessionId, rampEmail]
  );
  const [externalBankAccount, setExternalBankAccount] = useState<ExternalBankAccount | null>(null);
  const displayedExternalBankAccount = externalBankAccount || fallbackExternalBankAccount;
  const externalPixDestination = `PIX ${displayedExternalBankAccount.pix_key}`;
  const atomicIntentKey = intentId || `local-${stableHash([
    queryString,
    sessionId,
    rampMode,
    amountBrl,
    offRampAmount,
    offRampFiatAmount,
    targetAsset,
    desiredReceiveAmount,
    desiredReceiveAsset,
    transferRecipient,
    transferRecipientKey,
    transferRecipientPublicKey,
    autoPayAmount,
    autoPayAsset,
  ].join(":"))}`;
  const offRampInputAsset = rampMode === "offramp" ? targetAsset : "BRL";
  const offRampInputValue = offRampInputAsset === "BRL" ? (offRampFiatAmount || offRampAmount) : offRampAmount;
  const offRampDisplayAmount = offRampInputAsset === "BRL"
    ? formatMoney(offRampInputValue || "0")
    : formatRampAsset(offRampInputValue || "0", offRampInputAsset);
  const offRampInputPrefix = offRampInputAsset === "USDC" ? "US$" : "R$";
  const offRampPixTargetAmount = String(
    temporaryOffRampTestResult?.target_brl ||
    temporaryOffRampTestResult?.destination_amount ||
    temporaryOffRampTestResult?.quote?.toAmount ||
    (offRampInputAsset === "BRL" ? (offRampFiatAmount || offRampAmount) : "")
  );
  const offRampPixTargetDisplay = offRampPixTargetAmount ? formatMoney(offRampPixTargetAmount) : "Calculando BRL";
  const desiredFinalAmount = rampMode === "onramp" && desiredReceiveAmount && desiredReceiveAsset === targetAsset
    ? desiredReceiveAmount
    : "";
  const desiredFinalAsset = desiredFinalAmount ? desiredReceiveAsset : "";
  const autoPayDisplayAmount = autoPayAmount && autoPayAsset
    ? formatRampAsset(autoPayAmount, autoPayAsset)
    : (desiredFinalAmount && desiredFinalAsset ? formatRampAsset(desiredFinalAmount, desiredFinalAsset) : formatRampAsset(amountBrl, targetAsset));
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
  const waitingForReceiveEstimate = Boolean(rampMode === "onramp" && desiredFinalAmount && receiveEstimateLoading);

  const launchedFromChat = useMemo(() => queryParams.get("from") === "chat", [queryParams]);
  const externalProvider = String(queryParams.get("provider") || "").trim().toLowerCase();
  const externalProviderUserId = String(queryParams.get("provider_user_id") || "").trim();
  const externalSource = String(queryParams.get("source") || externalProvider || "chat").trim().toLowerCase();
  const hasSession = Boolean(sessionId);
  const allowEmailAccountLookup = Boolean(debugEnabled && !launchedFromChat);
  const etherfuseRailUnavailable = Boolean(config && !config.available);
  const needsBrowserLoginForPix = Boolean(!hasSession && !allowEmailAccountLookup);
  const needsBrowserLoginForChatLink = Boolean(launchedFromChat && !hasSession);
  const canResolveWallet = Boolean(!etherfuseRailUnavailable && (hasSession || (allowEmailAccountLookup && rampEmail.trim())));
  const quote = quotePayload?.quote;
  const activeOnRampQuote = orderPayload?.quote || quote;
  const onRampFeeEstimate = buildRampFeeBridgeEstimate("onramp", activeOnRampQuote);
  const feeAdjustedAutoPayAmount = transferFlow &&
    onRampFeeEstimate?.destinationCurrency === (autoPayAsset || targetAsset) &&
    Number.isFinite(onRampFeeEstimate.netDestinationAmount)
      ? formatApiAmount(onRampFeeEstimate.netDestinationAmount)
      : "";
  const feeAdjustedAutoPayAsset = feeAdjustedAutoPayAmount ? (autoPayAsset || targetAsset) : "";
  const feeAdjustedAutoPayDisplayAmount = feeAdjustedAutoPayAmount
    ? formatRampAsset(feeAdjustedAutoPayAmount, feeAdjustedAutoPayAsset)
    : autoPayDisplayAmount;
  const offRampQuote = temporaryOffRampTestResult?.quote || offRampPreviewPayload?.quote;
  const order = statusPayload?.transaction || orderPayload?.transaction;
  const operationId = String(orderPayload?.operation_id || "");
  const orderId = String(order?.id || "");
  const paymentInstructions = order?.paymentInstructions || {};
  const pixCode = String(paymentInstructions?.pixCode || "");
  const pixKey = String(paymentInstructions?.pixKey || "");
  const isSandboxMockOrder = Boolean(order?.sandbox_mock);
  const displayPixKey = isSandboxMockOrder ? (pixKey || `pix-${orderId.slice(-8) || "checkout"}@talktostellar.local`) : pixKey;
  const technicalFinalAssetCode = String(order?.finalAsset?.code || order?.auto_conversion?.destination_asset_code || targetAsset).split(":")[0];
  const receivedCode = userFacingAssetCode(technicalFinalAssetCode, targetAsset);
  const finalReceivedAmount = String(
    order?.finalAmount ||
    order?.auto_conversion?.destination_amount ||
    (desiredFinalAmount && receivedCode === desiredFinalAsset ? desiredFinalAmount : "") ||
    (receivedCode === "BRL" ? (order?.fromAmount || quote?.fromAmount || amountBrl) : "")
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
  const sandboxSimulationComplete = Boolean(isSandboxMockOrder && onRampComplete);
  const estimatedReceiveLabel = feeAdjustedAutoPayAmount
      ? feeAdjustedAutoPayDisplayAmount
      : targetAsset === "BRL"
        ? formatMoney(order?.toAmount || finalReceivedAmount || amountBrl)
      : desiredFinalAmount && desiredFinalAsset === targetAsset
        ? formatRampAsset(desiredFinalAmount, targetAsset)
      : finalReceivedAmount
        ? formatRampAsset(finalReceivedAmount, targetAsset)
        : "Calculated automatically on confirmation";
  const quoteGrossLabel = quote ? formatMoney(quote.fromAmount || amountBrl) : formatMoney(amountBrl);
  const quoteCostContext = transferFlow && transferRecipientLabel
    ? L("valor que sera usado para pagar o destinatario", "value used to pay the recipient")
    : L("valor que entra na sua conta", "value credited to your account");
  const transferRecipientBlocker = transferFlow && !transferRecipientVerified
    ? recipientVerificationLoading
      ? L("Validando destinatário salvo...", "Validating saved recipient...")
      : recipientVerificationError || L("Escolha um contato salvo real antes de gerar o PIX.", "Choose a real saved contact before creating PIX.")
    : "";
  const payablePixAvailable = Boolean(pixCode && !isSandboxMockOrder);
  const demoPixMode = Boolean(order && (isSandboxMockOrder || (config?.available && !payablePixAvailable)));
  const sandboxQrPayload = isSandboxMockOrder
    ? `talktostellar://pix-onramp?order=${encodeURIComponent(orderId)}&operation=${encodeURIComponent(operationId)}&amount=${encodeURIComponent(String(order?.fromAmount || amountBrl))}&asset=${encodeURIComponent(targetAsset)}`
    : "";
  const loginHref = useMemo(() => {
    if (!needsBrowserLoginForPix) return "";
    const params = new URLSearchParams();
    if (externalProvider) params.set("provider", externalProvider);
    if (externalProviderUserId) params.set("provider_user_id", externalProviderUserId);
    if (externalSource) params.set("source", externalSource || externalProvider || "chat");
    if (rampEmail.includes("@")) params.set("email", rampEmail);
    params.set("next", `${rampMode === "offramp" ? "/pix-off" : "/pix-on"}?${queryString}`);
    params.set("lang", language);
    return `/login?${params.toString()}`;
  }, [externalProvider, externalProviderUserId, externalSource, language, needsBrowserLoginForPix, queryString, rampEmail, rampMode]);
  const operationStorageKey = intentId ? `talk-to-stellar.pix-ramp.completed:${intentId}` : "";
  const buildIdempotencyKey = useCallback((action: string) => (
    `pix-ramp:${atomicIntentKey}:${action}`
  ), [atomicIntentKey]);
  const offRampAssetDeltas = useMemo(() => offRampBalancesAfter.length > 0 ? calculateDeltas(offRampBalancesBefore, offRampBalancesAfter) : [], [offRampBalancesBefore, offRampBalancesAfter]);
  const onRampReceiptBefore = formatVisibleBalance(onRampBalancesBefore, targetAsset);
  const onRampReceiptAfter = onRampBalancesAfter.length > 0 ? formatVisibleBalance(onRampBalancesAfter, targetAsset) : L("Atualizando", "Updating");
  const onRampReceiptDelta = formatVisibleDelta(onRampBalancesBefore, onRampBalancesAfter, targetAsset, language);
  const liveSteps = useMemo<LiveStep[]>(() => {
    if (rampMode === "offramp") {
      const hasTarget = Boolean(offRampFiatAmount.trim() || offRampAmount.trim());
      return [
        {
          label: "Conta TalkToStellar",
          detail: walletPublicKey
            ? L("Conta localizada.", "Account found.")
            : needsBrowserLoginForPix
              ? L("Entre com PIN para continuar com sua conta.", "Sign in with PIN to continue with your account.")
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
          label: L("Conversão para BRL", "Conversion to BRL"),
          detail: offRampPixTargetAmount
            ? L(`Saldo convertido para chegar em ${offRampPixTargetDisplay}.`, `Balance converted to arrive as ${offRampPixTargetDisplay}.`)
            : L("A tela converte automaticamente para BRL quando você confirma.", "The screen automatically converts to BRL when you confirm."),
          state: offRampQuote ? "done" : loading === "Previewing PIX off-ramp fees" || loading === "Confirming PIX off-ramp" ? "active" : "pending",
        },
        {
          label: L("Confirmação e saída", "Confirmation and withdrawal"),
          detail: temporaryOffRampTestResult?.submitted
            ? L("Saldo enviado para retirada.", "Balance sent for withdrawal.")
            : L("Aguardando seu PIN para mostrar o saldo saindo.", "Waiting for your PIN to move the balance out."),
          state: temporaryOffRampTestResult?.submitted ? "done" : loading === "Confirming PIX off-ramp" ? "active" : "pending",
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
        label: "TalkToStellar account",
          detail: walletPublicKey
            ? L("Conta localizada.", "Account found.")
            : needsBrowserLoginForPix
              ? needsBrowserLoginForChatLink
                ? L("A sessão deste navegador não foi detectada. Entre com PIN para continuar este PIX aberto pelo chat.", "This browser session was not detected. Sign in with PIN to continue this PIX opened from chat.")
                : L("Entre com PIN para continuar este PIX na sua conta.", "Sign in with PIN to continue this PIX in your account.")
              : hasSession
                ? L("Sessão detectada. Preparando sua conta PIX.", "Session detected. Preparing your PIX account.")
              : L("Digite o email para localizar sua conta.", "Enter the email to find your account."),
        state: walletPublicKey ? "done" : needsBrowserLoginForPix ? "warning" : loading === "Resolving account" ? "active" : "pending",
      },
      {
        label: L("Conta PIX", "PIX account"),
        detail: programmaticOnboarding
          ? L("Conta preparada para continuar o PIX.", "Account ready to continue with PIX.")
          : customerPayload
            ? L("Preparando conta PIX.", "Preparing PIX account.")
            : L("Aguardando preparo do PIX.", "Waiting to prepare PIX."),
        state: programmaticOnboarding ? "done" : (loading.includes("Preparing") || loading.includes("quote")) ? "active" : "pending",
      },
      {
        label: L("Estimativa", "Estimate"),
        detail: quote
          ? transferFlow && transferRecipientLabel
            ? L(`${formatMoney(quote.fromAmount || amountBrl)} via PIX para enviar a ${transferRecipientLabel}.`, `${formatMoney(quote.fromAmount || amountBrl)} via PIX to send to ${transferRecipientLabel}.`)
            : L(`${formatMoney(quote.fromAmount || amountBrl)} fica disponível como ${friendlyAssetName(targetAsset, language)}.`, `${formatMoney(quote.fromAmount || amountBrl)} becomes available as ${friendlyAssetName(targetAsset, language)}.`)
          : transferFlow && transferRecipientLabel
            ? L(`Alvo: mandar ${formatMoney(amountBrl)} para ${transferRecipientLabel}.`, `Target: send ${formatMoney(amountBrl)} to ${transferRecipientLabel}.`)
            : L(`Alvo: colocar ${formatMoney(amountBrl)} na conta.`, `Target: add ${formatMoney(amountBrl)} to the account.`),
        state: quote ? quoteExpired ? "warning" : "done" : (loading.includes("quote") || loading.includes("Preparing")) ? "active" : "pending",
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
            : L(`${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)} entregue na conta.`, `${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)} delivered to the account.`)
          : polling ? L("Atualizando status automaticamente.", "Updating status automatically.") : L(`Aguardando confirmação para entregar ${friendlyAssetName(targetAsset, language)}.`, `Waiting for confirmation to deliver ${friendlyAssetName(targetAsset, language)}.`),
        state: transferFlow ? pixFundedTransferResult?.transaction_hash ? "done" : onRampComplete ? "active" : polling ? "active" : "pending" : onRampComplete ? "done" : polling ? "active" : "pending",
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
    rampMode,
    receivedCode,
    onRampComplete,
    temporaryOffRampTestResult,
    offRampQuote,
    finalReceivedAmount,
    targetAsset,
    transferFlow,
    transferRecipient,
    transferRecipientLabel,
    autoPayAmount,
    autoPayAsset,
    pixFundedTransferResult,
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
    getClientSession().then(({ sessionId: cookieSessionId }) => {
      if (cookieSessionId) setSessionId(cookieSessionId);
    });
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
    const receiveAmount = normalizeHumanAmount(params.get("receive_amount") || params.get("target_amount") || "");
    const receiveAsset = String(params.get("receive_asset") || params.get("target_asset") || "").trim().toUpperCase();
    const asset = String(params.get("source_asset") || params.get("asset") || "").trim().toUpperCase();
    const currency = String(params.get("currency") || params.get("fiat_currency") || asset || "").trim().toUpperCase();
    const email = String(params.get("email") || "").trim().toLowerCase();
    const flow = String(params.get("flow") || "").trim().toLowerCase();
    const recipient = String(params.get("recipient") || "").trim();
    const recipientKey = String(params.get("recipient_key") || params.get("recipient_email") || "").trim();
    const recipientPublicKey = String(params.get("recipient_public_key") || "").trim();
    const payAmount = normalizeHumanAmount(params.get("pay_amount") || "");
    const payAsset = String(params.get("pay_asset") || "").trim().toUpperCase();
    const nextIntentId = String(params.get("intent_id") || params.get("operation_key") || params.get("intent") || "").trim();
    const offRampBrlAmount = mode === "offramp" && (fiatAmount || (amount && (!currency || currency === "BRL" || asset === "BRL")))
      ? (fiatAmount || amount)
      : "";

    setRampMode(mode);
    if (nextIntentId) setIntentId(nextIntentId);
    if (mode === "onramp" && receiveAmount) {
      const normalizedReceiveAsset = receiveAsset === "BRL" ? "BRL" : "USDC";
      setDesiredReceiveAmount(receiveAmount);
      setDesiredReceiveAsset(normalizedReceiveAsset);
      setTargetAsset(normalizedReceiveAsset);
      if (normalizedReceiveAsset === "BRL") setAmountBrl(receiveAmount);
      if (normalizedReceiveAsset === "USDC") setReceiveEstimateLoading(true);
    }
    if (amount) {
      if (mode === "offramp") setOffRampAmount(amount);
      else setAmountBrl(amount);
    }
    if (offRampBrlAmount) {
      setOffRampFiatAmount(offRampBrlAmount);
      setOffRampAmountLocked(true);
    }
    if (mode === "offramp" && amount && (currency === "USDC" || asset === "USDC")) {
      setOffRampFiatAmount("");
      setOffRampAmountLocked(true);
    }
    if (!(mode === "onramp" && receiveAmount)) {
      if (asset === "BRL" || asset === "USDC") setTargetAsset(asset);
      else if (asset === "TESOURO") setTargetAsset("BRL");
      else setTargetAsset(mode === "onramp" ? "USDC" : "BRL");
    }
    if (email.includes("@")) setRampEmail(email);
    if (flow === "fund_and_pay" || params.get("auto_pay_after_ramp") === "1") setTransferFlow(true);
    if (recipient) setTransferRecipient(recipient);
    if (recipientKey) setTransferRecipientKey(recipientKey);
    if (recipientPublicKey) setTransferRecipientPublicKey(recipientPublicKey);
    if (payAmount) setAutoPayAmount(payAmount);
    if (payAsset === "BRL" || payAsset === "USDC") setAutoPayAsset(payAsset);
    setQueryReady(true);
  }, [lockedMode, queryString]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (step !== "success") return;
    closeIntermediatePage();
  }, [step]);

  useEffect(() => {
    if (!operationStorageKey) return;
    try {
      if (window.localStorage.getItem(operationStorageKey) === "completed") {
        setOperationLocked(true);
      }
    } catch {}
  }, [operationStorageKey]);

  useEffect(() => {
    fetch("/api/ramp/etherfuse/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setConfig(payload))
      .catch(() => setConfig({ sandbox: false, available: false, testnet_only: true, network: "Stellar Testnet" }));
  }, []);

  useEffect(() => {
    if (rampMode !== "offramp") return;
    if (!sessionId) return;
    loadExternalBankAccount({ session_id: sessionId }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [rampMode, sessionId]);

  useEffect(() => {
    if (rampMode !== "offramp") return;
    if (offRampAutoResolvedRef.current) return;
    if (hasSession || !allowEmailAccountLookup || !rampEmail.trim() || loading) return;

    offRampAutoResolvedRef.current = true;
    void run("Resolving account", async () => {
      const auth = await resolveWalletFromEmail();
      await loadExternalBankAccount(auth);
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
    if (!desiredReceiveAmount || desiredReceiveAsset !== "USDC") return;
    const receiveUsdc = toPositiveNumber(desiredReceiveAmount, 0);
    if (!receiveUsdc) {
      setReceiveEstimateLoading(false);
      return;
    }

    let cancelled = false;
    setReceiveEstimateLoading(true);
    fetch(`/api/financial/usdc-to-brl-preview?usdc_amount=${encodeURIComponent(receiveUsdc.toFixed(7))}`, { cache: "no-store" })
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
        setQuotePayload(null);
        setQuoteReceivedAt(0);
        setOrderPayload(null);
        setStatusPayload(null);
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
          setError(L("Não consegui calcular o PIX pela estimativa da sua conta. Tente novamente em alguns segundos.", "I could not calculate the PIX amount from your account estimate. Try again in a few seconds."));
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

  async function resolveWalletFromEmail(): Promise<RampAuth> {
    if (sessionId) {
      return { session_id: sessionId };
    }
    if (needsBrowserLoginForPix) {
      throw new Error(needsBrowserLoginForChatLink
        ? L("Entre com PIN para continuar este PIX aberto pelo chat.", "Sign in with PIN to continue this PIX opened from chat.")
        : L("Entre com PIN para continuar este PIX na sua conta.", "Sign in with PIN to continue this PIX in your account."));
    }

    const email = rampEmail.trim().toLowerCase();
    if (!email) {
      throw new Error(L("Digite o email da conta TalkToStellar para localizar sua conta.", "Enter the TalkToStellar account email to find your account."));
    }

    const startedAt = performance.now();
    const response = await fetch("/api/ramp/etherfuse/resolve-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
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
    const startedAt = performance.now();
    const response = await fetch("/api/ramp/etherfuse/external-bank-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth),
    });
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: "Load linked PIX destination",
      method: "POST",
      path: "/api/ramp/etherfuse/external-bank-account",
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      request: auth,
      response: payload,
      error: !response.ok || payload?.success === false ? payload?.message || payload?.error : undefined,
    });
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || payload?.error || L("Não consegui carregar seu PIX vinculado.", "I could not load your linked PIX destination."));
    }
    if (payload?.external_bank_account) {
      setExternalBankAccount(payload.external_bank_account);
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
    const response = await fetch(path, init);
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: path.includes("/customer") ? "Etherfuse customer + PIX setup" : path.includes("/quote") ? "Etherfuse quote" : path.includes("/onramp") ? "Etherfuse create/poll on-ramp order" : "Ramp API request",
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
  }, [L, addDebugLog, externalProvider, externalProviderUserId, externalSource, language, sessionId]);

  useEffect(() => {
    if (!queryReady || !transferFlow) {
      setVerifiedTransferRecipient(null);
      setRecipientVerificationError("");
      setRecipientVerificationLoading(false);
      return;
    }

    const recipient = transferRecipient.trim();
    if (!recipient || !sessionId) {
      setVerifiedTransferRecipient(null);
      setRecipientVerificationError(recipient ? "" : L("Destinatário não informado.", "Recipient missing."));
      setRecipientVerificationLoading(false);
      return;
    }

    let cancelled = false;
    setRecipientVerificationLoading(true);
    setRecipientVerificationError("");

    callRamp("/api/ramp/etherfuse/sandbox/transfer-recipient", {
      recipient,
      recipient_name: recipient,
      recipient_key: transferRecipientKey || undefined,
      recipient_public_key: transferRecipientPublicKey || undefined,
    }, "POST")
      .then((payload) => {
        if (cancelled) return;
        const resolved = payload?.recipient || payload;
        const nextName = String(resolved?.recipient_name || resolved?.contact_name || "").trim();
        const nextKey = String(resolved?.recipient_key || resolved?.recipient_pix_key || "").trim();
        const nextPublicKey = String(resolved?.recipient_public_key || "").trim();
        if (!nextPublicKey) {
          throw new Error(L("Esse contato não tem conta de destino ativa.", "This contact does not have an active destination account."));
        }
        setVerifiedTransferRecipient(resolved);
        if (nextName && nextName !== transferRecipient) setTransferRecipient(nextName);
        if (nextKey && nextKey !== transferRecipientKey) setTransferRecipientKey(nextKey);
        if (nextPublicKey && nextPublicKey !== transferRecipientPublicKey) setTransferRecipientPublicKey(nextPublicKey);
      })
      .catch((requestError) => {
        if (cancelled) return;
        const message = requestError instanceof Error
          ? requestError.message
          : L("Esse destinatário não existe nos seus contatos salvos.", "This recipient does not exist in your saved contacts.");
        setVerifiedTransferRecipient(null);
        setRecipientVerificationError(message);
      })
      .finally(() => {
        if (!cancelled) setRecipientVerificationLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    L,
    callRamp,
    queryReady,
    sessionId,
    transferFlow,
    transferRecipient,
    transferRecipientKey,
    transferRecipientPublicKey,
  ]);

  const callRampGet = useCallback(async (path: string, params?: Record<string, string>, authOverride?: RampAuth) => {
    const auth = authOverride || { session_id: sessionId };
    if (!auth.session_id) throw new Error(L("Digite o email da conta TalkToStellar para localizar sua conta.", "Enter the TalkToStellar account email to find your account."));
    const search = new URLSearchParams({ ...auth, language, ...(params || {}) });
    const startedAt = performance.now();
    const response = await fetch(`${path}?${search.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: path.includes("wallet-balances") ? "Account balances" : path.includes("/onramp/") ? "Etherfuse order status poll" : "Ramp API GET request",
      method: "GET",
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      request: { ...auth, language, ...(params || {}) },
      response: payload,
      error: !response.ok || payload?.success === false ? payload?.message || payload?.error : undefined,
    });
    if (!response.ok || payload?.success === false) {
      const requestError = new Error(payload?.message || payload?.error || `Ramp request failed: ${response.status}`) as Error & { payload?: RampResponse };
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }, [L, addDebugLog, language, sessionId]);

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

  const refreshOrder = useCallback(async () => {
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
      if (isSuccessStatus(nextStatus) && !transferFlow) {
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
      if (payload?.kyc_url) setOnboardingUrl(String(payload.kyc_url));
      setError(publicRampErrorMessage(err, language));
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
    const receiptUrl = String(
      input.receiptUrl ||
      input.transferPayload?.receipt_url ||
      input.offRampPayload?.receipt_url ||
      input.completedTransaction?.receipt_url ||
      input.completedTransaction?.receiptUrl ||
      onRampReceiptUrl ||
      ""
    ).trim();
    const feedbackKey = `${input.kind}:${operationId || orderId || atomicIntentKey}:${receiptUrl}`;
    if (pixFeedbackKeysRef.current.has(feedbackKey)) return;
    pixFeedbackKeysRef.current.add(feedbackKey);

    if (input.kind === "offramp") {
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
      enqueueWebChatFeedback([
        L("PIX confirmado e transferência enviada.", "PIX confirmed and transfer sent."),
        L(`PIX pago: ${formatMoney(order?.fromAmount || quote?.fromAmount || amountBrl)}`, `PIX paid: ${formatMoney(order?.fromAmount || quote?.fromAmount || amountBrl)}`),
        L(`Transferência: ${sentAmount}`, `Transfer: ${sentAmount}`),
        L(`Destino: ${recipient}`, `Destination: ${recipient}`),
        L("Status: concluído", "Status: completed"),
        L(`Horário: ${new Date().toLocaleString("en-US")}`, `Time: ${new Date().toLocaleString("en-US")}`),
        receiptUrl ? L(`Comprovante: ${receiptUrl}`, `Receipt: ${receiptUrl}`) : "",
      ].filter(Boolean).join("\n"));
      return;
    }

    const finalAmount = String(input.completedTransaction?.finalAmount || input.completedTransaction?.toAmount || finalReceivedAmount || order?.toAmount || quote?.toAmount || amountBrl);
    const finalAsset = userFacingAssetCode(input.completedTransaction?.finalAssetCode || input.completedTransaction?.toCurrency || receivedCode || targetAsset, targetAsset);
    const paidAmount = formatMoney(input.completedTransaction?.fromAmount || order?.fromAmount || quote?.fromAmount || amountBrl);
    const receivedAmount = formatRampAsset(finalAmount, finalAsset);
    enqueueWebChatFeedback([
      L("PIX confirmado com sucesso.", "PIX confirmed successfully."),
      L(`Valor pago: ${paidAmount}`, `Paid amount: ${paidAmount}`),
      L(`Valor recebido: ${receivedAmount}`, `Received amount: ${receivedAmount}`),
      L("Destino: sua conta TalkToStellar", "Destination: your TalkToStellar account"),
      L("Status: concluído", "Status: completed"),
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
    setStatusPayload(null);
    setTemporaryTestResult(null);
    setTemporaryOffRampTestResult(null);
    setOffRampPreviewPayload(null);
    setExternalBankAccount(null);
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
    setStatusPayload(null);
    setOffRampPreviewPayload(null);
    setOnRampBalancesBefore([]);
    setOnRampBalancesAfter([]);
    setQrDataUrl("");
    setCopied(false);
    setWalletPin("");
    setPolling(false);
    setStep("quote");
  }

  async function requestQuote(): Promise<{ auth: RampAuth; customerResult: RampResponse; quoteResult: RampResponse }> {
    setStep("quote");
    setOrderPayload(null);
    setStatusPayload(null);
    setQuoteReceivedAt(0);
    setOnRampBalancesBefore([]);
    setOnRampBalancesAfter([]);
    setTemporaryTestResult(null);
    setWalletPin("");

    const auth = await resolveWalletFromEmail();
    const requestedFinalAmount = transferFlow ? "" : desiredFinalAmount;
    const requestedFinalAsset = requestedFinalAmount ? desiredFinalAsset : "";
    const customerResult = getRampCustomerId(customerPayload) ? customerPayload : await callRamp("/api/ramp/etherfuse/customer", {
      country: "BR",
      email: rampEmail.trim().toLowerCase() || undefined,
    }, "POST", auth);
    const quoteCustomerId = getRampCustomerId(customerResult);
    setCustomerPayload(customerResult);
    setProgrammaticOnboarding(customerResult?.programmatic_onboarding || null);

    const payload = await callRamp("/api/ramp/etherfuse/quote", {
      customer_id: quoteCustomerId || undefined,
      direction: "onramp",
      from_currency: "BRL",
      to_currency: "TESOURO",
      final_asset: targetAsset,
      amount: amountBrl,
      desired_final_amount: requestedFinalAmount || undefined,
      desired_final_asset: requestedFinalAsset || undefined,
    }, "POST", auth);
    const nextCustomerPayload = mergeRampCustomerPayload(customerResult, payload);
    setCustomerPayload(nextCustomerPayload);
    setQuotePayload(payload);
    setQuoteReceivedAt(Date.now());
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
        const fresh = await requestQuote();
        authForOrder = fresh.auth;
        quoteForOrder = fresh.quoteResult?.quote;
        customerForOrder = fresh.customerResult;
      }
      if (!quoteForOrder?.id) {
        addDebugLog({
          label: "Continuing PIX creation without client-side quote id",
          method: "POST",
          path: "/api/ramp/etherfuse/onramp",
          request: { amount: amountBrl, targetAsset },
          response: { reason: "backend_will_create_fresh_quote" },
        });
      }
      const orderCustomerId = getRampCustomerId(customerForOrder);
      authForOrder = authForOrder || await resolveWalletFromEmail();
      const before = await fetchBalances(authForOrder);
      setOnRampBalancesBefore(before);
      setOnRampBalancesAfter([]);
      const payload = await callRamp("/api/ramp/etherfuse/onramp", {
        intent_id: atomicIntentKey,
        customer_id: orderCustomerId || undefined,
        quote_id: quoteForOrder?.id || undefined,
        amount: amountBrl,
        expected_to_amount: quoteForOrder?.toAmount || undefined,
        from_currency: "BRL",
        to_currency: "TESOURO",
        final_asset: targetAsset,
        desired_final_amount: transferFlow ? undefined : desiredFinalAmount || undefined,
        desired_final_asset: transferFlow ? undefined : desiredFinalAsset || undefined,
        auto_pay_after_ramp: transferFlow && Boolean(transferRecipient),
        auto_pay_recipient: transferRecipient || undefined,
        auto_pay_amount: feeAdjustedAutoPayAmount || autoPayAmount || undefined,
        auto_pay_asset_code: autoPayAsset || targetAsset,
      }, "POST", authForOrder, buildIdempotencyKey("create-onramp"));
      if (payload?.quote) {
        setQuotePayload(payload);
        setQuoteReceivedAt(Date.now());
      }
      const nextCustomerPayload = mergeRampCustomerPayload(customerForOrder, payload);
      if (nextCustomerPayload) setCustomerPayload(nextCustomerPayload);
      setOnboardingUrl("");
      setOrderPayload(payload);
      setStatusPayload(null);
      setWalletPin("");
      setStep("checkout");
      setPolling(true);
    });
  }

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    if (params.get("autostart") !== "1") return;
    if (!queryReady) return;
    if (autoStartedRef.current) return;
    if (rampMode !== "onramp") return;
    if (operationLocked) return;
    if (!canResolveWallet || loading || order || quote || waitingForReceiveEstimate) return;

    autoStartedRef.current = true;
    void run("Preparing PIX checkout", confirmQuoteAndCreatePix);
  }, [canResolveWallet, loading, operationLocked, order, queryReady, queryString, quote, rampMode, waitingForReceiveEstimate]);

  useEffect(() => {
    if (!quote || order || !canResolveWallet || loading || autoRefreshingQuote) return;
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
  }, [addDebugLog, amountBrl, autoRefreshingQuote, canResolveWallet, desiredFinalAmount, desiredFinalAsset, loading, order, quote, quoteDeadlineAt, targetAsset]);

  async function copyPixCode() {
    const sandboxReference = [
      "TalkToStellar PIX",
      `Order: ${orderId}`,
      `Operation: ${operationId || "not persisted"}`,
      `PIX key: ${displayPixKey}`,
      `${L("Valor", "Amount")}: ${formatMoney(order?.fromAmount || amountBrl)}`,
      `${L("Entrega", "Delivery")}: ${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)}`,
    ].join("\n");
    await navigator.clipboard.writeText(isSandboxMockOrder ? sandboxReference : pixCode || pixKey || orderId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function simulatePixPayment() {
    await runAtomicAction("confirmar-pix", async () => {
      if (!orderId) throw new Error(L("Prepare o PIX antes de confirmar o pagamento.", "Prepare the PIX before confirming payment."));
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
      const refreshed = await refreshOrder();
      const completedTransaction = refreshed?.transaction || payload?.transaction;
      let transferPayload: RampResponse | null = null;
      if (transferFlow && transferRecipient && isSuccessStatus(completedTransaction?.status)) {
        transferPayload = await submitPixFundedTransfer(completedTransaction);
      }
      if (isSuccessStatus(completedTransaction?.status)) {
        markOperationCompleted();
        notifyChatAfterPixCompletion({
          kind: transferPayload ? "funded-transfer" : "onramp",
          completedTransaction,
          transferPayload,
        });
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
    const requestedAutoPayAsset = feeAdjustedAutoPayAsset || autoPayAsset || targetAsset;
    const transferAmount = requestedAutoPayAmount || (targetAsset === "BRL"
      ? String(completedTransaction?.finalAmount || completedTransaction?.toAmount || amountBrl)
      : String(completedTransaction?.finalAmount || finalReceivedAmount || completedTransaction?.toAmount || ""));
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/pix-funded-transfer", {
      intent_id: atomicIntentKey,
      recipient: transferRecipientLabel,
      recipient_name: transferRecipientLabel,
      recipient_key: transferRecipientKey || undefined,
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
    const auth = await resolveWalletFromEmail();
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/test-onramp", {
      intent_id: atomicIntentKey,
      amount: amountBrl,
      to_currency: "TESOURO",
      final_asset: targetAsset,
      desired_final_amount: transferFlow ? undefined : desiredFinalAmount || undefined,
      desired_final_asset: transferFlow ? undefined : desiredFinalAsset || undefined,
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
    const sourceAmount = normalizeHumanAmount(offRampInputAsset === "BRL" ? (offRampFiatAmount.trim() || offRampAmount.trim()) : offRampAmount.trim());
    const payload = await callRamp("/api/ramp/etherfuse/offramp-preview", {
      intent_id: atomicIntentKey,
      customer_id: previewCustomerId || undefined,
      amount: sourceAmount,
      source_amount: sourceAmount,
      source_asset_code: offRampInputAsset,
      amount_currency: offRampInputAsset,
      fiat_amount: offRampInputAsset === "BRL" ? sourceAmount : undefined,
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
      const bankAccount = await loadExternalBankAccount(auth) || displayedExternalBankAccount;
      const sourceAmount = normalizeHumanAmount(offRampInputAsset === "BRL" ? (offRampFiatAmount.trim() || offRampAmount.trim()) : offRampAmount.trim());
      const balancesBefore = await fetchBalances(auth);
      assertSufficientVisibleBalance(balancesBefore, offRampInputAsset, sourceAmount);
        addDebugLog({
          label: "PIX off-ramp client validation",
          method: "POST",
          path: "/api/ramp/etherfuse/sandbox/test-offramp",
          request: {
            has_pin: true,
            pin_digits: pin.length,
            source_amount: sourceAmount,
            source_asset_code: offRampInputAsset,
            available_balance: formatRampAsset(sumVisibleBalance(balancesBefore, offRampInputAsset).toFixed(7), offRampInputAsset),
            fiat_amount: offRampInputAsset === "BRL" ? sourceAmount : undefined,
            destination_currency: "BRL",
            fiat_account_id: bankAccount.id,
            intent_id: atomicIntentKey,
          },
          response: { ready_to_submit: true },
        });
        const payload = await callRamp("/api/ramp/etherfuse/sandbox/test-offramp", {
          intent_id: atomicIntentKey,
          amount: sourceAmount,
          source_amount: sourceAmount,
          source_asset_code: offRampInputAsset,
          amount_currency: offRampInputAsset,
          fiat_amount: offRampInputAsset === "BRL" ? sourceAmount : undefined,
          target_currency: "BRL",
          fiat_account_id: bankAccount.id,
          external_bank_account: bankAccount,
          pin,
          wallet_pin: pin,
          walletPin: pin,
        }, "POST", auth, buildIdempotencyKey("submit-offramp"));
      setTemporaryOffRampTestResult(payload);
      setWalletPublicKey(String(payload.wallet_public_key || ""));
      setOffRampBalancesBefore(Array.isArray(payload.balances_before) ? payload.balances_before : balancesBefore);
      setOffRampBalancesAfter(Array.isArray(payload.balances_after) ? payload.balances_after : []);
      if (payload?.submitted || payload?.success) {
        markOperationCompleted();
        notifyChatAfterPixCompletion({ kind: "offramp", offRampPayload: payload });
        setStep("success");
      }
    });
  }

  const timeline = [
    { label: L("PIX gerado", "PIX generated"), done: Boolean(orderId), active: Boolean(orderId) && status === "pending" },
    { label: L("Aguardando pagamento", "Waiting for payment"), done: ["processing", "funded", "completed"].includes(status), active: status === "pending" },
    { label: L("Pagamento detectado", "Payment detected"), done: ["processing", "funded", "completed"].includes(status), active: ["processing", "funded"].includes(status) },
    { label: transferFlow ? L("Transferência enviada", "Transfer sent") : L("Saldo entregue", "Balance delivered"), done: status === "completed", active: status === "completed" },
  ];
  const offRampReceiptAmount = temporaryOffRampTestResult
    ? formatRampAsset(temporaryOffRampTestResult.source_amount || offRampInputValue, temporaryOffRampTestResult.source_asset_code || offRampInputAsset)
    : offRampDisplayAmount;
  const offRampReceiptReceived = temporaryOffRampTestResult
    ? offRampPixTargetDisplay
    : offRampDisplayAmount;
  const successTransaction = rampMode === "offramp"
    ? (temporaryOffRampTestResult?.final_transaction || temporaryOffRampTestResult?.transaction)
    : order;
  const onRampReceiptUrl = String(
    statusPayload?.receipt_url ||
    statusPayload?.transaction?.receipt_url ||
    statusPayload?.transaction?.receiptUrl ||
    orderPayload?.receipt_url ||
    orderPayload?.transaction?.receipt_url ||
    orderPayload?.transaction?.receiptUrl ||
    ""
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className={`inline-flex rounded-full border px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] ${
              rampMode === "onramp"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
            }`}>
              PIX
            </div>
            <div className="space-y-4">
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                  {rampMode === "onramp"
                    ? transferFlow && safeTransferRecipientLabel
                      ? L(`Pagar ${safeTransferRecipientLabel} com PIX`, `Pay ${safeTransferRecipientLabel} with PIX`)
                      : transferFlow
                        ? L("PIX para contato salvo", "PIX to saved contact")
                      : t("pix_add_title")
                    : t("pix_send_title")}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                  {rampMode === "onramp"
                    ? transferFlow && safeTransferRecipientLabel
                      ? t("pix_transfer_subtitle", { recipient: safeTransferRecipientLabel })
                      : transferFlow
                        ? L("Antes de gerar o PIX, validamos se o destinatário existe nos seus contatos salvos.", "Before creating PIX, we verify that the recipient exists in your saved contacts.")
                      : t("pix_add_subtitle")
                    : t("pix_off_subtitle")}
                </p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{t("pix_value")}</p>
                <p className="mt-2 text-sm text-slate-200">
                  {rampMode === "onramp" ? formatMoney(amountBrl) : offRampDisplayAmount}
                </p>
              </div>
                <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{t("pix_destination")}</p>
                  <p className="mt-2 text-sm text-slate-200">{transferFlow && transferRecipientLabel ? transferRecipientLabel : rampMode === "onramp" ? t("pix_my_account") : t("pix_your_pix")}</p>
                  {transferFlow && transferRecipientDisplayKey && (
                    <p className="mt-1 break-all text-xs text-slate-400">{transferRecipientDisplayKey}</p>
                  )}
                  {transferFlow && (
                    <div className="mt-3">
                      <button
                        type="button"
                        className="rounded-full border border-emerald-300/35 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-100 transition hover:bg-emerald-300/10"
                        onClick={() => setRecipientDetailsOpen((current) => !current)}
                      >
                        {recipientDetailsOpen ? L("Ocultar dados reais", "Hide real details") : L("Ver dados reais", "See real details")}
                      </button>
                      {recipientVerificationLoading && (
                        <p className="mt-2 text-xs font-bold text-emerald-100">{L("Validando contato salvo...", "Validating saved contact...")}</p>
                      )}
                      {recipientVerificationError && (
                        <p className="mt-2 text-xs font-bold text-rose-200">{recipientVerificationError}</p>
                      )}
                      {recipientDetailsOpen && transferRecipientVerified && (
                        <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs text-emerald-50">
                          <p className="font-black uppercase tracking-[0.14em] text-emerald-200">{L("Contato salvo validado", "Saved contact verified")}</p>
                          <p className="mt-2"><span className="text-emerald-100/70">{L("Nome real", "Real name")}:</span> {transferRecipientLabel}</p>
                          {transferRecipientDisplayKey && <p className="mt-1 break-all"><span className="text-emerald-100/70">{L("Chave", "Key")}:</span> {transferRecipientDisplayKey}</p>}
                          {verifiedRecipientPublicKey && <p className="mt-1 break-all font-mono text-[11px]"><span className="font-sans text-emerald-100/70">{L("Conta Stellar", "Stellar account")}:</span> {verifiedRecipientPublicKey}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
            </div>
          </section>
        </header>

        {!hasSession && rampMode === "onramp" && (
          <section className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
            {needsBrowserLoginForPix
              ? needsBrowserLoginForChatLink
                ? L("Este PIX veio do chat, mas este navegador ainda não tem uma sessão ativa. Entre com PIN aqui para preparar o pagamento na mesma conta.", "This PIX came from chat, but this browser does not have an active session yet. Sign in with PIN here to prepare the payment on the same account.")
                : L("Entre com PIN para continuar este PIX na sua conta.", "Sign in with PIN to continue this PIX in your account.")
              : t("pix_need_email")}
            {loginHref && (
              <a
                className="mt-3 inline-flex rounded-full bg-amber-200 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-950 transition hover:bg-amber-100"
                href={loginHref}
              >
                {L("Entrar com PIN", "Sign in with PIN")}
              </a>
            )}
          </section>
        )}

        {error && (
          <section className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
            {error}
            {onboardingUrl && (
              <a
                className="mt-3 inline-flex rounded-full bg-rose-400 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950"
                href={onboardingUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir cadastro PIX Etherfuse
              </a>
            )}
          </section>
        )}

        {config && !config.available && (
          <section className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
            <p className="font-black">
              {L("PIX/Etherfuse fica disponível apenas no trilho Testnet.", "PIX/Etherfuse is available only on the Testnet rail.")}
            </p>
            <p className="mt-2 leading-6 text-amber-100/85">
              {config.unavailable_reason ||
                L("Troque o runtime para STELLAR_NETWORK=TESTNET antes de usar PIX. Mainnet continua separada para leitura de carteira pública.", "Switch runtime to STELLAR_NETWORK=TESTNET before using PIX. Mainnet remains separate for public wallet reads.")}
            </p>
            <a
              className="mt-3 inline-flex rounded-full border border-amber-200/40 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-50 transition hover:bg-amber-200/10"
              href="/mainnet"
            >
              {L("Abrir seletor de rede", "Open network selector")}
            </a>
          </section>
        )}

        {operationLocked && step !== "success" && (
          <section className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">
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
        />

        {!lockedMode && (
        <section className="mt-5 grid gap-3 rounded-[2rem] border border-white/10 bg-white/5 p-3 shadow-2xl backdrop-blur sm:grid-cols-2">
          <button
            className={`rounded-[1.5rem] px-5 py-4 text-left transition ${rampMode === "onramp" ? "bg-emerald-400 text-slate-950 shadow-lg" : "bg-black/20 text-slate-300 hover:bg-white/10"}`}
            onClick={() => {
              setRampMode("onramp");
              setError("");
            }}
          >
            <span className="block text-xs font-black uppercase tracking-[0.18em] opacity-70">{L("Adicionar saldo", "Add money")}</span>
            <span className="mt-1 block text-lg font-black">{L("PIX para saldo", "PIX to balance")}</span>
          </button>
          <button
            className={`rounded-[1.5rem] px-5 py-4 text-left transition ${rampMode === "offramp" ? "bg-cyan-400 text-slate-950 shadow-lg" : "bg-black/20 text-slate-300 hover:bg-white/10"}`}
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
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">{L("Retirada via PIX", "PIX withdrawal")}</p>
                <h2 className="mt-1 text-3xl font-black text-white">{L("Mandar saldo para seu PIX", "Send balance to your PIX")}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {L("O saldo sai da sua conta TalkToStellar e chega em BRL no seu PIX.", "The balance leaves your TalkToStellar account and arrives as BRL in your PIX.")}
                </p>

              <label className="mt-6 block text-sm font-bold text-slate-200">
                {offRampInputAsset === "BRL" ? L("Você quer receber", "You want to receive") : L("Você quer retirar", "You want to withdraw")}
              </label>
              <div className="mt-2 flex overflow-hidden rounded-3xl border border-white/10 bg-white/5 focus-within:border-cyan-400/60">
                <span className="flex items-center bg-white/10 px-4 text-sm font-black text-slate-300">{offRampInputPrefix}</span>
                <input
                  className="w-full bg-transparent px-4 py-4 text-3xl font-black text-white outline-none disabled:opacity-100 disabled:text-white"
                  value={offRampInputValue}
                  inputMode="decimal"
                  placeholder="100"
                  disabled={offRampAmountLocked}
                  title={offRampAmountLocked ? L("Valor definido pelo chat", "Amount set by chat") : undefined}
                  aria-label={L(`Valor em ${offRampInputAsset} para retirar via PIX`, `Amount in ${offRampInputAsset} to withdraw through PIX`)}
                  onChange={(event) => {
                    const next = event.target.value;
                    setOffRampPreviewPayload(null);
                    setTemporaryOffRampTestResult(null);
                    if (offRampInputAsset === "BRL") {
                      setOffRampFiatAmount(next);
                      setOffRampAmount(next);
                    } else {
                      setOffRampAmount(next);
                    }
                  }}
                />
                <span className="flex items-center px-4 text-sm font-black text-slate-300">{offRampInputAsset}</span>
              </div>
              {offRampAmountLocked && (
                <p className="mt-2 text-xs font-bold text-cyan-100/65">{L("Valor definido pelo chat.", "Amount set by chat.")}</p>
              )}
              <label className="mt-6 block text-sm font-bold text-slate-200">{L("PIX de destino", "Destination PIX")}</label>
              <div className="mt-2 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-white">{L("Seu PIX", "Your PIX")}</p>
                    <p className="mt-1 text-xs font-bold text-cyan-100/70">{L("Destino vinculado à sua conta", "Destination linked to your account")}</p>
                  </div>
                  <span className="rounded-full bg-cyan-300/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-100">{L("vinculada", "linked")}</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm">
                  <div className="rounded-2xl bg-black/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{L("Chave PIX", "PIX key")}</p>
                    <p className="mt-1 truncate font-black text-white">{displayedExternalBankAccount.pix_key}</p>
                  </div>
                </div>
              </div>
              <div className="mt-5 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">{L("Taxas reais da saída", "Real exit fees")}</p>
                    <p className="mt-2 text-sm font-bold leading-6 text-cyan-50/85">
                      {L("Calcule a cotação Etherfuse do off-ramp antes do PIN. A confirmação só acontece no botão final.", "Calculate the Etherfuse off-ramp quote before PIN. Confirmation only happens on the final button.")}
                    </p>
                  </div>
                  <button
                    className="w-fit rounded-2xl bg-cyan-300 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-slate-950 transition hover:bg-cyan-200 disabled:opacity-50"
                    disabled={!canResolveWallet || Boolean(loading) || operationLocked}
                    onClick={() => run("Previewing PIX off-ramp fees", previewOffRampFees)}
                  >
                    {loading === "Previewing PIX off-ramp fees" ? <span className="inline-flex items-center gap-2"><InlineSpinner tone="cyan" />{L("Calculando", "Calculating")}</span> : L("Ver taxa real", "Show real fee")}
                  </button>
                </div>
                {offRampQuote ? (
                  <RampFeeBridge
                    mode="offramp"
                    quote={offRampQuote}
                    language={language}
                    sourceLabel={offRampDisplayAmount}
                    sourceCaption={L("saldo que sai antes do off-ramp", "balance leaving before off-ramp")}
                    destinationCaption={L("valor líquido que chega no PIX", "net amount arriving in PIX")}
                  />
                ) : (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs font-semibold leading-5 text-cyan-50/70">
                    {L("Nenhuma taxa é estimada localmente aqui. Toque em Ver taxa real para buscar a cotação do provider.", "No fee is estimated locally here. Tap Show real fee to fetch the provider quote.")}
                  </p>
                )}
              </div>
              <label className="mt-6 block text-sm font-bold text-slate-200">{L("PIN da conta", "Account PIN")}</label>
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
              <div className="mt-5 rounded-3xl border border-cyan-300/30 bg-cyan-300/10 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100">{L("Confirmação final", "Final confirmation")}</p>
                <p className="mt-2 text-sm font-bold leading-6 text-cyan-50">
                  {L("Este botão confirma a retirada pela rota mais otimizada e envia o valor para sua chave PIX.", "This button confirms the withdrawal through the most optimized route and sends the amount to your PIX key.")}
                </p>
              </div>

              <button
                className="mt-4 w-full rounded-3xl bg-cyan-300 px-5 py-5 text-base font-black text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 disabled:opacity-50"
                disabled={!canResolveWallet || Boolean(loading) || walletPin.length < 4 || operationLocked}
                onClick={() => run("Confirming PIX off-ramp", runTemporaryOffRampEndpointTest)}
              >
                {operationLocked ? L("PIX concluído", "PIX complete") : loading === "Confirming PIX off-ramp" ? <span className="inline-flex items-center gap-2"><InlineSpinner tone="cyan" />{L("Confirmando...", "Confirming...")}</span> : L("Confirmar retirada para meu PIX agora", "Confirm withdrawal to my PIX now")}
              </button>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 text-white shadow-xl sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">{L("Seu PIX", "Your PIX")}</p>
              <h2 className="mt-1 text-2xl font-black">{L("Envio para PIX", "Send to PIX")}</h2>
              {!temporaryOffRampTestResult ? (
                <div className="mt-8 h-28 rounded-3xl border border-dashed border-white/10 bg-white/[0.03]" />
              ) : (
                <div className="mt-6 space-y-4">
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Status</p>
                      <p className="mt-1 text-lg font-black">{temporaryOffRampTestResult.final_transaction?.status || "processing"}</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">{L("Saiu da conta", "Left account")}</p>
                      <p className="mt-1 text-lg font-black">{formatRampAsset(temporaryOffRampTestResult.source_amount || offRampInputValue, temporaryOffRampTestResult.source_asset_code || offRampInputAsset)}</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">{L("Entrou no seu PIX", "Arrived in your PIX")}</p>
                      <p className="mt-1 text-lg font-black">{offRampPixTargetDisplay}</p>
                      <p className="mt-1 text-sm font-bold text-white/60">{externalPixDestination}</p>
                    </div>
                    {temporaryOffRampTestResult.target_brl && (
                      <div className="rounded-3xl bg-white/10 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">{L("Conversão para BRL", "Conversion to BRL")}</p>
                        <p className="mt-1 text-sm font-bold text-white/75">
                          {L("O valor foi convertido na saída para chegar em BRL no PIX.", "The amount was converted on exit so BRL arrives in PIX.")}
                        </p>
                      </div>
                    )}
                  <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-100">
                    <p className="text-sm font-black">{L("Envio concluído para seu PIX.", "Send to your PIX completed.")}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {rampMode === "onramp" && (
        <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">PIX</p>
                <h2 className="mt-1 text-2xl font-black text-white">
                  {transferFlow && transferRecipientLabel
                    ? L(`Quanto você quer mandar para ${transferRecipientLabel}?`, `How much do you want to send to ${transferRecipientLabel}?`)
                    : L("Quanto você quer colocar?", "How much do you want to add?")}
                </h2>
              </div>
            </div>

            {!hasSession && allowEmailAccountLookup && (
            <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <label className="block text-sm font-bold text-emerald-50">{L("Email da conta", "Account email")}</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:bg-white/10"
                  type="email"
                  value={rampEmail}
                  placeholder="jorge@gmail.com"
                  disabled={Boolean(loading)}
                  onChange={(event) => {
                    clearResolvedRampWallet(event.target.value);
                  }}
                />
                <button
                  className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50"
                  disabled={!rampEmail.trim() || Boolean(loading)}
                  onClick={() => run("Resolving account", async () => {
                    await resolveWalletFromEmail();
                  })}
                >
                  {loading === "Resolving account" ? L("Localizando...", "Finding...") : L("Usar conta", "Use account")}
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold text-emerald-100/75">
                {walletPublicKey
                  ? L("Conta localizada.", "Account found.")
                  : L("Digite o email da conta para localizar sua conta.", "Enter the account email to find your account.")}
              </p>
            </div>
            )}

            {desiredFinalAmount ? (
              <>
                <label className="mt-6 block text-sm font-bold text-slate-200">{L("Você quer receber", "You want to receive")}</label>
                <div className="mt-2 flex overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                  <span className="flex items-center bg-white/10 px-4 text-sm font-black text-slate-300">{desiredFinalAsset === "USDC" ? "US$" : "R$"}</span>
                  <div className="w-full px-4 py-4 text-3xl font-black text-white">{desiredFinalAmount}</div>
                  <span className="flex items-center px-4 text-sm font-black text-slate-300">{desiredFinalAsset}</span>
                </div>
                <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-bold text-emerald-50">
                  {receiveEstimateLoading ? <span className="inline-flex items-center gap-2"><InlineSpinner />{L("Calculando PIX...", "Calculating PIX...")}</span> : L(`PIX estimado pela rota da sua conta: ${formatMoney(amountBrl)}`, `Estimated PIX from your account route: ${formatMoney(amountBrl)}`)}
                </div>
              </>
            ) : (
              <>
                <label className="mt-6 block text-sm font-bold text-slate-200">{L("Valor", "Amount")}</label>
                <div className="mt-2 flex overflow-hidden rounded-3xl border border-white/10 bg-white/5 focus-within:border-emerald-400/60">
                  <span className="flex items-center bg-white/10 px-4 text-sm font-black text-slate-300">R$</span>
                  <input
                    className="w-full bg-transparent px-4 py-4 text-3xl font-black text-white outline-none"
                    value={amountBrl}
                    inputMode="decimal"
                    onChange={(event) => {
                      setAmountBrl(event.target.value);
                      clearQuoteState();
                    }}
                  />
                  <span className="flex items-center px-4 text-sm font-black text-slate-300">BRL</span>
                </div>
              </>
            )}

            <label className="mt-5 block text-sm font-bold text-slate-200">{transferFlow ? L("Enviar como", "Send as") : L("Receber como", "Receive as")}</label>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-3xl border border-white/10 bg-black/20 p-2">
              {(["BRL", "USDC"] as TargetAsset[]).map((asset) => (
                <button
                  key={asset}
                    className={`rounded-2xl px-4 py-3 text-sm font-black transition ${targetAsset === asset ? "bg-emerald-400 text-slate-950 shadow-lg" : "text-slate-400 hover:bg-white/10"}`}
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
            {transferFlow && transferRecipientLabel && (
              <div className="mt-4 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-bold text-emerald-50">
                <p>
                  {transferRecipientVerified
                    ? L(`Depois que você confirmar o PIX, enviaremos automaticamente ${feeAdjustedAutoPayDisplayAmount} para ${transferRecipientLabel}.`, `After you confirm the PIX, we will automatically send ${feeAdjustedAutoPayDisplayAmount} to ${transferRecipientLabel}.`)
                    : L(`Antes de gerar o PIX, vamos validar se "${transferRecipient}" existe nos seus contatos salvos.`, `Before creating PIX, we will verify that "${transferRecipient}" exists in your saved contacts.`)}
                </p>
                {transferRecipientDisplayKey && <p className="mt-1 break-all text-xs text-emerald-100/75">{transferRecipientDisplayKey}</p>}
                {transferRecipientVerified ? (
                  <p className="mt-2 text-xs text-emerald-100/80">
                    {L("Destinatário validado nos seus contatos salvos. Use o botão no topo para conferir os dados reais.", "Recipient verified in your saved contacts. Use the top button to inspect the real details.")}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-rose-100">
                    {transferRecipientBlocker}
                  </p>
                )}
              </div>
            )}

            <button className="mt-6 w-full rounded-3xl bg-emerald-300 px-5 py-5 text-base font-black text-slate-950 shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-200 disabled:opacity-50" disabled={!canResolveWallet || Boolean(loading) || operationLocked || waitingForReceiveEstimate || Boolean(transferRecipientBlocker)} onClick={() => run("Preparing PIX checkout", confirmQuoteAndCreatePix)}>
              {operationLocked ? L("PIX concluído", "PIX complete") : loading === "Preparing PIX checkout" || waitingForReceiveEstimate ? <span className="inline-flex items-center justify-center gap-2"><InlineSpinner />{L("Preparando PIX...", "Preparing PIX...")}</span> : L("Gerar PIX pela rota mais otimizada", "Generate PIX with the most optimized route")}
            </button>
            {transferRecipientBlocker && (
              <p className="mt-3 text-sm font-bold text-rose-100">{transferRecipientBlocker}</p>
            )}

            {quote && (
              <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">{L("Pronto", "Ready")}</p>
                    <h3 className="mt-1 text-2xl font-black text-white">{estimatedReceiveLabel}</h3>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-black ${quoteExpired ? "bg-rose-400 text-slate-950" : "bg-emerald-400 text-slate-950"}`}>
                    {quoteCountdown}
                  </div>
                </div>
                <RampFeeBridge
                  mode="onramp"
                  quote={quote}
                  language={language}
                  sourceLabel={quoteGrossLabel}
                  sourceCaption={L("valor que sai no PIX", "source PIX amount")}
                  destinationCaption={quoteCostContext}
                />
                {quoteExpired && (
                  <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm font-bold text-rose-100">
                    {L("A estimativa expirou. Toque em continuar para preparar um novo PIX.", "The estimate expired. Tap continue to prepare a new PIX.")}
                  </div>
                )}
                {onboardingUrl && (
                  <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                    <p className="font-bold">{L("Precisamos concluir o cadastro PIX desta conta.", "We need to finish this account's PIX setup.")}</p>
                    <a className="mt-3 inline-flex rounded-full bg-amber-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-950" href={onboardingUrl} target="_blank" rel="noreferrer">
                      {L("Abrir cadastro PIX Etherfuse", "Open Etherfuse PIX setup")}
                    </a>
                  </div>
                )}
                {programmaticOnboarding && !onboardingUrl && (
                  <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
                    <p className="font-bold">{L("Cadastro PIX preparado.", "PIX setup ready.")}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 text-white shadow-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">{L("Pagamento", "Payment")}</p>
                <h2 className="mt-1 text-2xl font-black">{L("Faça o PIX", "Make the PIX")}</h2>
              </div>
            </div>

            {!order ? (
              <div className="mt-8 rounded-3xl border border-dashed border-white/20 p-8 text-center text-sm text-white/60">
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
                      <div className="rounded-3xl bg-white p-4">
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt="QR Code PIX"
                            className="h-auto w-full"
                          />
                        ) : (
                          <div className="grid aspect-square place-items-center rounded-2xl bg-stone-100 text-center text-xs font-bold text-stone-500">{L("QR indisponível", "QR unavailable")}</div>
                        )}
                      </div>
                  <div className="space-y-3">
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">{L("Recebedor", "Receiver")}</p>
                      <p className="mt-1 text-lg font-black">TalkToStellar</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">{L("Valor", "Amount")}</p>
                      <p className="mt-1 text-lg font-black">{formatMoney(paymentInstructions.amount || order.fromAmount || amountBrl)}</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">{L("Expira em", "Expires in")}</p>
                      <p className="mt-1 text-lg font-black">{quoteCountdown}</p>
                    </div>
                  </div>
                </div>

                  {demoPixMode ? (
                    <div className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-50">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">{L("PIX integrado em preparação", "Integrated PIX in progress")}</p>
                      <p className="mt-2">
                        {L("Este QR é demonstrativo e usado apenas para simular o fluxo PIX nesta tela.", "This QR is a demo code used only to simulate the PIX flow on this screen.")}
                      </p>
                      <p className="mt-2 text-amber-100/80">
                        {L("Digite seu PIN e simule a confirmação nesta tela para continuar. Quando o PIX bancário estiver ativo, esta mesma tela mostrará o PIX copia e cola real e verificará o status no provedor.", "Enter your PIN and simulate confirmation on this screen to continue. When bank PIX is active, this same screen will show the real copy-and-paste PIX code and verify status with the provider.")}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-3xl bg-black/20 p-4">
                      <p className="mb-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm font-black text-emerald-100">
                        {L("PIX bancário integrado. Use o QR ou copie o código para pagar no seu app do banco.", "Bank PIX integrated. Use the QR or copy the code to pay in your bank app.")}
                      </p>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">{L("Código PIX copia e cola", "Copy-and-paste PIX code")}</p>
                        <button className="rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-[#17251d]" onClick={() => run("Copying PIX code", copyPixCode)}>
                          {copied ? L("Copiado", "Copied") : L("Copiar código PIX", "Copy PIX code")}
                        </button>
                      </div>
                      <p className="mt-3 max-h-28 overflow-auto break-all rounded-2xl bg-white/10 p-3 font-mono text-xs text-white/80">{pixCode || "PIX code not returned yet"}</p>
                      <p className="mt-3 text-sm text-white/65">{L("Chave PIX", "PIX key")}: <span className="font-mono text-white">{pixKey || L("indisponível", "unavailable")}</span></p>
                    </div>
                  )}

                  {orderFailed && (
                    <div className="mt-5 rounded-3xl border border-rose-300/30 bg-rose-400/10 p-4 text-rose-100">
                      <p className="text-sm font-black">{L("Não foi possível concluir este PIX.", "This PIX could not be completed.")}</p>
                      <p className="mt-2 text-sm font-bold text-rose-100/80">{L("Gere um novo checkout para renovar a estimativa e tentar novamente.", "Generate a new checkout to refresh the estimate and try again.")}</p>
                      <button
                        className="mt-4 rounded-2xl bg-rose-300 px-4 py-3 text-xs font-black text-rose-950"
                        onClick={clearQuoteState}
                      >
                        {L("Gerar novo checkout", "Generate new checkout")}
                      </button>
                    </div>
                  )}

                  {config?.available && !orderFailed && (
                    <div className="mt-5 rounded-3xl border-2 border-amber-200/70 bg-amber-300/15 p-4 text-amber-100 shadow-lg shadow-amber-950/20">
                        {sandboxSimulationComplete ? (
                          <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-black text-emerald-100">
                            {L("PIX confirmado.", "PIX confirmed.")} {transferFlow ? L("A transferência foi enviada.", "The transfer was sent.") : L(`${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)} entrou na conta.`, `${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)} arrived in the account.`)}
                          </p>
                        ) : (
                          <>
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-50">{L("Depois de pagar o PIX", "After paying PIX")}</p>
                            <p className="mt-2 text-sm font-bold leading-6 text-amber-50/90">
                              {L("Digite o PIN e toque no botão abaixo para simular a confirmação PIX neste ambiente de teste. Em produção, a confirmação vem do provedor PIX.", "Enter the PIN and tap the button below to simulate PIX confirmation in this test environment. In production, confirmation comes from the PIX provider.")}
                            </p>
                            <label className="mt-4 block text-sm font-bold text-amber-50">{L("PIN da conta", "Account PIN")}</label>
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
                              className="mt-4 w-full rounded-3xl bg-amber-200 px-5 py-5 text-base font-black text-amber-950 shadow-lg shadow-amber-950/30 transition hover:bg-amber-100 disabled:opacity-50"
                              disabled={Boolean(loading) || !orderId || walletPin.length < 4 || operationLocked}
                              onClick={() => run("Confirming PIX received", simulatePixPayment)}
                            >
                              {operationLocked ? L("PIX concluído", "PIX complete") : loading === "Confirming PIX received" ? <span className="inline-flex items-center justify-center gap-2"><InlineSpinner tone="amber" />{L("Confirmando...", "Confirming...")}</span> : L("Simular pagamento PIX neste ambiente de teste", "Simulate PIX payment in this test environment")}
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
              title="On-ramp temporary endpoint"
              endpoint="POST /api/ramp/etherfuse/sandbox/test-onramp"
              description="Runs the whole on-ramp server-side and returns the final transaction status."
              disabled={!canResolveWallet || Boolean(loading) || !config?.available || operationLocked}
              hidden={!config?.available}
              onRun={() => run("Running on-ramp temporary endpoint", runTemporaryEndpointTest)}
              result={temporaryTestResult ? {
                order_id: temporaryTestResult.transaction?.id,
                final_status: temporaryTestResult.final_transaction?.status,
              } : null}
            />
          )}

          {rampMode === "offramp" && (
          <div className="rounded-[2rem] bg-white p-5 shadow-xl shadow-stone-300/40 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Off-ramp test endpoint</p>
            <h2 className="mt-1 text-2xl font-black">Balance to PIX</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Endpoint shown in frontend: <span className="font-mono font-black text-stone-950">POST /api/ramp/etherfuse/sandbox/test-offramp</span>
            </p>
            <label className="mt-5 block text-sm font-bold text-stone-600">Balance amount to off-ramp</label>
            <input className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-lg font-black outline-none ring-rose-200 focus:ring-4" value={offRampAmount} inputMode="decimal" onChange={(event) => setOffRampAmount(event.target.value)} />
            {config?.available ? (
              <button className="mt-5 w-full rounded-3xl bg-rose-300 px-5 py-4 text-sm font-black text-rose-950 disabled:opacity-50" disabled={!canResolveWallet || Boolean(loading) || operationLocked} onClick={() => run("Running off-ramp temporary endpoint", runTemporaryOffRampEndpointTest)}>
                Test off-ramp and asset delta
              </button>
            ) : (
              <div className="mt-5 rounded-2xl bg-stone-100 p-4 text-sm font-bold text-stone-500">Hidden in production.</div>
            )}
            {temporaryOffRampTestResult && (
              <pre className="mt-5 max-h-80 overflow-auto rounded-2xl bg-stone-950 p-4 text-xs text-lime-100">{JSON.stringify({
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
          <section className="mt-5 overflow-hidden rounded-[2rem] border border-emerald-300/25 bg-[#0d1512] text-white shadow-2xl shadow-emerald-950/25">
            <div className="relative p-6 sm:p-8">
              <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
              <div className="absolute -bottom-28 left-8 h-48 w-48 rounded-full bg-lime-200/10 blur-3xl" />

              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">{L("Comprovante PIX", "PIX receipt")}</p>
                  <div className="mt-5 flex items-center gap-4">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-300 text-3xl font-black text-[#0d1512]">✓</span>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
                        {rampMode === "offramp" ? L("Retirada confirmada", "Withdrawal confirmed") : transferFlow ? L("PIX e transferência confirmados", "PIX and transfer confirmed") : L("PIX confirmado", "PIX confirmed")}
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/65">
                        {rampMode === "offramp"
                          ? L("O saldo saiu da sua conta TalkToStellar e entrou no seu PIX.", "The balance left your TalkToStellar account and arrived in your PIX.")
                          : transferFlow
                          ? L("O PIX foi confirmado, o saldo foi convertido automaticamente e a transferência foi enviada.", "PIX was confirmed, the balance was automatically converted, and the transfer was sent.")
                          : L("O PIX foi confirmado e o saldo final entrou na sua conta.", "PIX was confirmed and the final balance arrived in your account.")}
                      </p>
                    </div>
                  </div>
                </div>
                <span className="w-fit rounded-full border border-emerald-200/30 bg-emerald-300/15 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                  {L("Concluído", "Completed")}
                </span>
              </div>

              <div className="relative mt-8 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.07] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
                    {rampMode === "offramp" ? L("Valor retirado", "Amount withdrawn") : L("Valor recebido", "Amount received")}
                  </p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                    {rampMode === "offramp"
                      ? offRampReceiptAmount
                      : formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)}
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <ReceiptRow
                      label={rampMode === "offramp" ? L("Recebido no seu PIX", "Received in your PIX") : L("Pago via PIX", "Paid with PIX")}
                      value={rampMode === "offramp" ? offRampReceiptReceived : formatMoney(order?.fromAmount || quote?.fromAmount || amountBrl)}
                    />
                    <ReceiptRow label={L("Status", "Status")} value={L("Concluído", "Completed")} />
                    {rampMode === "onramp" && <ReceiptRow label={L("Saldo antes", "Balance before")} value={onRampReceiptBefore} />}
                    {rampMode === "onramp" && <ReceiptRow label={L("Saldo depois", "Balance after")} value={onRampReceiptAfter} />}
                    {rampMode === "onramp" && <ReceiptRow label={L("Mudança no saldo", "Balance change")} value={onRampReceiptDelta} />}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">{L("Detalhes do comprovante", "Receipt details")}</p>
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
                <div className={`relative mt-5 rounded-[1.75rem] border p-5 ${pixFundedTransferResult?.transaction_hash ? "border-cyan-300/25 bg-cyan-300/10" : "border-amber-300/30 bg-amber-300/10"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">{L("Transferência após PIX", "Transfer after PIX")}</p>
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
                    <p className="mt-3 text-sm font-bold text-amber-50">
                      {L(`PIX confirmado. Enviando automaticamente ${feeAdjustedAutoPayDisplayAmount} para ${transferRecipientLabel || "destinatário"}...`, `PIX confirmed. Automatically sending ${feeAdjustedAutoPayDisplayAmount} to ${transferRecipientLabel || "recipient"}...`)}
                    </p>
                  )}
                </div>
              )}

              <p className="relative mt-4 text-xs font-semibold text-white/45">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
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
    <div className="rounded-[2rem] bg-white p-5 shadow-xl shadow-stone-300/40 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Endpoint in frontend</p>
      <h2 className="mt-1 text-2xl font-black">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
      <div className="mt-4 rounded-2xl bg-stone-100 p-4 font-mono text-xs font-black text-stone-800">{endpoint}</div>
      {hidden ? (
        <div className="mt-5 rounded-2xl bg-stone-100 p-4 text-sm font-bold text-stone-500">Hidden in production.</div>
      ) : (
        <button className="mt-5 w-full rounded-3xl bg-amber-300 px-5 py-4 text-sm font-black text-amber-950 disabled:opacity-50" disabled={disabled} onClick={onRun}>
          Test whole flow and asset delta
        </button>
      )}
      {result && (
        <pre className="mt-5 max-h-80 overflow-auto rounded-2xl bg-stone-950 p-4 text-xs text-lime-100">{JSON.stringify(result, null, 2)}</pre>
      )}
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
  const hasFinalConversionAmount = Boolean(quote.finalAmountAfterFee || quote.userFacingToAmount);
  const destinationCurrency = estimate.destinationCurrency;
  const destinationBeforeRaw = estimate.destinationBeforeRaw;
  const destinationAfterRaw = estimate.destinationAfterRaw;
  const anchorCurrency = quoteCurrencyCode(quote.anchorCurrency || quote.toCurrency, "TESOURO");
  const anchorAfterRaw = quote.anchorAmountAfterFee || quote.destinationAmountAfterFee || quote.toAmount || "";
  const anchorBeforeRaw = quote.anchorAmountBeforeFee || quote.destinationAmountBeforeFee || quote.destinationAmount || "";
  const feeAmount = estimate.providerFeeAmount;
  const feePct = estimate.providerFeePct;
  const feeCurrency = estimate.providerFeeCurrency;
  const ttsTransactionFeePct = estimate.ttsTransactionFeePct;
  const ttsTransactionFeeAmount = estimate.ttsTransactionFeeAmount;
  const estimatedTraditionalFee = estimate.estimatedTraditionalFee;
  const estimatedSavingsVsTraditional = estimate.estimatedSavingsVsTraditional;
  const retainedPct = estimate.retainedPct;
  const sourceAmount = estimate.sourceAmount;
  const sourceValue = sourceLabel || formatQuoteAmount(quote.fromAmount, sourceCurrency);
  const beforeValue = destinationBeforeRaw ? formatQuoteAmount(destinationBeforeRaw, destinationCurrency) : L("Não retornado", "Not returned");
  const afterValue = destinationAfterRaw ? formatQuoteAmount(destinationAfterRaw, destinationCurrency) : formatQuoteAmount(quote.toAmount, destinationCurrency);
  const feeValue = `${feeAmount > 0 ? "-" : ""}${formatQuoteAmount(feeAmount.toFixed(7), feeCurrency)}${
    Number.isFinite(feePct) ? ` (${feePct.toFixed(2)}%)` : ""
  }`;
  const ttsFeeValue = `${ttsTransactionFeeAmount > 0 ? "-" : ""}${formatQuoteAmount(ttsTransactionFeeAmount.toFixed(7), sourceCurrency)} (${ttsTransactionFeePct.toFixed(2)}%)`;
  const traditionalFeeValue = Number.isFinite(sourceAmount) && sourceAmount > 0
    ? `${formatQuoteAmount(estimatedTraditionalFee.toFixed(7), sourceCurrency)} (${TRADITIONAL_FX_FEE_PCT.toFixed(2)}%)`
    : `${TRADITIONAL_FX_FEE_PCT.toFixed(2)}%`;
  const feeTitle = mode === "onramp"
    ? L("Taxa real do on-ramp", "Real on-ramp fee")
    : L("Taxa real do off-ramp", "Real off-ramp fee");
  const feeCaption = mode === "onramp"
    ? L("Mostra só a taxa de entrada PIX/on-ramp e a taxa de transação TalkToStellar.", "Shows only the PIX/on-ramp fee and the TalkToStellar transaction fee.")
    : L("Mostra só a taxa de saída PIX/off-ramp e a taxa de transação TalkToStellar.", "Shows only the PIX/off-ramp fee and the TalkToStellar transaction fee.");
  const showAnchorBridge = mode === "onramp" && hasFinalConversionAmount && anchorAfterRaw;

  return (
    <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{L("Antes e depois das taxas", "Before and after fees")}</p>
          <h3 className="mt-1 text-xl font-black text-white">{feeTitle}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">{feeCaption}</p>
        </div>
        {Number.isFinite(retainedPct) && (
          <span className="w-fit rounded-full bg-emerald-300 px-3 py-1 text-xs font-black text-slate-950">
            {retainedPct.toFixed(2)}% {L("retido", "retained")}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl bg-white/5 p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{L("Entrada", "Source")}</p>
          <p className="mt-2 text-lg font-black text-white">{sourceValue}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">{sourceCaption || L("valor antes de executar a rota", "value before executing the route")}</p>
        </div>
        <div className="rounded-2xl bg-white/5 p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{L("Antes da taxa", "Before fee")}</p>
          <p className="mt-2 text-lg font-black text-white">{beforeValue}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">{L("valor bruto cotado pelo provider", "gross value quoted by provider")}</p>
        </div>
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-100">{L("Depois da taxa", "After fee")}</p>
          <p className="mt-2 text-lg font-black text-emerald-50">{afterValue}</p>
          <p className="mt-1 text-xs font-bold text-emerald-100/70">{destinationCaption || L("valor líquido da instrução", "net value in the instruction")}</p>
        </div>
      </div>

      {showAnchorBridge && (
        <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs font-bold text-cyan-50">
          <span className="block uppercase tracking-[0.14em] text-cyan-100/70">
            {L("Ativo ponte Etherfuse", "Etherfuse bridge asset")}
          </span>
          <span className="mt-1 block text-sm font-black">
            {formatQuoteAmount(anchorAfterRaw, anchorCurrency)}
          </span>
          <span className="mt-1 block leading-5 text-cyan-50/75">
            {L(
              `A cotação real do provider liquida primeiro em ${anchorCurrency}. O backend converte esse ativo para ${destinationCurrency} antes de pagar o destinatário.`,
              `The real provider quote first settles as ${anchorCurrency}. The backend converts that asset to ${destinationCurrency} before paying the recipient.`,
            )}
            {anchorBeforeRaw && anchorBeforeRaw !== anchorAfterRaw
              ? ` ${L("Antes da taxa do provider", "Before provider fee")}: ${formatQuoteAmount(anchorBeforeRaw, anchorCurrency)}.`
              : ""}
          </span>
        </div>
      )}

      <div className="mt-3 grid gap-2 text-xs font-bold text-slate-300 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-50">
          <span className="block uppercase tracking-[0.14em] text-amber-100/70">
            {mode === "onramp" ? L("Taxa on-ramp", "On-ramp fee") : L("Taxa off-ramp", "Off-ramp fee")}
          </span>
          <span className="mt-1 block text-sm font-black">{feeValue}</span>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-50">
          <span className="block uppercase tracking-[0.14em] text-cyan-100/70">{L("Taxa TalkToStellar", "TalkToStellar fee")}</span>
          <span className="mt-1 block text-sm font-black">{ttsFeeValue}</span>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <span className="block uppercase tracking-[0.14em] text-slate-400">{L("Normal/tradicional", "Traditional benchmark")}</span>
          <span className="mt-1 block text-sm font-black text-white">{traditionalFeeValue}</span>
          {estimatedSavingsVsTraditional > 0 && (
            <span className="mt-1 block text-xs font-black text-emerald-200">
              {L("Economia estimada", "Estimated saving")}: {formatQuoteAmount(estimatedSavingsVsTraditional.toFixed(7), sourceCurrency)}
            </span>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-slate-400">
        {L(
          "Para demo, a tela separa somente as taxas que importam para o fluxo: ramp, transação TalkToStellar e comparação normal de 3,5%. Imposto/IOF não é inventado na UI sandbox.",
          "For demos, the screen separates only the fees that matter to this flow: ramp, TalkToStellar transaction, and a 3.5% traditional benchmark. Tax/IOF is not invented in the sandbox UI.",
        )}
      </p>
    </div>
  );
}

function LiveRampPanel({ mode, steps, loading, status, launchedFromChat, language }: {
  mode: RampMode;
  steps: LiveStep[];
  loading: string;
  status: string;
  launchedFromChat: boolean;
  language: "pt-BR" | "en";
}) {
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const completed = steps.filter((step) => step.state === "done").length;
  const progress = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const activeStep = steps.find((step) => step.state === "active") || steps.find((step) => step.state === "warning");

  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl backdrop-blur">
      <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
        <div className={`${mode === "onramp" ? "bg-emerald-400/15 text-emerald-50" : "bg-cyan-400/15 text-cyan-50"} p-5 sm:p-6`}>
          <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">{L("Fluxo PIX em tempo real", "Real-time PIX flow")}</p>
          <h2 className="mt-2 text-3xl font-black">
            {mode === "onramp" ? L("PIX entra e vira saldo na conta", "PIX comes in and becomes account balance") : L("Saldo sai e chega no seu PIX", "Balance goes out and arrives in your PIX")}
          </h2>
          <p className="mt-3 text-sm font-bold opacity-75">
            {launchedFromChat
              ? L("Aberto pelo chat. Acompanhe cada etapa sem detalhes técnicos.", "Opened from chat. Follow each step without technical details.")
              : L("Acompanhe estimativa, confirmação e saldo antes/depois em uma tela só.", "Track estimate, confirmation, and balance before/after in one screen.")}
          </p>
          <div className="mt-5 rounded-full bg-black/30 p-1">
            <div
              className={`h-3 rounded-full transition-all duration-700 ${mode === "onramp" ? "bg-emerald-300" : "bg-cyan-300"}`}
              style={{ width: `${Math.max(6, progress)}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] opacity-70">
            <span>{completed}/{steps.length} {L("etapas", "steps")}</span>
            <span className="inline-flex items-center gap-2">{loading ? <InlineSpinner tone="white" /> : null}{loading || statusLabel(status, language)}</span>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:p-5">
          {activeStep && (
            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-xl">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${activeStep.state === "warning" ? "bg-amber-300" : "animate-pulse bg-emerald-300"}`} />
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  {L("Agora", "Now")}
                </p>
              </div>
              <p className="mt-2 text-lg font-black text-white">{activeStep.label}</p>
              <p className="mt-1 text-sm font-bold text-slate-300">{activeStep.detail}</p>
            </div>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            {steps.map((step, index) => (
              <div key={`${step.label}-${index}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${
                    step.state === "done"
                      ? "bg-emerald-400 text-slate-950"
                      : step.state === "active"
                        ? "bg-cyan-400 text-slate-950"
                        : step.state === "warning"
                          ? "bg-amber-300 text-amber-950"
                          : "bg-white/10 text-slate-400"
                  }`}>
                    {step.state === "done" ? "OK" : index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-black text-white">{step.label}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">{step.detail}</p>
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
    <div className="rounded-[2rem] bg-[#111b16] p-5 text-white shadow-xl shadow-emerald-950/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">Frontend API debug</p>
          <h2 className="mt-1 text-2xl font-black">Etherfuse request log</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">
            Mostra os detalhes tecnicos enviados para `/api/ramp/...` e o que voltou. Segredos e ativos internos ficam mascarados.
          </p>
        </div>
        <button className="w-fit rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/70 disabled:opacity-40" disabled={logs.length === 0} onClick={onClear}>
          Clear logs
        </button>
      </div>
      <div className="mt-5 grid gap-3">
        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm font-bold text-white/45">
            Nenhuma chamada ainda. Use a tela para ver os requests mascarados.
          </div>
        ) : logs.map((log) => (
          <details key={log.id} className="rounded-2xl border border-white/10 bg-white/5 p-4" open={Boolean(log.error)}>
            <summary className="cursor-pointer list-none">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-black">{log.label}</p>
                  <p className="mt-1 font-mono text-xs text-white/45">{log.method} {log.path}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full bg-white/10 px-3 py-1 text-white/70">{log.at}</span>
                  {typeof log.durationMs === "number" && <span className="rounded-full bg-white/10 px-3 py-1 text-white/70">{log.durationMs}ms</span>}
                  {typeof log.status === "number" && (
                    <span className={`rounded-full px-3 py-1 ${log.status >= 200 && log.status < 300 ? "bg-lime-300 text-[#17251d]" : "bg-red-300 text-red-950"}`}>
                      HTTP {log.status}
                    </span>
                  )}
                </div>
              </div>
              {log.error && <p className="mt-3 rounded-xl bg-red-400/15 p-3 text-sm font-bold text-red-100">{log.error}</p>}
            </summary>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-lime-200">Request</p>
                <pre className="max-h-80 overflow-auto rounded-xl bg-black/35 p-3 text-xs text-lime-50">{formatDebugJson(log.request)}</pre>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-lime-200">Response</p>
                <pre className="max-h-80 overflow-auto rounded-xl bg-black/35 p-3 text-xs text-lime-50">{formatDebugJson(log.response)}</pre>
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
    <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Account balances changing</p>
      <h2 className="mt-1 text-2xl font-black text-white">{title}</h2>
      <div className="mt-5 grid gap-3">
        {before.length > 0 && after.length === 0 ? (
          <>
            <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">
              Snapshot inicial capturado. O delta so aparece quando o snapshot final existir, para nao mostrar saldo como zero antes da liquidacao.
            </div>
            {before.map((item) => (
              <div key={`${item.asset_code}:${item.asset_issuer || "native"}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-white">{displayAsset(item.asset_code)}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-300">pending</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl bg-white/5 p-3"><span className="text-slate-500">Before</span><p className="mt-1 font-black text-white">{item.balance}</p></div>
                  <div className="rounded-xl bg-white/5 p-3"><span className="text-slate-500">After</span><p className="mt-1 font-black text-white">waiting</p></div>
                </div>
              </div>
            ))}
          </>
        ) : deltas.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold text-slate-400">Run a quote/order or the temporary endpoint to capture asset movement.</div>
        ) : deltas.map((item) => {
          const deltaNumber = Number(item.delta || 0);
          return (
            <div key={`${item.asset_code}:${item.asset_issuer || "native"}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-white">{displayAsset(item.asset_code)}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${deltaNumber > 0 ? "bg-emerald-400 text-slate-950" : deltaNumber < 0 ? "bg-rose-400 text-slate-950" : "bg-white/10 text-slate-300"}`}>
                  {deltaNumber > 0 ? "+" : ""}{item.delta}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white/5 p-3"><span className="text-slate-500">Before</span><p className="mt-1 font-black text-white">{item.before}</p></div>
                <div className="rounded-xl bg-white/5 p-3"><span className="text-slate-500">After</span><p className="mt-1 font-black text-white">{item.after}</p></div>
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
    <div className="rounded-2xl bg-white/10 p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">{label}</dt>
      <dd className="mt-2 break-all font-black text-white">{value}</dd>
    </div>
  );
}
