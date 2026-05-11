"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Copy, Link2, Send, Wallet } from "lucide-react"

type CreatePayLinkResponse = {
  success?: boolean
  url?: string
  message?: string
}

export default function PayAnyoneClient() {
  const searchParams = useSearchParams()
  const [sessionId, setSessionId] = useState("")
  const [sessionToken, setSessionToken] = useState("")
  const [recipientName, setRecipientName] = useState("")
  const [amount, setAmount] = useState("15")
  const [assetCode, setAssetCode] = useState("USDC")
  const [pin, setPin] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle")
  const [result, setResult] = useState<CreatePayLinkResponse | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setSessionId(localStorage.getItem("talk-to-stellar.sessionId") || "")
    setSessionToken(localStorage.getItem("talk-to-stellar.sessionToken") || "")
    setRecipientName(searchParams.get("recipient") || "")
    setAmount(searchParams.get("amount") || "15")
    setAssetCode((searchParams.get("asset") || "USDC").toUpperCase().replace(/^USD$/, "USDC"))
  }, [searchParams])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("submitting")
    setResult(null)
    setCopied(false)

    try {
      const response = await fetch("/api/external/pay-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          session_token: sessionToken,
          recipient_name: recipientName || undefined,
          amount,
          asset_code: assetCode,
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

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-6 py-10 md:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-200">
            <Wallet className="h-4 w-4" />
            Pay Anyone
          </div>
          <div className="space-y-4">
            <h1 className="max-w-xl text-4xl font-semibold text-white md:text-6xl">
              Envie dinheiro para quem ainda não tem conta
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              O PIN autoriza a criação do link. Quem recebe entra ou cria a carteira para resgatar o valor.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {["Crie", "Compartilhe", "Resgate"].map((label, index) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{index + 1}. {label}</p>
                <p className="mt-2 text-sm text-slate-200">
                  {index === 0 && "Digite valor, destinatário e PIN."}
                  {index === 1 && "Envie o link pelo canal que preferir."}
                  {index === 2 && "O destinatário recebe na própria carteira."}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-white/10 bg-slate-950/80 p-5 shadow-2xl md:p-6">
          {!loggedIn && (
            <div className="mb-5 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm text-amber-100">
              Entre na sua conta antes de criar um link de pagamento.
              <Link href="/login?next=/pay-anyone" className="ml-2 font-semibold text-white underline">
                Entrar
              </Link>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Nome do destinatário</span>
              <input
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="João"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
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
                <span className="text-sm font-medium text-slate-200">Ativo</span>
                <select
                  value={assetCode}
                  onChange={(event) => setAssetCode(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400"
                >
                  <option value="USDC">USDC</option>
                  <option value="XLM">XLM</option>
                  <option value="BRL">BRL</option>
                </select>
              </label>
            </div>

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

            <button
              type="submit"
              disabled={!loggedIn || status === "submitting" || !amount.trim() || !pin.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Link2 className="h-4 w-4" />
              {status === "submitting" ? "Criando link..." : "Criar link de pagamento"}
            </button>
          </form>

          <div className="mt-5 rounded-lg border border-white/10 bg-black/25 p-4 text-sm">
            <p className="font-medium text-white">Link</p>
            {status === "idle" && <p className="mt-2 text-slate-400">O link aparece aqui depois da autorização.</p>}
            {status === "error" && <p className="mt-2 text-rose-300">{result?.message || "Não foi possível criar o link."}</p>}
            {status === "done" && result?.url && (
              <div className="mt-3 space-y-3">
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
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
