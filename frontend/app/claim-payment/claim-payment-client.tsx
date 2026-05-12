"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, LogIn, ShieldCheck, UserPlus } from "lucide-react"
import { clearClientSession, isClientSessionExpired } from "@/lib/session"
import { idempotentFetch } from "@/lib/idempotency"
import { Spinner, TypingDots } from "@/components/ui/feedback"

type ValidationResult = {
  valid?: boolean
  payload?: any
  message?: string
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
  const n = Number(String(amount || "").replace(",", "."))
  const code = String(assetCode || "USDC").toUpperCase().replace(/^USD$/, "USDC")
  if (!Number.isFinite(n)) return `${amount || ""} ${code}`.trim()
  if (code === "USDC") return `US$ ${n.toFixed(2)}`
  if (code === "BRL") return `R$ ${n.toFixed(2)}`
  return `${n.toFixed(2)} ${code}`
}

export default function ClaimPaymentClient({ initialToken }: { initialToken?: string }) {
  const [token, setToken] = useState(initialToken || "")
  const [sessionId, setSessionId] = useState("")
  const [sessionToken, setSessionToken] = useState("")
  const [validation, setValidation] = useState<ValidationResult>({})
  const [status, setStatus] = useState<"idle" | "claiming" | "done" | "error">("idle")
  const [result, setResult] = useState<any>(null)
  const [pin, setPin] = useState("")
  const [loginNotice, setLoginNotice] = useState("")

  useEffect(() => {
    const current = new URLSearchParams(window.location.search).get("token") || initialToken || ""
    setToken(current)
    if (isClientSessionExpired()) {
      clearClientSession()
      setLoginNotice("Sua sessão expirou. Entre novamente para receber este pagamento.")
      setSessionId("")
      setSessionToken("")
    } else {
      setLoginNotice("")
      setSessionId(localStorage.getItem("talk-to-stellar.sessionId") || "")
      setSessionToken(localStorage.getItem("talk-to-stellar.sessionToken") || "")
    }
    if (current) {
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [initialToken])

  useEffect(() => {
    async function validate() {
      if (!token) return
      const fallback = decodeJwtPayload(token)
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.valid) {
          setValidation({ valid: false, payload: fallback, message: payload?.message || "Link inválido ou expirado." })
          return
        }
        setValidation(payload)
      } catch {
        setValidation({ valid: true, payload: fallback })
      }
    }
    validate()
  }, [token])

  async function claim() {
    setStatus("claiming")
    setResult(null)
    try {
      const response = await idempotentFetch("/api/external/pay-links/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          session_id: sessionId,
          session_token: sessionToken,
          pin,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (response.status === 401 && payload?.loginRequired) {
        clearClientSession()
        setSessionId("")
        setSessionToken("")
        setPin("")
        setLoginNotice(payload?.message || "Entre novamente para receber este pagamento.")
      }
      setResult(payload)
      setStatus(response.ok && payload?.success ? "done" : "error")
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : "Falha ao receber pagamento." })
      setStatus("error")
    }
  }

  const payload = validation.payload || decodeJwtPayload(token)
  const sourceAmountLabel = useMemo(
    () => formatAmount(payload.amount, payload.asset_code),
    [payload.amount, payload.asset_code]
  )
  const destinationAssetCode = String(payload.destination_asset_code || payload.asset_code || "USDC").toUpperCase().replace(/^USD$/, "USDC")
  const sourceAssetCode = String(payload.asset_code || "USDC").toUpperCase().replace(/^USD$/, "USDC")
  const isCrossAsset = destinationAssetCode !== sourceAssetCode
  const receiveLabel = isCrossAsset ? destinationAssetCode : sourceAmountLabel
  const recipientName = String(payload.recipient_name || "você")
  const senderName = String(payload.sender_name || "Alguém")
  const loggedIn = Boolean(sessionId && sessionToken)
  const nextPath = `/claim-payment?token=${encodeURIComponent(token)}`
  const createAccountPath = `/create-account?next=${encodeURIComponent(nextPath)}&force_new=1&context=claim-payment`
  const senderSessionId = String(payload.session_id || "").trim()
  const isSenderSession = Boolean(loggedIn && senderSessionId && sessionId === senderSessionId)

  function leaveSenderSession() {
    clearClientSession()
    setSessionId("")
    setSessionToken("")
    setPin("")
    setStatus("idle")
    setResult(null)
  }

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10 sm:px-6">
        <section className="min-w-0 w-full overflow-hidden rounded-lg border border-white/10 bg-slate-950/85 p-5 shadow-2xl sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.22em] text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            Receber pagamento
          </div>

          <h1 className="mt-5 text-3xl font-semibold text-white md:text-5xl">
            {senderName} criou um link de {sourceAmountLabel} para {recipientName}
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-300 md:text-base">
            Entre em uma conta existente ou crie uma nova conta global para receber. {isCrossAsset ? `Você recebe em ${destinationAssetCode}.` : "O dinheiro é enviado para a conta autenticada nesta página."}
            {loggedIn && !isSenderSession ? " Confirme com seu PIN para garantir que este pagamento entre na sua conta." : ""}
          </p>

          <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
            <p className="text-slate-400">Status do link</p>
            {validation.valid === false ? (
              <p className="mt-1 text-rose-300">{validation.message || "Link inválido."}</p>
            ) : (
              <p className="mt-1 text-emerald-300">Link pronto. A pessoa que recebe precisa entrar na própria conta.</p>
            )}
          </div>

          {(!loggedIn || isSenderSession) && (
            <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
              {loginNotice && (
                <p className="sm:col-span-2 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                  {loginNotice}
                </p>
              )}
              {isSenderSession && (
                <p className="sm:col-span-2 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
                  Este navegador está com a conta de quem criou o link. Para receber, entre ou crie a conta do destinatário.
                </p>
              )}
              {isSenderSession && (
                <button
                  type="button"
                  onClick={leaveSenderSession}
                  className="sm:col-span-2 inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  Usar outra conta para receber
                </button>
              )}
              <Link
                href={`/login?next=${encodeURIComponent(nextPath)}`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                <LogIn className="h-4 w-4" />
                Entrar para receber
              </Link>
              <Link
                href={createAccountPath}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <UserPlus className="h-4 w-4" />
                Criar conta para receber
              </Link>
            </div>
          )}

          {loggedIn && !isSenderSession && (
            <div className="mt-5 space-y-3">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">PIN da conta que vai receber</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Confirme seu PIN"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
                />
              </label>
              <button
                type="button"
                onClick={claim}
                disabled={status === "claiming" || validation.valid === false || !token || !/^\d{4,8}$/.test(pin)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {status === "claiming" ? <span className="inline-flex items-center gap-2"><Spinner />Recebendo...</span> : `Receber ${receiveLabel}`}
              </button>
              <button
                type="button"
                onClick={leaveSenderSession}
                className="inline-flex w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Usar outra conta para receber
              </button>
            </div>
          )}

          {status === "claiming" && <div className="mt-5 inline-flex items-center gap-2 text-sm text-slate-300"><TypingDots />Validando e creditando pagamento...</div>}
          <AnimatePresence mode="wait">
          {status === "done" && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
              Pagamento recebido com sucesso.
              {result?.transferDetails?.destinationAmount && (
                <p className="mt-2">
                  Recebido: {formatAmount(result.transferDetails.destinationAmount, result.transferDetails.destinationAssetCode)}
                </p>
              )}
              {result?.operationId && (
                <p className="mt-2 break-all font-mono text-xs">ID da operação: {result.operationId}</p>
              )}
            </motion.div>
          )}
          {status === "error" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 rounded-lg border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
              {result?.message || "Não foi possível receber este pagamento."}
            </motion.div>
          )}
          </AnimatePresence>
        </section>
      </div>
    </main>
  )
}
