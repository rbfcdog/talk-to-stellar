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

function shortenValue(value?: string, left = 6, right = 6) {
  const raw = String(value || "").trim()
  if (!raw) return "Unavailable"
  if (raw.length <= left + right + 3) return raw
  return `${raw.slice(0, left)}...${raw.slice(-right)}`
}

function formatTimestamp(value?: string) {
  const timestamp = value ? Date.parse(value) : NaN
  if (!Number.isFinite(timestamp)) return new Date().toLocaleString("en-US")
  return new Date(timestamp).toLocaleString("en-US")
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
  if (!String(amount || "").trim()) return "Amount unavailable"
  const code = normalizeAssetCode(assetCode)
  const n = Number(String(amount || "").replace(",", "."))
  if (!Number.isFinite(n)) return "Amount unavailable"
  const truncated = Math.trunc(n * 100) / 100
  if (code === "BRL") return `R$ ${truncated.toFixed(2)}`
  if (code === "USDC") return `US$ ${truncated.toFixed(2)}`
  if (code === "XLM") return "TalkToStellar wallet balance"
  return `${truncated.toFixed(2)} ${code}`
}

function getAutoConversionMessage(result?: ConfirmResponse | null) {
  if (result?.autoConversion?.message) return result.autoConversion.message
  const details = result?.transferDetails
  const sourceAsset = normalizeAssetCode(details?.sourceAssetCode)
  const destinationAsset = normalizeAssetCode(details?.destinationAssetCode)
  if (!sourceAsset || !destinationAsset || sourceAsset === destinationAsset) return ""
  return `Automatic conversion completed: ${formatPaymentAmount(details?.sourceAmount, sourceAsset)} became ${formatPaymentAmount(details?.destinationAmount, destinationAsset)} before sending.`
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
  return 'Recipient'
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

function formatBrl(value?: string) {
  const amount = Number(String(value || "").replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return ""
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatRouteChainFromPayload(payload: any) {
  const explicit = String(payload?.route_chain || payload?.route?.chain || "").trim()
  if (explicit) return explicit
  const quote = payload?.quote
  const source = String(quote?.sourceAsset?.code || payload?.source_asset_code || "").trim().toUpperCase()
  const destination = String(quote?.destinationAsset?.code || payload?.destination_asset_code || payload?.asset_code || "").trim().toUpperCase()
  const hops = Array.isArray(quote?.path)
    ? quote.path
      .map((item: any) => String(item?.code || item?.asset_code || "").trim().toUpperCase())
      .filter(Boolean)
    : []
  const chain = [source, ...hops, destination].filter(Boolean)
  const compact = chain.filter((asset, index) => index === 0 || asset !== chain[index - 1])
  return compact.join(" -> ")
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

function buildMobileConfirmedFeedback(payload: any) {
  const amount = String(
    payload?.destination_amount ||
    payload?.amount ||
    payload?.source_amount ||
    payload?.quote?.destinationAmount ||
    payload?.quote?.sourceAmount ||
    ""
  ).trim()
  const asset = String(
    payload?.destination_asset_code ||
    payload?.asset_code ||
    payload?.source_asset_code ||
    payload?.quote?.destinationAsset?.code ||
    payload?.quote?.sourceAsset?.code ||
    ""
  ).trim()
  const route = formatRouteChainFromPayload(payload)
  const sourceCode = normalizeAssetCode(String(payload?.source_asset_code || payload?.quote?.sourceAsset?.code || ""))
  const destinationCode = normalizeAssetCode(String(payload?.destination_asset_code || payload?.quote?.destinationAsset?.code || payload?.asset_code || ""))
  const isCrossAsset = Boolean(sourceCode && destinationCode && sourceCode !== destinationCode)
  const fee = buildFeeSummary({
    feeDisplay: String(payload?.estimated_fee_display || payload?.quote?.fee_display || ""),
    feeUsdc: String(payload?.estimated_fee_usdc || payload?.quote?.fee_usdc || ""),
    feeBrl: String(payload?.estimated_fee_brl || payload?.quote?.fee_brl || ""),
    sourceAmount: String(payload?.source_amount || payload?.quote?.sourceAmount || payload?.amount || ""),
    sourceAssetCode: String(payload?.source_asset_code || payload?.quote?.sourceAsset?.code || payload?.asset_code || ""),
  })
  const savings = formatBrl(String(payload?.savings_estimate?.estimated_savings_brl || ""))

  return [
    "Payment confirmed on mobile.",
    amount && asset ? `Amount: ${formatPaymentAmount(amount, asset)}` : "",
    `Destination: ${formatRecipientLabel(payload)}`,
    isCrossAsset && route ? `Best path: ${route}` : "",
    hasUsableFeeDisplay(fee) ? `Estimated fee: ${fee}` : "",
    isCrossAsset && savings ? `Estimated savings: ${savings}` : "",
    `Time: ${formatTimestamp()}`,
    "Receipt saved in history.",
  ].filter(Boolean).join("\n")
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
    return "Biometric authentication was canceled or expired. Try again."
  }
  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "Passkey must open on the correct domain with HTTPS."
  }
  if (normalized.includes("registrationrequired")) {
    return "No Passkey is registered for this account."
  }

  return message || "Could not confirm with biometrics."
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
        if (response.status === 409 && payload?.processing) {
          setValidation({
            success: true,
            valid: true,
            payload: payload?.payload || fallbackPayload,
            message: "Confirmation in progress on mobile...",
          })
          setMobileSyncStatus("Confirmation in progress on mobile...")
          return
        }
        if (!response.ok || !payload?.valid) {
          if (payload?.used) {
            setResult({
              success: true,
              message: "Payment already confirmed on this link.",
            })
            setStatus("done")
            submitLockRef.current = true
            return
          }
          setValidation({
            success: false,
            valid: false,
            payload: fallbackPayload,
            message: payload?.message || "Invalid or expired link. Generate a new confirmation link.",
          })
          return
        }
        setMobileSyncStatus("")
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
          setMobileSyncStatus("Confirmation in progress on mobile...")
          return
        }

        if (response.status === 409 && payload?.used) {
          const payloadForFeedback = payload?.payload || validation?.payload || decodeJwtPayload(token)
          const feedback = buildMobileConfirmedFeedback(payloadForFeedback)
          submitLockRef.current = true
          setResult((prev) => prev || {
            success: true,
            message: feedback,
          })
          setStatus("done")
          setMobileSyncStatus("")
          enqueueWebChatFeedback(feedback)
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
        const payloadForFeedback = validation?.payload || decodeJwtPayload(token)
        const routeForFeedback = formatRouteChainFromPayload(payloadForFeedback)
        const feedbackSourceCode = normalizeAssetCode(String(payloadForFeedback?.source_asset_code || payloadForFeedback?.quote?.sourceAsset?.code || ""))
        const feedbackDestinationCode = normalizeAssetCode(String(payloadForFeedback?.destination_asset_code || payloadForFeedback?.quote?.destinationAsset?.code || payloadForFeedback?.asset_code || ""))
        const feedbackIsCrossAsset = Boolean(feedbackSourceCode && feedbackDestinationCode && feedbackSourceCode !== feedbackDestinationCode)
        const estimatedFeeForFeedback = buildFeeSummary({
          feeDisplay: String(payloadForFeedback?.estimated_fee_display || payloadForFeedback?.quote?.fee_display || ""),
          feeUsdc: String(payloadForFeedback?.estimated_fee_usdc || payloadForFeedback?.quote?.fee_usdc || ""),
          feeBrl: String(payloadForFeedback?.estimated_fee_brl || payloadForFeedback?.quote?.fee_brl || ""),
          sourceAmount: String(payloadForFeedback?.source_amount || payloadForFeedback?.quote?.sourceAmount || payloadForFeedback?.amount || ""),
          sourceAssetCode: String(payloadForFeedback?.source_asset_code || payloadForFeedback?.quote?.sourceAsset?.code || payloadForFeedback?.asset_code || ""),
        })
        const savingsForFeedback = formatBrl(String(payloadForFeedback?.savings_estimate?.estimated_savings_brl || ""))
        const monthlySavingsForFeedback = formatBrl(String(payload?.monthly_savings?.estimated_savings_brl || ""))
        enqueueWebChatFeedback([
          "Payment sent successfully.",
          conversionMessage,
          `Amount: ${String(payload.amount || payload.transferDetails?.destinationAmount || "").trim()} ${String(payload.asset || payload.assetCode || payload.transferDetails?.destinationAssetCode || "").trim()}`.trim(),
          `Destination: ${shortenValue(String(payload.destination || payload.destinationName || ""))}`,
          feedbackIsCrossAsset && routeForFeedback ? `Best path: ${routeForFeedback}` : "",
          hasUsableFeeDisplay(estimatedFeeForFeedback) ? `Estimated fee: ${estimatedFeeForFeedback}` : "",
          feedbackIsCrossAsset && savingsForFeedback ? `Estimated savings: ${savingsForFeedback}` : "",
          monthlySavingsForFeedback ? `Monthly savings so far: ${monthlySavingsForFeedback}` : "",
          hash ? `Transaction: ${shortenValue(hash, 8, 8)}` : "",
          `Time: ${formatTimestamp(payload.completed_at)}`,
          receiptUrl ? `Receipt: ${receiptUrl}` : "",
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
      const message = error instanceof Error ? error.message : "Failed to confirm payment"
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  async function handlePasskeyConfirm(attempt = 0) {
    if (!token.trim() || validation?.valid === false || submitLockRef.current || status === "done") return
    if (!window.PublicKeyCredential) {
      setPasskeyStatus("error")
      setPasskeyError("This browser does not support Passkey/WebAuthn.")
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
        throw new Error(initPayload?.message || "Could not start biometric authentication.")
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
        setMobileSyncStatus("")
        setPasskeyStatus("idle")
      } else {
        const serverMessage = String(payload?.message || payload?.error || "")
        if (attempt < 1 && isPasskeyChallengeExpiredMessage(serverMessage)) {
          submitLockRef.current = false
          setMobileSyncStatus("Biometric challenge expired while switching devices. Generating a new challenge...")
          setPasskeyStatus("starting")
          await handlePasskeyConfirm(attempt + 1)
          return
        }
        submitLockRef.current = false
        setPasskeyStatus("error")
        setPasskeyError(serverMessage || "Failed to confirm with biometrics.")
      }
    } catch (error: any) {
      const message = getPasskeyErrorMessage(error)
      if (attempt < 1 && isPasskeyChallengeExpiredMessage(message)) {
        submitLockRef.current = false
        setMobileSyncStatus("Biometric challenge expired while switching devices. Generating a new challenge...")
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
        error: message,
      })
    }
  }

  const payload = validation?.payload || decodeJwtPayload(token)
  const externalProvider = String(searchParams.get("provider") || payload.provider || payload.source || "").trim().toLowerCase()
  const providerLabel = getProviderLabel(externalProvider)
  const returnMessage = providerLabel ? `Completed. Return to ${providerLabel} to continue.` : ""
  const assetCode = normalizeAssetCode(payload.asset_code || payload.assetCode || "")
  const amountLabel = formatPaymentAmount(payload.amount, assetCode)
  const sourceAssetCode = normalizeAssetCode(payload.source_asset_code || payload.quote?.sourceAsset?.code || "")
  const sourceAmount = String(payload.source_amount || payload.quote?.sourceAmount || "")
  const sourceAmountLabel = sourceAmount && sourceAssetCode ? formatPaymentAmount(sourceAmount, sourceAssetCode) : ""
  const isCrossCurrency = Boolean(sourceAmountLabel && sourceAssetCode && sourceAssetCode !== assetCode)
  const shouldShowCrossAssetInsights = isCrossCurrency
  const destinationLabel = formatRecipientLabel(payload)
  const estimatedFeeDisplay = String(payload.estimated_fee_display || payload.quote?.fee_display || "")
  const estimatedSavingsBrl = String(payload?.savings_estimate?.estimated_savings_brl || "")
  const estimatedSavingsPct = Number(String(payload?.savings_estimate?.savings_percentage_over_traditional_fee || "").replace(",", "."))
  const routeChain = formatRouteChainFromPayload(payload)
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
  const successMonthlySavings = formatBrl(String(result?.monthly_savings?.estimated_savings_brl || ""))
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12 sm:px-6">
        <div className="grid min-w-0 w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-emerald-200">
              Payment Confirmation
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Confirm this payment
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Review the details below and enter your PIN to authorize the transfer.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 text-xs">
              {["Review", "Authorize", "Complete"].map((step, index) => {
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
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Payment</p>
                <p className="mt-2 text-sm text-slate-200">
                  {isCrossCurrency ? sourceAmountLabel : amountLabel}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Recipient</p>
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
                <p className="font-medium text-white">Summary</p>
                <p className="mt-2 text-slate-300">
                  {isCrossCurrency ? `You send: ${sourceAmountLabel}` : `Amount: ${amountLabel}`}
                </p>
                {isCrossCurrency && (
                  <p className="text-slate-300">Recipient receives approximately: {amountLabel}</p>
                )}
                <p className="text-slate-300">Destination: {destinationLabel}</p>
                {showEstimatedFee && (
                  <p className="text-slate-300">Estimated total fee: {estimatedFeeSummary}</p>
                )}
                {shouldShowCrossAssetInsights && routeChain && (
                  <p className="text-slate-300">Best path found: {routeChain}</p>
                )}
                {shouldShowCrossAssetInsights && formatBrl(estimatedSavingsBrl) && (
                  <p className="text-emerald-300 font-medium">
                    Cheapest route found: you save {formatBrl(estimatedSavingsBrl)}
                    {Number.isFinite(estimatedSavingsPct) && estimatedSavingsPct > 0 ? ` (${estimatedSavingsPct.toFixed(1)}%)` : ""}
                    {" "}vs traditional methods.
                  </p>
                )}
                {assetCode !== "XLM" && !isCrossCurrency && (
                  <p className="text-emerald-300">Guaranteed amount at destination: {amountLabel}</p>
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
                  placeholder="Enter your PIN"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400/60 focus:bg-white/10"
                />
              </div>

              <button
                type="submit"
                disabled={status === "submitting" || status === "done" || !token.trim() || !pin.trim() || validation?.valid === false}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? <span className="inline-flex items-center gap-2"><Spinner />Confirming payment...</span> : "Confirm payment"}
              </button>
              <button
                type="button"
                onClick={() => setShowPasskeyOptions((current) => !current)}
                disabled={status === "submitting" || status === "done" || !token.trim() || validation?.valid === false}
                className="inline-flex w-full items-center justify-center rounded-2xl border border-indigo-300/40 bg-indigo-500/20 px-4 py-3 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {showPasskeyOptions ? "Hide Passkey options" : "Use Touch ID (Passkey)"}
              </button>
              {showPasskeyOptions && (
                <>
                  <button
                    type="button"
                    onClick={() => { void handlePasskeyConfirm(); }}
                    disabled={status === "submitting" || status === "done" || !token.trim() || validation?.valid === false}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passkeyStatus === "starting" || passkeyStatus === "authenticating" || passkeyStatus === "submitting"
                      ? "Authenticating with Touch ID..."
                      : "Confirm with Touch ID (Passkey)"}
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
                <p className="font-medium text-white">Confirm on mobile with Touch ID</p>
                <p className="mt-1 text-slate-300">Scan the QR with your phone to open this confirmation and authorize with Touch ID.</p>
                <div className="mt-3 flex justify-center">
                  <img
                    src={qrImageUrl}
                    alt="QR code to confirm payment on mobile"
                    className="h-72 w-72 rounded-xl border border-white/10 bg-white p-3"
                  />
                </div>
                {qrTargetUrl && (
                  <p className="mt-3 break-all text-xs text-slate-400">{qrTargetUrl}</p>
                )}
              </div>
            )}

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Result</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Waiting for confirmation.</p>}
              {status === "submitting" && (
                <div className="mt-3 inline-flex items-center gap-2 text-slate-300"><TypingDots />Processing on the network...</div>
              )}
              <AnimatePresence mode="wait">
              {status === "done" && result?.success && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 space-y-3 text-emerald-100"
                >
                  <p className="text-base font-semibold text-emerald-300">Payment sent successfully</p>
                  <div className="space-y-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm">
                    <p><span className="text-slate-300">Amount: </span>{successAmount} {successAsset}</p>
                    <p><span className="text-slate-300">Destination: </span><span className="font-mono">{shortenValue(successDestination)}</span></p>
                    <p><span className="text-slate-300">Transaction: </span><span className="font-mono">{shortenValue(successHash, 8, 8)}</span></p>
                    <p><span className="text-slate-300">Time: </span>{formatTimestamp(result.completed_at)}</p>
                  </div>
                  {showResultFee && (
                    <p>Applied fee: {resultFeeSummary || "applied fee unavailable"}</p>
                  )}
                  {shouldShowCrossAssetInsights && formatBrl(estimatedSavingsBrl) && (
                    <p>Estimated savings on this operation with the best route: {formatBrl(estimatedSavingsBrl)}</p>
                  )}
                  {successAutoConversionMessage && (
                    <p>{successAutoConversionMessage}</p>
                  )}
                  {successMonthlySavings && (
                    <p>You have already saved {successMonthlySavings} this month using TalkToStellar.</p>
                  )}
                  {successReceiptUrl && (
                    <a
                      href={successReceiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                    >
                      View receipt
                    </a>
                  )}
                  {result.receiptImageDataUrl && (
                    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.08 }} className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                      <motion.img
                        src={result.receiptImageDataUrl}
                        alt="TalkToStellar receipt"
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
              {status === "error" && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-rose-300">{result?.error || result?.message || "Something went wrong."}</motion.p>}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
