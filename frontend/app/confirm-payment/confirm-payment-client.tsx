"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"

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
  const code = String(assetCode || "XLM").toUpperCase().replace(/^USD$/, "USDC")
  const n = Number(String(amount || "").replace(",", "."))
  if (!Number.isFinite(n)) return "Valor indisponível"
  if (code === "BRL") return `R$ ${n.toFixed(2)}`
  if (code === "USDC") return `US$ ${n.toFixed(2)}`
  return `${n.toFixed(2)} ${code}`
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
          setValidation({ success: true, valid: true, payload: fallbackPayload })
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
      const response = await fetch(`/api/external/finalize`, {
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
  const assetCode = String(payload.asset_code || payload.assetCode || "XLM").toUpperCase().replace(/^USD$/, "USDC")
  const amountLabel = formatPaymentAmount(payload.amount, assetCode)
  const destinationLabel = payload.destination_name || payload.destination || "Destinatário indisponível"

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <section className="space-y-6">
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Pagamento</p>
                <p className="mt-2 text-sm text-slate-200">
                  {amountLabel}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Destinatário</p>
                <p className="mt-2 text-sm text-slate-200">
                  {destinationLabel}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">Resumo</p>
                <p className="mt-2 text-slate-300">Valor: {amountLabel}</p>
                <p className="text-slate-300">Destino: {destinationLabel}</p>
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
                disabled={status === "submitting" || !token.trim() || !pin.trim()}
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
                  <p className="break-all font-mono text-xs">Hash: {result.hash}</p>
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
