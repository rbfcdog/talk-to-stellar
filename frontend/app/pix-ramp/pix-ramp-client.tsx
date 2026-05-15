"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { closeIntermediatePage, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback";

type Step = "quote" | "checkout" | "success";
type TargetAsset = "BRL" | "USDC";
type RampMode = "onramp" | "offramp";

type RampConfig = {
  sandbox?: boolean;
  network?: string;
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
type RampAuth = { session_id: string; session_token: string };
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

function getStoredSession() {
  if (typeof window === "undefined") return { sessionId: "", sessionToken: "" };
  return {
    sessionId: window.localStorage.getItem("talk-to-stellar.sessionId") || "",
    sessionToken: window.localStorage.getItem("talk-to-stellar.sessionToken") || "",
  };
}

function formatMoney(value: unknown, currency = "BRL") {
  const numeric = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(numeric)) return `${value || "0"} ${currency}`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(numeric);
}

function toPositiveNumber(value: unknown, fallback = 0) {
  const numeric = Number(String(value || "").replace(",", "."));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function userFacingAssetCode(code: unknown, fallback: TargetAsset | "BRL" | "USDC" = "BRL") {
  const normalized = String(code || "").trim().toUpperCase().split(":")[0];
  if (normalized === "USDC") return "USDC";
  if (normalized === "BRL" || normalized === "TESOURO") return fallback === "USDC" ? "USDC" : "BRL";
  return fallback;
}

function formatAsset(value: unknown, code = "BRL") {
  const numeric = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(numeric)) return `${value || "0"} ${code}`;
  return `${numeric.toLocaleString("pt-BR", { maximumFractionDigits: 7 })} ${code}`;
}

function formatRampAsset(value: unknown, code = "BRL") {
  const displayCode = userFacingAssetCode(code);
  return displayCode === "BRL" ? formatMoney(value, "BRL") : formatAsset(value, displayCode);
}

function friendlyAssetName(code: unknown) {
  const displayCode = userFacingAssetCode(code);
  return displayCode === "USDC" ? "dólar digital" : "real digital";
}

function formatCountdown(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "expirada";
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

function statusLabel(status: unknown) {
  const normalized = normalizeStatus(status);
  if (normalized === "completed") return "Concluído";
  if (normalized === "processing" || normalized === "funded") return "Processando";
  if (normalized === "pending") return "Aguardando";
  if (normalized === "failed") return "Falhou";
  if (normalized === "expired") return "Expirou";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelado";
  if (normalized === "refunded") return "Estornado";
  if (normalized === "cotação expirada") return "Cotação expirada";
  if (normalized === "não iniciado") return "Não iniciado";
  return normalized || "Aguardando";
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
      const numeric = Number(String(balance.balance || "0").replace(",", "."));
      return total + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);
}

function formatVisibleBalance(balances: BalanceItem[], assetCode: TargetAsset) {
  return formatRampAsset(sumVisibleBalance(balances, assetCode).toFixed(7), assetCode);
}

function formatVisibleDelta(before: BalanceItem[], after: BalanceItem[], assetCode: TargetAsset) {
  if (!after.length) return "Aguardando";
  const delta = sumVisibleBalance(after, assetCode) - sumVisibleBalance(before, assetCode);
  const sign = delta > 0 ? "+" : "";
  return `${sign}${formatRampAsset(delta.toFixed(7), assetCode)}`;
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

function truncateKey(value?: string) {
  if (!value) return "not available";
  return `${value.slice(0, 7)}...${value.slice(-7)}`;
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
    label: "Seu PIX",
    institution: "Destino PIX vinculado",
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
}: {
  value: string;
  onChange: (next: string) => void;
  tone?: "emerald" | "cyan" | "amber";
  inputRef?: (node: HTMLInputElement | null) => void;
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
          placeholder="Digite seu PIN"
          onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
        />
        <button
          type="button"
          className="mr-2 rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white/75 transition hover:bg-white/15"
          onClick={() => onChange("")}
        >
          Limpar
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

function formatDebugJson(value: unknown) {
  return JSON.stringify(hideInternalAssetNames(value || {}), null, 2);
}

export default function PixRampClient({
  initialQuery = "",
  lockedMode,
}: {
  initialQuery?: string;
  lockedMode?: RampMode;
}) {
  const queryString = initialQuery;
  const queryAppliedRef = useRef(false);
  const autoStartedRef = useRef(false);
  const offRampAutoResolvedRef = useRef(false);
  const atomicActionRef = useRef(false);
  const walletPinInputRef = useRef<HTMLInputElement | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [sessionToken, setSessionToken] = useState("");
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
  const [transferFlow, setTransferFlow] = useState(false);
  const [transferRecipient, setTransferRecipient] = useState("");
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
  const waitingForReceiveEstimate = Boolean(rampMode === "onramp" && desiredFinalAmount && receiveEstimateLoading);

  const hasSession = Boolean(sessionId && sessionToken);
  const canResolveWallet = Boolean(hasSession || rampEmail.trim());
  const customer = customerPayload?.customer;
  const customerId = String(customer?.id || "");
  const bankAccountId = String(customer?.bankAccountId || "");
  const quote = quotePayload?.quote;
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
  const quoteCountdown = quote ? formatCountdown(quoteTimeRemainingMs) : "not quoted";
  const quoteExpired = Boolean(quote && Number.isFinite(quoteTimeRemainingMs) && quoteTimeRemainingMs <= 0);
  const quoteStaleForOrder = Boolean(quote && (!Number.isFinite(quoteTimeRemainingMs) || quoteTimeRemainingMs <= 15000));
  const status = order ? normalizeStatus(order.status) : quoteExpired ? "cotação expirada" : "não iniciado";
  const onRampComplete = Boolean(order && isSuccessStatus(status));
  const orderFailed = Boolean(order && isFailureStatus(status));
  const sandboxSimulationComplete = Boolean(isSandboxMockOrder && onRampComplete);
  const estimatedReceiveLabel = targetAsset === "BRL"
      ? formatMoney(order?.toAmount || finalReceivedAmount || amountBrl)
      : desiredFinalAmount && desiredFinalAsset === targetAsset
        ? formatRampAsset(desiredFinalAmount, targetAsset)
      : finalReceivedAmount
        ? formatRampAsset(finalReceivedAmount, targetAsset)
        : "Calculado automaticamente na confirmação";
  const payablePixAvailable = Boolean(pixCode && !isSandboxMockOrder);
  const demoPixMode = Boolean(order && (isSandboxMockOrder || (config?.sandbox && !payablePixAvailable)));
  const sandboxQrPayload = isSandboxMockOrder
    ? `talktostellar://pix-onramp?order=${encodeURIComponent(orderId)}&operation=${encodeURIComponent(operationId)}&amount=${encodeURIComponent(String(order?.fromAmount || amountBrl))}&asset=${encodeURIComponent(targetAsset)}`
    : "";
  const launchedFromChat = useMemo(() => {
    const params = new URLSearchParams(queryString);
    return params.get("from") === "chat";
  }, [queryString]);
  const debugEnabled = useMemo(() => {
    const params = new URLSearchParams(queryString);
    return params.get("debug") === "1";
  }, [queryString]);
  const operationStorageKey = intentId ? `talk-to-stellar.pix-ramp.completed:${intentId}` : "";
  const buildIdempotencyKey = useCallback((action: string) => (
    `pix-ramp:${atomicIntentKey}:${action}`
  ), [atomicIntentKey]);
  const offRampAssetDeltas = useMemo(() => offRampBalancesAfter.length > 0 ? calculateDeltas(offRampBalancesBefore, offRampBalancesAfter) : [], [offRampBalancesBefore, offRampBalancesAfter]);
  const onRampReceiptBefore = formatVisibleBalance(onRampBalancesBefore, targetAsset);
  const onRampReceiptAfter = onRampBalancesAfter.length > 0 ? formatVisibleBalance(onRampBalancesAfter, targetAsset) : "Atualizando";
  const onRampReceiptDelta = formatVisibleDelta(onRampBalancesBefore, onRampBalancesAfter, targetAsset);
  const liveSteps = useMemo<LiveStep[]>(() => {
    if (rampMode === "offramp") {
      const hasTarget = Boolean(offRampFiatAmount.trim() || offRampAmount.trim());
      return [
        {
          label: "Conta TalkToStellar",
          detail: walletPublicKey ? "Conta localizada." : "Digite o email para localizar sua conta.",
          state: walletPublicKey ? "done" : loading === "Resolving wallet" ? "active" : "pending",
        },
        {
          label: "Valor de saída",
          detail: offRampInputAsset === "BRL"
            ? `Alvo: ${offRampDisplayAmount} entrando no seu PIX.`
            : `Saída do saldo: ${offRampDisplayAmount}. Chega em BRL no seu PIX.`,
          state: hasTarget ? "done" : "pending",
        },
        {
          label: "Conversão para BRL",
          detail: offRampPixTargetAmount
            ? `Saldo convertido para chegar em ${offRampPixTargetDisplay}.`
            : "A tela converte automaticamente para BRL quando você confirma.",
          state: temporaryOffRampTestResult?.quote ? "done" : loading === "Confirming PIX off-ramp" ? "active" : "pending",
        },
        {
          label: "Confirmação e saída",
          detail: temporaryOffRampTestResult?.submitted
            ? "Saldo enviado para retirada."
            : "Aguardando seu PIN para mostrar o saldo saindo.",
          state: temporaryOffRampTestResult?.submitted ? "done" : loading === "Confirming PIX off-ramp" ? "active" : "pending",
        },
        {
          label: "Seu PIX",
          detail: temporaryOffRampTestResult
            ? `${offRampPixTargetDisplay} chegou em ${externalPixDestination}.`
            : `Destino final: ${externalPixDestination}.`,
          state: temporaryOffRampTestResult ? "done" : "pending",
        },
      ];
    }

    return [
      {
        label: "Conta TalkToStellar",
        detail: walletPublicKey ? "Conta localizada." : "Digite o email para localizar sua conta.",
        state: walletPublicKey ? "done" : loading === "Resolving wallet" ? "active" : "pending",
      },
      {
        label: "Conta PIX",
        detail: programmaticOnboarding
          ? "Conta preparada para continuar o PIX."
          : customerPayload
            ? "Preparando conta PIX."
            : "Aguardando preparo do PIX.",
        state: programmaticOnboarding ? "done" : (loading.includes("Preparing") || loading.includes("quote")) ? "active" : "pending",
      },
      {
        label: "Cotação",
        detail: quote
          ? `${formatMoney(quote.fromAmount || amountBrl)} fica disponível como ${friendlyAssetName(targetAsset)}.`
          : `Alvo: colocar ${formatMoney(amountBrl)} na conta.`,
        state: quote ? quoteExpired ? "warning" : "done" : (loading.includes("quote") || loading.includes("Preparing")) ? "active" : "pending",
      },
      {
        label: "Checkout PIX",
        detail: orderId
          ? `QR e referência prontos: ${orderId.slice(0, 18)}...`
          : "A página cria a ordem e mostra QR, chave e botão de confirmação.",
        state: orderId ? "done" : loading.includes("PIX") || loading.includes("Preparing") ? "active" : "pending",
      },
      {
        label: "Confirmação do PIX",
        detail: onRampComplete
          ? "PIX confirmado."
          : orderId ? "Clique em confirmar após fazer o PIX." : "Aguardando geração do checkout.",
        state: onRampComplete ? "done" : orderId ? "active" : "pending",
      },
      {
        label: transferFlow ? "Transferência para destinatário" : "Saldo entregue",
        detail: onRampComplete
          ? pixFundedTransferResult?.transaction_hash
            ? `${formatRampAsset(pixFundedTransferResult.amount || autoPayAmount || amountBrl, pixFundedTransferResult.asset_code || autoPayAsset || targetAsset)} enviado para ${pixFundedTransferResult.recipient_name || transferRecipient}.`
            : `${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)} entregue na conta.`
          : polling ? "Atualizando status automaticamente." : `Aguardando confirmação para entregar ${friendlyAssetName(targetAsset)}.`,
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
    finalReceivedAmount,
    targetAsset,
    transferFlow,
    transferRecipient,
    autoPayAmount,
    autoPayAsset,
    pixFundedTransferResult,
    walletPublicKey,
  ]);

  useEffect(() => {
    const stored = getStoredSession();
    setSessionId(stored.sessionId);
    setSessionToken(stored.sessionToken);
    const storedName = window.localStorage.getItem("talk-to-stellar.userName") || "";
    if (storedName.includes("@")) setRampEmail(storedName);
  }, []);

  useEffect(() => {
    if (queryAppliedRef.current) return;
    queryAppliedRef.current = true;

    const params = new URLSearchParams(queryString);
    const mode = lockedMode || (params.get("mode") === "offramp" ? "offramp" : "onramp");
    const amount = String(params.get("source_amount") || params.get("amount") || "").trim().replace(",", ".");
    const fiatAmount = String(params.get("fiat_amount") || params.get("target_brl") || params.get("to_amount") || "").trim().replace(",", ".");
    const receiveAmount = String(params.get("receive_amount") || params.get("target_amount") || "").trim().replace(",", ".");
    const receiveAsset = String(params.get("receive_asset") || params.get("target_asset") || "").trim().toUpperCase();
    const asset = String(params.get("source_asset") || params.get("asset") || "").trim().toUpperCase();
    const currency = String(params.get("currency") || params.get("fiat_currency") || asset || "").trim().toUpperCase();
    const email = String(params.get("email") || "").trim().toLowerCase();
    const flow = String(params.get("flow") || "").trim().toLowerCase();
    const recipient = String(params.get("recipient") || "").trim();
    const payAmount = String(params.get("pay_amount") || "").trim().replace(",", ".");
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
    if (payAmount) setAutoPayAmount(payAmount);
    if (payAsset === "BRL" || payAsset === "USDC") setAutoPayAsset(payAsset);
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
      .catch(() => setConfig({ sandbox: false, network: "Stellar" }));
  }, []);

  useEffect(() => {
    if (rampMode !== "offramp") return;
    if (!sessionId || !sessionToken) return;
    loadExternalBankAccount({ session_id: sessionId, session_token: sessionToken }).catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [rampMode, sessionId, sessionToken]);

  useEffect(() => {
    if (rampMode !== "offramp") return;
    if (offRampAutoResolvedRef.current) return;
    if (hasSession || !rampEmail.trim() || loading) return;

    offRampAutoResolvedRef.current = true;
    void run("Resolving wallet", async () => {
      const auth = await resolveWalletFromEmail();
      await loadExternalBankAccount(auth);
    });
  }, [hasSession, loading, rampEmail, rampMode]);

  const addDebugLog = useCallback((entry: Omit<DebugLogEntry, "id" | "at">) => {
    setDebugLogs((current) => [{
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toLocaleTimeString("pt-BR"),
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
    fetch("/api/financial/conversion-preview?brl_amount=100", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        const brlPerUsdc = toPositiveNumber(payload?.quote?.brl_per_usdc, 5.6);
        const feeBuffer = Math.max(toPositiveNumber(payload?.fees?.total_fee_brl, 0), 0.05);
        const estimatedBrl = (receiveUsdc * brlPerUsdc) + feeBuffer;
        if (cancelled) return;
        setAmountBrl(estimatedBrl.toFixed(2));
        setQuotePayload(null);
        setQuoteReceivedAt(0);
        setOrderPayload(null);
        setStatusPayload(null);
        addDebugLog({
          label: "PIX amount estimated from requested receive amount",
          method: "GET",
          path: "/api/financial/conversion-preview",
          request: { receive_amount: desiredReceiveAmount, receive_asset: desiredReceiveAsset },
          response: { amount_brl: estimatedBrl.toFixed(2), brl_per_usdc: brlPerUsdc },
        });
      })
      .catch((err) => {
        const fallbackBrl = (receiveUsdc * 5.6) + 0.05;
        if (!cancelled) {
          setAmountBrl(fallbackBrl.toFixed(2));
          addDebugLog({
            label: "PIX amount estimated with fallback rate",
            method: "GET",
            path: "/api/financial/conversion-preview",
            request: { receive_amount: desiredReceiveAmount, receive_asset: desiredReceiveAsset },
            response: { amount_brl: fallbackBrl.toFixed(2), brl_per_usdc: 5.6 },
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
    if (sessionId && sessionToken) {
      return { session_id: sessionId, session_token: sessionToken };
    }

    const email = rampEmail.trim().toLowerCase();
    if (!email) {
      throw new Error("Digite o email da conta TalkToStellar para localizar sua conta.");
    }

    const startedAt = performance.now();
    const response = await fetch("/api/ramp/etherfuse/resolve-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: "Resolve TalkToStellar wallet by email",
      method: "POST",
      path: "/api/ramp/etherfuse/resolve-wallet",
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      request: { email },
      response: payload,
      error: !response.ok || payload?.success === false ? payload?.message || payload?.error : undefined,
    });
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || "Nao encontrei uma conta TalkToStellar ativa para este email.");
    }

    const nextSessionId = String(payload.session_id || "");
    const nextSessionToken = String(payload.session_token || "");
    if (!nextSessionId || !nextSessionToken) {
      throw new Error("A conta foi encontrada, mas nao retornou sessao valida para cotar.");
    }

    setSessionId(nextSessionId);
    setSessionToken(nextSessionToken);
    setResolvedWallet(payload);
    setWalletPublicKey(String(payload.public_key || ""));
    window.localStorage.setItem("talk-to-stellar.sessionId", nextSessionId);
    window.localStorage.setItem("talk-to-stellar.sessionToken", nextSessionToken);
    window.localStorage.setItem("talk-to-stellar.userName", email);

    return { session_id: nextSessionId, session_token: nextSessionToken };
  }

  async function loadExternalBankAccount(authOverride?: RampAuth) {
    const auth = authOverride || { session_id: sessionId, session_token: sessionToken };
    if (!auth.session_id || !auth.session_token) return null;
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
      throw new Error(payload?.message || payload?.error || "Não consegui carregar seu PIX vinculado.");
    }
    if (payload?.external_bank_account) {
      setExternalBankAccount(payload.external_bank_account);
      return payload.external_bank_account as ExternalBankAccount;
    }
    return null;
  }

  const callRamp = useCallback(async (path: string, body?: Record<string, unknown>, method = "POST", authOverride?: RampAuth, idempotencyKey?: string) => {
    const auth = authOverride || { session_id: sessionId, session_token: sessionToken };
    if (!auth.session_id || !auth.session_token) throw new Error("Digite o email da conta TalkToStellar para localizar sua conta.");
    const requestBody: Record<string, unknown> = { ...auth, ...(body || {}) };
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
  }, [addDebugLog, sessionId, sessionToken]);

  const callRampGet = useCallback(async (path: string, params?: Record<string, string>, authOverride?: RampAuth) => {
    const auth = authOverride || { session_id: sessionId, session_token: sessionToken };
    if (!auth.session_id || !auth.session_token) throw new Error("Digite o email da conta TalkToStellar para localizar sua conta.");
    const search = new URLSearchParams({ ...auth, ...(params || {}) });
    const startedAt = performance.now();
    const response = await fetch(`${path}?${search.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    addDebugLog({
      label: path.includes("wallet-balances") ? "Stellar wallet balances" : path.includes("/onramp/") ? "Etherfuse order status poll" : "Ramp API GET request",
      method: "GET",
      path,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      request: { ...auth, ...(params || {}) },
      response: payload,
      error: !response.ok || payload?.success === false ? payload?.message || payload?.error : undefined,
    });
    if (!response.ok || payload?.success === false) {
      const requestError = new Error(payload?.message || payload?.error || `Ramp request failed: ${response.status}`) as Error & { payload?: RampResponse };
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }, [addDebugLog, sessionId, sessionToken]);

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
        setStep("success");
      } else if (isFailureStatus(nextStatus)) {
        setError("O PIX não foi concluído. Gere uma nova cotação e tente novamente.");
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
      setError(err instanceof Error ? err.message : String(err));
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
      throw new Error("Esta operação PIX já foi concluída. O comprovante foi enviado no chat.");
    }
    if (atomicActionRef.current) {
      throw new Error(`Esta operação PIX já está em andamento (${action}).`);
    }
    atomicActionRef.current = true;
    try {
      await fn();
    } finally {
      atomicActionRef.current = false;
    }
  }

  function getValidatedWalletPin() {
    const inputValue = walletPinInputRef.current?.value || "";
    const pin = (inputValue || walletPin).replace(/\D/g, "").slice(0, 8);
    if (pin !== walletPin) setWalletPin(pin);
    if (!/^\d{4,8}$/.test(pin)) {
      throw new Error("Digite o PIN da conta com 4 a 8 dígitos antes de confirmar.");
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
    setSessionToken("");
    setResolvedWallet(null);
    setWalletPublicKey("");
    setCustomerPayload(null);
    setQuotePayload(null);
    setQuoteReceivedAt(0);
    setOrderPayload(null);
    setStatusPayload(null);
    setTemporaryTestResult(null);
    setTemporaryOffRampTestResult(null);
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
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("talk-to-stellar.sessionId");
      window.localStorage.removeItem("talk-to-stellar.sessionToken");
    }
  }

  function clearQuoteState() {
    setQuotePayload(null);
    setQuoteReceivedAt(0);
    setOrderPayload(null);
    setStatusPayload(null);
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
    const customerResult = customerPayload || await callRamp("/api/ramp/etherfuse/customer", {
      country: "BR",
      email: rampEmail.trim().toLowerCase() || undefined,
    }, "POST", auth);
    setCustomerPayload(customerResult);
    setProgrammaticOnboarding(customerResult?.programmatic_onboarding || null);

    const payload = await callRamp("/api/ramp/etherfuse/quote", {
      customer_id: customerResult?.customer?.id,
      direction: "onramp",
      from_currency: "BRL",
      to_currency: "TESOURO",
      final_asset: targetAsset,
      amount: amountBrl,
      desired_final_amount: desiredFinalAmount || undefined,
      desired_final_asset: desiredFinalAsset || undefined,
    }, "POST", auth);
    setQuotePayload(payload);
    setQuoteReceivedAt(Date.now());
    return { auth, customerResult, quoteResult: payload };
  }

  async function confirmQuoteAndCreatePix() {
    await runAtomicAction("preparar-pix", async () => {
      if (waitingForReceiveEstimate) throw new Error("Calculando o valor do PIX. Tente novamente em alguns segundos.");
      let quoteForOrder = quote;
      let customerForOrder = customerPayload;
      let authForOrder: RampAuth | undefined;
      if (!quoteForOrder?.id || quoteStaleForOrder) {
        addDebugLog({
          label: quoteForOrder?.id ? "Quote too close to expiration before order, refreshing" : "No quote available, creating quote before order",
          method: "POST",
          path: "/api/ramp/etherfuse/quote",
          request: { amount: amountBrl, targetAsset, desiredFinalAmount, desiredFinalAsset },
          response: { reason: quoteForOrder?.id ? "expiring_soon" : "missing", remaining_ms: quoteTimeRemainingMs },
        });
        const fresh = await requestQuote();
        authForOrder = fresh.auth;
        quoteForOrder = fresh.quoteResult?.quote;
        customerForOrder = fresh.customerResult;
      }
      if (!quoteForOrder?.id) throw new Error("Request a quote first.");
      authForOrder = authForOrder || await resolveWalletFromEmail();
      const before = await fetchBalances(authForOrder);
      setOnRampBalancesBefore(before);
      setOnRampBalancesAfter([]);
      const payload = await callRamp("/api/ramp/etherfuse/onramp", {
        intent_id: atomicIntentKey,
        customer_id: String(customerForOrder?.customer?.id || customerId),
        quote_id: quoteForOrder.id,
        amount: amountBrl,
        expected_to_amount: quoteForOrder.toAmount,
        from_currency: "BRL",
        to_currency: "TESOURO",
        final_asset: targetAsset,
        desired_final_amount: desiredFinalAmount || undefined,
        desired_final_asset: desiredFinalAsset || undefined,
        auto_pay_after_ramp: transferFlow && Boolean(transferRecipient),
        auto_pay_recipient: transferRecipient || undefined,
        auto_pay_amount: autoPayAmount || undefined,
        auto_pay_asset_code: autoPayAsset || targetAsset,
      }, "POST", authForOrder, buildIdempotencyKey("create-onramp"));
      if (payload?.quote) {
        setQuotePayload(payload);
        setQuoteReceivedAt(Date.now());
      }
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
    if (autoStartedRef.current) return;
    if (rampMode !== "onramp") return;
    if (operationLocked) return;
    if (!canResolveWallet || loading || order || quote || waitingForReceiveEstimate) return;

    autoStartedRef.current = true;
    void run("Preparing PIX checkout", confirmQuoteAndCreatePix);
  }, [canResolveWallet, loading, operationLocked, order, queryString, quote, rampMode, waitingForReceiveEstimate]);

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
      `Amount: ${formatMoney(order?.fromAmount || amountBrl)}`,
      `Delivery: ${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)}`,
    ].join("\n");
    await navigator.clipboard.writeText(isSandboxMockOrder ? sandboxReference : pixCode || pixKey || orderId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function simulatePixPayment() {
    await runAtomicAction("confirmar-pix", async () => {
      if (!orderId) throw new Error("Prepare o PIX antes de confirmar o pagamento.");
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
      if (transferFlow && transferRecipient && isSuccessStatus(completedTransaction?.status)) {
        await submitPixFundedTransfer(completedTransaction);
      }
      if (isSuccessStatus(completedTransaction?.status)) {
        markOperationCompleted();
        setStep("success");
      }
    });
  }

  async function submitPixFundedTransfer(completedTransaction?: RampResponse) {
    const auth = await resolveWalletFromEmail();
    const pin = getValidatedWalletPin();
    const requestedAutoPayAmount = autoPayAmount && autoPayAsset ? autoPayAmount : "";
    const requestedAutoPayAsset = autoPayAsset || targetAsset;
    const transferAmount = requestedAutoPayAmount || (targetAsset === "BRL"
      ? String(completedTransaction?.finalAmount || completedTransaction?.toAmount || amountBrl)
      : String(completedTransaction?.finalAmount || finalReceivedAmount || completedTransaction?.toAmount || ""));
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/pix-funded-transfer", {
      intent_id: atomicIntentKey,
      recipient: transferRecipient,
      amount: transferAmount,
      asset_code: requestedAutoPayAsset,
      order_id: orderId,
      operation_id: operationId,
      pin,
      wallet_pin: pin,
      walletPin: pin,
    }, "POST", auth, buildIdempotencyKey("pix-funded-transfer"));
    setPixFundedTransferResult(payload);
  }

  async function runTemporaryEndpointTest() {
    const auth = await resolveWalletFromEmail();
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/test-onramp", {
      intent_id: atomicIntentKey,
      amount: amountBrl,
      to_currency: "TESOURO",
      final_asset: targetAsset,
      desired_final_amount: desiredFinalAmount || undefined,
      desired_final_asset: desiredFinalAsset || undefined,
    }, "POST", auth, buildIdempotencyKey("test-onramp"));
    setTemporaryTestResult(payload);
    setWalletPublicKey(String(payload.wallet_public_key || ""));
    setOnRampBalancesBefore(Array.isArray(payload.balances_before) ? payload.balances_before : []);
    setOnRampBalancesAfter(Array.isArray(payload.balances_after) ? payload.balances_after : []);
  }

  async function runTemporaryOffRampEndpointTest() {
    await runAtomicAction("confirmar-retirada", async () => {
      const pin = getValidatedWalletPin();
      const auth = await resolveWalletFromEmail();
      const bankAccount = await loadExternalBankAccount(auth) || displayedExternalBankAccount;
      const sourceAmount = offRampInputAsset === "BRL" ? (offRampFiatAmount.trim() || offRampAmount.trim()) : offRampAmount.trim();
        addDebugLog({
          label: "PIX off-ramp client validation",
          method: "POST",
          path: "/api/ramp/etherfuse/sandbox/test-offramp",
          request: {
            has_pin: true,
            pin_digits: pin.length,
            source_amount: sourceAmount,
            source_asset_code: offRampInputAsset,
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
      setOffRampBalancesBefore(Array.isArray(payload.balances_before) ? payload.balances_before : []);
      setOffRampBalancesAfter(Array.isArray(payload.balances_after) ? payload.balances_after : []);
      if (payload?.submitted || payload?.success) {
        markOperationCompleted();
        setStep("success");
      }
    });
  }

  const timeline = [
    { label: "PIX gerado", done: Boolean(orderId), active: Boolean(orderId) && status === "pending" },
    { label: "Aguardando pagamento", done: ["processing", "funded", "completed"].includes(status), active: status === "pending" },
    { label: "Pagamento detectado", done: ["processing", "funded", "completed"].includes(status), active: ["processing", "funded"].includes(status) },
    { label: transferFlow ? "Transferência enviada" : "Saldo entregue", done: status === "completed", active: status === "completed" },
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
                  {rampMode === "onramp" ? "Adicionar saldo com PIX" : "Mandar dinheiro para seu PIX"}
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                  {rampMode === "onramp"
                    ? transferFlow && transferRecipient
                      ? `Faça o PIX integrado, confirme com seu PIN e envie automaticamente para ${transferRecipient}.`
                      : "Faça o PIX integrado, confirme com seu PIN e receba o saldo na sua conta."
                    : "Confirme com seu PIN para mandar saldo para seu PIX em BRL."}
                </p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Valor</p>
                <p className="mt-2 text-sm text-slate-200">
                  {rampMode === "onramp" ? formatMoney(amountBrl) : offRampDisplayAmount}
                </p>
              </div>
                <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Destino</p>
                  <p className="mt-2 text-sm text-slate-200">{transferFlow && transferRecipient ? transferRecipient : rampMode === "onramp" ? "Minha conta" : "Seu PIX"}</p>
                </div>
            </div>
          </section>
        </header>

        {!hasSession && rampMode === "onramp" && (
          <section className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
            Digite o email da conta para localizar sua conta e continuar.
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

        {operationLocked && step !== "success" && (
          <section className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm font-bold text-emerald-100">
            Esta operação já foi concluída. O comprovante foi enviado no chat.
          </section>
        )}

        <LiveRampPanel
          mode={rampMode}
          steps={liveSteps}
          loading={loading}
          status={statusLabel(status)}
          launchedFromChat={launchedFromChat}
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
            <span className="block text-xs font-black uppercase tracking-[0.18em] opacity-70">Adicionar saldo</span>
            <span className="mt-1 block text-lg font-black">PIX para saldo</span>
          </button>
          <button
            className={`rounded-[1.5rem] px-5 py-4 text-left transition ${rampMode === "offramp" ? "bg-cyan-400 text-slate-950 shadow-lg" : "bg-black/20 text-slate-300 hover:bg-white/10"}`}
            onClick={() => {
              setRampMode("offramp");
              setError("");
            }}
          >
            <span className="block text-xs font-black uppercase tracking-[0.18em] opacity-70">Mandar para PIX</span>
            <span className="mt-1 block text-lg font-black">Saldo para PIX</span>
          </button>
        </section>
        )}

        {rampMode === "offramp" && (
          <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl sm:p-6">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Retirada via PIX</p>
                <h2 className="mt-1 text-3xl font-black text-white">Mandar saldo para seu PIX</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  O saldo sai da sua conta TalkToStellar e chega em BRL no seu PIX.
                </p>

              <label className="mt-6 block text-sm font-bold text-slate-200">
                {offRampInputAsset === "BRL" ? "Você quer receber" : "Você quer retirar"}
              </label>
              <div className="mt-2 flex overflow-hidden rounded-3xl border border-white/10 bg-white/5 focus-within:border-cyan-400/60">
                <span className="flex items-center bg-white/10 px-4 text-sm font-black text-slate-300">{offRampInputPrefix}</span>
                <input
                  className="w-full bg-transparent px-4 py-4 text-3xl font-black text-white outline-none disabled:opacity-100 disabled:text-white"
                  value={offRampInputValue}
                  inputMode="decimal"
                  placeholder="100"
                  disabled={offRampAmountLocked}
                  title={offRampAmountLocked ? "Valor definido pelo chat" : undefined}
                  aria-label={`Valor em ${offRampInputAsset} para retirar via PIX`}
                  onChange={(event) => {
                    const next = event.target.value;
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
                <p className="mt-2 text-xs font-bold text-cyan-100/65">Valor definido pelo chat.</p>
              )}
              <label className="mt-6 block text-sm font-bold text-slate-200">PIX de destino</label>
              <div className="mt-2 overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-white">Seu PIX</p>
                    <p className="mt-1 text-xs font-bold text-cyan-100/70">Destino vinculado à sua conta</p>
                  </div>
                  <span className="rounded-full bg-cyan-300/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-100">vinculada</span>
                </div>
                <div className="mt-4 grid gap-3 text-sm">
                  <div className="rounded-2xl bg-black/20 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Chave PIX</p>
                    <p className="mt-1 truncate font-black text-white">{displayedExternalBankAccount.pix_key}</p>
                  </div>
                </div>
              </div>
              <label className="mt-6 block text-sm font-bold text-slate-200">PIN da conta</label>
              <WalletPinInput
                value={walletPin}
                onChange={updateWalletPin}
                tone="cyan"
                inputRef={(node) => {
                  walletPinInputRef.current = node;
                }}
              />

              <button
                className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
                disabled={!canResolveWallet || Boolean(loading) || walletPin.length < 4 || operationLocked}
                onClick={() => run("Confirming PIX off-ramp", runTemporaryOffRampEndpointTest)}
              >
                {operationLocked ? "PIX concluído" : loading === "Confirming PIX off-ramp" ? <span className="inline-flex items-center gap-2"><InlineSpinner tone="cyan" />Confirmando...</span> : "Confirmar envio para PIX"}
              </button>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 text-white shadow-xl sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Seu PIX</p>
              <h2 className="mt-1 text-2xl font-black">Envio para PIX</h2>
              {!temporaryOffRampTestResult ? (
                <div className="mt-8 h-28 rounded-3xl border border-dashed border-white/10 bg-white/[0.03]" />
              ) : (
                <div className="mt-6 space-y-4">
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Status</p>
                      <p className="mt-1 text-lg font-black">{temporaryOffRampTestResult.final_transaction?.status || "processing"}</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Saiu da conta</p>
                      <p className="mt-1 text-lg font-black">{formatRampAsset(temporaryOffRampTestResult.source_amount || offRampInputValue, temporaryOffRampTestResult.source_asset_code || offRampInputAsset)}</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Entrou no seu PIX</p>
                      <p className="mt-1 text-lg font-black">{offRampPixTargetDisplay}</p>
                      <p className="mt-1 text-sm font-bold text-white/60">{externalPixDestination}</p>
                    </div>
                    {temporaryOffRampTestResult.target_brl && (
                      <div className="rounded-3xl bg-white/10 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Conversão para BRL</p>
                        <p className="mt-1 text-sm font-bold text-white/75">
                          O valor foi convertido na saída para chegar em BRL no PIX.
                        </p>
                      </div>
                    )}
                  <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-100">
                    <p className="text-sm font-black">Envio concluído para seu PIX.</p>
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
                <h2 className="mt-1 text-2xl font-black text-white">Quanto você quer colocar?</h2>
              </div>
            </div>

            {!hasSession && (
            <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4">
              <label className="block text-sm font-bold text-emerald-50">Email da conta</label>
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
                  onClick={() => run("Resolving wallet", async () => {
                    await resolveWalletFromEmail();
                  })}
                >
                  {loading === "Resolving wallet" ? "Localizando..." : "Usar conta"}
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold text-emerald-100/75">
                {walletPublicKey
                  ? "Conta localizada."
                  : "Digite o email da conta para localizar sua conta."}
              </p>
            </div>
            )}

            {desiredFinalAmount ? (
              <>
                <label className="mt-6 block text-sm font-bold text-slate-200">Você quer receber</label>
                <div className="mt-2 flex overflow-hidden rounded-3xl border border-white/10 bg-white/5">
                  <span className="flex items-center bg-white/10 px-4 text-sm font-black text-slate-300">{desiredFinalAsset === "USDC" ? "US$" : "R$"}</span>
                  <div className="w-full px-4 py-4 text-3xl font-black text-white">{desiredFinalAmount}</div>
                  <span className="flex items-center px-4 text-sm font-black text-slate-300">{desiredFinalAsset}</span>
                </div>
                <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-bold text-emerald-50">
                  {receiveEstimateLoading ? <span className="inline-flex items-center gap-2"><InlineSpinner />Calculando PIX...</span> : `PIX estimado: ${formatMoney(amountBrl)}`}
                </div>
              </>
            ) : (
              <>
                <label className="mt-6 block text-sm font-bold text-slate-200">Valor</label>
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

            <label className="mt-5 block text-sm font-bold text-slate-200">{transferFlow ? "Enviar como" : "Receber como"}</label>
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
                  {friendlyAssetName(asset)}
                </button>
              ))}
            </div>
            {transferFlow && transferRecipient && (
              <div className="mt-4 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-bold text-emerald-50">
                Depois que você confirmar o PIX, enviaremos automaticamente {autoPayDisplayAmount} para {transferRecipient}.
              </div>
            )}

            <button className="mt-6 w-full rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50" disabled={!canResolveWallet || Boolean(loading) || operationLocked || waitingForReceiveEstimate} onClick={() => run("Preparing PIX checkout", confirmQuoteAndCreatePix)}>
              {operationLocked ? "PIX concluído" : loading === "Preparing PIX checkout" || waitingForReceiveEstimate ? <span className="inline-flex items-center justify-center gap-2"><InlineSpinner />Preparando PIX...</span> : "Continuar"}
            </button>

            {quote && (
              <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-200">Pronto</p>
                    <h3 className="mt-1 text-2xl font-black text-white">{estimatedReceiveLabel}</h3>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-black ${quoteExpired ? "bg-rose-400 text-slate-950" : "bg-emerald-400 text-slate-950"}`}>
                    {quoteCountdown}
                  </div>
                </div>
                <dl className="mt-5 grid gap-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-slate-300">Você paga</dt><dd className="font-black text-white">{formatMoney(quote.fromAmount)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-300">Você recebe</dt><dd className="font-black text-white">{estimatedReceiveLabel}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-slate-300">Taxa</dt><dd className="font-black text-white">{quote.fee || "0"}</dd></div>
                </dl>
                {quoteExpired && (
                  <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm font-bold text-rose-100">
                    A cotação expirou. Toque em continuar para preparar um novo PIX.
                  </div>
                )}
                {onboardingUrl && (
                  <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
                    <p className="font-bold">Precisamos concluir o cadastro PIX desta conta.</p>
                    <a className="mt-3 inline-flex rounded-full bg-amber-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-950" href={onboardingUrl} target="_blank" rel="noreferrer">
                      Abrir cadastro PIX Etherfuse
                    </a>
                  </div>
                )}
                {programmaticOnboarding && !onboardingUrl && (
                  <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
                    <p className="font-bold">Cadastro PIX preparado.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 text-white shadow-xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">Pagamento</p>
                <h2 className="mt-1 text-2xl font-black">Faça o PIX</h2>
              </div>
            </div>

            {!order ? (
              <div className="mt-8 rounded-3xl border border-dashed border-white/20 p-8 text-center text-sm text-white/60">
                <p>
                  {quoteExpired
                      ? "A cotação expirou. Toque em continuar para preparar um novo PIX."
                      : quote
                      ? "Preparando o PIX."
                      : "Informe o valor e toque em continuar."}
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
                          <div className="grid aspect-square place-items-center rounded-2xl bg-stone-100 text-center text-xs font-bold text-stone-500">QR indisponível</div>
                        )}
                      </div>
                  <div className="space-y-3">
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">Recebedor</p>
                      <p className="mt-1 text-lg font-black">Etherfuse</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">Valor</p>
                      <p className="mt-1 text-lg font-black">{formatMoney(paymentInstructions.amount || order.fromAmount || amountBrl)}</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">Expira em</p>
                      <p className="mt-1 text-lg font-black">{quoteCountdown}</p>
                    </div>
                  </div>
                </div>

                  {demoPixMode ? (
                    <div className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-50">
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100">PIX integrado em preparação</p>
                      <p className="mt-2">
                        Este QR ainda não está integrado a uma transação bancária real. Não pague este QR em bancos como Nubank, Itaú ou Mercado Pago.
                      </p>
                      <p className="mt-2 text-amber-100/80">
                        Digite seu PIN e confirme nesta tela para continuar. Quando o PIX bancário estiver ativo, esta mesma tela mostrará o PIX copia e cola real.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-5 rounded-3xl bg-black/20 p-4">
                      <p className="mb-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm font-black text-emerald-100">
                        PIX bancário integrado. Use o QR ou copie o código para pagar no seu app do banco.
                      </p>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">Código PIX copia e cola</p>
                        <button className="rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-[#17251d]" onClick={() => run("Copying PIX code", copyPixCode)}>
                          {copied ? "Copiado" : "Copiar código PIX"}
                        </button>
                      </div>
                      <p className="mt-3 max-h-28 overflow-auto break-all rounded-2xl bg-white/10 p-3 font-mono text-xs text-white/80">{pixCode || "PIX code not returned yet"}</p>
                      <p className="mt-3 text-sm text-white/65">Chave PIX: <span className="font-mono text-white">{pixKey || "indisponível"}</span></p>
                    </div>
                  )}

                  {orderFailed && (
                    <div className="mt-5 rounded-3xl border border-rose-300/30 bg-rose-400/10 p-4 text-rose-100">
                      <p className="text-sm font-black">Não foi possível concluir este PIX.</p>
                      <p className="mt-2 text-sm font-bold text-rose-100/80">Gere um novo checkout para renovar a cotação e tentar novamente.</p>
                      <button
                        className="mt-4 rounded-2xl bg-rose-300 px-4 py-3 text-xs font-black text-rose-950"
                        onClick={clearQuoteState}
                      >
                        Gerar novo checkout
                      </button>
                    </div>
                  )}

                  {config?.sandbox && !orderFailed && (
                    <div className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-amber-100">
                        {sandboxSimulationComplete ? (
                          <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-black text-emerald-100">
                            PIX confirmado. {transferFlow ? "A transferência foi enviada." : `${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)} entrou na conta.`}
                          </p>
                        ) : (
                          <>
                            <label className="block text-sm font-bold text-amber-50">PIN da conta</label>
                            <WalletPinInput
                              value={walletPin}
                              onChange={updateWalletPin}
                              tone="amber"
                              inputRef={(node) => {
                                walletPinInputRef.current = node;
                              }}
                            />
                            <button
                              className="mt-3 w-full rounded-2xl bg-amber-300 px-5 py-4 text-sm font-black text-amber-950 transition hover:bg-amber-200 disabled:opacity-50"
                              disabled={Boolean(loading) || !orderId || walletPin.length < 4 || operationLocked}
                              onClick={() => run("Confirming PIX received", simulatePixPayment)}
                            >
                              {operationLocked ? "PIX concluído" : loading === "Confirming PIX received" ? <span className="inline-flex items-center justify-center gap-2"><InlineSpinner tone="amber" />Confirmando...</span> : "Confirmar aqui após fazer o PIX"}
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
            <AssetMovement title="Off-ramp wallet assets" before={offRampBalancesBefore} after={offRampBalancesAfter} deltas={offRampAssetDeltas} walletPublicKey={walletPublicKey} />
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
              disabled={!canResolveWallet || Boolean(loading) || !config?.sandbox || operationLocked}
              hidden={!config?.sandbox}
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
            <h2 className="mt-1 text-2xl font-black">Saldo para PIX</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Endpoint shown in frontend: <span className="font-mono font-black text-stone-950">POST /api/ramp/etherfuse/sandbox/test-offramp</span>
            </p>
            <label className="mt-5 block text-sm font-bold text-stone-600">Saldo amount to off-ramp</label>
            <input className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-lg font-black outline-none ring-rose-200 focus:ring-4" value={offRampAmount} inputMode="decimal" onChange={(event) => setOffRampAmount(event.target.value)} />
            {config?.sandbox ? (
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
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">Comprovante PIX</p>
                  <div className="mt-5 flex items-center gap-4">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-300 text-3xl font-black text-[#0d1512]">✓</span>
                    <div>
                      <h2 className="text-3xl font-black tracking-tight sm:text-5xl">
                        {rampMode === "offramp" ? "Retirada confirmada" : transferFlow ? "PIX e transferência confirmados" : "PIX confirmado"}
                      </h2>
                      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/65">
                        {rampMode === "offramp"
                          ? "O saldo saiu da sua conta TalkToStellar e entrou no seu PIX."
                          : transferFlow
                          ? "O PIX foi confirmado, o saldo foi convertido automaticamente e a transferência foi enviada."
                          : "O PIX foi confirmado e o saldo final entrou na sua conta."}
                      </p>
                    </div>
                  </div>
                </div>
                <span className="w-fit rounded-full border border-emerald-200/30 bg-emerald-300/15 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                  Concluído
                </span>
              </div>

              <div className="relative mt-8 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.07] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
                    {rampMode === "offramp" ? "Valor retirado" : "Valor recebido"}
                  </p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                    {rampMode === "offramp"
                      ? offRampReceiptAmount
                      : formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)}
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <ReceiptRow
                      label={rampMode === "offramp" ? "Recebido no seu PIX" : "Pago via PIX"}
                      value={rampMode === "offramp" ? offRampReceiptReceived : formatMoney(order?.fromAmount || quote?.fromAmount || amountBrl)}
                    />
                    <ReceiptRow label="Status" value="Concluído" />
                    {rampMode === "onramp" && <ReceiptRow label="Saldo antes" value={onRampReceiptBefore} />}
                    {rampMode === "onramp" && <ReceiptRow label="Saldo depois" value={onRampReceiptAfter} />}
                    {rampMode === "onramp" && <ReceiptRow label="Mudança no saldo" value={onRampReceiptDelta} />}
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Detalhes do comprovante</p>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <ReceiptRow label="Destino" value={rampMode === "offramp" ? "Seu PIX" : "Minha conta TalkToStellar"} />
                    <ReceiptRow label="Ordem" value={String(successTransaction?.id || temporaryOffRampTestResult?.submit_result?.order_id || "")} />
                    {rampMode === "offramp" && temporaryOffRampTestResult?.receipt_url && <ReceiptRow label="Comprovante" value={String(temporaryOffRampTestResult.receipt_url)} />}
                    {rampMode === "onramp" && onRampReceiptUrl && <ReceiptRow label="Comprovante" value={onRampReceiptUrl} />}
                    <ReceiptRow label="Data" value={new Date().toLocaleString("pt-BR")} />
                  </dl>
                </div>
              </div>

              {transferFlow && (
                <div className={`relative mt-5 rounded-[1.75rem] border p-5 ${pixFundedTransferResult?.transaction_hash ? "border-cyan-300/25 bg-cyan-300/10" : "border-amber-300/30 bg-amber-300/10"}`}>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">Transferência após PIX</p>
                  {pixFundedTransferResult?.transaction_hash ? (
                    <>
                      <p className="mt-3 rounded-2xl border border-cyan-200/20 bg-cyan-200/10 p-3 text-sm font-black text-cyan-50">
                        {String(pixFundedTransferResult.route_summary || "Escolhemos a melhor rota para essa conversão.")}
                      </p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <ReceiptRow label="Enviado para" value={String(pixFundedTransferResult.recipient_name || transferRecipient)} />
                        <ReceiptRow label="Valor transferido" value={formatRampAsset(pixFundedTransferResult.amount || autoPayAmount || amountBrl, pixFundedTransferResult.asset_code || autoPayAsset || targetAsset)} />
                        <ReceiptRow label="Conta destino" value={truncateKey(String(pixFundedTransferResult.recipient_public_key || ""))} />
                        <ReceiptRow label="Transação" value={String(pixFundedTransferResult.transaction_hash)} />
                        {pixFundedTransferResult.receipt_url && <ReceiptRow label="Comprovante" value={String(pixFundedTransferResult.receipt_url)} />}
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-sm font-bold text-amber-50">
                      PIX confirmado. Enviando automaticamente {autoPayDisplayAmount} para {transferRecipient || "destinatário"}...
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

function LiveRampPanel({ mode, steps, loading, status, launchedFromChat }: {
  mode: RampMode;
  steps: LiveStep[];
  loading: string;
  status: string;
  launchedFromChat: boolean;
}) {
  const completed = steps.filter((step) => step.state === "done").length;
  const progress = steps.length ? Math.round((completed / steps.length) * 100) : 0;
  const activeStep = steps.find((step) => step.state === "active") || steps.find((step) => step.state === "warning");

  return (
    <section className="mt-5 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl backdrop-blur">
      <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
        <div className={`${mode === "onramp" ? "bg-emerald-400/15 text-emerald-50" : "bg-cyan-400/15 text-cyan-50"} p-5 sm:p-6`}>
          <p className="text-xs font-black uppercase tracking-[0.2em] opacity-70">Fluxo PIX em tempo real</p>
          <h2 className="mt-2 text-3xl font-black">
            {mode === "onramp" ? "PIX entra e vira saldo na conta" : "Saldo sai e chega no seu PIX"}
          </h2>
          <p className="mt-3 text-sm font-bold opacity-75">
            {launchedFromChat
              ? "Aberto pelo chat. Acompanhe cada etapa sem precisar entender cripto."
              : "Acompanhe cotação, confirmação e saldo antes/depois em uma tela só."}
          </p>
          <div className="mt-5 rounded-full bg-black/30 p-1">
            <div
              className={`h-3 rounded-full transition-all duration-700 ${mode === "onramp" ? "bg-emerald-300" : "bg-cyan-300"}`}
              style={{ width: `${Math.max(6, progress)}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] opacity-70">
            <span>{completed}/{steps.length} etapas</span>
            <span className="inline-flex items-center gap-2">{loading ? <InlineSpinner tone="white" /> : null}{loading || status}</span>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:p-5">
          {activeStep && (
            <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-xl">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${activeStep.state === "warning" ? "bg-amber-300" : "animate-pulse bg-emerald-300"}`} />
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  Agora
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

function AssetMovement({ title, before, after, deltas, walletPublicKey }: {
  title: string;
  before: BalanceItem[];
  after: BalanceItem[];
  deltas: BalanceDelta[];
  walletPublicKey: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Wallet assets changing</p>
      <h2 className="mt-1 text-2xl font-black text-white">{title}</h2>
      <p className="mt-2 text-xs text-slate-400">Wallet: {truncateKey(walletPublicKey)}</p>
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
                    <p className="text-sm font-black text-white">{item.asset_code}</p>
                    <p className="mt-1 break-all text-[11px] text-slate-500">{item.asset_issuer || "native"}</p>
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
                  <p className="text-sm font-black text-white">{item.asset_code}</p>
                  <p className="mt-1 break-all text-[11px] text-slate-500">{item.asset_issuer || "native"}</p>
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
