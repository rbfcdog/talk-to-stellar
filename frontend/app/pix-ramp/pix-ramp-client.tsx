"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";

type Step = "quote" | "checkout" | "success";
type TargetAsset = "TESOURO" | "USDC";

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

function formatCountdown(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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

export default function PixRampClient() {
  const [sessionId, setSessionId] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [rampEmail, setRampEmail] = useState("");
  const [resolvedWallet, setResolvedWallet] = useState<RampResponse | null>(null);
  const [config, setConfig] = useState<RampConfig | null>(null);
  const [step, setStep] = useState<Step>("quote");
  const [amountBrl, setAmountBrl] = useState("100");
  const [targetAsset, setTargetAsset] = useState<TargetAsset>("TESOURO");
  const [customerPayload, setCustomerPayload] = useState<RampResponse | null>(null);
  const [quotePayload, setQuotePayload] = useState<RampResponse | null>(null);
  const [orderPayload, setOrderPayload] = useState<RampResponse | null>(null);
  const [statusPayload, setStatusPayload] = useState<RampResponse | null>(null);
  const [onRampBalancesBefore, setOnRampBalancesBefore] = useState<BalanceItem[]>([]);
  const [onRampBalancesAfter, setOnRampBalancesAfter] = useState<BalanceItem[]>([]);
  const [offRampBalancesBefore, setOffRampBalancesBefore] = useState<BalanceItem[]>([]);
  const [offRampBalancesAfter, setOffRampBalancesAfter] = useState<BalanceItem[]>([]);
  const [offRampAmount, setOffRampAmount] = useState("1");
  const [walletPublicKey, setWalletPublicKey] = useState("");
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [programmaticOnboarding, setProgrammaticOnboarding] = useState<RampResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [polling, setPolling] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [temporaryTestResult, setTemporaryTestResult] = useState<RampResponse | null>(null);
  const [temporaryOffRampTestResult, setTemporaryOffRampTestResult] = useState<RampResponse | null>(null);

  const hasSession = Boolean(sessionId && sessionToken);
  const canResolveWallet = Boolean(hasSession || rampEmail.trim());
  const customer = customerPayload?.customer;
  const customerId = String(customer?.id || "");
  const bankAccountId = String(customer?.bankAccountId || "");
  const quote = quotePayload?.quote;
  const order = statusPayload?.transaction || orderPayload?.transaction;
  const operationId = String(orderPayload?.operation_id || "");
  const orderId = String(order?.id || "");
  const status = normalizeStatus(order?.status);
  const paymentInstructions = order?.paymentInstructions || {};
  const pixCode = String(paymentInstructions?.pixCode || "");
  const pixKey = String(paymentInstructions?.pixKey || "");
  const receivedCode = String(quote?.toCurrency || targetAsset).split(":")[0];
  const quoteExpiresAt = Date.parse(String(quote?.expiresAt || ""));
  const quoteCountdown = formatCountdown(quoteExpiresAt - now);
  const quoteExpired = quoteCountdown === "expired";
  const onRampAssetDeltas = useMemo(() => calculateDeltas(onRampBalancesBefore, onRampBalancesAfter), [onRampBalancesBefore, onRampBalancesAfter]);
  const offRampAssetDeltas = useMemo(() => calculateDeltas(offRampBalancesBefore, offRampBalancesAfter), [offRampBalancesBefore, offRampBalancesAfter]);

  const receiptText = useMemo(() => {
    if (!order) return "";
    return [
      "PIX payment confirmed",
      `BRL amount paid: ${formatMoney(order.fromAmount || quote?.fromAmount || amountBrl)}`,
      `Asset received: ${formatAsset(order.toAmount || quote?.toAmount, receivedCode)}`,
      `Destination wallet: ${walletPublicKey}`,
      `Order id: ${order.id}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Network: ${config?.network || "Stellar Testnet"}`,
      `Status: ${order.status}`,
    ].join("\n");
  }, [amountBrl, config?.network, order, quote?.fromAmount, quote?.toAmount, receivedCode, walletPublicKey]);

  useEffect(() => {
    const stored = getStoredSession();
    setSessionId(stored.sessionId);
    setSessionToken(stored.sessionToken);
    const storedName = window.localStorage.getItem("talk-to-stellar.userName") || "";
    if (storedName.includes("@")) setRampEmail(storedName);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/ramp/etherfuse/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => setConfig(payload))
      .catch(() => setConfig({ sandbox: false, network: "Stellar Testnet" }));
  }, []);

  async function resolveWalletFromEmail(): Promise<RampAuth> {
    if (sessionId && sessionToken) {
      return { session_id: sessionId, session_token: sessionToken };
    }

    const email = rampEmail.trim().toLowerCase();
    if (!email) {
      throw new Error("Digite o email da conta TalkToStellar para localizar a wallet.");
    }

    const response = await fetch("/api/ramp/etherfuse/resolve-wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const payload = await response.json().catch(() => ({}));
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
    if (method !== "GET") init.body = JSON.stringify({ ...auth, ...(body || {}) });
    const response = await fetch(path, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      const requestError = new Error(payload?.message || payload?.error || `Ramp request failed: ${response.status}`) as Error & { payload?: RampResponse };
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }, [sessionId, sessionToken]);

  const callRampGet = useCallback(async (path: string, params?: Record<string, string>, authOverride?: RampAuth) => {
    const auth = authOverride || { session_id: sessionId, session_token: sessionToken };
    if (!auth.session_id || !auth.session_token) throw new Error("Digite o email da conta TalkToStellar para localizar a wallet.");
    const search = new URLSearchParams({ ...auth, ...(params || {}) });
    const response = await fetch(`${path}?${search.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      const requestError = new Error(payload?.message || payload?.error || `Ramp request failed: ${response.status}`) as Error & { payload?: RampResponse };
      requestError.payload = payload;
      throw requestError;
    }
    return payload;
  }, [sessionId, sessionToken]);

  const fetchBalances = useCallback(async (authOverride?: RampAuth) => {
    const payload = await callRampGet("/api/ramp/etherfuse/wallet-balances", undefined, authOverride);
    setWalletPublicKey(String(payload.public_key || ""));
    return Array.isArray(payload.balances) ? payload.balances as BalanceItem[] : [];
  }, [callRampGet]);

  useEffect(() => {
    if (!pixCode) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(pixCode, {
      width: 260,
      margin: 1,
      color: { dark: "#10231b", light: "#ffffff" },
    }).then(setQrDataUrl).catch(() => setQrDataUrl(""));
  }, [pixCode]);

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
      refreshOrder().catch((err) => setError(err instanceof Error ? err.message : String(err)));
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
    setOrderPayload(null);
    setStatusPayload(null);
    setTemporaryTestResult(null);
    setTemporaryOffRampTestResult(null);
    setOnboardingUrl("");
    setProgrammaticOnboarding(null);
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

  async function requestQuote() {
    setStep("quote");
    setOrderPayload(null);
    setStatusPayload(null);
    setOnRampBalancesAfter([]);
    setTemporaryTestResult(null);

    const auth = await resolveWalletFromEmail();
    const customerResult = customerPayload || await callRamp("/api/ramp/etherfuse/customer", {
      country: "BR",
      email: rampEmail.trim().toLowerCase() || undefined,
    }, "POST", auth);
    setCustomerPayload(customerResult);
    setProgrammaticOnboarding(customerResult?.programmatic_onboarding || null);

    const before = await fetchBalances(auth);
    setOnRampBalancesBefore(before);

    const payload = await callRamp("/api/ramp/etherfuse/quote", {
      customer_id: customerResult?.customer?.id,
      direction: "onramp",
      from_currency: "BRL",
      to_currency: targetAsset,
      amount: amountBrl,
    }, "POST", auth);
    setQuotePayload(payload);
  }

  async function confirmQuoteAndCreatePix() {
    if (!quote?.id) throw new Error("Request a quote first.");
    const payload = await callRamp("/api/ramp/etherfuse/onramp", {
      customer_id: customerId,
      quote_id: quote.id,
      amount: amountBrl,
      to_currency: quote.toCurrency || targetAsset,
      bank_account_id: bankAccountId || undefined,
    });
    setOnboardingUrl("");
    setOrderPayload(payload);
    setStatusPayload(null);
    setStep("checkout");
    setPolling(true);
  }

  async function copyPixCode() {
    await navigator.clipboard.writeText(pixCode || pixKey || orderId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function simulatePixPayment() {
    if (!orderId) throw new Error("Create a PIX order before simulating payment.");
    await callRamp("/api/ramp/etherfuse/sandbox/simulate-fiat", { order_id: orderId });
    setPolling(true);
    await refreshOrder();
  }

  async function runTemporaryEndpointTest() {
    const auth = await resolveWalletFromEmail();
    const payload = await callRamp("/api/ramp/etherfuse/sandbox/test-onramp", {
      amount: amountBrl,
      to_currency: targetAsset,
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
    }, "POST", auth);
    setTemporaryOffRampTestResult(payload);
    setWalletPublicKey(String(payload.wallet_public_key || ""));
    setOffRampBalancesBefore(Array.isArray(payload.balances_before) ? payload.balances_before : []);
    setOffRampBalancesAfter(Array.isArray(payload.balances_after) ? payload.balances_after : []);
  }

  async function copyReceipt() {
    await navigator.clipboard.writeText(receiptText);
    setReceiptCopied(true);
    window.setTimeout(() => setReceiptCopied(false), 1600);
  }

  function newTransfer() {
    setStep("quote");
    setQuotePayload(null);
    setOrderPayload(null);
    setStatusPayload(null);
    setOnRampBalancesBefore([]);
    setOnRampBalancesAfter([]);
    setQrDataUrl("");
    setCopied(false);
    setPolling(false);
    setError("");
  }

  const timeline = [
    { label: "PIX generated", done: Boolean(orderId), active: Boolean(orderId) && status === "pending" },
    { label: "Waiting for payment", done: ["processing", "funded", "completed"].includes(status), active: status === "pending" },
    { label: "Payment detected", done: ["processing", "funded", "completed"].includes(status), active: ["processing", "funded"].includes(status) },
    { label: "Stellar asset delivered", done: status === "completed", active: status === "completed" },
  ];

  return (
    <main className="min-h-screen bg-[#f5f1e8] px-4 py-6 text-[#17251d] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="overflow-hidden rounded-[2rem] bg-[#17251d] p-6 text-white shadow-2xl shadow-emerald-950/20 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="mb-3 inline-flex rounded-full bg-lime-300 px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-[#17251d]">
                Etherfuse {config?.sandbox ? "sandbox" : "production"} checkout
              </p>
              <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl">
                PIX checkout to your TalkToStellar wallet
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/70">
                Quote BRL, generate PIX instructions, simulate sandbox payment, poll delivery, and show wallet asset changes before and after settlement.
              </p>
            </div>
            <Link href="/chat" className="inline-flex w-fit rounded-full border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10">
              Back to chat
            </Link>
          </div>
        </header>

        {!hasSession && (
          <section className="mt-5 rounded-2xl border border-amber-300 bg-amber-100 p-4 text-sm text-amber-950">
            Nenhuma sessao TalkToStellar ativa foi encontrada neste navegador. Digite o email da conta abaixo para localizar a wallet existente e continuar sem Freighter.
          </section>
        )}

        {error && (
          <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
            {onboardingUrl && (
              <a
                className="mt-3 inline-flex rounded-full bg-red-700 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-white"
                href={onboardingUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir cadastro PIX Etherfuse
              </a>
            )}
          </section>
        )}

        <section className="mt-6 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] bg-white p-5 shadow-xl shadow-stone-300/40 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">3. Quote screen</p>
                <h2 className="mt-1 text-2xl font-black">Choose amount</h2>
              </div>
              <div className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
                {config?.network || "Stellar Testnet"}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
              <label className="block text-sm font-bold text-emerald-950">TalkToStellar account email</label>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-bold text-emerald-950 outline-none ring-lime-200 placeholder:text-emerald-900/35 focus:ring-4"
                  type="email"
                  value={rampEmail}
                  placeholder="jorge@gmail.com"
                  disabled={Boolean(loading)}
                  onChange={(event) => {
                    clearResolvedRampWallet(event.target.value);
                  }}
                />
                <button
                  className="rounded-2xl bg-[#17251d] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                  disabled={!rampEmail.trim() || Boolean(loading)}
                  onClick={() => run("Resolving wallet", async () => {
                    await resolveWalletFromEmail();
                  })}
                >
                  {loading === "Resolving wallet" ? "Finding..." : hasSession ? "Refresh wallet" : "Use wallet"}
                </button>
              </div>
              {hasSession && (
                <button
                  className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-emerald-700 underline decoration-emerald-300 underline-offset-4"
                  disabled={Boolean(loading)}
                  onClick={() => clearResolvedRampWallet("")}
                >
                  Trocar wallet/email
                </button>
              )}
              <p className="mt-3 text-xs font-semibold text-emerald-900/65">
                {walletPublicKey
                  ? `Wallet localizada: ${resolvedWallet?.public_key_display || truncateKey(walletPublicKey)}`
                  : "A cotacao usa a wallet criada/importada na infra TalkToStellar para este email. Em sandbox, a conta e fundida na Testnet antes de ler saldo."}
              </p>
            </div>

            <label className="mt-6 block text-sm font-bold text-stone-600">You send</label>
            <div className="mt-2 flex overflow-hidden rounded-3xl border border-stone-200 bg-stone-50 focus-within:ring-4 focus-within:ring-lime-200">
              <span className="flex items-center bg-stone-100 px-4 text-sm font-black text-stone-500">R$</span>
              <input className="w-full bg-transparent px-4 py-4 text-3xl font-black outline-none" value={amountBrl} inputMode="decimal" onChange={(event) => setAmountBrl(event.target.value)} />
              <span className="flex items-center px-4 text-sm font-black text-stone-500">BRL</span>
            </div>

            <label className="mt-5 block text-sm font-bold text-stone-600">You receive</label>
            <div className="mt-2 grid grid-cols-2 gap-2 rounded-3xl bg-stone-100 p-2">
              {(["TESOURO", "USDC"] as TargetAsset[]).map((asset) => (
                <button key={asset} className={`rounded-2xl px-4 py-3 text-sm font-black transition ${targetAsset === asset ? "bg-[#17251d] text-white shadow-lg" : "text-stone-500 hover:bg-white"}`} onClick={() => setTargetAsset(asset)}>
                  {asset}
                </button>
              ))}
            </div>

            <button className="mt-6 w-full rounded-3xl bg-lime-300 px-5 py-4 text-sm font-black text-[#17251d] shadow-lg shadow-lime-900/10 disabled:opacity-50" disabled={!canResolveWallet || Boolean(loading)} onClick={() => run("Requesting quote", requestQuote)}>
              {loading === "Requesting quote" ? "Getting quote..." : "Get quote"}
            </button>

            {quote && (
              <div className="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Quote ready</p>
                    <h3 className="mt-1 text-2xl font-black text-emerald-950">{formatAsset(quote.toAmount, receivedCode)}</h3>
                  </div>
                  <div className={`rounded-full px-3 py-1 text-xs font-black ${quoteExpired ? "bg-red-100 text-red-700" : "bg-white text-emerald-700"}`}>
                    {quoteCountdown}
                  </div>
                </div>
                <dl className="mt-5 grid gap-3 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-emerald-900/60">BRL amount</dt><dd className="font-black">{formatMoney(quote.fromAmount)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-emerald-900/60">Estimated received</dt><dd className="font-black">{formatAsset(quote.toAmount, receivedCode)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-emerald-900/60">Exchange rate</dt><dd className="font-black">{quote.exchangeRate}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-emerald-900/60">Fee</dt><dd className="font-black">{quote.fee || "0"}</dd></div>
                </dl>
                <button className="mt-5 w-full rounded-2xl bg-[#17251d] px-4 py-3 text-sm font-black text-white disabled:opacity-50" disabled={quoteExpired || Boolean(loading)} onClick={() => run("Creating PIX order", confirmQuoteAndCreatePix)}>
                  Confirm quote and generate PIX
                </button>
                {onboardingUrl && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                    <p className="font-bold">Fallback: a Etherfuse ainda exigiu concluir cadastro PIX/KYC hospedado para esta combinacao de customer/wallet.</p>
                    <a className="mt-3 inline-flex rounded-full bg-amber-300 px-4 py-2 text-xs font-black uppercase tracking-[0.12em] text-amber-950" href={onboardingUrl} target="_blank" rel="noreferrer">
                      Abrir cadastro PIX Etherfuse
                    </a>
                  </div>
                )}
                {programmaticOnboarding && !onboardingUrl && (
                  <div className="mt-4 rounded-2xl border border-lime-200 bg-lime-50 p-4 text-sm text-lime-950">
                    <p className="font-bold">KYC, wallet e conta PIX sandbox enviados programaticamente via API com dados mockados.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[2rem] bg-[#123026] p-5 text-white shadow-xl shadow-emerald-950/20 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">4. PIX payment screen</p>
                <h2 className="mt-1 text-2xl font-black">Etherfuse PIX checkout</h2>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white/70">{status}</span>
            </div>

            {!order ? (
              <div className="mt-8 rounded-3xl border border-dashed border-white/20 p-8 text-center text-sm text-white/60">
                Confirm a quote to generate PIX copy-and-paste code, key, QR code, and timeline.
              </div>
            ) : (
              <>
                <div className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr]">
                  <div className="rounded-3xl bg-white p-4">
                    {qrDataUrl ? <img src={qrDataUrl} alt="PIX QR Code" className="h-auto w-full" /> : <div className="grid aspect-square place-items-center rounded-2xl bg-stone-100 text-center text-xs font-bold text-stone-500">QR unavailable</div>}
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">Receiver</p>
                      <p className="mt-1 text-lg font-black">Etherfuse</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">Amount</p>
                      <p className="mt-1 text-lg font-black">{formatMoney(paymentInstructions.amount || order.fromAmount || amountBrl)}</p>
                    </div>
                    <div className="rounded-3xl bg-white/10 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">Expires in</p>
                      <p className="mt-1 text-lg font-black">{quoteCountdown}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-3xl bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">PIX copy-and-paste code / BR-Code</p>
                    <button className="rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-[#17251d]" onClick={() => run("Copying PIX code", copyPixCode)}>
                      {copied ? "Copied" : "Copy PIX code"}
                    </button>
                  </div>
                  <p className="mt-3 max-h-28 overflow-auto break-all rounded-2xl bg-white/10 p-3 font-mono text-xs text-white/80">{pixCode || "PIX code not returned yet"}</p>
                  <p className="mt-3 text-sm text-white/65">PIX key: <span className="font-mono text-white">{pixKey || "not returned"}</span></p>
                </div>

                <div className="mt-5 rounded-3xl bg-white/10 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-lime-200">Status timeline</p>
                  <div className="mt-4 space-y-3">
                    {timeline.map((item, index) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <span className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${item.done ? "bg-lime-300 text-[#17251d]" : item.active ? "bg-white text-[#17251d]" : "bg-white/10 text-white/45"}`}>{index + 1}</span>
                        <span className={item.done || item.active ? "font-bold text-white" : "text-white/45"}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {config?.sandbox && (
                  <button className="mt-5 w-full rounded-3xl border border-lime-200/50 bg-lime-200/10 px-5 py-4 text-sm font-black text-lime-100 transition hover:bg-lime-200/20 disabled:opacity-50" disabled={Boolean(loading) || isTerminalStatus(status)} onClick={() => run("Simulating PIX payment", simulatePixPayment)}>
                    Simulate PIX payment
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <AssetMovement title="On-ramp wallet assets" before={onRampBalancesBefore} after={onRampBalancesAfter} deltas={onRampAssetDeltas} walletPublicKey={walletPublicKey} />
          <AssetMovement title="Off-ramp wallet assets" before={offRampBalancesBefore} after={offRampBalancesAfter} deltas={offRampAssetDeltas} walletPublicKey={walletPublicKey} />
        </section>

        <section className="mt-5 grid gap-5 lg:grid-cols-2">
          <TemporaryEndpointCard
            title="On-ramp temporary endpoint"
            endpoint="POST /api/ramp/etherfuse/sandbox/test-onramp"
            description="Runs the whole sandbox on-ramp server-side and returns balances before, after, and delta."
            disabled={!canResolveWallet || Boolean(loading) || !config?.sandbox}
            hidden={!config?.sandbox}
            onRun={() => run("Running on-ramp temporary endpoint", runTemporaryEndpointTest)}
            result={temporaryTestResult ? {
              order_id: temporaryTestResult.transaction?.id,
              final_status: temporaryTestResult.final_transaction?.status,
              balance_delta: temporaryTestResult.balance_delta,
            } : null}
          />

          <div className="rounded-[2rem] bg-white p-5 shadow-xl shadow-stone-300/40 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Off-ramp test endpoint</p>
            <h2 className="mt-1 text-2xl font-black">TESOURO to PIX sandbox</h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              Endpoint shown in frontend: <span className="font-mono font-black text-stone-950">POST /api/ramp/etherfuse/sandbox/test-offramp</span>
            </p>
            <label className="mt-5 block text-sm font-bold text-stone-600">TESOURO amount to off-ramp</label>
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
        </section>

        {step === "success" && order && (
          <section className="mt-5 rounded-[2rem] bg-[#17251d] p-6 text-white shadow-2xl shadow-emerald-950/25 sm:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-lime-200">7. Success receipt</p>
            <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-4xl font-black">PIX payment confirmed</h2>
                <p className="mt-3 text-white/65">The sandbox PIX payment was detected and the Stellar asset delivery reached a completed status.</p>
              </div>
              <span className="rounded-full bg-lime-300 px-4 py-2 text-sm font-black text-[#17251d]">completed</span>
            </div>
            <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <ReceiptRow label="BRL amount paid" value={formatMoney(order.fromAmount || quote?.fromAmount || amountBrl)} />
              <ReceiptRow label="Asset received" value={formatAsset(order.toAmount || quote?.toAmount, receivedCode)} />
              <ReceiptRow label="Destination wallet" value={truncateKey(walletPublicKey)} />
              <ReceiptRow label="Order id" value={order.id} />
              <ReceiptRow label="Timestamp" value={new Date().toLocaleString("pt-BR")} />
              <ReceiptRow label="Network" value={config?.network || "Stellar Testnet"} />
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={walletPublicKey ? `/profile/${encodeURIComponent(walletPublicKey)}` : "/chat"} className="rounded-full bg-white px-4 py-2 text-sm font-black text-[#17251d]">View wallet</Link>
              <button className="rounded-full border border-white/20 px-4 py-2 text-sm font-black text-white" onClick={() => run("Copying receipt", copyReceipt)}>{receiptCopied ? "Receipt copied" : "Copy receipt"}</button>
              <button className="rounded-full border border-white/20 px-4 py-2 text-sm font-black text-white" onClick={newTransfer}>New transfer</button>
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

function AssetMovement({ title, before, after, deltas, walletPublicKey }: {
  title: string;
  before: BalanceItem[];
  after: BalanceItem[];
  deltas: BalanceDelta[];
  walletPublicKey: string;
}) {
  return (
    <div className="rounded-[2rem] bg-white p-5 shadow-xl shadow-stone-300/40 sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-700">Wallet assets changing</p>
      <h2 className="mt-1 text-2xl font-black">{title}</h2>
      <p className="mt-2 text-xs text-stone-500">Wallet: {truncateKey(walletPublicKey)}</p>
      <div className="mt-5 grid gap-3">
        {deltas.length === 0 ? (
          <div className="rounded-2xl bg-stone-100 p-4 text-sm font-bold text-stone-500">Run a quote/order or the temporary endpoint to capture asset movement.</div>
        ) : deltas.map((item) => {
          const deltaNumber = Number(item.delta || 0);
          return (
            <div key={`${item.asset_code}:${item.asset_issuer || "native"}`} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-stone-950">{item.asset_code}</p>
                  <p className="mt-1 break-all text-[11px] text-stone-400">{item.asset_issuer || "native"}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${deltaNumber > 0 ? "bg-emerald-100 text-emerald-700" : deltaNumber < 0 ? "bg-red-100 text-red-700" : "bg-stone-200 text-stone-600"}`}>
                  {deltaNumber > 0 ? "+" : ""}{item.delta}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-white p-3"><span className="text-stone-400">Before</span><p className="mt-1 font-black">{item.before}</p></div>
                <div className="rounded-xl bg-white p-3"><span className="text-stone-400">After</span><p className="mt-1 font-black">{item.after}</p></div>
              </div>
            </div>
          );
        })}
      </div>
      {before.length > 0 && after.length === 0 && (
        <p className="mt-4 text-xs font-bold text-stone-500">Before snapshot captured. After snapshot appears once polling reaches a terminal status.</p>
      )}
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
