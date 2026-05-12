"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { idempotentFetch } from "@/lib/idempotency"

type ValidationResult = {
  success?: boolean
  valid?: boolean
  payload?: any
  message?: string
}

type ConfirmResponse = {
  success: boolean
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
  receiptImageDataUrl?: string
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

function formatPaymentAmount(amount?: string, assetCode?: string) {
  if (!String(amount || "").trim()) return "Valor indisponível"
  const code = String(assetCode || "").toUpperCase().replace(/^USD$/, "USDC")
  const n = Number(String(amount || "").replace(",", "."))
  if (!Number.isFinite(n)) return "Valor indisponível"
  const truncated = Math.trunc(n * 100) / 100
  if (code === "BRL") return `R$ ${truncated.toFixed(2)}`
  if (code === "USDC") return `US$ ${truncated.toFixed(2)}`
  if (code === "XLM") return "saldo da carteira TalkToStellar"
  return `${truncated.toFixed(2)} ${code}`
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
  const code = String(assetCode || "").toUpperCase().replace(/^USD$/, "USDC")
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

  const sourceCode = String(input.sourceAssetCode || "").toUpperCase().replace(/^USD$/, "USDC")
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

export default function ConfirmPaymentClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const publicKeyFromUrl = useMemo(() => searchParams.get("public_key") || searchParams.get("destination_public_key") || '', [searchParams])
  const router = useRouter()

  const [token, setToken] = useState(tokenFromUrl)
  const [publicKey, setPublicKey] = useState(publicKeyFromUrl)
  const [status, setStatus] = useState("ready")
  const [result, setResult] = useState<ConfirmResponse | null>(null)
  const [pin, setPin] = useState("")
  const [validation, setValidation] = useState<ValidationResult>(initialValidation || { success: false, valid: false })

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
      // Preserve public key from URL before we strip query params for privacy
      if (publicKeyFromUrl) setPublicKey(publicKeyFromUrl)
      // remove token from URL to avoid leaking it in history/refs
      try {
        // keep the same pathname (no token/query)
        router.replace(window.location.pathname)
      } catch (err) {
        // ignore in environments where router/window aren't available
      }
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
      } catch (error) {
        setValidation({ success: true, valid: true, payload: fallbackPayload })
      }
    }

    validateToken()
  }, [token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      setStatus(response.ok ? "done" : "error")

      // On success, ensure token is removed from URL (double-safety)
      if (response.ok) {
        try {
          router.replace(window.location.pathname)
        } catch (err) {
          // ignore
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao confirmar pagamento"
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  const payload = validation?.payload || decodeJwtPayload(token)
  const externalProvider = String(searchParams.get("provider") || payload.provider || payload.source || "").trim().toLowerCase()
  const providerLabel = getProviderLabel(externalProvider)
  const returnMessage = providerLabel ? `Concluído. Volte ao ${providerLabel} para continuar.` : ""
  const assetCode = String(payload.asset_code || payload.assetCode || "").toUpperCase().replace(/^USD$/, "USDC")
  const amountLabel = formatPaymentAmount(payload.amount, assetCode)
  const sourceAssetCode = String(payload.source_asset_code || payload.quote?.sourceAsset?.code || "").toUpperCase().replace(/^USD$/, "USDC")
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
                    <span className="text-rose-300">{validation.message || 'Link inválido ou ausente'}</span>
                  )}
                </div>
              )}
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
                disabled={status === "submitting" || !token.trim() || !pin.trim() || validation?.valid === false}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? "Confirmando pagamento..." : "Confirmar pagamento"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Resultado</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Aguardando confirmação.</p>}
              {status === "done" && result?.success && (
                <div className="mt-2 space-y-1 text-emerald-300">
                  <p>Pagamento confirmado com sucesso.</p>
                  {result.transferDetails?.destinationAmount && (
                    <p>
                      Destino recebeu: {formatPaymentAmount(result.transferDetails.destinationAmount, result.transferDetails.destinationAssetCode)}
                    </p>
                  )}
                  {result.transferDetails?.sourceAmount && (
                    <p>
                      Origem debitada: {formatPaymentAmount(result.transferDetails.sourceAmount, result.transferDetails.sourceAssetCode)}
                      {result.transferDetails.exact === false ? " (valor estimado)" : ""}
                    </p>
                  )}
                  {showResultFee && (
                    <p>Taxa aplicada: {resultFeeSummary || "taxa aplicada indisponível"}</p>
                  )}
                  {result.receiptImageDataUrl && (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                      <img
                        src={result.receiptImageDataUrl}
                        alt="Recibo TalkToStellar"
                        className="h-auto w-full"
                      />
                    </div>
                  )}
                  {returnMessage && <p>{returnMessage}</p>}
                  <p className="break-all font-mono text-xs">Destino: {result.destinationName || result.destination}</p>
                </div>
              )}
              {status === "error" && (
                <p className="mt-2 text-rose-300">{result?.error || result?.message || "Algo deu errado."}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
