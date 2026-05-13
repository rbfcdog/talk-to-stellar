"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowRight, Loader2, WalletCards } from "lucide-react"

function displayName(profile: any, username: string) {
  return String(profile?.display_name || profile?.username || username || "TalkToStellar").trim()
}

export default function PublicReceivePage() {
  const router = useRouter()
  const params = useParams<{ username: string }>()
  const username = String(params?.username || "").trim()
  const [profile, setProfile] = useState<any>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [amount, setAmount] = useState("")
  const [asset, setAsset] = useState("USDC")
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "error">("idle")
  const [submitMessage, setSubmitMessage] = useState("")
  const submitLockRef = useRef(false)

  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const response = await fetch(`/api/financial/u/${encodeURIComponent(username)}`, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (!active) return
        if (!response.ok || !payload?.success) {
          setStatus("error")
          return
        }
        setProfile(payload.profile)
        setStatus("ready")
      } catch {
        if (active) setStatus("error")
      }
    }
    loadProfile()
    return () => {
      active = false
    }
  }, [username])

  const name = displayName(profile, username)

  async function handlePayNow() {
    if (submitLockRef.current) return
    submitLockRef.current = true
    setSubmitStatus("submitting")
    setSubmitMessage("")

    try {
      const sessionId = localStorage.getItem("talk-to-stellar.sessionId") || ""
      const sessionToken = localStorage.getItem("talk-to-stellar.sessionToken") || ""
      const normalizedAmount = amount.trim().replace(",", ".")
      if (!normalizedAmount || !Number.isFinite(Number(normalizedAmount)) || Number(normalizedAmount) <= 0) {
        throw new Error("Informe um valor maior que zero.")
      }

      if (!sessionId || !sessionToken) {
        const next = `/u/${encodeURIComponent(username)}`
        router.push(`/login?next=${encodeURIComponent(next)}`)
        return
      }

      const response = await fetch(`/api/financial/u/${encodeURIComponent(username)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          session_token: sessionToken,
          amount: normalizedAmount,
          asset_code: asset,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success || !payload?.url) {
        throw new Error(payload?.message || "Não foi possível iniciar o pagamento agora.")
      }

      window.location.href = String(payload.url)
    } catch (error) {
      setSubmitStatus("error")
      setSubmitMessage(error instanceof Error ? error.message : "Falha ao iniciar pagamento.")
      submitLockRef.current = false
    }
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-4 text-slate-100">
        <p className="text-sm text-slate-300">Carregando link de recebimento...</p>
      </main>
    )
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-4 text-slate-100">
        <section className="w-full max-w-md rounded-lg border border-white/10 bg-white/5 p-6">
          <h1 className="text-2xl font-semibold text-white">Link não encontrado</h1>
          <p className="mt-3 text-sm text-slate-300">Confira o endereço ou peça um novo link para quem vai receber.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#07111f] px-4 py-10 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center">
        <section className="w-full rounded-lg border border-white/10 bg-slate-950/85 p-5 shadow-2xl sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.22em] text-emerald-200">
            <WalletCards className="h-4 w-4" />
            Link para receber
          </div>

          <h1 className="mt-5 text-3xl font-semibold text-white">Pagar {name}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Digite o valor e continue para autorizar o pagamento pela sua conta TalkToStellar.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Valor</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                placeholder="500"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Moeda</span>
              <select
                value={asset}
                onChange={(event) => setAsset(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
              >
                <option value="USDC">US$</option>
                <option value="EURC">€</option>
                <option value="BRL">R$</option>
                <option value="XLM">XLM</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={handlePayNow}
            disabled={submitStatus === "submitting" || submitLockRef.current}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitStatus === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando confirmação...
              </>
            ) : (
              <>
                Continuar pagamento
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          {submitStatus === "error" && submitMessage && (
            <p className="mt-3 text-sm text-rose-300">{submitMessage}</p>
          )}
        </section>
      </div>
    </main>
  )
}
