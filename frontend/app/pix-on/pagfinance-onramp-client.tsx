"use client";

/**
 * Slim Pix cash-in client (PagFinance-backed — provider name never shown).
 *
 * Steps: amount → customer (only when data is missing) → qr → done/expired.
 * The USDC estimate shown on the QR step is the value frozen at intent time
 * by the backend; the page never recomputes it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";
import { closeIntermediatePage, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback";
import { cpfDigits, formatCpf, isValidCpf } from "@/lib/cpf";

export interface CashinConfig {
  available: boolean;
  needs_customer_data?: boolean;
  min_brl_amount?: number;
  max_brl_amount?: number;
}

interface UsdcEstimate {
  gross?: number | null;
  fee?: number | null;
  net?: number | null;
  brl_per_usdc?: number | null;
}

interface IntentResponse {
  success: boolean;
  code?: string;
  message?: string;
  needs_customer_data?: boolean;
  operation_id?: string;
  intent_id?: string;
  br_code?: string;
  qr_code_image?: string | null;
  payment_link_url?: string | null;
  expires_in?: number;
  usdc_estimate?: UsdcEstimate;
  retry_after_ms?: number;
}

type Step = "amount" | "customer" | "qr" | "done" | "expired";

const POLL_INTERVAL_MS = 4_000;

export default function PagfinanceOnrampClient({
  initialQuery = "",
  config,
}: {
  initialQuery?: string;
  config: CashinConfig;
}) {
  const { language } = useLanguage();
  const L = useCallback((pt: string, en: string) => (language === "pt-BR" ? pt : en), [language]);
  const queryParams = useMemo(() => new URLSearchParams(initialQuery), [initialQuery]);
  const fromChat = queryParams.get("from") === "chat";

  const minAmount = config.min_brl_amount ?? 1;
  const maxAmount = config.max_brl_amount ?? 5000;

  const [step, setStep] = useState<Step>("amount");
  const [amountBrl, setAmountBrl] = useState(() => {
    const fromQuery = Number(queryParams.get("amount") || "");
    return Number.isFinite(fromQuery) && fromQuery > 0 ? String(fromQuery) : "50";
  });
  const [customerName, setCustomerName] = useState("");
  const [customerCpf, setCustomerCpf] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [expiresAtMs, setExpiresAtMs] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const autoStartedRef = useRef(false);
  const closedRef = useRef(false);

  const createIntent = useCallback(
    async (withCustomer: boolean) => {
      const amount = Number(amountBrl);
      if (!Number.isFinite(amount) || amount < minAmount || amount > maxAmount) {
        setError(
          L(
            `Informe um valor entre R$ ${minAmount} e R$ ${maxAmount}.`,
            `Enter an amount between R$ ${minAmount} and R$ ${maxAmount}.`,
          ),
        );
        return;
      }
      if (withCustomer) {
        if (!customerName.trim()) {
          setError(L("Informe seu nome completo.", "Enter your full name."));
          return;
        }
        if (!isValidCpf(customerCpf)) {
          setError(L("CPF inválido.", "Invalid CPF."));
          return;
        }
      }

      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/pagfinance/cashin/intent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amount_brl: Number(amountBrl),
            ...(withCustomer
              ? { customer_name: customerName.trim(), customer_tax_id: cpfDigits(customerCpf) }
              : {}),
            ...(queryParams.get("provider") ? { provider: queryParams.get("provider") } : {}),
            ...(queryParams.get("provider_user_id")
              ? { provider_user_id: queryParams.get("provider_user_id") }
              : {}),
            ...(queryParams.get("session_scope")
              ? { session_scope: queryParams.get("session_scope") }
              : {}),
            ...(queryParams.get("lang") ? { lang: queryParams.get("lang") } : {}),
          }),
        });
        const payload: IntentResponse = await response.json().catch(() => ({ success: false }));

        if (response.status === 422 && payload.needs_customer_data) {
          setStep("customer");
          return;
        }
        if (!response.ok || !payload.success) {
          setError(
            payload.message ||
              L("Não foi possível gerar o PIX agora. Tente de novo.", "Could not create the PIX charge. Try again."),
          );
          return;
        }
        setIntent(payload);
        setExpiresAtMs(Date.now() + (payload.expires_in ?? 900) * 1000);
        setImageFailed(false);
        setStep("qr");
      } catch {
        setError(L("Falha de conexão. Tente de novo.", "Connection failed. Try again."));
      } finally {
        setLoading(false);
      }
    },
    [amountBrl, customerCpf, customerName, L, maxAmount, minAmount, queryParams],
  );

  // Agent deep-link: ?amount=50&autostart=1 goes straight to the QR when no
  // customer data is missing (never auto-advances past a data-entry step).
  useEffect(() => {
    if (autoStartedRef.current) return;
    if (queryParams.get("autostart") !== "1") return;
    if (config.needs_customer_data) return;
    autoStartedRef.current = true;
    void createIntent(false);
  }, [config.needs_customer_data, createIntent, queryParams]);

  // Countdown for the active charge.
  useEffect(() => {
    if (step !== "qr" || !expiresAtMs) return;
    const tick = () => {
      const left = Math.max(0, Math.round((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) setStep("expired");
    };
    tick();
    const interval = window.setInterval(tick, 1_000);
    return () => window.clearInterval(interval);
  }, [expiresAtMs, step]);

  // Status poll while the QR is on screen.
  useEffect(() => {
    if (step !== "qr" || !intent?.intent_id) return;
    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/pagfinance/cashin/intent/${encodeURIComponent(intent.intent_id || "")}`);
        const payload = await response.json().catch(() => null);
        if (cancelled || !payload?.success) return;
        if (payload.status === "COMPLETED") setStep("done");
        else if (payload.status === "EXPIRED") setStep("expired");
      } catch {
        // transient poll failure — keep trying until expiry
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [intent, step]);

  // Completion: hand control back to the chat.
  useEffect(() => {
    if (step !== "done" || closedRef.current) return;
    closedRef.current = true;
    if (fromChat) closeIntermediatePage();
  }, [fromChat, step]);

  const copyBrCode = useCallback(async () => {
    if (!intent?.br_code) return;
    try {
      await navigator.clipboard.writeText(intent.br_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError(L("Não foi possível copiar. Selecione o código manualmente.", "Could not copy. Select the code manually."));
    }
  }, [intent, L]);

  const restart = useCallback(() => {
    setIntent(null);
    setError("");
    setStep("amount");
  }, []);

  const usdcNet = intent?.usdc_estimate?.net;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <main className="min-h-screen bg-tts-bg px-4 py-10" data-testid="pagfinance-onramp">
      <div className="mx-auto w-full max-w-md rounded-xl border border-tts-border bg-tts-surface p-6">
        <p className="mb-6 text-[9px] font-bold uppercase tracking-[0.12em] text-tts-muted">
          {L("Adicionar dinheiro · PIX", "Add money · PIX")}
        </p>

        {step === "amount" && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold tracking-tight text-tts-deep">
              {L("Quanto você quer adicionar?", "How much do you want to add?")}
            </h1>
            <label className="block">
              <span className="mb-1 block text-sm text-tts-muted">{L("Valor em reais", "Amount in BRL")}</span>
              <input
                inputMode="decimal"
                value={amountBrl}
                onChange={(event) => setAmountBrl(event.target.value.replace(/[^\d.,]/g, ""))}
                className="font-mono-financial w-full rounded-lg border border-tts-border bg-tts-bg px-3 py-2 text-lg text-tts-deep outline-none focus:border-tts-gold"
                aria-label={L("Valor em reais", "Amount in BRL")}
              />
            </label>
            {error && <p className="text-sm text-tts-error">{error}</p>}
            <Button className="w-full" disabled={loading} onClick={() => void createIntent(false)}>
              {loading ? L("Gerando…", "Creating…") : L("Continuar", "Continue")}
            </Button>
          </div>
        )}

        {step === "customer" && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold tracking-tight text-tts-deep">
              {L("Só falta identificar o pagador", "One step: identify the payer")}
            </h1>
            <label className="block">
              <span className="mb-1 block text-sm text-tts-muted">{L("Nome completo", "Full name")}</span>
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className="w-full rounded-lg border border-tts-border bg-tts-bg px-3 py-2 text-tts-deep outline-none focus:border-tts-gold"
                aria-label={L("Nome completo", "Full name")}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-tts-muted">CPF</span>
              <input
                inputMode="numeric"
                value={formatCpf(customerCpf)}
                onChange={(event) => setCustomerCpf(cpfDigits(event.target.value))}
                className="font-mono-financial w-full rounded-lg border border-tts-border bg-tts-bg px-3 py-2 text-tts-deep outline-none focus:border-tts-gold"
                aria-label="CPF"
              />
            </label>
            {error && <p className="text-sm text-tts-error">{error}</p>}
            <Button className="w-full" disabled={loading} onClick={() => void createIntent(true)}>
              {loading ? L("Gerando…", "Creating…") : L("Continuar", "Continue")}
            </Button>
          </div>
        )}

        {step === "qr" && intent && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold tracking-tight text-tts-deep">
              {L("Pague com PIX", "Pay with PIX")}
            </h1>
            <div className="rounded-lg border border-tts-border bg-tts-bg p-3 text-center">
              {intent.qr_code_image && !imageFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={intent.qr_code_image}
                  alt={L("QR Code PIX", "PIX QR Code")}
                  className="mx-auto h-52 w-52"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <p className="break-all p-2 text-left text-xs text-tts-muted">{intent.br_code}</p>
              )}
              <p className="mt-2 text-sm text-tts-muted">
                {L("Expira em", "Expires in")}{" "}
                <span className="font-mono-financial text-tts-deep">{minutes}:{seconds}</span>
              </p>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-tts-border bg-tts-bg px-3 py-2">
              <span className="text-sm text-tts-muted">{L("Você recebe", "You receive")}</span>
              <span className="font-mono-financial text-tts-gold">
                {usdcNet != null ? `≈ ${Number(usdcNet).toFixed(2)} USDC` : "—"}
              </span>
            </div>
            <Button className="w-full" variant="outline" onClick={() => void copyBrCode()}>
              {copied ? L("Copiado ✓", "Copied ✓") : L("Copiar código PIX", "Copy PIX code")}
            </Button>
            {intent.payment_link_url && (
              <a
                href={intent.payment_link_url}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-sm text-tts-muted underline"
              >
                {L("Abrir link de pagamento", "Open payment link")}
              </a>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-bold tracking-tight text-tts-confirm">
              ✅ {L("Pagamento concluído", "Payment completed")}
            </h1>
            {fromChat ? (
              <p className="text-sm text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
            ) : (
              <p className="text-sm text-tts-muted">
                {L("Seu saldo será atualizado em instantes.", "Your balance will update in a moment.")}
              </p>
            )}
          </div>
        )}

        {step === "expired" && (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-bold tracking-tight text-tts-deep">
              {L("Código expirado", "Code expired")}
            </h1>
            <p className="text-sm text-tts-muted">
              {L("O código PIX venceu sem pagamento.", "The PIX code expired without a payment.")}
            </p>
            <Button className="w-full" onClick={restart}>
              {L("Gerar novo código", "Create a new code")}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
