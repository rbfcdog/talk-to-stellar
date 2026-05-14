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

function formatAsset(value: unknown, code = "TESOURO") {
  const numeric = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(numeric)) return `${value || "0"} ${code}`;
  return `${numeric.toLocaleString("pt-BR", { maximumFractionDigits: 7 })} ${code}`;
}

function formatRampAsset(value: unknown, code = "TESOURO") {
  return String(code || "").toUpperCase() === "BRL" ? formatMoney(value, "BRL") : formatAsset(value, code);
}

function formatCountdown(ms: number) {
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

function truncateKey(value?: string) {
  if (!value) return "not available";
  return `${value.slice(0, 7)}...${value.slice(-7)}`;
}

function sanitizeForDebug(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 8).map(sanitizeForDebug);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/token|secret|authorization|password/i.test(key)) return [key, "[redacted]"];
    if (typeof item === "string" && item.length > 240) return [key, `${item.slice(0, 240)}...`];
    if (item && typeof item === "object") return [key, sanitizeForDebug(item)];
    return [key, item];
  }));
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
  const [sessionId, setSessionId] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [rampEmail, setRampEmail] = useState("");
  const [resolvedWallet, setResolvedWallet] = useState<RampResponse | null>(null);
  const [config, setConfig] = useState<RampConfig | null>(null);
  const [rampMode, setRampMode] = useState<RampMode>("onramp");
  const [step, setStep] = useState<Step>("quote");
  const [amountBrl, setAmountBrl] = useState("100");
  const [targetAsset, setTargetAsset] = useState<TargetAsset>("BRL");
  const [customerPayload, setCustomerPayload] = useState<RampResponse | null>(null);
  const [quotePayload, setQuotePayload] = useState<RampResponse | null>(null);
  const [quoteReceivedAt, setQuoteReceivedAt] = useState(0);
  const [orderPayload, setOrderPayload] = useState<RampResponse | null>(null);
  const [statusPayload, setStatusPayload] = useState<RampResponse | null>(null);
  const [, setOnRampBalancesBefore] = useState<BalanceItem[]>([]);
  const [, setOnRampBalancesAfter] = useState<BalanceItem[]>([]);
  const [offRampBalancesBefore, setOffRampBalancesBefore] = useState<BalanceItem[]>([]);
  const [offRampBalancesAfter, setOffRampBalancesAfter] = useState<BalanceItem[]>([]);
  const [offRampAmount, setOffRampAmount] = useState("1");
  const [offRampFiatAmount, setOffRampFiatAmount] = useState("");
  const [walletPublicKey, setWalletPublicKey] = useState("");
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [programmaticOnboarding, setProgrammaticOnboarding] = useState<RampResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [walletPin, setWalletPin] = useState("");
  const [externalPixDestination, setExternalPixDestination] = useState("Conta bancária externa vinculada ao seu PIX");
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
  const [pixFundedTransferResult, setPixFundedTransferResult] = useState<RampResponse | null>(null);

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
  const finalAssetCode = String(order?.finalAsset?.code || order?.auto_conversion?.destination_asset_code || targetAsset).split(":")[0];
  const finalReceivedAmount = String(
    order?.finalAmount ||
    order?.auto_conversion?.destination_amount ||
    (finalAssetCode === "TESOURO" ? (order?.toAmount || quote?.toAmount || "") : "")
  );
  const receivedCode = finalAssetCode || targetAsset;
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
  const status = order ? normalizeStatus(order.status) : quoteExpired ? "quote expired" : "not started";
  const onRampComplete = Boolean(order && isSuccessStatus(status));
  const sandboxSimulationComplete = Boolean(isSandboxMockOrder && onRampComplete);
  const estimatedReceiveLabel = targetAsset === "BRL"
      ? formatMoney(order?.toAmount || finalReceivedAmount || amountBrl)
      : finalReceivedAmount
        ? formatRampAsset(finalReceivedAmount, targetAsset)
        : "Calculado automaticamente na confirmação";
  const payablePixAvailable = Boolean(pixCode && !isSandboxMockOrder);
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
  const offRampAssetDeltas = useMemo(() => offRampBalancesAfter.length > 0 ? calculateDeltas(offRampBalancesBefore, offRampBalancesAfter) : [], [offRampBalancesBefore, offRampBalancesAfter]);
  const liveSteps = useMemo<LiveStep[]>(() => {
    if (rampMode === "offramp") {
      const hasTarget = Boolean(offRampFiatAmount.trim() || offRampAmount.trim());
      return [
        {
          label: "Wallet TalkToStellar",
          detail: walletPublicKey ? `Wallet localizada: ${truncateKey(walletPublicKey)}` : "Digite o email para localizar a wallet.",
          state: walletPublicKey ? "done" : loading === "Resolving wallet" ? "active" : "pending",
        },
        {
          label: "Valor de saída",
          detail: offRampFiatAmount.trim()
            ? `Alvo: ${formatMoney(offRampFiatAmount)} entrando na conta PIX.`
            : `Saída direta do saldo: ${formatMoney(offRampAmount)} estimado.`,
          state: hasTarget ? "done" : "pending",
        },
        {
          label: "Conversão para BRL",
          detail: temporaryOffRampTestResult?.target_brl
            ? `Saldo convertido para chegar em ${formatMoney(temporaryOffRampTestResult.target_brl)}.`
            : "A cotação é criada quando você confirma o saque.",
          state: temporaryOffRampTestResult?.quote ? "done" : loading === "Confirming PIX off-ramp" ? "active" : "pending",
        },
        {
          label: "Assinatura e saída",
          detail: temporaryOffRampTestResult?.submitted
            ? "Transação assinada e submetida."
            : "Aguardando confirmação para mostrar o saldo saindo da wallet.",
          state: temporaryOffRampTestResult?.submitted ? "done" : loading === "Confirming PIX off-ramp" ? "active" : "pending",
        },
        {
          label: "Conta externa",
          detail: temporaryOffRampTestResult
            ? `${formatMoney(temporaryOffRampTestResult.target_brl || temporaryOffRampTestResult.quote?.toAmount || offRampFiatAmount || offRampAmount)} chegou em ${externalPixDestination}.`
            : `Destino final: ${externalPixDestination}.`,
          state: temporaryOffRampTestResult ? "done" : "pending",
        },
      ];
    }

    return [
      {
        label: "Wallet TalkToStellar",
        detail: walletPublicKey ? `Wallet localizada: ${truncateKey(walletPublicKey)}` : "Digite o email para localizar a wallet.",
        state: walletPublicKey ? "done" : loading === "Resolving wallet" ? "active" : "pending",
      },
      {
        label: "Conta PIX",
        detail: programmaticOnboarding
          ? "Conta preparada para continuar o PIX."
          : customerPayload
            ? "Preparando conta PIX."
            : "Aguardando criação do customer Etherfuse.",
        state: programmaticOnboarding ? "done" : (loading.includes("Preparing") || loading.includes("quote")) ? "active" : "pending",
      },
      {
        label: `Cotação BRL -> ${targetAsset}`,
        detail: quote
          ? `${formatMoney(quote.fromAmount || amountBrl)} fica disponível como ${targetAsset}.`
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
            ? `${formatRampAsset(pixFundedTransferResult.amount || amountBrl, pixFundedTransferResult.asset_code || targetAsset)} enviado para ${pixFundedTransferResult.recipient_name || transferRecipient}.`
            : `${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)} entregue na wallet.`
          : polling ? "Polling da ordem em andamento." : `Aguardando confirmação para entregar ${targetAsset}.`,
        state: transferFlow ? pixFundedTransferResult?.transaction_hash ? "done" : onRampComplete ? "active" : polling ? "active" : "pending" : onRampComplete ? "done" : polling ? "active" : "pending",
      },
    ];
  }, [
    amountBrl,
    customerPayload,
    loading,
    offRampAmount,
    offRampFiatAmount,
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
    const amount = String(params.get("amount") || "").trim().replace(",", ".");
    const fiatAmount = String(params.get("fiat_amount") || params.get("target_brl") || params.get("to_amount") || "").trim().replace(",", ".");
    const asset = String(params.get("asset") || "").trim().toUpperCase();
    const email = String(params.get("email") || "").trim().toLowerCase();
    const flow = String(params.get("flow") || "").trim().toLowerCase();
    const recipient = String(params.get("recipient") || "").trim();

    setRampMode(mode);
    if (amount) {
      if (mode === "offramp") setOffRampAmount(amount);
      else setAmountBrl(amount);
    }
    if (mode === "offramp" && fiatAmount) setOffRampFiatAmount(fiatAmount);
    if (asset === "BRL" || asset === "USDC") setTargetAsset(asset);
    if (asset === "TESOURO") setTargetAsset("BRL");
    if (email.includes("@")) setRampEmail(email);
    if (flow === "fund_and_pay") setTransferFlow(true);
    if (recipient) setTransferRecipient(recipient);
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
    fetch("/api/ramp/etherfuse/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setConfig(payload))
      .catch(() => setConfig({ sandbox: false, network: "Stellar" }));
  }, []);

  const addDebugLog = useCallback((entry: Omit<DebugLogEntry, "id" | "at">) => {
    setDebugLogs((current) => [{
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toLocaleTimeString("pt-BR"),
      ...entry,
      request: sanitizeForDebug(entry.request),
      response: sanitizeForDebug(entry.response),
    }, ...current].slice(0, 40));
  }, []);

  async function resolveWalletFromEmail(): Promise<RampAuth> {
    if (sessionId && sessionToken) {
      return { session_id: sessionId, session_token: sessionToken };
    }

    const email = rampEmail.trim().toLowerCase();
    if (!email) {
      throw new Error("Digite o email da conta TalkToStellar para localizar a wallet.");
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
      throw new Error(payload?.message || "Nao encontrei uma wallet TalkToStellar ativa para este email.");
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

  const callRamp = useCallback(async (path: string, body?: Record<string, unknown>, method = "POST", authOverride?: RampAuth) => {
    const auth = authOverride || { session_id: sessionId, session_token: sessionToken };
    if (!auth.session_id || !auth.session_token) throw new Error("Digite o email da conta TalkToStellar para localizar a wallet.");
    const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
    const requestBody = { ...auth, ...(body || {}) };
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
    if (!auth.session_id || !auth.session_token) throw new Error("Digite o email da conta TalkToStellar para localizar a wallet.");
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
      if (isSuccessStatus(nextStatus)) setStep("success");
    }
    return payload;
  }, [callRampGet, fetchBalances, operationId, orderId]);

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
    }, "POST", auth);
    setQuotePayload(payload);
    setQuoteReceivedAt(Date.now());
    return { auth, customerResult, quoteResult: payload };
  }

  async function confirmQuoteAndCreatePix() {
    let quoteForOrder = quote;
    let customerForOrder = customerPayload;
    let authForOrder: RampAuth | undefined;
    if (!quoteForOrder?.id || quoteStaleForOrder) {
      addDebugLog({
        label: quoteForOrder?.id ? "Quote too close to expiration before order, refreshing" : "No quote available, creating quote before order",
        method: "POST",
        path: "/api/ramp/etherfuse/quote",
        request: { amount: amountBrl, targetAsset },
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
      customer_id: String(customerForOrder?.customer?.id || customerId),
      quote_id: quoteForOrder.id,
      amount: amountBrl,
      expected_to_amount: quoteForOrder.toAmount,
      from_currency: "BRL",
      to_currency: "TESOURO",
      final_asset: targetAsset,
    }, "POST", authForOrder);
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
  }

  useEffect(() => {
    const params = new URLSearchParams(queryString);
    if (params.get("autostart") !== "1") return;
    if (autoStartedRef.current) return;
    if (rampMode !== "onramp") return;
    if (!canResolveWallet || loading || order || quote) return;

    autoStartedRef.current = true;
    void run("Preparing PIX checkout", confirmQuoteAndCreatePix);
  }, [canResolveWallet, loading, order, queryString, quote, rampMode]);

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
            request: { amount: amountBrl, targetAsset },
            response: {},
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => setAutoRefreshingQuote(false));
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [addDebugLog, amountBrl, autoRefreshingQuote, canResolveWallet, loading, order, quote, quoteDeadlineAt, targetAsset]);

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
    if (!orderId) throw new Error("Prepare o PIX antes de confirmar o pagamento.");
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/simulate-fiat", {
      order_id: orderId,
      operation_id: operationId,
      pin: walletPin,
    });
    if (payload?.transaction) setStatusPayload(payload);
    setPolling(true);
    const refreshed = await refreshOrder();
    const completedTransaction = refreshed?.transaction || payload?.transaction;
    if (transferFlow && transferRecipient && isSuccessStatus(completedTransaction?.status)) {
      await submitPixFundedTransfer(completedTransaction);
    }
  }

  async function submitPixFundedTransfer(completedTransaction?: RampResponse) {
    const auth = await resolveWalletFromEmail();
    const transferAmount = targetAsset === "BRL"
      ? String(completedTransaction?.finalAmount || completedTransaction?.toAmount || amountBrl)
      : String(completedTransaction?.finalAmount || finalReceivedAmount || completedTransaction?.toAmount || "");
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/pix-funded-transfer", {
      recipient: transferRecipient,
      amount: transferAmount,
      asset_code: targetAsset,
      order_id: orderId,
      operation_id: operationId,
      pin: walletPin,
    }, "POST", auth);
    setPixFundedTransferResult(payload);
  }

  async function runTemporaryEndpointTest() {
    const auth = await resolveWalletFromEmail();
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/test-onramp", {
      amount: amountBrl,
      to_currency: "TESOURO",
      final_asset: targetAsset,
    }, "POST", auth);
    setTemporaryTestResult(payload);
    setWalletPublicKey(String(payload.wallet_public_key || ""));
    setOnRampBalancesBefore(Array.isArray(payload.balances_before) ? payload.balances_before : []);
    setOnRampBalancesAfter(Array.isArray(payload.balances_after) ? payload.balances_after : []);
  }

  async function runTemporaryOffRampEndpointTest() {
    const auth = await resolveWalletFromEmail();
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/test-offramp", {
      amount: offRampAmount,
      fiat_amount: offRampFiatAmount.trim() || undefined,
      pin: walletPin,
    }, "POST", auth);
    setTemporaryOffRampTestResult(payload);
    setWalletPublicKey(String(payload.wallet_public_key || ""));
    setOffRampBalancesBefore(Array.isArray(payload.balances_before) ? payload.balances_before : []);
    setOffRampBalancesAfter(Array.isArray(payload.balances_after) ? payload.balances_after : []);
  }

  const timeline = [
    { label: "PIX generated", done: Boolean(orderId), active: Boolean(orderId) && status === "pending" },
    { label: "Waiting for payment", done: ["processing", "funded", "completed"].includes(status), active: status === "pending" },
    { label: "Payment detected", done: ["processing", "funded", "completed"].includes(status), active: ["processing", "funded"].includes(status) },
    { label: transferFlow ? "Transfer sent" : "Balance delivered", done: status === "completed", active: status === "completed" },
  ];

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
                {rampMode === "onramp" ? "Adicionar saldo com PIX" : "Retirar dinheiro via PIX"}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                {rampMode === "onramp"
                  ? transferFlow && transferRecipient
                    ? `Faça o PIX, confirme com seu PIN e envie automaticamente para ${transferRecipient}.`
                    : "Faça o PIX, confirme com seu PIN e receba o saldo na sua wallet."
                  : "Confirme com seu PIN para retirar saldo via PIX."}
              </p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Valor</p>
                <p className="mt-2 text-sm text-slate-200">
                  {rampMode === "onramp" ? formatMoney(amountBrl) : offRampFiatAmount ? formatMoney(offRampFiatAmount) : formatMoney(offRampAmount)}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Destino</p>
                <p className="mt-2 text-sm text-slate-200">{transferFlow && transferRecipient ? transferRecipient : rampMode === "onramp" ? "Minha wallet" : "Minha conta PIX"}</p>
              </div>
            </div>
          </section>
        </header>

        {!hasSession && (
          <section className="mt-5 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
            Digite o email da conta para localizar sua wallet e continuar.
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
            <span className="block text-xs font-black uppercase tracking-[0.18em] opacity-70">Retirar dinheiro</span>
            <span className="mt-1 block text-lg font-black">Saldo para PIX</span>
          </button>
        </section>
        )}

        {rampMode === "offramp" && (
          <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Retirada via PIX</p>
              <h2 className="mt-1 text-3xl font-black text-white">Retirar saldo para PIX</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                O saldo sai da sua wallet e aparece como dinheiro recebido por PIX.
              </p>

              <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
              <label className="block text-sm font-bold text-cyan-50">Email da conta</label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                    type="email"
                    value={rampEmail}
                    placeholder="jorge@gmail.com"
                    disabled={Boolean(loading)}
                    onChange={(event) => clearResolvedRampWallet(event.target.value)}
                  />
                  <button
                    className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
                    disabled={!rampEmail.trim() || Boolean(loading)}
                    onClick={() => run("Resolving wallet", async () => {
                      await resolveWalletFromEmail();
                    })}
                  >
                    {loading === "Resolving wallet" ? "Localizando..." : hasSession ? "Atualizar wallet" : "Usar wallet"}
                  </button>
                </div>
                <p className="mt-3 text-xs font-semibold text-cyan-100/75">
                  {walletPublicKey
                    ? `Wallet localizada: ${resolvedWallet?.public_key_display || truncateKey(walletPublicKey)}`
                    : "Informe o email da conta para buscar sua wallet."}
                </p>
              </div>

              <label className="mt-6 block text-sm font-bold text-slate-200">Você quer receber</label>
              <div className="mt-2 flex overflow-hidden rounded-3xl border border-white/10 bg-white/5 focus-within:border-cyan-400/60">
                <span className="flex items-center bg-white/10 px-4 text-sm font-black text-slate-300">R$</span>
                <input
                  className="w-full bg-transparent px-4 py-4 text-3xl font-black text-white outline-none"
                  value={offRampFiatAmount}
                  inputMode="decimal"
                  placeholder="100"
                  onChange={(event) => setOffRampFiatAmount(event.target.value)}
                />
                <span className="flex items-center px-4 text-sm font-black text-slate-300">BRL</span>
              </div>
              <label className="mt-6 block text-sm font-bold text-slate-200">Destino final</label>
              <div className="mt-2 overflow-hidden rounded-3xl border border-white/10 bg-white/5 focus-within:border-cyan-400/60">
                <input
                  className="w-full bg-transparent px-4 py-4 text-base font-black text-white outline-none"
                  value={externalPixDestination}
                  autoComplete="off"
                  placeholder="Conta bancária externa vinculada ao seu PIX"
                  onChange={(event) => setExternalPixDestination(event.target.value)}
                />
              </div>
              <label className="mt-6 block text-sm font-bold text-slate-200">PIN da wallet</label>
              <div className="mt-2 flex overflow-hidden rounded-3xl border border-white/10 bg-white/5 focus-within:border-cyan-400/60">
                <input className="hidden" tabIndex={-1} autoComplete="username" aria-hidden="true" />
                <input className="hidden" tabIndex={-1} type="password" autoComplete="current-password" aria-hidden="true" />
                <input
                  className="w-full bg-transparent px-4 py-4 text-xl font-black text-white outline-none"
                  value={walletPin}
                  inputMode="numeric"
                  type="text"
                  name="manual-wallet-code-off"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  style={{ WebkitTextSecurity: "disc" } as any}
                  placeholder="Digite seu PIN"
                  onPaste={(event) => event.preventDefault()}
                  onDrop={(event) => event.preventDefault()}
                  onChange={(event) => setWalletPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                />
              </div>

              <button
                className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
                disabled={!canResolveWallet || Boolean(loading) || walletPin.length < 4}
                onClick={() => run("Confirming PIX off-ramp", runTemporaryOffRampEndpointTest)}
              >
                {loading === "Confirming PIX off-ramp" ? "Confirmando..." : "Confirmar retirada"}
              </button>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-5 text-white shadow-xl sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Conta externa</p>
              <h2 className="mt-1 text-2xl font-black">Retirada para banco</h2>
              {!temporaryOffRampTestResult ? (
                <div className="mt-8 rounded-3xl border border-dashed border-white/20 p-8 text-center text-sm text-white/60">
                  Digite seu PIN e confirme a retirada para ver o dinheiro sair da wallet e chegar na conta externa.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  <div className="rounded-3xl bg-white/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Status</p>
                    <p className="mt-1 text-lg font-black">{temporaryOffRampTestResult.final_transaction?.status || "processing"}</p>
                  </div>
                  <div className="rounded-3xl bg-white/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Saiu da wallet</p>
                    <p className="mt-1 text-lg font-black">{formatMoney(temporaryOffRampTestResult.target_brl || temporaryOffRampTestResult.quote?.toAmount || offRampFiatAmount || offRampAmount)}</p>
                  </div>
                  <div className="rounded-3xl bg-white/10 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Entrou na conta externa</p>
                    <p className="mt-1 text-lg font-black">{formatMoney(temporaryOffRampTestResult.target_brl || temporaryOffRampTestResult.quote?.toAmount || offRampFiatAmount || offRampAmount)}</p>
                    <p className="mt-1 text-sm font-bold text-white/60">{externalPixDestination}</p>
                  </div>
                  {temporaryOffRampTestResult.target_brl && (
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-rose-100">Conversao usada</p>
                      <p className="mt-1 text-sm font-bold text-white/75">
                        Alvo de {formatMoney(temporaryOffRampTestResult.target_brl)} calculado antes da retirada.
                      </p>
                    </div>
                  )}
                  <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-100">
                    <p className="text-sm font-black">Retirada concluída para a conta externa.</p>
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
                  {loading === "Resolving wallet" ? "Localizando..." : "Usar wallet"}
                </button>
              </div>
              <p className="mt-3 text-xs font-semibold text-emerald-100/75">
                {walletPublicKey
                  ? `Wallet localizada: ${resolvedWallet?.public_key_display || truncateKey(walletPublicKey)}`
                  : "Digite o email da conta para localizar sua wallet."}
              </p>
            </div>
            )}

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

            <label className="mt-5 block text-sm font-bold text-slate-200">{transferFlow ? "Enviar como" : "Receber como"}</label>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-3xl border border-white/10 bg-black/20 p-2">
              {(["BRL", "USDC"] as TargetAsset[]).map((asset) => (
                <button
                  key={asset}
                  className={`rounded-2xl px-4 py-3 text-sm font-black transition ${targetAsset === asset ? "bg-emerald-400 text-slate-950 shadow-lg" : "text-slate-400 hover:bg-white/10"}`}
                  onClick={() => {
                    if (asset !== targetAsset) {
                      setTargetAsset(asset);
                      clearQuoteState();
                    }
                  }}
                >
                  {asset}
                </button>
              ))}
            </div>
            {transferFlow && transferRecipient && (
              <div className="mt-4 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-bold text-emerald-50">
                Depois que você confirmar o PIX, enviaremos automaticamente {formatMoney(amountBrl)} em {targetAsset} para {transferRecipient}.
              </div>
            )}

            <button className="mt-6 w-full rounded-2xl bg-emerald-400 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50" disabled={!canResolveWallet || Boolean(loading)} onClick={() => run("Preparing PIX checkout", confirmQuoteAndCreatePix)}>
              {loading === "Preparing PIX checkout" ? "Preparando..." : "Continuar"}
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
                          <div className="grid aspect-square place-items-center rounded-2xl bg-stone-100 text-center text-xs font-bold text-stone-500">QR unavailable</div>
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

                  {isSandboxMockOrder ? (
                    <div className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-50">
                      Este QR code ainda não conecta com transação bancária. Depois de fazer o PIX, digite seu PIN e confirme.
                    </div>
                  ) : (
                    <div className="mt-5 rounded-3xl bg-black/20 p-4">
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

                  {config?.sandbox && (
                    <div className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-300/10 p-4 text-amber-100">
                        {sandboxSimulationComplete ? (
                          <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm font-black text-emerald-100">
                            PIX confirmado. {transferFlow ? "A transferência foi enviada." : `${formatRampAsset(finalReceivedAmount || order?.toAmount || quote?.toAmount, receivedCode)} entrou na wallet.`}
                          </p>
                        ) : (
                          <>
                            <label className="block text-sm font-bold text-amber-50">PIN da wallet</label>
                            <input className="hidden" tabIndex={-1} autoComplete="username" aria-hidden="true" />
                            <input className="hidden" tabIndex={-1} type="password" autoComplete="current-password" aria-hidden="true" />
                            <input
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-xl font-black text-white outline-none placeholder:text-amber-100/35 focus:border-amber-200/60"
                              value={walletPin}
                              inputMode="numeric"
                              type="text"
                              name="manual-wallet-code-on"
                              autoComplete="off"
                              data-lpignore="true"
                              data-1p-ignore="true"
                              style={{ WebkitTextSecurity: "disc" } as any}
                              placeholder="Digite seu PIN"
                              onPaste={(event) => event.preventDefault()}
                              onDrop={(event) => event.preventDefault()}
                              onChange={(event) => setWalletPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                            />
                            <button
                              className="mt-3 w-full rounded-2xl bg-amber-300 px-5 py-4 text-sm font-black text-amber-950 transition hover:bg-amber-200 disabled:opacity-50"
                              disabled={Boolean(loading) || !orderId || walletPin.length < 4}
                              onClick={() => run("Confirming PIX received", simulatePixPayment)}
                            >
                              {loading === "Confirming PIX received" ? "Confirmando..." : "Confirme aqui após fazer o PIX"}
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
              disabled={!canResolveWallet || Boolean(loading) || !config?.sandbox}
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
              <button className="mt-5 w-full rounded-3xl bg-rose-300 px-5 py-4 text-sm font-black text-rose-950 disabled:opacity-50" disabled={!canResolveWallet || Boolean(loading)} onClick={() => run("Running off-ramp temporary endpoint", runTemporaryOffRampEndpointTest)}>
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

        {step === "success" && order && (
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
                      <h2 className="text-3xl font-black tracking-tight sm:text-5xl">{transferFlow ? "PIX e transferência confirmados" : "PIX confirmado"}</h2>
                      <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/65">
                        {transferFlow
                          ? "O PIX foi confirmado, o saldo foi convertido automaticamente e a transferência foi enviada."
                          : "O PIX foi confirmado e o saldo final entrou na sua wallet."}
                      </p>
                    </div>
                  </div>
                </div>
                <span className="w-fit rounded-full border border-emerald-200/30 bg-emerald-300/15 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">
                  completed
                </span>
              </div>

              <div className="relative mt-8 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.07] p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Valor recebido</p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-white sm:text-5xl">
                    {formatRampAsset(finalReceivedAmount || order.toAmount || quote?.toAmount, receivedCode)}
                  </p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <ReceiptRow label="Pago via PIX" value={formatMoney(order.fromAmount || quote?.fromAmount || amountBrl)} />
                    <ReceiptRow label="Status" value="Concluído" />
                  </div>
                </div>

                <div className="rounded-[1.75rem] border border-white/10 bg-black/25 p-5">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">Detalhes do comprovante</p>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <ReceiptRow label="Destino" value={truncateKey(walletPublicKey)} />
                    <ReceiptRow label="Ordem Etherfuse" value={order.id} />
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
                        <ReceiptRow label="Valor transferido" value={formatRampAsset(pixFundedTransferResult.amount || amountBrl, pixFundedTransferResult.asset_code || targetAsset)} />
                        <ReceiptRow label="Wallet destino" value={truncateKey(String(pixFundedTransferResult.recipient_public_key || ""))} />
                        <ReceiptRow label="Transação" value={String(pixFundedTransferResult.transaction_hash)} />
                        {pixFundedTransferResult.receipt_url && <ReceiptRow label="Comprovante" value={String(pixFundedTransferResult.receipt_url)} />}
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-sm font-bold text-amber-50">
                      PIX confirmado. Enviando automaticamente {formatRampAsset(amountBrl, targetAsset)} para {transferRecipient || "destinatário"}...
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
            {mode === "onramp" ? "PIX entra, saldo escolhido chega na wallet" : "Saldo sai, BRL aparece na conta PIX"}
          </h2>
          <p className="mt-3 text-sm font-bold opacity-75">
            {launchedFromChat
              ? "Aberto pelo chat. A página mantém o estado da operação e mostra cada request do ramp avançando."
              : "Use esta tela para acompanhar sessão, cotação, ordem, confirmação e saldo antes/depois."}
          </p>
          <div className="mt-5 rounded-full bg-black/30 p-1">
            <div
              className={`h-3 rounded-full transition-all duration-700 ${mode === "onramp" ? "bg-emerald-300" : "bg-cyan-300"}`}
              style={{ width: `${Math.max(6, progress)}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.14em] opacity-70">
            <span>{completed}/{steps.length} etapas</span>
            <span>{loading || status}</span>
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
            Mostra exatamente o que a tela enviou para `/api/ramp/...` e o que voltou. `session_token` e segredos sao mascarados.
          </p>
        </div>
        <button className="w-fit rounded-full border border-white/15 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white/70 disabled:opacity-40" disabled={logs.length === 0} onClick={onClear}>
          Clear logs
        </button>
      </div>
      <div className="mt-5 grid gap-3">
        {logs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-5 text-sm font-bold text-white/45">
            Nenhuma chamada ainda. Clique em `Use wallet`, `Get quote` ou `Generate PIX` para ver os requests.
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
                <pre className="max-h-80 overflow-auto rounded-xl bg-black/35 p-3 text-xs text-lime-50">{JSON.stringify(log.request || {}, null, 2)}</pre>
              </div>
              <div>
                <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-lime-200">Response</p>
                <pre className="max-h-80 overflow-auto rounded-xl bg-black/35 p-3 text-xs text-lime-50">{JSON.stringify(log.response || {}, null, 2)}</pre>
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
