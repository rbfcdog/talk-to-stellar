"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback } from "@/lib/web-feedback"
import { Spinner, TypingDots } from "@/components/ui/feedback"

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

function formatAmount(amount?: string, assetCode?: string) {
  if (!String(amount || "").trim()) return "Valor indisponível"
  const code = String(assetCode || "").toUpperCase().replace(/^USD$/, "USDC")
  const n = Number(String(amount || "").replace(",", "."))
  if (!Number.isFinite(n)) return "Valor indisponível"
  if (code === "BRL") return `R$ ${n.toFixed(2)}`
  if (code === "USDC") return `US$ ${n.toFixed(2)}`
  if (code === "XLM") return "saldo da carteira TalkToStellar"
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

function getProviderLabel(provider?: string) {
  const normalized = String(provider || "").trim().toLowerCase()
  if (normalized === "telegram") return "Telegram"
  if (normalized === "whatsapp" || normalized === "phone") return "WhatsApp"
  return normalized ? normalized : ""
}

export default function ConfirmConversionClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const router = useRouter()

  const [token, setToken] = useState(tokenFromUrl)
  const [status, setStatus] = useState("ready")
  const [result, setResult] = useState<ConfirmResponse | null>(null)
  const [pin, setPin] = useState("")
  const [validation, setValidation] = useState<ValidationResult>(initialValidation || { success: false, valid: false })
  const submitLockRef = useRef(false)

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
            message: payload?.message || "Link inválido ou expirado. Gere um novo link de confirmação.",
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
    closeIntermediatePage(5000)
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
        }),
      })

      const payload = (await response.json()) as ConfirmResponse
      setResult(payload)
      setStatus(response.ok ? "done" : "error")
      if (response.ok && payload?.success) {
        enqueueWebChatFeedback([
          "✅ Conversão concluída.",
          payload.transferDetails?.sourceAmount
            ? `Origem debitada: ${formatAmount(payload.transferDetails.sourceAmount, payload.transferDetails.sourceAssetCode)}`
            : "",
          payload.transferDetails?.destinationAmount
            ? `Destino recebeu: ${formatAmount(payload.transferDetails.destinationAmount, payload.transferDetails.destinationAssetCode)}`
            : "",
          payload.transferDetails?.feeDisplay ? `Taxa: ${payload.transferDetails.feeDisplay}` : "",
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
      const message = error instanceof Error ? error.message : "Falha ao confirmar conversão"
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  const payload = validation?.payload || decodeJwtPayload(token)
  const externalProvider = String(searchParams.get("provider") || payload.provider || payload.source || "").trim().toLowerCase()
  const providerLabel = getProviderLabel(externalProvider)
  const returnMessage = providerLabel ? `Concluído. Volte ao ${providerLabel} para continuar.` : ""
  const sourceAssetCode = String(payload.source_asset_code || payload.sourceAssetCode || "XLM").toUpperCase().replace(/^USD$/, "USDC")
  const destAssetCode = String(payload.dest_asset_code || payload.destAssetCode || "XLM").toUpperCase().replace(/^USD$/, "USDC")
  const sourceAmount = String(payload.source_amount || payload.sourceAmount || "")
  const destAmount = String(payload.dest_amount || payload.destAmount || "")
  const estimatedFeeDisplay = String(payload.estimated_fee_display || payload.quote?.fee_display || "")
  const showEstimatedFee = hasUsableFeeDisplay(estimatedFeeDisplay)
  const resultFeeDisplay = result?.transferDetails?.feeDisplay || ""
  const showResultFee = hasUsableFeeDisplay(resultFeeDisplay)
  const currentStep = status === "submitting" ? 2 : status === "done" ? 3 : 1

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12 sm:px-6">
        <div className="grid min-w-0 w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-emerald-200">
              Confirmação de conversão
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Confirme esta conversão
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Confira os dados e digite seu PIN para executar a conversão na sua carteira.
              </p>
              {validation && (
                <div className="mt-3 rounded-md bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <strong>Status: </strong>
                  {validation.valid ? (
                    <span className="text-emerald-300">Link válido</span>
                  ) : (
                    <span className="text-rose-300">{validation.message || 'Link inválido ou ausente'}</span>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 text-xs">
              {["Revisar", "Autorizar", "Concluído"].map((step, index) => (
                <motion.div key={step} layout className={`rounded-xl px-3 py-2 text-center transition ${currentStep >= index + 1 ? "bg-emerald-400/20 text-emerald-200" : "text-slate-400"}`}>
                  {step}
                </motion.div>
              ))}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Origem</p>
                <p className="mt-2 text-sm text-slate-200">
                  {formatAmount(sourceAmount, sourceAssetCode)}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Destino</p>
                <p className="mt-2 text-sm text-slate-200">
                  {formatAmount(destAmount, destAssetCode)}
                </p>
              </div>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">Resumo</p>
                <p className="mt-2 text-slate-300">Debitar: {formatAmount(sourceAmount, sourceAssetCode)}</p>
                <p className="text-slate-300">Receber: {formatAmount(destAmount, destAssetCode)}</p>
                {showEstimatedFee && (
                  <p className="text-slate-300">Taxa total estimada: {estimatedFeeDisplay}</p>
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
                {status === "submitting" ? <span className="inline-flex items-center gap-2"><Spinner />Confirmando conversão...</span> : "Confirmar conversão"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Resultado</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Aguardando confirmação.</p>}
              {status === "submitting" && <div className="mt-3 inline-flex items-center gap-2 text-slate-300"><TypingDots />Executando conversão...</div>}
              <AnimatePresence mode="wait">
              {status === "done" && result?.success && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-1 text-emerald-300">
                  <p>Conversão confirmada com sucesso.</p>
                  {result.transferDetails?.sourceAmount && (
                    <p>
                      Origem debitada: {formatAmount(result.transferDetails.sourceAmount, result.transferDetails.sourceAssetCode)}
                    </p>
                  )}
                  {result.transferDetails?.destinationAmount && (
                    <p>
                      Destino recebeu: {formatAmount(result.transferDetails.destinationAmount, result.transferDetails.destinationAssetCode)}
                    </p>
                  )}
                  {showResultFee && (
                    <p>Taxa aplicada: {resultFeeDisplay}</p>
                  )}
                  {returnMessage && <p>{returnMessage}</p>}
                  <p className="text-xs text-slate-400">Esta janela fecha automaticamente em alguns segundos.</p>
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
