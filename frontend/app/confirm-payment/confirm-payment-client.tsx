"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { startAuthentication } from "@simplewebauthn/browser"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { Spinner, TypingDots } from "@/components/ui/feedback"

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
  receiptImageDataUrl?: string
  message?: string
  error?: string
}

function shortenValue(value?: string, left = 6, right = 6) {
  const raw = String(value || "").trim()
  if (!raw) return "Indisponível"
  if (raw.length <= left + right + 3) return raw
  return `${raw.slice(0, left)}...${raw.slice(-right)}`
}

function formatTimestamp(value?: string) {
  const timestamp = value ? Date.parse(value) : NaN
  if (!Number.isFinite(timestamp)) return new Date().toLocaleString("pt-BR")
  return new Date(timestamp).toLocaleString("pt-BR")
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
  return String(value || "").toUpperCase().replace(/^USD$/, "USDC")
}

function formatPaymentAmount(amount?: string, assetCode?: string) {
  if (!String(amount || "").trim()) return "Valor indisponível"
  const code = normalizeAssetCode(assetCode)
  const n = Number(String(amount || "").replace(",", "."))
  if (!Number.isFinite(n)) return "Valor indisponível"
  const truncated = Math.trunc(n * 100) / 100
  if (code === "BRL") return `R$ ${truncated.toFixed(2)}`
  if (code === "USDC") return `US$ ${truncated.toFixed(2)}`
  if (code === "XLM") return "saldo da carteira TalkToStellar"
  return `${truncated.toFixed(2)} ${code}`
}

function getAutoConversionMessage(result?: ConfirmResponse | null) {
  if (result?.autoConversion?.message) return result.autoConversion.message
  const details = result?.transferDetails
  const sourceAsset = normalizeAssetCode(details?.sourceAssetCode)
  const destinationAsset = normalizeAssetCode(details?.destinationAssetCode)
  if (!sourceAsset || !destinationAsset || sourceAsset === destinationAsset) return ""
  return `Conversão automática concluída: ${formatPaymentAmount(details?.sourceAmount, sourceAsset)} viraram ${formatPaymentAmount(details?.destinationAmount, destinationAsset)} antes do envio.`
}

function formatRecipientLabel(payload: any) {
  const candidate = String(
    payload?.destination_name ||
    payload?.destination_contact?.contact_name ||
    payload?.destination_contact?.name ||
    payload?.destination_contact?.email ||
    payload?.destination_contact?.phone_number ||
    payload?.destination_contact?.phone ||
    ''
  ).trim()

  if (candidate) return candidate
  return 'Destinatário'
}

function hasUsableFeeDisplay(value?: string) {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized || normalized.includes("indispon")) return false
  const compact = normalized.replace(/\s+/g, "")
  const looksLikeZeroOnly =
    compact.includes("us$0") ||
    compact.includes("r$0") ||
    compact.includes("0%") ||
    compact.includes("0,0%")
  return !looksLikeZeroOnly
}

function parseNumber(value?: string) {
  const parsed = Number(String(value || "").replace(",", "."))
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function trimFixed(value: number, decimals: number) {
  return value.toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")
}

function truncateNumber(value: number, decimals: number) {
  const factor = 10 ** decimals
  return Math.trunc(value * factor) / factor
}

function formatFeeAmount(value: number, assetCode: string) {
  const code = normalizeAssetCode(assetCode)
  const decimals = value > 0 && value < 0.01 ? 8 : 2
  const threshold = Math.pow(10, -decimals)
  const prefix = value > 0 && value < threshold ? "<" : ""
  if (code === "BRL") return `R$ ${prefix}${trimFixed(prefix ? threshold : truncateNumber(value, decimals), decimals)}`
  if (code === "USDC") return `US$ ${prefix}${trimFixed(prefix ? threshold : truncateNumber(value, decimals), decimals)}`
  if (code === "XLM") {
    const xlmDecimals = 7
    const xlmThreshold = Math.pow(10, -xlmDecimals)
    const xlmPrefix = value > 0 && value < xlmThreshold ? "<" : ""
    return `${xlmPrefix}${trimFixed(xlmPrefix ? xlmThreshold : truncateNumber(value, xlmDecimals), xlmDecimals)} XLM`
  }
  return `${prefix}${trimFixed(prefix ? threshold : truncateNumber(value, decimals), decimals)} ${code}`
}

function formatFeePercent(percent: number) {
  if (!Number.isFinite(percent) || percent < 0) return ""
  const decimals = percent > 0 && percent < 0.01 ? 6 : 4
  const threshold = Math.pow(10, -decimals)
  if (percent > 0 && percent < threshold) return `<${trimFixed(threshold, decimals)}%`
  return `${trimFixed(percent, decimals)}%`
}

function buildFeeSummary(input: {
  feeDisplay?: string
  platformFeeDisplay?: string
  totalFeeDisplay?: string
  feeUsdc?: string
  feeBrl?: string
  feeXlm?: string
  sourceAmount?: string
  sourceAssetCode?: string
}) {
  if (hasUsableFeeDisplay(input.totalFeeDisplay)) return String(input.totalFeeDisplay || "")

  const sourceCode = normalizeAssetCode(input.sourceAssetCode)
  const sourceAmount = parseNumber(input.sourceAmount)
  const feeUsdc = parseNumber(input.feeUsdc)
  const feeBrl = parseNumber(input.feeBrl)
  const feeXlm = parseNumber(input.feeXlm)

  let primaryAmount: number | undefined
  let primaryAsset = sourceCode
  if (sourceCode === "USDC" && feeUsdc !== undefined) primaryAmount = feeUsdc
  if (sourceCode === "BRL" && feeBrl !== undefined) primaryAmount = feeBrl
  if (sourceCode === "XLM" && feeXlm !== undefined) primaryAmount = feeXlm

  if (primaryAmount === undefined && feeUsdc !== undefined) {
    primaryAmount = feeUsdc
    primaryAsset = "USDC"
  }
  if (primaryAmount === undefined && feeBrl !== undefined) {
    primaryAmount = feeBrl
    primaryAsset = "BRL"
  }
  if (primaryAmount === undefined && feeXlm !== undefined) {
    primaryAmount = feeXlm
    primaryAsset = "XLM"
  }

  const fallbackParts = [
    hasUsableFeeDisplay(input.platformFeeDisplay) ? String(input.platformFeeDisplay || "") : "",
    hasUsableFeeDisplay(input.feeDisplay) ? String(input.feeDisplay || "") : "",
  ].filter(Boolean)
  const fallback = fallbackParts.join(" + ")
  if (primaryAmount === undefined) return fallback
  if (primaryAmount <= 0) return ""

  const equivalents: string[] = []
  if (primaryAsset !== "BRL" && feeBrl !== undefined) equivalents.push(formatFeeAmount(feeBrl, "BRL"))
  if (primaryAsset !== "USDC" && feeUsdc !== undefined) equivalents.push(formatFeeAmount(feeUsdc, "USDC"))

  if (sourceAmount && sourceAmount > 0 && primaryAsset === sourceCode) {
    equivalents.push(formatFeePercent((primaryAmount / sourceAmount) * 100))
  }

  const nonZeroEquivalents = equivalents.filter((item) => !/^(r\$|us\$)\s*0([.,]0+)?$|^0([.,]0+)?%$/i.test(item.trim()))
  const computed = `${formatFeeAmount(primaryAmount, primaryAsset)}${nonZeroEquivalents.length ? ` (${nonZeroEquivalents.join(", ")})` : ""}`
  return fallbackParts.length ? `${fallbackParts.join(" + ")} + ${computed}` : computed
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
    return "A biometria foi cancelada ou expirou. Tente novamente."
  }
  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "A Passkey precisa abrir no domínio correto e com HTTPS."
  }
  if (normalized.includes("registrationrequired")) {
    return "Nenhuma Passkey registrada para esta conta."
  }

  return message || "Não foi possível confirmar com biometria."
}

export default function ConfirmPaymentClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const requestedAuthMethod = useMemo(() => String(searchParams.get("auth") || "").trim().toLowerCase(), [searchParams])
  const publicKeyFromUrl = useMemo(() => searchParams.get("public_key") || searchParams.get("destination_public_key") || '', [searchParams])

  const [token, setToken] = useState(tokenFromUrl)
  const [publicKey, setPublicKey] = useState(publicKeyFromUrl)
  const [status, setStatus] = useState("ready")
  const [result, setResult] = useState<ConfirmResponse | null>(null)
  const [pin, setPin] = useState("")
  const [showPasskeyOptions, setShowPasskeyOptions] = useState(false)
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "starting" | "authenticating" | "submitting" | "error">("idle")
  const [passkeyError, setPasskeyError] = useState("")
  const [qrTargetUrl, setQrTargetUrl] = useState("")
  const [mobileSyncStatus, setMobileSyncStatus] = useState("")
  const [validation, setValidation] = useState<ValidationResult>(initialValidation || { success: false, valid: false })
  const submitLockRef = useRef(false)
  const passkeyAutoTriggerRef = useRef(false)
  const urlScrubbedRef = useRef(false)

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
      // Preserve public key from URL before we strip query params for privacy
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
      if (!token) return
      const fallbackPayload = decodeJwtPayload(token)
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.valid) {
          if (payload?.used) {
            setResult({
              success: true,
              message: "Pagamento já confirmado neste link.",
            })
            setStatus("done")
            submitLockRef.current = true
            return
          }
          setValidation({
            success: false,
            valid: false,
            payload: fallbackPayload,
            message: payload?.message || "Link inválido ou expirado. Gere um novo link de confirmação.",
          })
          return
        }
        setValidation(payload?.payload ? payload : { success: true, valid: true, payload: fallbackPayload })
      } catch (error) {
        setValidation({ success: true, valid: true, payload: fallbackPayload })
      }
    }

    validateToken()
  }, [token])

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
          setMobileSyncStatus("Confirmação em andamento no celular...")
          return
        }

        if (response.status === 409 && payload?.used) {
          submitLockRef.current = true
          setResult((prev) => prev || {
            success: true,
            message: "Pagamento confirmado pelo celular.",
          })
          setStatus("done")
          setMobileSyncStatus("")
          enqueueWebChatFeedback("Pagamento confirmado pelo celular.")
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
  }, [token, status])

  useEffect(() => {
    if (status !== "done") return
    closeIntermediatePage()
  }, [status])

  const mobileRedirectUrl = useMemo(() => {
    if (!token || typeof window === "undefined") return ""
    const url = new URL(`${window.location.origin}/confirm-payment`)
    url.searchParams.set("token", token)
    const destinationKey = String(publicKey || publicKeyFromUrl || "").trim()
    if (destinationKey) url.searchParams.set("public_key", destinationKey)
    url.searchParams.set("auth", "passkey")
    return url.toString()
  }, [token, publicKey, publicKeyFromUrl])
  const qrImageUrl = useMemo(() => {
    if (!qrTargetUrl) return ""
    return `https://quickchart.io/qr?size=320&margin=2&ecLevel=Q&format=png&text=${encodeURIComponent(qrTargetUrl)}`
  }, [qrTargetUrl])

  useEffect(() => {
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
            expires_in_hours: 6,
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
        }),
      })

      const payload = (await response.json()) as ConfirmResponse
      setResult(payload)
      setStatus(response.ok && payload?.success ? "done" : "error")

      if (response.ok && payload?.success) {
        const hash = String(payload.tx_hash || payload.hash || "")
        const receiptUrl = String(payload.receipt_url || "")
        const conversionMessage = getAutoConversionMessage(payload)
        enqueueWebChatFeedback([
          "Pagamento enviado com sucesso.",
          conversionMessage,
          `Valor: ${String(payload.amount || payload.transferDetails?.destinationAmount || "").trim()} ${String(payload.asset || payload.assetCode || payload.transferDetails?.destinationAssetCode || "").trim()}`.trim(),
          `Destino: ${shortenValue(String(payload.destination || payload.destinationName || ""))}`,
          hash ? `Transação: ${shortenValue(hash, 8, 8)}` : "",
          `Horário: ${formatTimestamp(payload.completed_at)}`,
          receiptUrl ? `Comprovante: ${receiptUrl}` : "",
        ].filter(Boolean).join("\n"))
      }

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
      const message = error instanceof Error ? error.message : "Falha ao confirmar pagamento"
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  async function handlePasskeyConfirm() {
    if (!token.trim() || validation?.valid === false || submitLockRef.current || status === "done") return
    if (!window.PublicKeyCredential) {
      setPasskeyStatus("error")
      setPasskeyError("Este navegador não suporta Passkey/WebAuthn.")
      return
    }

    setPasskeyError("")
    setPasskeyStatus("starting")
    setStatus("submitting")
    setResult(null)
    submitLockRef.current = true

    try {
      const initResponse = await idempotentFetch("/api/passkeys/auth-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          public_key: publicKey || publicKeyFromUrl || undefined,
        }),
      })
      const initPayload = await initResponse.json().catch(() => ({}))
      if (!initResponse.ok || !initPayload?.success) {
        throw new Error(initPayload?.message || "Não foi possível iniciar biometria.")
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
        }),
      })

      const payload = (await response.json()) as ConfirmResponse
      setResult(payload)
      setStatus(response.ok && payload?.success ? "done" : "error")

      if (response.ok && payload?.success) {
        setPasskeyStatus("idle")
      } else {
        submitLockRef.current = false
        setPasskeyStatus("error")
        setPasskeyError(payload?.message || payload?.error || "Falha ao confirmar com biometria.")
      }
    } catch (error: any) {
      submitLockRef.current = false
      setStatus("error")
      setPasskeyStatus("error")
      setPasskeyError(getPasskeyErrorMessage(error))
      setResult({
        success: false,
        error: getPasskeyErrorMessage(error),
      })
    }
  }

  const payload = validation?.payload || decodeJwtPayload(token)
  const externalProvider = String(searchParams.get("provider") || payload.provider || payload.source || "").trim().toLowerCase()
  const providerLabel = getProviderLabel(externalProvider)
  const returnMessage = providerLabel ? `Concluído. Volte ao ${providerLabel} para continuar.` : ""
  const assetCode = normalizeAssetCode(payload.asset_code || payload.assetCode || "")
  const amountLabel = formatPaymentAmount(payload.amount, assetCode)
  const sourceAssetCode = normalizeAssetCode(payload.source_asset_code || payload.quote?.sourceAsset?.code || "")
  const sourceAmount = String(payload.source_amount || payload.quote?.sourceAmount || "")
  const sourceAmountLabel = sourceAmount && sourceAssetCode ? formatPaymentAmount(sourceAmount, sourceAssetCode) : ""
  const isCrossCurrency = Boolean(sourceAmountLabel && sourceAssetCode && sourceAssetCode !== assetCode)
  const destinationLabel = formatRecipientLabel(payload)
  const estimatedFeeDisplay = String(payload.estimated_fee_display || payload.quote?.fee_display || "")
  const estimatedFeeSummary = buildFeeSummary({
    feeDisplay: estimatedFeeDisplay,
    platformFeeDisplay: String(payload.estimated_platform_fee || payload.estimated_spread_fee || ""),
    feeUsdc: String(payload.estimated_fee_usdc || payload.quote?.fee_usdc || ""),
    feeBrl: String(payload.estimated_fee_brl || payload.quote?.fee_brl || ""),
    feeXlm: String(payload.quote?.networkFeeXlm || ""),
    sourceAmount: sourceAmount || String(payload.amount || ""),
    sourceAssetCode: sourceAssetCode || assetCode,
  })
  const showEstimatedFee = hasUsableFeeDisplay(estimatedFeeSummary)
  const resultFeeDisplay = result?.transferDetails?.feeDisplay || ""
  const resultFeeSummary = buildFeeSummary({
    feeDisplay: resultFeeDisplay,
    platformFeeDisplay: result?.transferDetails?.platformFeeDisplay,
    totalFeeDisplay: result?.transferDetails?.totalFeeDisplay,
    feeUsdc: result?.transferDetails?.feeUsdc,
    feeBrl: result?.transferDetails?.feeBrl,
    feeXlm: result?.transferDetails?.feeXlm,
    sourceAmount: result?.transferDetails?.sourceAmount,
    sourceAssetCode: result?.transferDetails?.sourceAssetCode,
  })
  const showResultFee = hasUsableFeeDisplay(resultFeeSummary) || Boolean(result?.transferDetails)
  const currentStep = status === "submitting" ? 2 : status === "done" ? 3 : 1
  const successAmount = String(result?.amount || result?.transferDetails?.destinationAmount || payload.amount || "")
  const successAsset = String(result?.asset || result?.assetCode || result?.transferDetails?.destinationAssetCode || assetCode || "")
  const successDestination = String(result?.destination || result?.destinationName || "")
  const successHash = String(result?.tx_hash || result?.hash || "")
  const successReceiptUrl = String(result?.receipt_url || "")
  const successAutoConversionMessage = getAutoConversionMessage(result)
  const isExpiredLink = Boolean(validation?.valid === false && (validation as any)?.expired)

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12 sm:px-6">
        <div className="grid min-w-0 w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-emerald-200">
              Confirmação de pagamento
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Confirme este pagamento
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Confira os dados abaixo e digite seu PIN para autorizar a transferência.
              </p>
              {validation && (
                <div className="mt-3 rounded-md bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <strong>Status: </strong>
                  {validation.valid ? (
                    <span className="text-emerald-300">Link válido</span>
                  ) : (
                    <span className="text-rose-300">
                      {isExpiredLink ? `Link expirado. ${validation.message || 'Solicite um novo link.'}` : (validation.message || 'Link inválido ou ausente')}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 text-xs">
              {["Revisar", "Autorizar", "Concluído"].map((step, index) => {
                const active = currentStep >= index + 1
                return (
                  <motion.div
                    key={step}
                    layout
                    className={`rounded-xl px-3 py-2 text-center transition ${active ? "bg-emerald-400/20 text-emerald-200" : "text-slate-400"}`}
                  >
                    {step}
                  </motion.div>
                )
              })}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Pagamento</p>
                <p className="mt-2 text-sm text-slate-200">
                  {isCrossCurrency ? sourceAmountLabel : amountLabel}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Destinatário</p>
                <p className="mt-2 text-sm text-slate-200">
                  {destinationLabel}
                </p>
              </div>
            </div>
            {mobileSyncStatus && (
              <p className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                {mobileSyncStatus}
              </p>
            )}
          </section>

          <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">Resumo</p>
                <p className="mt-2 text-slate-300">
                  {isCrossCurrency ? `Você envia: ${sourceAmountLabel}` : `Valor: ${amountLabel}`}
                </p>
                {isCrossCurrency && (
                  <p className="text-slate-300">Destino recebe aproximadamente: {amountLabel}</p>
                )}
                <p className="text-slate-300">Destino: {destinationLabel}</p>
                {showEstimatedFee && (
                  <p className="text-slate-300">Taxa total estimada: {estimatedFeeSummary}</p>
                )}
                {assetCode !== "XLM" && !isCrossCurrency && (
                  <p className="text-emerald-300">Recebimento garantido no destino: {amountLabel}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="pin" className="text-sm font-medium text-slate-200">PIN</label>
                <input
                  id="pin"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Digite seu PIN"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:bg-white/10"
                />
              </div>

              <button
                type="submit"
                disabled={status === "submitting" || status === "done" || !token.trim() || !pin.trim() || validation?.valid === false}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? <span className="inline-flex items-center gap-2"><Spinner />Confirmando pagamento...</span> : "Confirmar pagamento"}
              </button>
              <button
                type="button"
                onClick={() => setShowPasskeyOptions((current) => !current)}
                disabled={status === "submitting" || status === "done" || !token.trim() || validation?.valid === false}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-indigo-300/40 bg-indigo-500/20 px-4 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {showPasskeyOptions ? "Ocultar opções de Passkey" : "Usar Touch ID (Passkey)"}
              </button>
              {showPasskeyOptions && (
                <>
                  <button
                    type="button"
                    onClick={handlePasskeyConfirm}
                    disabled={status === "submitting" || status === "done" || !token.trim() || validation?.valid === false}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passkeyStatus === "starting" || passkeyStatus === "authenticating" || passkeyStatus === "submitting"
                      ? "Autenticando com Touch ID..."
                      : "Confirmar com Touch ID (Passkey)"}
                  </button>
                  {passkeyError && (
                    <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
                      {passkeyError}
                    </p>
                  )}
                </>
              )}
            </form>

            {showPasskeyOptions && qrImageUrl && status !== "done" && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">Confirmar pelo celular com Touch ID</p>
                <p className="mt-1 text-slate-300">Escaneie o QR com seu celular para abrir esta confirmação e autorizar com Touch ID.</p>
                <div className="mt-3 flex justify-center">
                  <img
                    src={qrImageUrl}
                    alt="QR Code para confirmar pagamento no celular"
                    className="h-72 w-72 rounded-xl border border-white/10 bg-white p-3"
                  />
                </div>
                {qrTargetUrl && (
                  <p className="mt-3 break-all text-xs text-slate-400">{qrTargetUrl}</p>
                )}
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Resultado</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Aguardando confirmação.</p>}
              {status === "submitting" && (
                <div className="mt-3 inline-flex items-center gap-2 text-slate-300"><TypingDots />Processando na rede...</div>
              )}
              <AnimatePresence mode="wait">
              {status === "done" && result?.success && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 space-y-3 text-emerald-100"
                >
                  <p className="text-base font-semibold text-emerald-300">Pagamento enviado com sucesso</p>
                  <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm">
                    <p><span className="text-slate-300">Valor: </span>{successAmount} {successAsset}</p>
                    <p><span className="text-slate-300">Destino: </span><span className="font-mono">{shortenValue(successDestination)}</span></p>
                    <p><span className="text-slate-300">Transação: </span><span className="font-mono">{shortenValue(successHash, 8, 8)}</span></p>
                    <p><span className="text-slate-300">Horário: </span>{formatTimestamp(result.completed_at)}</p>
                  </div>
                  {showResultFee && (
                    <p>Taxa aplicada: {resultFeeSummary || "taxa aplicada indisponível"}</p>
                  )}
                  {successAutoConversionMessage && (
                    <p>{successAutoConversionMessage}</p>
                  )}
                  {successReceiptUrl && (
                    <a
                      href={successReceiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                    >
                      Ver comprovante
                    </a>
                  )}
                  {result.receiptImageDataUrl && (
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.08 }} className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                      <motion.img
                        src={result.receiptImageDataUrl}
                        alt="Recibo TalkToStellar"
                        className="h-auto w-full"
                        initial={{ y: 12, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                      />
                    </motion.div>
                  )}
                  {returnMessage && <p>{returnMessage}</p>}
                  <p className="text-xs text-slate-400">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
                </motion.div>
              )}
              {status === "error" && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-rose-300">{result?.error || result?.message || "Algo deu errado."}</motion.p>}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
