"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { idempotentFetch } from "@/lib/idempotency"
import { Spinner, TypingDots } from "@/components/shared/feedback"
import { OperationProgressPanel, type OperationProgressStatus } from "@/components/ui/operation-progress"
import { SecureLinkState } from "@/components/shared/secure-link-state"
import { normalizeLanguage, useLanguage, type AppLanguage } from "@/lib/i18n"
import { mapPublicError } from "@/lib/public-errors"
import { resolveReturnTarget, type ReturnTarget } from "@/lib/return-target"
import { closeIntermediatePage, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"

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
  code?: string
  support_code?: string
  request_id?: string
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
  if (code === "EUR" || code === "EURC") return "CETES"
  return code
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
  if (code === "CETES") return `${n.toFixed(2)} CETES`
  if (code === "XLM") return `${n.toFixed(2)} XLM`
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

function isPixReturnTarget(target: ReturnTarget) {
  const source = String(target?.source || "").toLowerCase()
  const href = String(target?.href || "").toLowerCase()
  return (
    source.includes("pix") ||
    source.includes("onramp") ||
    source.includes("offramp") ||
    href.includes("/pix-") ||
    href.includes("/pix-ramp")
  )
}

function buildActionUrl(path: string, params: Record<string, unknown>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim()
    if (text) search.set(key, text)
  }
  const query = search.toString()
  return query ? `${path}?${query}` : path
}

function publicConversionErrorMessage(error: unknown, language: AppLanguage) {
  const mapped = mapPublicError(error, language)
  if (mapped.code === "link_expired") {
    return T(language, "Essa confirmação expirou ou já foi usada. Abra uma nova confirmação de conversão.", "This confirmation expired or was already used. Open a new conversion confirmation.")
  }
  if (mapped.code === "quote_expired") {
    return T(language, "A estimativa expirou. Volte para conversão e gere uma nova confirmação.", "The estimate expired. Return to conversion and create a new confirmation.")
  }
  return mapped.message
}

export default function ConfirmConversionClient({
  initialToken = '',
  initialValidation = null,
  initialReturnTarget = null,
}: {
  initialToken?: string
  initialValidation?: any
  initialReturnTarget?: ReturnTarget | null
}) {
  const searchParams = useSearchParams()
  const { language } = useLanguage()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const router = useRouter()

  const [token, setToken] = useState(tokenFromUrl)
  const [completionProvider] = useState(() => String(searchParams.get("provider") || decodeJwtPayload(tokenFromUrl)?.provider || "").trim().toLowerCase())
  const [completionProviderUserId] = useState(() => String(searchParams.get("provider_user_id") || decodeJwtPayload(tokenFromUrl)?.provider_user_id || "").trim())
  const [completionSource] = useState(() => String(searchParams.get("source") || decodeJwtPayload(tokenFromUrl)?.source || completionProvider || "").trim().toLowerCase())
  const [queryReturnTo] = useState(() => String(searchParams.get("return_to") || searchParams.get("returnTo") || "").trim())
  const [queryReturnSource] = useState(() => String(searchParams.get("from") || searchParams.get("origin") || "").trim())
  const [status, setStatus] = useState("ready")
  const [result, setResult] = useState<ConfirmResponse | null>(null)
  const [pin, setPin] = useState("")
  const [validation, setValidation] = useState<ValidationResult>(initialValidation || {})
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null)
  const [progressNow, setProgressNow] = useState(Date.now())
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
        if (!response.ok || !payload?.valid) {
          setValidation({
            success: false,
            valid: false,
            message: publicConversionErrorMessage(payload?.message || "Invalid or expired link.", feedbackLanguage),
          })
          return
        }
        setValidation(payload?.payload ? payload : { success: true, valid: true, payload: fallbackPayload })
      } catch {
        setValidation({
          success: false,
          valid: false,
          message: T(feedbackLanguage, "Não foi possível validar este link. Peça uma nova confirmação para continuar.", "Could not validate this link. Request a new confirmation to continue."),
        })
      }
    }
    validateToken()
  }, [token])

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

  const payload = validation?.payload || {}
  const returnTarget = initialReturnTarget || resolveReturnTarget({
    language: feedbackLanguage,
    returnTo: payload.return_to || payload.returnTo || queryReturnTo,
    source: payload.return_source || payload.returnSource || payload.from || queryReturnSource || payload.source || completionSource,
    fallbackSource: "convert",
  })
  const pixReturnTarget = isPixReturnTarget(returnTarget)

  useEffect(() => {
    if (status !== "done" || !result?.success || !pixReturnTarget) return
    closeIntermediatePage()
  }, [pixReturnTarget, result?.success, status])

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

  const sourceAssetCode = normalizeAssetCode(payload.source_asset_code || payload.sourceAssetCode || "")
  const destAssetCode = normalizeAssetCode(payload.dest_asset_code || payload.destAssetCode || "")
  const isCrossAssetConversion = Boolean(sourceAssetCode && destAssetCode && sourceAssetCode !== destAssetCode)
  const sourceAmount = String(payload.source_amount || payload.sourceAmount || "")
  const destAmount = String(payload.dest_amount || payload.destAmount || "")
  const nextDestinationAssetCode = normalizeAssetCode(result?.transferDetails?.destinationAssetCode || destAssetCode || "")
  const nextDestinationAmount = String(result?.transferDetails?.destinationAmount || destAmount || "")
  const keepEarningUrl = buildActionUrl("/review", {
    asset: nextDestinationAssetCode,
    amount: nextDestinationAmount,
    advanced: "1",
    from: "confirm-conversion",
    lang: feedbackLanguage,
  })
  const transactionsUrl = buildActionUrl("/transactions", {
    from: "confirm-conversion",
    lang: feedbackLanguage,
  })
  const estimatedFeeDisplay = String(payload.estimated_fee_display || payload.quote?.fee_display || "")
  const showEstimatedFee = hasUsableFeeDisplay(estimatedFeeDisplay)
  const routeChain = formatRouteChainFromPayload(payload)
  const estimatedSavingsBrl = String(payload?.savings_estimate?.estimated_savings_brl || "")
  const estimatedSavingsPct = Number(String(payload?.savings_estimate?.savings_percentage_over_traditional_fee || "").replace(",", "."))
  const resultFeeDisplay = result?.transferDetails?.feeDisplay || ""
  const showResultFee = hasUsableFeeDisplay(resultFeeDisplay)
  const currentStep = status === "submitting" ? 2 : status === "done" ? 3 : 1
  const progressStatus = (status === "submitting" || status === "done" || status === "error" ? status : "ready") as OperationProgressStatus
  const progressElapsedSeconds = progressStartedAt ? Math.max(0, Math.floor((progressNow - progressStartedAt) / 1000)) : 0
  const conversionProgressSteps = [
    {
      label: T(feedbackLanguage, "PIN validado", "PIN validated"),
      detail: T(feedbackLanguage, "A autorização é conferida antes de converter saldo.", "Authorization is checked before converting balance."),
    },
    {
      label: T(feedbackLanguage, "Rota recalculada", "Route recalculated"),
      detail: T(feedbackLanguage, "O backend confirma a rota mais segura disponível.", "The backend confirms the safest available route."),
    },
    {
      label: T(feedbackLanguage, "Conversão enviada", "Conversion submitted"),
      detail: T(feedbackLanguage, "A confirmação é enviada para sua conta.", "The confirmation is submitted to your account."),
    },
    {
      label: T(feedbackLanguage, "Saldo atualizado", "Balance updated"),
      detail: T(feedbackLanguage, "O resultado é salvo no histórico da conta.", "The result is saved in the account history."),
    },
  ]
  const visibleError = result?.error || result?.message
    ? publicConversionErrorMessage(result?.error || result?.message, feedbackLanguage)
    : T(feedbackLanguage, "Não consegui confirmar essa conversão agora. Tente novamente em alguns segundos.", "I could not confirm this conversion right now. Try again in a few seconds.")
  const visibleSupportCode = String(result?.support_code || result?.request_id || "").trim()

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl items-start px-4 py-3 sm:px-6 sm:py-10">
        <div className="grid min-w-0 w-full gap-4 overflow-hidden border border-tts-border bg-tts-surface p-4 shadow-sm backdrop-blur md:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] md:gap-6 md:p-8">
          <section className="min-w-0 space-y-3 overflow-hidden md:space-y-5">
            <div className="inline-flex border border-tts-confirm bg-tts-confirm/10 px-4 py-1 text-xs font-black uppercase tracking-normal text-tts-confirm">
              {T(feedbackLanguage, "Confirmação de conversão", "Conversion confirmation")}
            </div>
            <div className="space-y-2 md:space-y-4">
	              <h1 className="max-w-xl text-2xl font-bold tracking-normal text-tts-deep md:text-3xl">
	                {T(feedbackLanguage, "Confirmar conversão", "Confirm conversion")}
              </h1>
              <p className="tts-mobile-soft-hide max-w-2xl text-sm leading-6 text-tts-muted md:block">
                {T(feedbackLanguage, "Confira os valores e digite seu PIN para concluir na sua conta.", "Check the details and enter your PIN to complete it in your account.")}
              </p>
            </div>
            <div className="tts-stage-strip grid-cols-3 text-xs">
              {[T(feedbackLanguage, "Conferir", "Check"), T(feedbackLanguage, "Autorizar", "Authorize"), T(feedbackLanguage, "Concluir", "Complete")].map((step, index) => (
                <motion.div
                  key={step}
                  layout
                  data-active={currentStep >= index + 1}
                  className={`tts-stage-button grid place-items-center px-2 text-center transition ${currentStep >= index + 1 ? "bg-tts-deep text-tts-bg" : "text-tts-muted"}`}
                >
                  {step}
                </motion.div>
              ))}
            </div>

            <div className="hidden min-w-0 gap-4 md:grid sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden border border-tts-border bg-tts-bg p-4">
                <p className="text-sm font-black uppercase tracking-normal text-tts-muted">{T(feedbackLanguage, "Origem", "Source")}</p>
                <p className="mt-2 text-sm text-tts-deep">
                  {formatAmount(sourceAmount, sourceAssetCode, feedbackLanguage)}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden border border-tts-border bg-tts-bg p-4">
                <p className="text-sm font-black uppercase tracking-normal text-tts-muted">{T(feedbackLanguage, "Destino", "Destination")}</p>
                <p className="mt-2 text-sm text-tts-deep">
                  {formatAmount(destAmount, destAssetCode, feedbackLanguage)}
                </p>
              </div>
            </div>
            <p className="tts-mobile-soft-hide text-xs leading-5 text-tts-muted md:block">
              {T(feedbackLanguage, "Testnet: valores de conversão são estimados e podem variar.", "Testnet: conversion values are estimated and may vary.")}
            </p>

            <div className="hidden gap-3 md:grid md:grid-cols-2">
              <a href={keepEarningUrl} className="border border-tts-border bg-tts-bg p-4 transition hover:border-tts-confirm">
                <p className="text-sm font-black text-tts-deep">{T(feedbackLanguage, "Aplicar destino", "Apply destination")}</p>
                <p className="mt-2 text-xs leading-5 text-tts-muted">{T(feedbackLanguage, "Use o destino desta conversão em uma aplicação.", "Use this conversion destination in an application.")}</p>
              </a>
              <a href={transactionsUrl} className="border border-tts-border bg-tts-bg p-4 transition hover:border-tts-confirm">
                <p className="text-sm font-black text-tts-deep">{T(feedbackLanguage, "Histórico", "History")}</p>
                <p className="mt-2 text-xs leading-5 text-tts-muted">{T(feedbackLanguage, "Veja conversões, PIX e ajustes da conta.", "See conversions, PIX, and account adjustments.")}</p>
              </a>
            </div>
          </section>

          <section className="tts-mobile-flow-card tts-stage-panel min-w-0 overflow-hidden p-4 md:p-5">
            <form className={`${status === "submitting" || status === "done" ? "hidden md:block" : "block"} space-y-4`} onSubmit={handleSubmit}>
	              <div className="min-w-0 overflow-hidden border border-tts-border bg-tts-bg p-3 text-sm text-tts-deep">
	                <p className="tts-field-label font-black text-tts-deep">{T(feedbackLanguage, "Confira os valores", "Review values")}</p>
	                <div className="mt-3 grid gap-2">
	                  <div className="rounded-xl border border-tts-border bg-tts-surface p-3">
	                    <p className="text-xs font-black text-tts-muted">{T(feedbackLanguage, "Sai da conta", "Leaves account")}</p>
	                    <p className="mt-1 text-lg font-black text-tts-deep">{formatAmount(sourceAmount, sourceAssetCode, feedbackLanguage)}</p>
	                  </div>
	                  <div className="rounded-xl border border-tts-border bg-tts-surface p-3">
	                    <p className="text-xs font-black text-tts-muted">{T(feedbackLanguage, "Entra na conta", "Enters account")}</p>
	                    <p className="mt-1 text-lg font-black text-tts-deep">{formatAmount(destAmount, destAssetCode, feedbackLanguage)}</p>
	                  </div>
	                </div>
	                <p className="tts-mobile-soft-hide mt-2 text-xs text-tts-muted">{T(feedbackLanguage, "Testnet: conversão estimada.", "Testnet: estimated conversion.")}</p>
                {showEstimatedFee && (
	                  <p className="tts-mobile-soft-hide text-tts-deep">{T(feedbackLanguage, "Taxa estimada", "Estimated fee")}: {estimatedFeeDisplay}</p>
                )}
                {isCrossAssetConversion && routeChain && (
	                  <p className="tts-mobile-soft-hide text-tts-deep">{T(feedbackLanguage, "Cotação aplicada antes do PIN.", "Quote applied before PIN.")}</p>
                )}
                {isCrossAssetConversion && formatBrl(estimatedSavingsBrl, feedbackLanguage) && (
                  <p className="text-tts-confirm">
                    {T(feedbackLanguage, "Economia estimada vs métodos tradicionais", "Estimated savings vs traditional methods")}: {formatBrl(estimatedSavingsBrl, feedbackLanguage)}
                    {Number.isFinite(estimatedSavingsPct) && estimatedSavingsPct > 0 ? ` (${estimatedSavingsPct.toFixed(1).replace(".", ",")}%)` : ""}
                  </p>
                )}
              </div>

              {status === "error" && (
                <div className="border border-tts-error bg-tts-error/10 p-4 text-sm text-tts-error">
                  <p className="font-black">{T(feedbackLanguage, "Conversão não concluída", "Conversion not completed")}</p>
                  <p className="mt-2">{visibleError}</p>
                  {visibleSupportCode && (
                    <p className="mt-2 text-xs opacity-80">{T(feedbackLanguage, "ID do erro", "Error ID")}: {visibleSupportCode}</p>
                  )}
                </div>
              )}

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
	                  className="tts-fill-field w-full border-2 border-tts-border bg-tts-surface px-4 py-4 text-lg font-black text-tts-deep outline-none transition placeholder:text-tts-muted focus:border-tts-confirm focus:bg-tts-surface"
                />
              </div>

	              <div className={status === "ready" || status === "submitting" ? "tts-mobile-action" : ""}>
	                <button
	                  type="submit"
	                  disabled={status === "submitting" || status === "done" || !token.trim() || !pin.trim()}
	                  className="inline-flex w-full items-center justify-center bg-tts-confirm px-4 py-4 text-base font-black text-tts-deep transition hover:bg-tts-confirm disabled:cursor-not-allowed disabled:opacity-60"
                >
	                  {status === "submitting" ? <span className="inline-flex items-center gap-2"><Spinner />{T(feedbackLanguage, "Confirmando conversão...", "Confirming conversion...")}</span> : T(feedbackLanguage, "Confirmar conversão", "Confirm conversion")}
	                </button>
	              </div>
	            </form>

	            <div className={`mt-4 ${status === "ready" ? "hidden md:block" : "block"}`}>
	              <OperationProgressPanel
	                status={progressStatus}
	                elapsedSeconds={progressElapsedSeconds}
	                title={T(feedbackLanguage, "Andamento da conversão", "Conversion progress")}
	                readyMessage={T(feedbackLanguage, "Depois de confirmar, esta tela mostra validação, rota e saldo.", "After confirmation, this screen shows validation, route, and balance.")}
	                runningMessage={T(feedbackLanguage, "Conversão em andamento. Não clique de novo; a rota e sua conta estão sendo processadas.", "Conversion in progress. Do not click again; route and account are being processed.")}
	                doneMessage={T(feedbackLanguage, "Conversão concluída. O saldo foi atualizado.", "Conversion completed. Balance was updated.")}
	                errorMessage={T(feedbackLanguage, "A conversão parou antes de concluir. Confira o erro destacado acima antes de tentar novamente.", "The conversion stopped before completion. Check the highlighted error above before trying again.")}
	                steps={conversionProgressSteps}
	              />
	            </div>

	            <div className={`tts-stage-panel mt-4 p-4 text-sm text-tts-deep ${status === "ready" ? "hidden md:block" : "block"}`}>
              <p className="font-black text-tts-deep">{T(feedbackLanguage, "Resultado", "Result")}</p>
              {status === "ready" && <p className="mt-2 text-tts-muted">{T(feedbackLanguage, "Aguardando confirmação.", "Waiting for confirmation.")}</p>}
              {status === "submitting" && <div className="mt-3 inline-flex items-center gap-2 text-tts-deep"><TypingDots />{T(feedbackLanguage, "Executando conversão com a cotação confirmada...", "Executing conversion with the confirmed quote...")}</div>}
              <AnimatePresence mode="wait">
              {status === "done" && result?.success && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-1 text-tts-confirm">
                  <p>{T(feedbackLanguage, "Conversão confirmada com sucesso.", "Conversion confirmed successfully.")}</p>
                  {result.transferDetails?.sourceAmount && (
                    <p>
                      {T(feedbackLanguage, "Origem debitada", "Source debited")}: {formatAmount(result.transferDetails.sourceAmount, result.transferDetails.sourceAssetCode, feedbackLanguage)}
                    </p>
                  )}
                  {result.transferDetails?.destinationAmount && (
                    <p>
                      {T(feedbackLanguage, "Destino recebido", "Destination received")}: {formatAmount(result.transferDetails.destinationAmount, result.transferDetails.destinationAssetCode, feedbackLanguage)}
                    </p>
                  )}
                  {showResultFee && (
                    <p>{T(feedbackLanguage, "Taxa aplicada", "Applied fee")}: {resultFeeDisplay}</p>
                  )}
                  {isCrossAssetConversion && formatBrl(estimatedSavingsBrl, feedbackLanguage) && (
                    <p>{T(feedbackLanguage, "Economia estimada nesta operação", "Estimated savings on this operation")}: {formatBrl(estimatedSavingsBrl, feedbackLanguage)}</p>
                  )}
                  {!pixReturnTarget && (
                    <a
                      href={returnTarget.href}
                      className="mt-3 inline-flex w-full items-center justify-center bg-tts-deep px-4 py-3 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
                    >
                      {returnTarget.label}
                    </a>
                  )}
                </motion.div>
              )}
              {status === "error" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 space-y-1 text-tts-error">
                  <p>{visibleError}</p>
                  {visibleSupportCode && (
                    <p className="text-xs opacity-80">{T(feedbackLanguage, "ID do erro", "Error ID")}: {visibleSupportCode}</p>
                  )}
                </motion.div>
              )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {status === "done" && result?.success && pixReturnTarget && (
                <motion.div
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.98 }}
                  className="fixed inset-x-3 bottom-3 z-50 rounded-3xl border border-tts-confirm/60 bg-tts-surface/95 p-4 text-tts-deep shadow-2xl shadow-black/30 backdrop-blur md:static md:mt-4 md:rounded-2xl"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-tts-confirm text-sm font-black text-tts-deep">
                      OK
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase tracking-normal text-tts-confirm">
                        {T(feedbackLanguage, "PIX atualizado", "PIX updated")}
                      </p>
                      <p className="mt-1 text-base font-black text-tts-deep">
                        {T(feedbackLanguage, "Volte ao PIX para continuar.", "Back to PIX to continue.")}
                      </p>
                      <p className="mt-1 text-xs font-bold text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
                    </div>
                  </div>
                  <a
                    href={returnTarget.href}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-tts-confirm px-4 py-4 text-sm font-black text-tts-deep transition hover:bg-tts-confirm/90"
                  >
                    {returnTarget.label}
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </main>
  )
}
