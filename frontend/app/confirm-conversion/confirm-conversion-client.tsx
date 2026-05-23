"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { Spinner, TypingDots } from "@/components/ui/feedback"
import { normalizeLanguage, useLanguage, type AppLanguage } from "@/lib/i18n"
import { mapPublicError } from "@/lib/public-errors"

type ValidationResult = {
  success?: boolean
  valid?: boolean
  payload?: any
  message?: string
}

type ConfirmResponse = {
  success: boolean
  conversionConfirmed?: boolean
  sessionId?: string
  userId?: string
  sourceAssetCode?: string
  destAssetCode?: string
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
    exact?: boolean
  }
  message?: string
  error?: string
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

function T(language: AppLanguage, pt: string, en: string) {
  return language === "pt-BR" ? pt : en
}

function formatAmount(amount?: string, assetCode?: string, language: AppLanguage = "en") {
  if (!String(amount || "").trim()) return T(language, "Valor indisponível", "Amount unavailable")
  const code = normalizeAssetCode(assetCode || "")
  const n = Number(String(amount || "").replace(",", "."))
  if (!Number.isFinite(n)) return T(language, "Valor indisponível", "Amount unavailable")
  if (code === "BRL") return `R$ ${n.toFixed(2)}`
  if (code === "USDC") return `US$ ${n.toFixed(2)}`
  if (code === "XLM") return "saldo da conta TalkToStellar"
  return `${n.toFixed(2)} ${code}`
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

function formatBrl(value?: string, language: AppLanguage = "en") {
  const amount = Number(String(value || "").replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return ""
  const displayAmount = amount > 0 && amount < 0.01 ? 0.01 : amount
  return new Intl.NumberFormat(language === "pt-BR" ? "pt-BR" : "en-US", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(displayAmount)
}

function formatRouteChainFromPayload(payload: any) {
  const explicit = String(payload?.route_chain || payload?.route?.chain || "").trim()
  if (explicit) return explicit
  const quote = payload?.quote
  const source = String(quote?.sourceAsset?.code || payload?.source_asset_code || "").trim().toUpperCase()
  const destination = String(quote?.destinationAsset?.code || payload?.dest_asset_code || payload?.destination_asset_code || "").trim().toUpperCase()
  const hops = Array.isArray(quote?.path)
    ? quote.path
      .map((item: any) => String(item?.code || item?.asset_code || "").trim().toUpperCase())
      .filter(Boolean)
    : []
  const chain = [source, ...hops, destination].filter(Boolean)
  const compact = chain.filter((asset, index) => index === 0 || asset !== chain[index - 1])
  return compact.join(" -> ")
}

function getProviderLabel(provider?: string) {
  const normalized = String(provider || "").trim().toLowerCase()
  if (normalized === "telegram") return "Telegram"
  if (normalized === "whatsapp" || normalized === "phone") return "WhatsApp"
  return normalized ? normalized : ""
}

function publicConversionErrorMessage(error: unknown, language: AppLanguage) {
  return mapPublicError(error, language).message
}

export default function ConfirmConversionClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const searchParams = useSearchParams()
  const { language } = useLanguage()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const router = useRouter()

  const [token, setToken] = useState(tokenFromUrl)
  const [completionProvider] = useState(() => String(searchParams.get("provider") || decodeJwtPayload(tokenFromUrl)?.provider || "").trim().toLowerCase())
  const [completionProviderUserId] = useState(() => String(searchParams.get("provider_user_id") || decodeJwtPayload(tokenFromUrl)?.provider_user_id || "").trim())
  const [completionSource] = useState(() => String(searchParams.get("source") || decodeJwtPayload(tokenFromUrl)?.source || completionProvider || "").trim().toLowerCase())
  const [status, setStatus] = useState("ready")
  const [result, setResult] = useState<ConfirmResponse | null>(null)
  const [pin, setPin] = useState("")
  const [validation, setValidation] = useState<ValidationResult>(initialValidation || { success: false, valid: false })
  const submitLockRef = useRef(false)
  const feedbackLanguage = useMemo(
    () => normalizeLanguage(searchParams.get("lang") || validation?.payload?.language || validation?.payload?.lang || decodeJwtPayload(token)?.language || language),
    [searchParams, validation?.payload, token, language]
  )

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
      try {
        router.replace(window.location.pathname)
      } catch {}
    }
  }, [tokenFromUrl])

  useEffect(() => {
    async function validateToken() {
      if (!token) return
      const fallbackPayload = decodeJwtPayload(token)
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.valid) {
          setValidation({
            success: false,
            valid: false,
            payload: fallbackPayload,
            message: publicConversionErrorMessage(payload?.message || "Invalid or expired link.", feedbackLanguage),
          })
          return
        }
        setValidation(payload?.payload ? payload : { success: true, valid: true, payload: fallbackPayload })
      } catch {
        setValidation({ success: true, valid: true, payload: fallbackPayload })
      }
    }
    validateToken()
  }, [token])

  useEffect(() => {
    if (!(status === "done" && result?.success)) return
    closeIntermediatePage()
  }, [status, result?.success])

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
          error: publicConversionErrorMessage(payload?.message || payload?.error || "Failed to confirm conversion", feedbackLanguage),
        })
      setStatus(response.ok && payload?.success ? "done" : "error")
      if (response.ok && payload?.success) {
        const payloadForFeedback = validation?.payload || decodeJwtPayload(token)
        const feedbackSourceCode = normalizeAssetCode(String(payloadForFeedback?.source_asset_code || payloadForFeedback?.quote?.sourceAsset?.code || ""))
        const feedbackDestinationCode = normalizeAssetCode(String(payloadForFeedback?.dest_asset_code || payloadForFeedback?.destination_asset_code || payloadForFeedback?.quote?.destinationAsset?.code || ""))
        const feedbackIsCrossAsset = Boolean(feedbackSourceCode && feedbackDestinationCode && feedbackSourceCode !== feedbackDestinationCode)
        const routeForFeedback = formatRouteChainFromPayload(payloadForFeedback)
        const savingsForFeedback = formatBrl(String(payloadForFeedback?.savings_estimate?.estimated_savings_brl || ""), feedbackLanguage)
        enqueueWebChatFeedback([
          T(feedbackLanguage, "Conversão concluída da forma mais otimizada.", "Conversion completed with the most optimized route."),
          payload.transferDetails?.sourceAmount
            ? `${T(feedbackLanguage, "Origem debitada", "Source debited")}: ${formatAmount(payload.transferDetails.sourceAmount, payload.transferDetails.sourceAssetCode, feedbackLanguage)}`
            : "",
          payload.transferDetails?.destinationAmount
            ? `${T(feedbackLanguage, "Destino recebido", "Destination received")}: ${formatAmount(payload.transferDetails.destinationAmount, payload.transferDetails.destinationAssetCode, feedbackLanguage)}`
            : "",
          feedbackIsCrossAsset && routeForFeedback ? T(feedbackLanguage, "Rota mais otimizada selecionada.", "Most optimized route selected.") : "",
          payload.transferDetails?.feeDisplay ? `${T(feedbackLanguage, "Taxa", "Fee")}: ${payload.transferDetails.feeDisplay}` : "",
          feedbackIsCrossAsset && savingsForFeedback ? `${T(feedbackLanguage, "Economia estimada", "Estimated savings")}: ${savingsForFeedback}` : "",
        ].filter(Boolean).join("\n"))
      }
      if (!response.ok || !payload?.success) {
        submitLockRef.current = false
      }
      if (response.ok) {
        try {
          router.replace(window.location.pathname)
        } catch {}
      }
    } catch (error) {
      submitLockRef.current = false
      const message = publicConversionErrorMessage(error instanceof Error ? error.message : "Failed to confirm conversion", feedbackLanguage)
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  const payload = validation?.payload || decodeJwtPayload(token)
  const externalProvider = String(searchParams.get("provider") || payload.provider || payload.source || "").trim().toLowerCase()
  const providerLabel = getProviderLabel(externalProvider)
  const returnMessage = providerLabel ? `Completed. Return to ${providerLabel} to continue.` : ""
  const sourceAssetCode = normalizeAssetCode(payload.source_asset_code || payload.sourceAssetCode || "")
  const destAssetCode = normalizeAssetCode(payload.dest_asset_code || payload.destAssetCode || "")
  const isCrossAssetConversion = Boolean(sourceAssetCode && destAssetCode && sourceAssetCode !== destAssetCode)
  const sourceAmount = String(payload.source_amount || payload.sourceAmount || "")
  const destAmount = String(payload.dest_amount || payload.destAmount || "")
  const estimatedFeeDisplay = String(payload.estimated_fee_display || payload.quote?.fee_display || "")
  const showEstimatedFee = hasUsableFeeDisplay(estimatedFeeDisplay)
  const routeChain = formatRouteChainFromPayload(payload)
  const estimatedSavingsBrl = String(payload?.savings_estimate?.estimated_savings_brl || "")
  const estimatedSavingsPct = Number(String(payload?.savings_estimate?.savings_percentage_over_traditional_fee || "").replace(",", "."))
  const resultFeeDisplay = result?.transferDetails?.feeDisplay || ""
  const showResultFee = hasUsableFeeDisplay(resultFeeDisplay)
  const currentStep = status === "submitting" ? 2 : status === "done" ? 3 : 1
  const visibleError = result?.error || result?.message
    ? publicConversionErrorMessage(result?.error || result?.message, feedbackLanguage)
    : T(feedbackLanguage, "Não consegui confirmar essa conversão agora. Tente novamente em alguns segundos.", "I could not confirm this conversion right now. Try again in a few seconds.")

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12 sm:px-6">
        <div className="grid min-w-0 w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-emerald-200">
              Conversion Confirmation
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Confirm this conversion
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Review the details and enter your PIN to execute the conversion in your account.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 text-xs">
              {["Review", "Authorize", "Complete"].map((step, index) => (
                <motion.div key={step} layout className={`rounded-xl px-3 py-2 text-center transition ${currentStep >= index + 1 ? "bg-emerald-400/20 text-emerald-200" : "text-slate-400"}`}>
                  {step}
                </motion.div>
              ))}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Source</p>
                <p className="mt-2 text-sm text-slate-200">
                  {formatAmount(sourceAmount, sourceAssetCode)}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Destination</p>
                <p className="mt-2 text-sm text-slate-200">
                  {formatAmount(destAmount, destAssetCode)}
                </p>
              </div>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">{T(feedbackLanguage, "Resumo", "Summary")}</p>
                <p className="mt-2 text-slate-300">{T(feedbackLanguage, "Debitar", "Debit")}: {formatAmount(sourceAmount, sourceAssetCode, feedbackLanguage)}</p>
                <p className="text-slate-300">{T(feedbackLanguage, "Receber", "Receive")}: {formatAmount(destAmount, destAssetCode, feedbackLanguage)}</p>
                {showEstimatedFee && (
                  <p className="text-slate-300">{T(feedbackLanguage, "Taxa total estimada", "Estimated total fee")}: {estimatedFeeDisplay}</p>
                )}
                {isCrossAssetConversion && routeChain && (
                  <p className="text-slate-300">{T(feedbackLanguage, "Rota mais otimizada selecionada.", "Most optimized route selected.")}</p>
                )}
                {isCrossAssetConversion && formatBrl(estimatedSavingsBrl, feedbackLanguage) && (
                  <p className="text-emerald-300">
                    {T(feedbackLanguage, "Economia estimada vs métodos tradicionais", "Estimated savings vs traditional methods")}: {formatBrl(estimatedSavingsBrl, feedbackLanguage)}
                    {Number.isFinite(estimatedSavingsPct) && estimatedSavingsPct > 0 ? ` (${estimatedSavingsPct.toFixed(1).replace(".", ",")}%)` : ""}
                  </p>
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
                {status === "submitting" ? <span className="inline-flex items-center gap-2"><Spinner />Confirming conversion...</span> : "Confirm conversion"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Result</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Waiting for confirmation.</p>}
              {status === "submitting" && <div className="mt-3 inline-flex items-center gap-2 text-slate-300"><TypingDots />{T(feedbackLanguage, "Executando conversão da forma mais otimizada...", "Executing conversion with the most optimized route...")}</div>}
              <AnimatePresence mode="wait">
              {status === "done" && result?.success && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-1 text-emerald-300">
                  <p>{T(feedbackLanguage, "Conversão confirmada com sucesso.", "Conversion confirmed successfully.")}</p>
                  {result.transferDetails?.sourceAmount && (
                    <p>
                      Source debited: {formatAmount(result.transferDetails.sourceAmount, result.transferDetails.sourceAssetCode)}
                    </p>
                  )}
                  {result.transferDetails?.destinationAmount && (
                    <p>
                      Destination received: {formatAmount(result.transferDetails.destinationAmount, result.transferDetails.destinationAssetCode)}
                    </p>
                  )}
                  {showResultFee && (
                    <p>Applied fee: {resultFeeDisplay}</p>
                  )}
                  {isCrossAssetConversion && formatBrl(estimatedSavingsBrl) && (
                    <p>Estimated savings on this operation: {formatBrl(estimatedSavingsBrl)}</p>
                  )}
                  {returnMessage && <p>{returnMessage}</p>}
                  <p className="text-xs text-slate-400">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
                </motion.div>
              )}
              {status === "error" && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-rose-300">{visibleError}</motion.p>}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
