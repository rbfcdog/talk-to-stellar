"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { LogIn, ShieldCheck, UserPlus } from "lucide-react"
import { clearClientSession, getClientSession, isClientSessionExpired } from "@/lib/session"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { TypingDots } from "@/components/shared/feedback"
import { useLanguage, type AppLanguage } from "@/lib/i18n"

type ValidationResult = {
  valid?: boolean
  payload?: any
  message?: string
  expired?: boolean
  expired_at?: string
}

function decodeJwtPayload(token: string): any {
  try {
    const payload = token.split(".")[1]
    if (!payload) return {}
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=")
    return JSON.parse(atob(padded))
  } catch {
    return {}
  }
}

function normalizeAssetCode(value?: string) {
  const code = String(value || "").toUpperCase().replace(/^USD$/, "USDC")
  if (code === "TESOURO") return "BRL"
  if (code === "EUR" || code === "EURC" || code === "EURO" || code === "EUROS") return "CETES"
  return code
}

function formatAmount(amount?: string, assetCode?: string) {
  const n = Number(String(amount || "").replace(",", "."))
  const code = normalizeAssetCode(assetCode || "USDC")
  if (!Number.isFinite(n)) return `${amount || ""} ${code}`.trim()
  if (code === "USDC") return `US$ ${n.toFixed(2)}`
  if (code === "BRL") return `R$ ${n.toFixed(2)}`
  if (code === "CETES") return `${n.toFixed(2)} CETES`
  if (code === "XLM") return `${n.toFixed(2)} XLM`
  return `${n.toFixed(2)} ${code}`
}

function getAutoConversionMessage(result?: any, language: AppLanguage = "en") {
  if (result?.autoConversion?.message) return String(result.autoConversion.message)
  const details = result?.transferDetails
  const sourceAsset = normalizeAssetCode(details?.sourceAssetCode)
  const destinationAsset = normalizeAssetCode(details?.destinationAssetCode)
  if (!sourceAsset || !destinationAsset || sourceAsset === destinationAsset) return ""
  return T(
    language,
    `Conversão automática concluída com a cotação atual: ${formatAmount(details?.sourceAmount, sourceAsset)} virou ${formatAmount(details?.destinationAmount, destinationAsset)} antes de receber.`,
    `Automatic conversion completed with the current quote: ${formatAmount(details?.sourceAmount, sourceAsset)} became ${formatAmount(details?.destinationAmount, destinationAsset)} before receiving.`
  )
}

function T(language: AppLanguage, pt: string, en: string) {
  return language === "pt-BR" ? pt : en
}

function formatTimestamp(value?: string, language: AppLanguage = "en") {
  const timestamp = value ? Date.parse(value) : NaN
  const locale = language === "pt-BR" ? "pt-BR" : "en-US"
  if (!Number.isFinite(timestamp)) return new Date().toLocaleString(locale)
  return new Date(timestamp).toLocaleString(locale)
}

export default function ClaimPaymentClient({ initialToken }: { initialToken?: string }) {
  const { language } = useLanguage()
  const [token, setToken] = useState(initialToken || "")
  const [sessionId, setSessionId] = useState("")
  const [sessionReady, setSessionReady] = useState<"unknown" | "checking" | "ready" | "missing_wallet" | "invalid">("unknown")
  const [validation, setValidation] = useState<ValidationResult>({})
  const [status, setStatus] = useState<"idle" | "claiming" | "done" | "error">("idle")
  const [result, setResult] = useState<any>(null)
  const [loginNotice, setLoginNotice] = useState("")
  const [autoClaimAttempted, setAutoClaimAttempted] = useState(false)
  const claimLockRef = useRef(false)

  useEffect(() => {
    const current = new URLSearchParams(window.location.search).get("token") || initialToken || ""
    setToken(current)
    if (isClientSessionExpired()) {
      clearClientSession()
      setLoginNotice(T(language, "Sua sessão expirou. Entre novamente para receber este pagamento.", "Your session expired. Sign in again to receive this payment."))
      setSessionId("")
      setSessionReady("invalid")
    } else {
      setLoginNotice("")
      getClientSession().then(({ sessionId: storedSessionId, authenticated }) => {
        setSessionId(storedSessionId)
        setSessionReady(storedSessionId && authenticated ? "checking" : "unknown")
      })
    }
    if (current) {
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [initialToken, language])

  useEffect(() => {
    async function validate() {
      if (!token) return
      const fallback = decodeJwtPayload(token)
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.valid) {
          setValidation({
            valid: false,
            payload: fallback,
            message: payload?.message || T(language, "Link inválido ou expirado.", "Invalid or expired link."),
          })
          return
        }
        setValidation(payload)
      } catch {
        setValidation({ valid: true, payload: fallback })
      }
    }
    validate()
  }, [token, language])

  useEffect(() => {
    if (status !== "done") return
    closeIntermediatePage()
  }, [status])

  useEffect(() => {
    let cancelled = false

    async function validateCurrentSessionForClaim() {
      if (!sessionId) {
        setSessionReady("unknown")
        return
      }

      setSessionReady("checking")
      try {
        const response = await fetch(`/api/agent/session/${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return

        const sessionPublicKey = String(payload?.public_key || "").trim()
        if (!response.ok || !sessionPublicKey) {
          clearClientSession()
          setSessionId("")
          setSessionReady(response.ok ? "missing_wallet" : "invalid")
          setLoginNotice(T(language, "Sua sessão atual não tem uma conta global ativa. Entre ou crie sua conta para receber este pagamento.", "Your current session does not have an active global account. Sign in or create your account to receive this payment."))
          return
        }

        setLoginNotice("")
        setSessionReady("ready")
      } catch {
        if (cancelled) return
        clearClientSession()
        setSessionId("")
        setSessionReady("invalid")
        setLoginNotice(T(language, "Não foi possível validar sua sessão atual. Entre novamente para receber este pagamento.", "Could not validate your current session. Sign in again to receive this payment."))
      }
    }

    void validateCurrentSessionForClaim()
    return () => {
      cancelled = true
    }
  }, [sessionId, language])

  async function claim() {
    if (!token || validation.valid === false || !sessionId) return
    if (claimLockRef.current) return
    claimLockRef.current = true
    setStatus("claiming")
    setResult(null)
    try {
      const response = await idempotentFetch("/api/external/pay-links/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          session_id: sessionId,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 401 && payload?.loginRequired) {
        clearClientSession()
        setSessionId("")
        setLoginNotice(payload?.message || T(language, "Entre novamente para receber este pagamento.", "Sign in again to receive this payment."))
      }
      setResult(payload)
      setStatus(response.ok && payload?.success ? "done" : "error")
      if (response.ok && payload?.success) {
        const receiptUrl = String(payload.receipt_url || "")
        const conversionMessage = getAutoConversionMessage(payload, language)
        enqueueWebChatFeedback([
          T(language, "Pagamento recebido com sucesso.", "Payment received successfully."),
          conversionMessage,
          `${T(language, "Valor", "Amount")}: ${formatAmount(String(payload.amount || payload.transferDetails?.destinationAmount || ""), String(payload.asset || payload.transferDetails?.destinationAssetCode || ""))}`,
          `${T(language, "Horário", "Time")}: ${formatTimestamp(payload.completed_at, language)}`,
          receiptUrl ? `${T(language, "Comprovante", "Receipt")}: ${receiptUrl}` : "",
        ].filter(Boolean).join("\n"))
      }
      if (!response.ok || !payload?.success) {
        claimLockRef.current = false
      }
    } catch (error) {
      claimLockRef.current = false
      setResult({
        success: false,
        message: error instanceof Error
          ? error.message
          : T(language, "Não foi possível receber este pagamento.", "Failed to receive payment."),
      })
      setStatus("error")
    }
  }

  const payload = validation.payload || decodeJwtPayload(token)
  const sourceAmountLabel = useMemo(
    () => formatAmount(payload.amount, payload.asset_code),
    [payload.amount, payload.asset_code]
  )
  const destinationAssetCode = normalizeAssetCode(payload.destination_asset_code || payload.asset_code || "USDC")
  const sourceAssetCode = normalizeAssetCode(payload.asset_code || "USDC")
  const isCrossAsset = destinationAssetCode !== sourceAssetCode
  const receiveLabel = isCrossAsset ? destinationAssetCode : sourceAmountLabel
  const recipientName = String(payload.recipient_name || T(language, "você", "you"))
  const senderName = String(payload.sender_name || T(language, "Alguém", "Someone"))
  const hasSessionCredentials = Boolean(sessionId)
  const loggedIn = Boolean(hasSessionCredentials && sessionReady === "ready")
  const nextPath = `/claim-payment?token=${encodeURIComponent(token)}`
  const localizedNextPath = `${nextPath}&lang=${encodeURIComponent(language)}`
  const createAccountPath = `/create-account?next=${encodeURIComponent(localizedNextPath)}&force_new=1&context=claim-payment&lang=${encodeURIComponent(language)}`
  const senderSessionId = String(payload.session_id || "").trim()
  const isSenderSession = Boolean(loggedIn && senderSessionId && sessionId === senderSessionId)
  const successAmount = String(result?.amount || result?.transferDetails?.destinationAmount || payload.amount || "")
  const successAsset = String(result?.asset || result?.transferDetails?.destinationAssetCode || destinationAssetCode || "")
  const successReceiptUrl = String(result?.receipt_url || "")
  const successAutoConversionMessage = getAutoConversionMessage(result, language)
  const isExpiredLink = Boolean(validation.valid === false && (validation as any)?.expired)

  useEffect(() => {
    if (autoClaimAttempted) return
    if (!token || validation.valid === false || isExpiredLink) return
    if (!loggedIn || isSenderSession) return
    setAutoClaimAttempted(true)
    void claim()
  }, [autoClaimAttempted, token, validation.valid, isExpiredLink, loggedIn, isSenderSession])

  function leaveSenderSession() {
    clearClientSession()
    setSessionId("")
    setStatus("idle")
    setResult(null)
    setAutoClaimAttempted(false)
  }

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10 sm:px-6">
        <section className="min-w-0 w-full overflow-hidden rounded-lg border border-tts-border bg-tts-deep/40 p-5 shadow-2xl sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-tts-confirm bg-tts-confirm/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.22em] text-tts-confirm">
            <ShieldCheck className="h-4 w-4" />
            {T(language, "Receber pagamento", "Receive Payment")}
          </div>

          <h1 className="mt-5 text-3xl font-semibold text-tts-surface md:text-5xl">
            {T(
              language,
              `${senderName} criou um link de ${sourceAmountLabel} para ${recipientName}`,
              `${senderName} created a ${sourceAmountLabel} link for ${recipientName}`
            )}
          </h1>
          <p className="mt-4 text-sm leading-6 text-tts-deep md:text-base">
            {T(
              language,
              `Você vai receber ${isCrossAsset ? `${formatAmount(payload.amount, payload.asset_code)} com crédito final em ${destinationAssetCode}` : sourceAmountLabel}. Para receber, entre ou crie sua conta global. Esse processo leva cerca de 2 minutos.`,
              `You will receive ${isCrossAsset ? `${formatAmount(payload.amount, payload.asset_code)} with final credit in ${destinationAssetCode}` : sourceAmountLabel}. To receive it, sign in or create your global account. This process takes about 2 minutes.`
            )}
            {isCrossAsset
              ? T(language, ` Você recebe em ${destinationAssetCode}.`, ` You receive in ${destinationAssetCode}.`)
              : T(language, " O dinheiro vai para a conta autenticada nesta página.", " The money is sent to the account authenticated on this page.")}
            {loggedIn && !isSenderSession
              ? T(language, " Assim que o login estiver válido, o crédito será processado automaticamente.", " As soon as the login is valid, the credit will be processed automatically.")
              : ""}
          </p>

          <div className="mt-6 rounded-lg border border-tts-border bg-tts-surface p-4 text-sm">
            <p className="text-tts-muted">{T(language, "Status do link", "Link status")}</p>
            {validation.valid === false ? (
              <p className="mt-1 text-tts-error">
                {isExpiredLink
                  ? `${T(language, "Link expirado.", "Expired link.")} ${validation.message || T(language, "Peça um novo link.", "Request a new link.")}`
                  : (validation.message || T(language, "Link inválido.", "Invalid link."))}
              </p>
            ) : (
              <p className="mt-1 text-tts-confirm">
                {T(language, "Link pronto. Próximo passo: entre ou crie uma conta para receber este valor.", "Link ready. Next step: sign in or create an account to receive this amount.")}
              </p>
            )}
          </div>

          {(!loggedIn || isSenderSession) && !isExpiredLink && (
            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
              {hasSessionCredentials && sessionReady === "checking" && (
                <p className="sm:col-span-2 rounded-lg border border-tts-border bg-tts-surface p-3 text-sm text-tts-deep">
                  {T(language, "Validando sua conta para recebimento...", "Validating your account for receipt...")}
                </p>
              )}
              {loginNotice && (
                <p className="sm:col-span-2 rounded-lg border border-tts-gold bg-tts-gold-bg p-3 text-sm text-tts-gold">
                  {loginNotice}
                </p>
              )}
              {isSenderSession && (
                <p className="sm:col-span-2 rounded-lg border border-tts-gold bg-tts-gold-bg p-3 text-sm text-tts-gold">
                  {T(language, "Este navegador está conectado na conta que criou o link. Para receber, entre ou crie a conta de destino.", "This browser is signed in to the account that created the link. To receive it, sign in or create the recipient account.")}
                </p>
              )}
              {isSenderSession && (
                <button
                  type="button"
                  onClick={leaveSenderSession}
                  className="sm:col-span-2 inline-flex items-center justify-center rounded-lg border border-tts-border bg-tts-surface px-4 py-3 text-sm font-semibold text-tts-surface transition hover:bg-tts-surface"
                >
                  {T(language, "Usar outra conta para receber", "Use another account to receive")}
                </button>
              )}
              <Link
                href={`/login?next=${encodeURIComponent(localizedNextPath)}&lang=${encodeURIComponent(language)}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-tts-gold px-4 py-3 text-sm font-semibold text-tts-deep transition hover:bg-tts-gold"
              >
                <LogIn className="h-4 w-4" />
                {T(language, "1) Entrar para receber", "1) Sign in to receive")}
              </Link>
              <Link
                href={createAccountPath}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-tts-border bg-tts-surface px-4 py-3 text-sm font-semibold text-tts-surface transition hover:bg-tts-surface"
              >
                <UserPlus className="h-4 w-4" />
                {T(language, "2) Criar conta para receber", "2) Create account to receive")}
              </Link>
            </div>
          )}

          {loggedIn && !isSenderSession && !isExpiredLink && (
            <div className="mt-5 space-y-3">
              <div className="rounded-lg border border-tts-confirm bg-tts-confirm/10 p-3 text-sm text-tts-confirm">
                {T(language, `Conta validada. Processando recebimento automático de ${receiveLabel}.`, `Account validated. Processing automatic receipt of ${receiveLabel}.`)}
              </div>
              <button
                type="button"
                onClick={leaveSenderSession}
                className="inline-flex w-full items-center justify-center rounded-lg border border-tts-border bg-tts-surface px-4 py-3 text-sm font-semibold text-tts-surface transition hover:bg-tts-surface"
              >
                {T(language, "Usar outra conta para receber", "Use another account to receive")}
              </button>
            </div>
          )}

          {status === "claiming" && (
            <div className="mt-5 inline-flex items-center gap-2 text-sm text-tts-deep">
              <TypingDots />
              {T(language, "Validando e creditando pagamento...", "Validating and crediting payment...")}
            </div>
          )}
          <AnimatePresence mode="wait">
          {status === "done" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 space-y-3 rounded-lg border border-tts-confirm bg-tts-confirm/10 p-4 text-sm text-tts-confirm">
              <p className="text-base font-semibold text-tts-confirm">{T(language, "Pagamento recebido com sucesso", "Payment received successfully")}</p>
              <div className="space-y-2 rounded-lg border border-tts-confirm bg-tts-deep/40 p-4">
                <p><span className="text-tts-deep">{T(language, "Valor", "Amount")}: </span>{formatAmount(successAmount, successAsset)}</p>
                <p><span className="text-tts-deep">{T(language, "Destino", "Destination")}: </span>{T(language, "Sua conta", "Your account")}</p>
                <p><span className="text-tts-deep">{T(language, "Horário", "Time")}: </span>{formatTimestamp(result?.completed_at, language)}</p>
              </div>
              {successReceiptUrl && (
                <a
                  href={successReceiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-lg bg-tts-confirm px-4 py-3 text-sm font-semibold text-tts-deep transition hover:bg-tts-confirm"
                >
                  {T(language, "Ver comprovante", "View receipt")}
                </a>
              )}
              {successAutoConversionMessage && (
                <p>{successAutoConversionMessage}</p>
              )}
              <p className="text-xs text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
            </motion.div>
          )}
          {status === "error" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 rounded-lg border border-tts-error bg-tts-error/10 p-4 text-sm text-tts-error">
              {result?.error || result?.message || T(language, "Não foi possível receber este pagamento.", "Could not receive this payment.")}
            </motion.div>
          )}
          </AnimatePresence>
        </section>
      </div>
    </main>
  )
}
