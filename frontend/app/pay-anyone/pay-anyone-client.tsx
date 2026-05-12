"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Copy, Link2, Send, ShieldCheck } from "lucide-react"
import { idempotentFetch } from "@/lib/idempotency"
import { Spinner, TypingDots, Shimmer } from "@/components/ui/feedback"

type CreatePayLinkResponse = {
  success?: boolean
  url?: string
  message?: string
}

type LinkMode = "send" | "receive"

function displayAsset(assetCode: string) {
  const code = String(assetCode || "").toUpperCase().replace(/^USD$/, "USDC")
  if (code === "USDC") return "US$"
  if (code === "BRL") return "R$"
  return code
}

function friendlyName(value: string) {
  const raw = String(value || "").trim()
  if (!raw) return "usuário"
  const base = raw.includes("@") ? raw.split("@")[0] : raw
  return base.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim() || "usuário"
}

export default function PayAnyoneClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sessionId, setSessionId] = useState("")
  const [sessionToken, setSessionToken] = useState("")
  const [mode, setMode] = useState<LinkMode>("send")
  const [userName, setUserName] = useState("usuário")
  const [recipientName, setRecipientName] = useState("")
  const [amount, setAmount] = useState("15")
  const [assetCode, setAssetCode] = useState("USDC")
  const [destinationAssetCode, setDestinationAssetCode] = useState("USDC")
  const [pin, setPin] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle")
  const [result, setResult] = useState<CreatePayLinkResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const storedSessionId = localStorage.getItem("talk-to-stellar.sessionId") || ""
    const storedSessionToken = localStorage.getItem("talk-to-stellar.sessionToken") || ""
    const storedUserName = localStorage.getItem("talk-to-stellar.userName") || ""
    setSessionId(storedSessionId)
    setSessionToken(storedSessionToken)
    setUserName(friendlyName(storedUserName || storedSessionId))
    setMode(searchParams.get("mode") === "receive" ? "receive" : "send")
    setRecipientName(searchParams.get("recipient") || "")
    setAmount(searchParams.get("amount") || "15")
    const sourceAsset = (searchParams.get("asset") || "USDC").toUpperCase().replace(/^USD$/, "USDC")
    setAssetCode(sourceAsset)
    setDestinationAssetCode((searchParams.get("receive_asset") || searchParams.get("destination_asset") || sourceAsset).toUpperCase().replace(/^USD$/, "USDC"))

    if (!storedSessionId || !storedSessionToken) {
      const next = `/pay-anyone${window.location.search || ""}`
      router.replace(`/login?next=${encodeURIComponent(next)}`)
    }
    setBooting(false)
  }, [router, searchParams])

  useEffect(() => {
    if (!sessionId) return
    let active = true
    async function loadProfileName() {
      try {
        const response = await fetch(`/api/financial/global-profile/${encodeURIComponent(sessionId)}`, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        const profile = payload?.profile || {}
        const nextName = friendlyName(String(profile.display_name || profile.username || ""))
        if (!active || !nextName) return
        setUserName(nextName)
        localStorage.setItem("talk-to-stellar.userName", nextName)
      } catch {
        // Keep the locally cached name.
      }
    }
    loadProfileName()
    return () => {
      active = false
    }
  }, [sessionId])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("submitting")
    setResult(null)
    setCopied(false)

    try {
      if (mode === "receive") {
        const response = await idempotentFetch(`/api/financial/global-profile/${encodeURIComponent(sessionId)}`, {
          method: "GET",
        })
        const payload = await response.json().catch(() => ({}))
        const profile = payload?.profile || {}
        if (!response.ok || !payload?.success || !profile?.public_link) {
          throw new Error(payload?.message || "Não foi possível criar seu link para receber.")
        }
        const link = String(profile.public_link)
        const displayName = friendlyName(String(profile.display_name || profile.username || userName))
        setUserName(displayName)
        localStorage.setItem("talk-to-stellar.userName", displayName)
        setResult({
          success: true,
          url: link,
          message: `Compartilhe este link para receber pagamentos. Quem paga acessa, digita o valor e envia para sua conta.`,
        })
        setStatus("done")
        return
      }

      const response = await idempotentFetch("/api/external/pay-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          session_token: sessionToken,
          recipient_name: recipientName || undefined,
          amount,
          asset_code: assetCode,
          destination_asset_code: destinationAssetCode,
          pin,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult(payload)
      setStatus(response.ok && payload?.success ? "done" : "error")
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : "Falha ao criar link." })
      setStatus("error")
    }
  }

  async function copyLink() {
    if (!result?.url) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
  }

  const loggedIn = Boolean(sessionId && sessionToken)
  const shareText = result?.message && result?.url ? `${result.message}\n${result.url}` : result?.url || ""
  const whatsappUrl = shareText ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : "#"
  const isReceiveMode = mode === "receive"

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 md:grid-cols-[0.95fr_1.05fr]">
        <section className="min-w-0 space-y-6 overflow-hidden">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-200">
            <ShieldCheck className="h-4 w-4" />
            Pay Anyone
          </div>
          <div className="space-y-4">
            <p className="text-lg font-semibold text-emerald-200">Bem vindo, {userName}</p>
            <h1 className="max-w-xl text-4xl font-semibold text-white md:text-6xl">
              {isReceiveMode ? "Receba dinheiro pelo seu link global" : "Envie dinheiro para quem ainda não tem conta"}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              {isReceiveMode
                ? "Compartilhe seu link com clientes. Eles acessam, digitam o valor e pagam direto para sua conta."
                : "O PIN autoriza a criação do link. Quem recebe precisa entrar ou criar a própria conta global para receber o valor."}
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            {(isReceiveMode ? ["Crie", "Compartilhe", "Receba"] : ["Crie", "Compartilhe", "Receba"]).map((label, index) => (
              <div key={label} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{index + 1}. {label}</p>
                <p className="mt-2 text-sm text-slate-200">
                  {index === 0 && (isReceiveMode ? "Gere seu link público de recebimento." : "Digite valor, destinatário e PIN.")}
                  {index === 1 && "Envie o link pelo canal que preferir."}
                  {index === 2 && (isReceiveMode ? "O pagamento cai na sua conta." : "O destinatário recebe na própria conta.")}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950/80 p-5 shadow-2xl md:p-6">
          {booting && (
            <div className="mb-5 space-y-3">
              <Shimmer className="h-12 w-full rounded-xl" />
              <Shimmer className="h-24 w-full rounded-xl" />
            </div>
          )}
          {!loggedIn && (
            <div className="mb-5 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
              Entre na sua conta antes de criar um link de pagamento.
              <Link href="/login?next=/pay-anyone" className="ml-2 font-semibold text-white underline">
                Entrar
              </Link>
            </div>
          )}

          <div className="mb-5 grid rounded-lg border border-white/10 bg-white/5 p-1 text-sm sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setMode("send")
                setStatus("idle")
                setResult(null)
                setCopied(false)
              }}
              className={`rounded-md px-4 py-2 font-semibold transition ${!isReceiveMode ? "bg-emerald-400 text-slate-950" : "text-slate-200 hover:bg-white/10"}`}
            >
              Enviar
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("receive")
                setStatus("idle")
                setResult(null)
                setCopied(false)
              }}
              className={`rounded-md px-4 py-2 font-semibold transition ${isReceiveMode ? "bg-emerald-400 text-slate-950" : "text-slate-200 hover:bg-white/10"}`}
            >
              Receber
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {!isReceiveMode && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Nome do destinatário</span>
                <input
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  placeholder="João"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
                />
              </label>
            )}

            {!isReceiveMode && <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_130px_130px]">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Valor</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="15"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Você paga</span>
                <select
                  value={assetCode}
                  onChange={(event) => setAssetCode(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                >
                  <option value="USDC">US$</option>
                  <option value="XLM">XLM</option>
                  <option value="BRL">R$</option>
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Recebe em</span>
                <select
                  value={destinationAssetCode}
                  onChange={(event) => setDestinationAssetCode(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                >
                  <option value="USDC">US$</option>
                  <option value="BRL">R$</option>
                  <option value="XLM">XLM</option>
                </select>
              </label>
            </div>}

            {isReceiveMode && (
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
                Seu link de recebimento é fixo. O cliente escolhe o valor na página pública e o pagamento é identificado como entrada para você.
              </div>
            )}

            {!isReceiveMode && destinationAssetCode !== assetCode && (
              <p className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-50">
                O link debita {amount || "0"} {displayAsset(assetCode)} da sua conta e o destinatário recebe em {displayAsset(destinationAssetCode)} ao entrar.
              </p>
            )}

            {!isReceiveMode && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Seu PIN</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Autorize a criação do link"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={!loggedIn || status === "submitting" || (!isReceiveMode && (!amount.trim() || !pin.trim()))}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Link2 className="h-4 w-4" />
              {status === "submitting"
                ? <span className="inline-flex items-center gap-2"><Spinner />Criando link...</span>
                : isReceiveMode ? "Criar link para receber" : "Criar link de pagamento"}
            </button>
          </form>

          <div className="mt-5 rounded-lg border border-white/10 bg-black/25 p-4 text-sm">
            <p className="font-medium text-white">Link</p>
            {status === "idle" && <p className="mt-2 text-slate-400">O link aparece aqui depois da autorização.</p>}
            {status === "submitting" && <div className="mt-2 inline-flex items-center gap-2 text-slate-300"><TypingDots />Gerando link seguro...</div>}
            {status === "error" && <p className="mt-2 text-rose-300">{result?.message || "Não foi possível criar o link."}</p>}
            <AnimatePresence mode="wait">
            {status === "done" && result?.url && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-3">
                <p className="break-all rounded-lg bg-white/5 p-3 font-mono text-xs text-slate-200">{result.url}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 font-semibold text-white transition hover:bg-white/10"
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 font-semibold text-slate-950 transition hover:bg-[#35e176]"
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </a>
                </div>
                <p className="text-slate-300">{result.message}</p>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  )
}
