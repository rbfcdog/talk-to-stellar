"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { startAuthentication } from "@simplewebauthn/browser"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { Spinner, TypingDots } from "@/components/shared/feedback"
import { OperationProgressPanel, type OperationProgressStatus } from "@/components/ui/operation-progress"
import { SecureLinkState } from "@/components/shared/secure-link-state"
import { normalizeLanguage, useLanguage, type AppLanguage } from "@/lib/i18n"
import { mapPublicError } from "@/lib/public-errors"
import { resolveReturnTarget } from "@/lib/return-target"
import { decodeJwtPayload } from "@/lib/jwt"

type ValidationResult = {
  success?: boolean
  valid?: boolean
  payload?: any
  message?: string
  expired?: boolean
  expired_at?: string
}

type ConfirmResponse = {
  success: boolean
  tx_hash?: string
  asset?: string
  completed_at?: string
  receipt_url?: string
  paymentConfirmed?: boolean
  sessionId?: string
  userId?: string
  destination?: string
  destinationName?: string
  amount?: string
  assetCode?: string
  hash?: string
  transferDetails?: {
    sourceAmount?: string
    sourceAssetCode?: string
    destinationAmount?: string
    destinationAssetCode?: string
    feeXlm?: string
    feeDisplay?: string
    feeUsdc?: string
    feeBrl?: string
    platformFeeDisplay?: string
    totalFeeDisplay?: string
    exact?: boolean
  }
  autoConversion?: {
    sourceAmount?: string
    sourceAssetCode?: string
    destinationAmount?: string
    destinationAssetCode?: string
    message?: string
  } | null
  monthly_savings?: {
    period?: string
    estimated_savings_brl?: string
    estimated_traditional_fee_brl?: string
    actual_fee_brl?: string
    savings_percentage?: string
    comparison_method?: string
    message?: string
  } | null
  receiptImageDataUrl?: string
  message?: string
  error?: string
}

function T(language: AppLanguage, pt: string, en: string) {
  return language === "pt-BR" ? pt : en
}

function isPublicAccountKey(value?: string) {
  return /^G[A-Z2-7]{55}$/i.test(String(value || "").trim())
}

function formatTimestamp(value?: string, language: AppLanguage = "en") {
  const timestamp = value ? Date.parse(value) : NaN
  const locale = language === "pt-BR" ? "pt-BR" : "en-US"
  if (!Number.isFinite(timestamp)) return new Date().toLocaleString(locale)
  return new Date(timestamp).toLocaleString(locale)
}

function normalizeAssetCode(value?: string) {
  const code = String(value || "").toUpperCase().replace(/^USD$/, "USDC")
  if (code === "TESOURO") return "BRL"
  if (code === "EUR" || code === "EURC") return "CETES"
  return code
}

function formatPaymentAmount(amount?: string, assetCode?: string) {
  if (!String(amount || "").trim()) return "Amount unavailable"
  const code = normalizeAssetCode(assetCode)
  const n = Number(String(amount || "").replace(",", "."))
  if (!Number.isFinite(n)) return "Amount unavailable"
  const truncated = Math.trunc(n * 100) / 100
  if (code === "BRL") return `R$ ${truncated.toFixed(2)}`
  if (code === "USDC") return `US$ ${truncated.toFixed(2)}`
  if (code === "CETES") return `${truncated.toFixed(2)} CETES`
  if (code === "XLM") return `${truncated.toFixed(2)} XLM`
  return `${truncated.toFixed(2)} ${code}`
}

function formatRecipientLabel(payload: any, language: AppLanguage = "en") {
  const candidate = String(
    payload?.destination_name ||
    payload?.destinationName ||
    payload?.recipient_name ||
    payload?.recipientName ||
    payload?.destination_contact?.contact_name ||
    payload?.destination_contact?.name ||
    payload?.destination_contact?.email ||
    payload?.destination_contact?.phone_number ||
    payload?.destination_contact?.phone ||
    ''
  ).trim()

  const fallback = formatRecipientKey(payload)
  const weakLabel = /^(o|a|ao|aos|as|para|pra|pro|destinatario|recipient)$/i.test(candidate)
  if (isPublicAccountKey(candidate)) return fallback || T(language, 'Destinatário', 'Recipient')
  if (candidate && !weakLabel) return candidate
  return fallback || T(language, 'Destinatário', 'Recipient')
}

function formatRecipientKey(payload: any) {
  const candidate = String(
    payload?.destination_key ||
    payload?.destinationKey ||
    payload?.destination_display_key ||
    payload?.recipient_key ||
    payload?.recipientKey ||
    payload?.destination_contact?.email ||
    payload?.destination_contact?.pix_key ||
    payload?.destination_contact?.phone_number ||
    payload?.destination_contact?.phone ||
    payload?.destination_contact?.cpf ||
    ""
  ).trim()

  return candidate && !isPublicAccountKey(candidate) ? candidate : ""
}

function getProviderLabel(provider?: string) {
  const normalized = String(provider || "").trim().toLowerCase()
  if (normalized === "telegram") return "Telegram"
  if (normalized === "whatsapp" || normalized === "phone") return "WhatsApp"
  return normalized ? normalized : ""
}

function getPasskeyErrorMessage(error: any): string {
  const name = String(error?.name || "")
  const message = String(error?.message || error || "")
  const normalized = message.toLowerCase()

  if (name === "NotAllowedError") {
    return "A confirmação expirou ou foi cancelada. Use o PIN para confirmar."
  }
  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "Não consegui validar a Passkey neste domínio. Use o PIN para confirmar."
  }
  if (normalized.includes("registrationrequired")) {
    return "Não há Passkey cadastrada nesta conta. Use o PIN para confirmar."
  }

  return message || "Não consegui confirmar com Passkey. Use o PIN para confirmar."
}

function publicPaymentErrorMessage(error: unknown, language: AppLanguage) {
  return mapPublicError(error, language).message
}

function isPasskeyChallengeExpiredMessage(message?: string) {
  const normalized = String(message || "").toLowerCase()
  return (
    normalized.includes("passkey challenge expired") ||
    normalized.includes("challenge expired") ||
    normalized.includes("desafio expirada") ||
    normalized.includes("desafio expirado")
  )
}

const PASSKEY_CONFIRMATION_ENABLED = process.env.NEXT_PUBLIC_PASSKEY_ENABLED !== "false"

export default function ConfirmPaymentClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const searchParams = useSearchParams()
  const { language } = useLanguage()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const requestedAuthMethod = useMemo(() => (
    PASSKEY_CONFIRMATION_ENABLED ? String(searchParams.get("auth") || "").trim().toLowerCase() : ""
  ), [searchParams])
  const publicKeyFromUrl = useMemo(() => searchParams.get("public_key") || searchParams.get("destination_public_key") || '', [searchParams])

  const [token, setToken] = useState(tokenFromUrl)
  const [publicKey, setPublicKey] = useState(publicKeyFromUrl)
  const [completionProvider] = useState(() => String(searchParams.get("provider") || decodeJwtPayload(tokenFromUrl)?.provider || "").trim().toLowerCase())
  const [completionProviderUserId] = useState(() => String(searchParams.get("provider_user_id") || decodeJwtPayload(tokenFromUrl)?.provider_user_id || "").trim())
  const [completionSource] = useState(() => String(searchParams.get("source") || decodeJwtPayload(tokenFromUrl)?.source || completionProvider || "").trim().toLowerCase())
  const [queryReturnTo] = useState(() => String(searchParams.get("return_to") || searchParams.get("returnTo") || "").trim())
  const [queryReturnSource] = useState(() => String(searchParams.get("from") || searchParams.get("origin") || "").trim())
  const [status, setStatus] = useState("ready")
  const [result, setResult] = useState<ConfirmResponse | null>(null)
  const [pin, setPin] = useState("")
  const [showPasskeyOptions, setShowPasskeyOptions] = useState(false)
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "starting" | "authenticating" | "submitting" | "error">("idle")
  const [passkeyError, setPasskeyError] = useState("")
  const [qrTargetUrl, setQrTargetUrl] = useState("")
  const [mobileSyncStatus, setMobileSyncStatus] = useState("")
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null)
  const [progressNow, setProgressNow] = useState(Date.now())
  const [validation, setValidation] = useState<ValidationResult>(initialValidation || {})
  const submitLockRef = useRef(false)
  const passkeyAutoTriggerRef = useRef(false)
  const urlScrubbedRef = useRef(false)
  const feedbackLanguage = useMemo(
    () => normalizeLanguage(
      searchParams.get("lang") ||
      searchParams.get("language") ||
      validation?.payload?.language ||
      validation?.payload?.lang ||
      decodeJwtPayload(token)?.language ||
      language
    ),
    [searchParams, validation?.payload, token, language]
  )
  const hasExplicitReturnTarget = useMemo(
    () => Boolean(String(validation?.payload?.return_to || validation?.payload?.returnTo || queryReturnTo || "").trim()),
    [validation?.payload, queryReturnTo]
  )

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
      // Preserve account identifier from URL before we strip query params for privacy
      if (publicKeyFromUrl) setPublicKey(publicKeyFromUrl)
      // remove token/query from URL to avoid leaking it in history/referrers
      if (typeof window !== "undefined" && !urlScrubbedRef.current) {
        try {
          window.history.replaceState(null, "", window.location.pathname)
          urlScrubbedRef.current = true
        } catch {
          // ignore
        }
      }
    }
  }, [tokenFromUrl, publicKeyFromUrl])

  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setValidation({
          success: false,
          valid: false,
          message: T(feedbackLanguage, "Link inválido ou expirado.", "Invalid or expired link."),
        })
        return
      }
      const fallbackPayload = decodeJwtPayload(token)
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`)
        const payload = await response.json().catch(() => ({}))
        if (response.status === 409 && payload?.processing) {
          setValidation({
            success: true,
            valid: true,
            payload: payload?.payload || fallbackPayload,
            message: T(feedbackLanguage, "Confirmação em andamento...", "Confirmation in progress..."),
          })
          setMobileSyncStatus(T(feedbackLanguage, "Confirmação em andamento...", "Confirmation in progress..."))
          return
        }
        if (!response.ok || !payload?.valid) {
          setValidation({
            success: false,
            valid: false,
            message: publicPaymentErrorMessage(payload?.message || "Invalid or expired link.", feedbackLanguage),
            expired: Boolean(payload?.used || payload?.expired),
            expired_at: payload?.expired_at,
          })
          return
        }
        setMobileSyncStatus("")
        setValidation(payload?.payload ? payload : { success: true, valid: true, payload: fallbackPayload })
      } catch {
        setValidation({
          success: false,
          valid: false,
          message: T(feedbackLanguage, "Não foi possível validar este link. Peça um novo link para continuar.", "Could not validate this link. Request a new link to continue."),
        })
      }
    }

    validateToken()
  }, [token, feedbackLanguage])

  useEffect(() => {
    if (!token || status === "done") return

    let cancelled = false
    const poll = async () => {
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return

        if (response.status === 409 && payload?.processing) {
          setMobileSyncStatus(T(feedbackLanguage, "Confirmação em andamento...", "Confirmation in progress..."))
          return
        }

        if (response.status === 409 && payload?.used) {
          submitLockRef.current = true
          setValidation({
            success: false,
            valid: false,
            message: publicPaymentErrorMessage(payload?.message || "Invalid or expired link.", feedbackLanguage),
            expired: true,
          })
          setStatus("error")
          setMobileSyncStatus("")
          return
        }

        if (response.ok) {
          setMobileSyncStatus("")
        }
      } catch {
        // ignore polling errors
      }
    }

    const timer = window.setInterval(poll, 2500)
    void poll()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [token, status, feedbackLanguage, validation?.payload])

  useEffect(() => {
    if (status !== "done") return
    if (hasExplicitReturnTarget) return
    closeIntermediatePage()
  }, [hasExplicitReturnTarget, status])

  useEffect(() => {
    if (status === "ready") {
      setProgressStartedAt(null)
      setProgressNow(Date.now())
      return
    }
    if (status !== "submitting") return
    const startedAt = Date.now()
    setProgressStartedAt((current) => current || startedAt)
    setProgressNow(startedAt)
    const timer = window.setInterval(() => setProgressNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [status])

  const mobileRedirectUrl = useMemo(() => {
    if (!PASSKEY_CONFIRMATION_ENABLED) return ""
    if (!token || typeof window === "undefined") return ""
    const url = new URL(`${window.location.origin}/confirm-payment`)
    url.searchParams.set("token", token)
    const destinationKey = String(publicKey || publicKeyFromUrl || "").trim()
    if (destinationKey) url.searchParams.set("public_key", destinationKey)
    if (completionProvider) url.searchParams.set("provider", completionProvider)
    if (completionProviderUserId) url.searchParams.set("provider_user_id", completionProviderUserId)
    if (completionSource) url.searchParams.set("source", completionSource)
    url.searchParams.set("auth", "passkey")
    return url.toString()
  }, [token, publicKey, publicKeyFromUrl, completionProvider, completionProviderUserId, completionSource])
  const qrImageUrl = useMemo(() => {
    if (!qrTargetUrl) return ""
    return `https://quickchart.io/qr?size=320&margin=2&ecLevel=Q&format=png&text=${encodeURIComponent(qrTargetUrl)}`
  }, [qrTargetUrl])

  useEffect(() => {
    if (!PASSKEY_CONFIRMATION_ENABLED) {
      setQrTargetUrl("")
      return
    }
    let cancelled = false
    async function prepareQrTarget() {
      if (!mobileRedirectUrl) {
        setQrTargetUrl("")
        return
      }
      const tokenPayload = validation?.payload || decodeJwtPayload(token)
      try {
        const response = await fetch("/api/external/short-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: mobileRedirectUrl,
            purpose: "confirm_payment_passkey_qr",
            session_id: String(tokenPayload?.session_id || tokenPayload?.sessionId || "").trim() || undefined,
            user_id: String(tokenPayload?.owner_id || tokenPayload?.ownerId || tokenPayload?.user_id || tokenPayload?.userId || "").trim() || undefined,
            expires_in_minutes: 15,
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok && payload?.url) {
          setQrTargetUrl(String(payload.url))
          return
        }
        setQrTargetUrl(mobileRedirectUrl)
      } catch {
        if (!cancelled) setQrTargetUrl(mobileRedirectUrl)
      }
    }

    void prepareQrTarget()
    return () => {
      cancelled = true
    }
  }, [mobileRedirectUrl, token, validation?.payload])

  useEffect(() => {
    if (!PASSKEY_CONFIRMATION_ENABLED) return
    if (requestedAuthMethod !== "passkey") return
    if (passkeyAutoTriggerRef.current) return
    if (!token.trim()) return
    if (validation?.valid !== true) return
    if (status === "done" || submitLockRef.current) return
    passkeyAutoTriggerRef.current = true
    setShowPasskeyOptions(true)
    void handlePasskeyConfirm()
  }, [requestedAuthMethod, token, validation?.valid, status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token.trim() || !pin.trim() || validation?.valid === false) return
    if (submitLockRef.current) return
    submitLockRef.current = true
    setStatus("submitting")
    setResult(null)

    try {
      const response = await idempotentFetch(`/api/external/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          public_key: publicKey || publicKeyFromUrl || undefined,
          pin,
          ...(completionProvider ? { provider: completionProvider, external_provider: completionProvider } : {}),
          ...(completionProviderUserId ? { provider_user_id: completionProviderUserId, external_provider_user_id: completionProviderUserId } : {}),
          ...(completionSource ? { source: completionSource } : {}),
        }),
      })

      const payload = (await response.json()) as ConfirmResponse
      setResult(response.ok && payload?.success
        ? payload
        : {
          ...payload,
          success: false,
          error: publicPaymentErrorMessage(payload?.message || payload?.error || "Failed to confirm payment", feedbackLanguage),
        })
      setStatus(response.ok && payload?.success ? "done" : "error")

      if (!response.ok || !payload?.success) {
        submitLockRef.current = false
      }

      // On success, ensure token is removed from URL (double-safety)
      if (response.ok && typeof window !== "undefined") {
        try {
          window.history.replaceState(null, "", window.location.pathname)
        } catch {
          // ignore
        }
      }
    } catch (error) {
      submitLockRef.current = false
      const message = publicPaymentErrorMessage(error instanceof Error ? error.message : "Failed to confirm payment", feedbackLanguage)
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  async function handlePasskeyConfirm(attempt = 0) {
    if (!token.trim() || validation?.valid === false || submitLockRef.current || status === "done") return
    if (!window.PublicKeyCredential) {
      setPasskeyStatus("error")
      setPasskeyError("Este navegador não suporta Passkey. Use o PIN para confirmar.")
      return
    }

    setPasskeyError("")
    setPasskeyStatus("starting")
    setStatus("submitting")
    setResult(null)
    submitLockRef.current = true

    try {
      const initResponse = await fetch("/api/passkeys/auth-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          public_key: publicKey || publicKeyFromUrl || undefined,
        }),
      })
      const initPayload = await initResponse.json().catch(() => ({}))
      if (!initResponse.ok || !initPayload?.success) {
        throw new Error(initPayload?.message || "Não consegui iniciar a confirmação com Passkey.")
      }
      if (initPayload?.registrationRequired) {
        throw new Error("registrationRequired")
      }

      setPasskeyStatus("authenticating")
      const credential = await startAuthentication({ optionsJSON: initPayload.options })

      setPasskeyStatus("submitting")
      const response = await idempotentFetch(`/api/external/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          public_key: publicKey || publicKeyFromUrl || undefined,
          passkey_challenge_id: initPayload.challengeId,
          passkey_credential: credential,
          ...(completionProvider ? { provider: completionProvider, external_provider: completionProvider } : {}),
          ...(completionProviderUserId ? { provider_user_id: completionProviderUserId, external_provider_user_id: completionProviderUserId } : {}),
          ...(completionSource ? { source: completionSource } : {}),
        }),
      })

      const payload = (await response.json()) as ConfirmResponse
      setResult(response.ok && payload?.success
        ? payload
        : {
          ...payload,
          success: false,
          error: publicPaymentErrorMessage(payload?.message || payload?.error || "Failed to confirm payment", feedbackLanguage),
        })
      setStatus(response.ok && payload?.success ? "done" : "error")

      if (response.ok && payload?.success) {
        setMobileSyncStatus("")
        setPasskeyStatus("idle")
      } else {
        const serverMessage = String(payload?.message || payload?.error || "")
        if (attempt < 1 && isPasskeyChallengeExpiredMessage(serverMessage)) {
          submitLockRef.current = false
          setMobileSyncStatus("A confirmação expirou. Gerando uma nova confirmação...")
          setPasskeyStatus("starting")
          await handlePasskeyConfirm(attempt + 1)
          return
        }
        submitLockRef.current = false
        setPasskeyStatus("error")
        setPasskeyError(publicPaymentErrorMessage(serverMessage || "Failed to confirm with Passkey.", feedbackLanguage))
      }
    } catch (error: any) {
      const message = getPasskeyErrorMessage(error)
      if (attempt < 1 && isPasskeyChallengeExpiredMessage(message)) {
        submitLockRef.current = false
        setMobileSyncStatus("A confirmação expirou. Gerando uma nova confirmação...")
        setPasskeyStatus("starting")
        await handlePasskeyConfirm(attempt + 1)
        return
      }
      submitLockRef.current = false
      setStatus("error")
      setPasskeyStatus("error")
      setPasskeyError(message)
      setResult({
        success: false,
        error: publicPaymentErrorMessage(message, feedbackLanguage),
      })
    }
  }

  if (!token.trim() || validation?.valid !== true) {
    const state = validation?.valid === false ? "expired" : "checking"
    return (
      <SecureLinkState
        language={feedbackLanguage}
        state={state}
        message={validation?.valid === false ? validation.message : undefined}
      />
    )
  }

  const payload = validation?.payload || {}
  const externalProvider = String(searchParams.get("provider") || payload.provider || payload.source || "").trim().toLowerCase()
  const providerLabel = getProviderLabel(externalProvider)
  const returnMessage = providerLabel ? `Completed. Return to ${providerLabel} to continue.` : ""
  const returnTarget = resolveReturnTarget({
    language: feedbackLanguage,
    returnTo: payload.return_to || payload.returnTo || queryReturnTo,
    source: payload.return_source || payload.returnSource || payload.from || queryReturnSource || payload.source || completionSource || externalProvider,
    fallbackSource: externalProvider || "chat",
  })
  const assetCode = normalizeAssetCode(payload.asset_code || payload.assetCode || "")
  const amountLabel = formatPaymentAmount(payload.amount, assetCode)
  const sourceAssetCode = normalizeAssetCode(payload.source_asset_code || payload.quote?.sourceAsset?.code || "")
  const sourceAmount = String(payload.source_amount || payload.quote?.sourceAmount || "")
  const sourceAmountLabel = sourceAmount && sourceAssetCode ? formatPaymentAmount(sourceAmount, sourceAssetCode) : ""
  const isCrossCurrency = Boolean(sourceAmountLabel && sourceAssetCode && sourceAssetCode !== assetCode)
  const destinationLabel = formatRecipientLabel(payload, feedbackLanguage)
  const destinationKeyLabel = formatRecipientKey(payload)
  const currentStep = status === "submitting" ? 2 : status === "done" ? 3 : 1
  const progressStatus = (status === "submitting" || status === "done" || status === "error" ? status : "ready") as OperationProgressStatus
  const progressElapsedSeconds = progressStartedAt ? Math.max(0, Math.floor((progressNow - progressStartedAt) / 1000)) : 0
  const paymentProgressSteps = [
    {
      label: T(feedbackLanguage, "PIN validado", "PIN validated"),
      detail: T(feedbackLanguage, "O backend confere a autorização antes de movimentar saldo.", "The backend checks authorization before moving funds."),
    },
    {
      label: T(feedbackLanguage, "Transação preparada", "Transaction prepared"),
      detail: T(feedbackLanguage, "A rota, saldo e destinatário são revalidados.", "Route, balance and recipient are revalidated."),
    },
    {
      label: T(feedbackLanguage, "Envio na Stellar", "Stellar submission"),
      detail: T(feedbackLanguage, "A operação é assinada e enviada para a rede.", "The operation is signed and submitted to the network."),
    },
    {
      label: T(feedbackLanguage, "Conclusão", "Completion"),
      detail: T(feedbackLanguage, "A mensagem final é enviada ao canal de origem.", "The final message is sent to the origin channel."),
    },
  ]
  const successAmount = String(result?.amount || result?.transferDetails?.destinationAmount || payload.amount || "")
  const successAsset = String(result?.asset || result?.assetCode || result?.transferDetails?.destinationAssetCode || assetCode || "")
  const successDestinationKey = formatRecipientKey(result) || destinationKeyLabel
  const visibleError = result?.error || result?.message
    ? publicPaymentErrorMessage(result?.error || result?.message, feedbackLanguage)
    : T(feedbackLanguage, "Não consegui confirmar esse pagamento agora. Tente novamente em alguns segundos.", "I could not confirm this payment right now. Try again in a few seconds.")
  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl items-start px-4 py-3 sm:px-6 sm:py-10">
        <div className="grid min-w-0 w-full gap-4 overflow-hidden rounded-2xl border border-tts-border bg-tts-surface p-4 shadow-sm backdrop-blur md:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] md:gap-6 md:p-8">
          <section className="min-w-0 space-y-3 overflow-hidden md:space-y-5">
            <div className="inline-flex rounded-full border border-tts-confirm bg-tts-confirm/10 px-4 py-1 text-xs font-medium uppercase tracking-normal text-tts-confirm">
              {T(feedbackLanguage, "Confirmação de pagamento", "Payment Confirmation")}
            </div>
            <div className="space-y-2 md:space-y-4">
	              <h1 className="max-w-xl text-2xl font-bold tracking-normal text-tts-deep md:text-3xl">
	                {T(feedbackLanguage, "Confirmar pagamento", "Confirm payment")}
              </h1>
              <p className="tts-mobile-soft-hide max-w-2xl text-sm leading-6 text-tts-muted md:block">
                {T(feedbackLanguage, "Confira os dados abaixo e digite seu PIN para autorizar a transferência.", "Check the details below and enter your PIN to authorize the transfer.")}
              </p>
            </div>
            <div className="tts-stage-strip grid-cols-3 text-xs">
              {[
                T(feedbackLanguage, "Conferir", "Check"),
                T(feedbackLanguage, "Autorizar", "Authorize"),
                T(feedbackLanguage, "Concluir", "Complete"),
              ].map((step, index) => {
                const active = currentStep >= index + 1
                return (
                  <motion.div
                    key={step}
                    layout
                    data-active={active}
                    className={`tts-stage-button grid place-items-center px-2 text-center transition ${active ? "bg-tts-deep text-tts-bg" : "text-tts-muted"}`}
                  >
                    {step}
                  </motion.div>
                )
              })}
            </div>

            <div className="hidden min-w-0 gap-4 md:grid sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-tts-border bg-tts-bg p-4">
                <p className="text-sm uppercase tracking-normal text-tts-muted">{T(feedbackLanguage, "Pagamento", "Payment")}</p>
                <p className="mt-2 text-sm text-tts-deep">
                  {isCrossCurrency ? sourceAmountLabel : amountLabel}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-tts-border bg-tts-bg p-4">
                <p className="text-sm uppercase tracking-normal text-tts-muted">{T(feedbackLanguage, "Destinatário", "Recipient")}</p>
                <p className="mt-2 text-sm text-tts-deep">
                  {destinationLabel}
                </p>
              </div>
            </div>
            {mobileSyncStatus && (
              <p className="rounded-xl border border-tts-gold bg-tts-gold-bg px-3 py-2 text-sm text-tts-gold">
                {mobileSyncStatus}
              </p>
            )}
          </section>

          <section className="tts-mobile-flow-card tts-stage-panel min-w-0 overflow-hidden p-4 md:p-5">
            <form className={`${status === "submitting" || status === "done" ? "hidden md:block" : "block"} space-y-4`} onSubmit={handleSubmit}>
	              <div className="min-w-0 overflow-hidden rounded-xl border border-tts-border bg-tts-bg p-3 text-sm text-tts-deep">
	                <p className="tts-field-label font-black text-tts-deep">{T(feedbackLanguage, "Confira os dados", "Review details")}</p>
	                <div className="mt-3 grid gap-2">
	                  <div className="rounded-xl border border-tts-border bg-tts-surface p-3">
	                    <p className="text-xs font-black text-tts-muted">{T(feedbackLanguage, "Sai da conta", "Leaves account")}</p>
	                    <p className="mt-1 text-lg font-black text-tts-deep">{isCrossCurrency ? sourceAmountLabel : amountLabel}</p>
	                  </div>
	                  {isCrossCurrency && (
	                    <div className="rounded-xl border border-tts-border bg-tts-surface p-3">
	                      <p className="text-xs font-black text-tts-muted">{T(feedbackLanguage, "Chega para o destinatário", "Arrives for recipient")}</p>
	                      <p className="mt-1 text-lg font-black text-tts-deep">{amountLabel}</p>
	                    </div>
	                  )}
	                  <div className="rounded-xl border border-tts-border bg-tts-surface p-3">
	                    <p className="text-xs font-black text-tts-muted">{T(feedbackLanguage, "Destino", "Destination")}</p>
	                    <p className="mt-1 text-base font-black text-tts-deep">{destinationLabel}</p>
	                    {destinationKeyLabel && <p className="tts-mobile-soft-hide mt-1 text-xs font-bold text-tts-muted">{destinationKeyLabel}</p>}
	                  </div>
	                </div>
	              </div>

	              <div className="space-y-2">
	                <label htmlFor="pin" className="tts-field-label text-sm font-black text-tts-deep">PIN</label>
                <input
                  id="pin"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder={T(feedbackLanguage, "Digite seu PIN", "Enter your PIN")}
	                  className="tts-fill-field w-full rounded-xl border-2 border-tts-border bg-tts-surface px-4 py-4 text-lg font-black text-tts-deep outline-none transition placeholder:text-tts-muted focus:border-tts-confirm focus:bg-tts-surface"
                />
              </div>

              <div className={status === "ready" || status === "submitting" ? "tts-mobile-action" : ""}>
                <button
                  type="submit"
                  disabled={status === "submitting" || status === "done" || !token.trim() || !pin.trim()}
	                  className="inline-flex w-full items-center justify-center rounded-xl bg-tts-confirm px-4 py-4 text-base font-black text-tts-deep transition hover:bg-tts-confirm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === "submitting"
                    ? <span className="inline-flex items-center gap-2"><Spinner />{T(feedbackLanguage, "Confirmando pagamento...", "Confirming payment...")}</span>
                    : T(feedbackLanguage, "Confirmar pagamento", "Confirm payment")}
                </button>
              </div>
              {PASSKEY_CONFIRMATION_ENABLED && (
                <button
                  type="button"
                  onClick={() => setShowPasskeyOptions((current) => !current)}
                  disabled={status === "submitting" || status === "done" || !token.trim()}
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-tts-gold bg-tts-gold-bg px-4 py-3 text-sm font-semibold text-tts-gold transition hover:bg-tts-gold-bg disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {showPasskeyOptions
                    ? T(feedbackLanguage, "Ocultar Passkey", "Hide Passkey")
                    : T(feedbackLanguage, "Usar Passkey", "Use Passkey")}
                </button>
              )}
	              {PASSKEY_CONFIRMATION_ENABLED && showPasskeyOptions && (
	                <>
                  <button
                    type="button"
                    onClick={() => { void handlePasskeyConfirm(); }}
                    disabled={status === "submitting" || status === "done" || !token.trim()}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-tts-gold px-4 py-3 text-sm font-semibold text-tts-deep transition hover:bg-tts-gold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passkeyStatus === "starting" || passkeyStatus === "authenticating" || passkeyStatus === "submitting"
                      ? T(feedbackLanguage, "Confirmando com Passkey...", "Confirming with Passkey...")
                      : T(feedbackLanguage, "Confirmar com Passkey", "Confirm with Passkey")}
                  </button>
                  {passkeyError && (
                    <p className="rounded-xl border border-tts-error bg-tts-error/10 px-3 py-2 text-sm text-tts-error">
                      {passkeyError}
                    </p>
                  )}
	                </>
	              )}
	            </form>

	            <div className={`mt-4 ${status === "ready" ? "hidden md:block" : "block"}`}>
	              <OperationProgressPanel
	                status={progressStatus}
	                elapsedSeconds={progressElapsedSeconds}
	                title={T(feedbackLanguage, "Andamento da operação", "Operation progress")}
	                readyMessage={T(feedbackLanguage, "Depois de confirmar, esta tela mostra cada etapa até a conclusão.", "After you confirm, this screen shows each step until completion.")}
	                runningMessage={T(feedbackLanguage, "Pagamento em andamento. Não clique de novo; estamos aguardando a rede.", "Payment in progress. Do not click again; we are waiting for the network.")}
	                doneMessage={T(feedbackLanguage, "Pagamento concluído.", "Payment completed.")}
	                errorMessage={T(feedbackLanguage, "A operação parou antes de concluir. Leia o erro abaixo antes de tentar novamente.", "The operation stopped before completion. Read the error below before trying again.")}
	                steps={paymentProgressSteps}
	              />
	            </div>

	            {PASSKEY_CONFIRMATION_ENABLED && showPasskeyOptions && qrImageUrl && status !== "done" && (
              <div className="mt-5 hidden rounded-2xl border border-tts-border bg-tts-bg p-4 text-sm text-tts-deep lg:block">
                <p className="font-medium text-tts-deep">{T(feedbackLanguage, "Confirmar com Passkey", "Confirm with Passkey")}</p>
                <p className="mt-1 text-tts-deep">{T(feedbackLanguage, "Use este QR somente se esta tela estiver em outro dispositivo. Escaneie com o celular onde sua Passkey está cadastrada.", "Use this QR only when this screen is on another device. Scan it with the phone where your Passkey is registered.")}</p>
                <div className="mt-3 flex justify-center">
                  <img
                    src={qrImageUrl}
                    alt={T(feedbackLanguage, "QR code para confirmar pagamento", "QR code to confirm payment")}
                    className="h-72 w-72 rounded-xl border border-tts-border bg-white p-3"
                  />
                </div>
              </div>
            )}

            <div className={`tts-stage-panel mt-4 p-4 text-sm text-tts-deep ${status === "ready" ? "hidden md:block" : "block"}`}>
              <p className="font-medium text-tts-deep">{T(feedbackLanguage, "Resultado", "Result")}</p>
              {status === "ready" && <p className="mt-2 text-tts-muted">{T(feedbackLanguage, "Aguardando confirmação.", "Waiting for confirmation.")}</p>}
              {status === "submitting" && (
                <div className="mt-3 inline-flex items-center gap-2 text-tts-deep"><TypingDots />{T(feedbackLanguage, "Confirmando pagamento...", "Confirming payment...")}</div>
              )}
              <AnimatePresence mode="wait">
              {status === "done" && result?.success && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 space-y-3 text-tts-confirm"
                >
                  <p className="text-base font-semibold text-tts-confirm">{T(feedbackLanguage, "Pagamento enviado com sucesso", "Payment sent successfully")}</p>
                  <div className="space-y-2 rounded-2xl border border-tts-confirm bg-tts-confirm/10 p-4 text-sm">
                    <p><span className="text-tts-deep">{T(feedbackLanguage, "Valor", "Amount")}: </span>{formatPaymentAmount(successAmount, successAsset)}</p>
                    <p><span className="text-tts-deep">{T(feedbackLanguage, "Destino", "Destination")}: </span>{formatRecipientLabel(result, feedbackLanguage)}</p>
                    {successDestinationKey && <p><span className="text-tts-deep">{T(feedbackLanguage, "Chave", "Key")}: </span>{successDestinationKey}</p>}
                    <p><span className="text-tts-deep">{T(feedbackLanguage, "Horário", "Time")}: </span>{formatTimestamp(result.completed_at, feedbackLanguage)}</p>
                  </div>
                  <a
                    href={returnTarget.href}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-tts-deep px-4 py-3 text-sm font-semibold text-tts-surface transition hover:bg-tts-deep2"
                  >
                    {returnTarget.label}
                  </a>
                  {returnMessage && <p>{returnMessage}</p>}
                  {!hasExplicitReturnTarget && <p className="text-xs text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>}
                </motion.div>
              )}
              {status === "error" && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-tts-error">{visibleError}</motion.p>}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
