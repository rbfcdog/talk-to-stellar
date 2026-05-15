"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"
import { CheckCircle2, Copy, Loader2, ShieldAlert, XCircle } from "lucide-react"
import { idempotentFetch } from "@/lib/idempotency"

type AssetCode = "USDC" | "XLM"

type Preview = {
  success?: boolean
  user_id?: string
  available_balance?: string
  estimated_fee_display?: string
  destination_exists?: boolean
  destination_warning?: string | null
  destination_accepts_asset?: boolean
  error?: string
}

type SendResult = {
  success?: boolean
  tx_hash?: string
  amount?: string
  asset?: string
  destination?: string
  completed_at?: string
  receipt_url?: string
  error?: string
}

const PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/

function normalizeAsset(value: string | null): AssetCode {
  return String(value || "").trim().toUpperCase() === "XLM" ? "XLM" : "USDC"
}

function shortKey(value: string) {
  return value.length <= 15 ? value : `${value.slice(0, 6)}...${value.slice(-6)}`
}

function validDestination(value: string) {
  return PUBLIC_KEY_REGEX.test(String(value || "").trim())
}

export default function SendExternalClient() {
  const searchParams = useSearchParams()
  const [sessionId, setSessionId] = useState("")
  const [destination, setDestination] = useState("")
  const [amount, setAmount] = useState("")
  const [asset, setAsset] = useState<AssetCode>("USDC")
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "error">("idle")
  const [step, setStep] = useState<"form" | "review" | "auth" | "sending" | "done">("form")
  const [pin, setPin] = useState("")
  const [authError, setAuthError] = useState("")
  const [result, setResult] = useState<SendResult | null>(null)
  const [copied, setCopied] = useState(false)
  const executionIdRef = useRef("")

  useEffect(() => {
    setSessionId(localStorage.getItem("talk-to-stellar.sessionId") || "")
    setDestination(String(searchParams.get("destination") || "").trim())
    setAmount(String(searchParams.get("amount") || "").replace(",", ".").trim())
    setAsset(normalizeAsset(searchParams.get("asset")))
    executionIdRef.current = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  }, [searchParams])

  const destinationValid = validDestination(destination)
  const amountNumber = Number(amount)
  const amountValid = Number.isFinite(amountNumber) && amountNumber > 0
  const available = Number(String(preview?.available_balance || "0").replace(",", "."))
  const enoughBalance = amountValid && amountNumber <= available + 0.0000001
  const destinationAcceptsAsset = preview?.destination_accepts_asset !== false
  const missingAccountNeedsOneXlm = asset === "XLM" && preview?.destination_exists === false && amountValid && amountNumber < 1
  const canReview = Boolean(destinationValid && amountValid && preview?.success && enoughBalance && destinationAcceptsAsset && !missingAccountNeedsOneXlm)

  useEffect(() => {
    if (!sessionId || !destinationValid) {
      setPreview(null)
      setPreviewStatus("idle")
      return
    }

    let cancelled = false
    async function loadPreview() {
      setPreviewStatus("loading")
      try {
        const response = await fetch("/api/external/send-to-wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preview: true,
            session_id: sessionId,
            destination,
            amount: amount || "0",
            asset,
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        setPreview(payload)
        setPreviewStatus(response.ok && payload?.success ? "idle" : "error")
      } catch (error) {
        if (cancelled) return
        setPreview({ success: false, error: error instanceof Error ? error.message : "Falha ao carregar saldo." })
        setPreviewStatus("error")
      }
    }

    loadPreview()
    return () => {
      cancelled = true
    }
  }, [sessionId, destination, destinationValid, asset, amount])

  async function copyDestination() {
    await navigator.clipboard.writeText(destination)
    setCopied(true)
  }

  async function executePayment(auth: { pin?: string; passkeyChallengeId?: string; passkeyCredential?: unknown }) {
    setStep("sending")
    setResult(null)
    try {
      const response = await idempotentFetch("/api/external/send-to-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          destination,
          amount,
          asset,
          execution_id: executionIdRef.current,
          pin: auth.pin,
          passkey_challenge_id: auth.passkeyChallengeId,
          passkey_credential: auth.passkeyCredential,
        }),
      }, "send-external")
      const payload = await response.json().catch(() => ({}))
      setResult(payload)
      setStep(response.ok && payload?.success ? "done" : "auth")
      if (!response.ok || !payload?.success) {
        setAuthError(payload?.error || "Não foi possível enviar. Tente novamente.")
      }
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : "Falha ao enviar." })
      setAuthError(error instanceof Error ? error.message : "Falha ao enviar.")
      setStep("auth")
    }
  }

  async function authenticateWithPasskey() {
    setAuthError("")
    if (!window.PublicKeyCredential) {
      setAuthError("Passkey indisponível neste navegador. Use o PIN.")
      return
    }
    try {
      const initResponse = await fetch("/api/passkeys/auth-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: preview?.user_id }),
      })
      const init = await initResponse.json().catch(() => ({}))
      if (!initResponse.ok || !init?.success || init?.registrationRequired) {
        throw new Error("Passkey não cadastrada. Use o PIN.")
      }
      const credential = await startAuthentication({ optionsJSON: init.options })
      await executePayment({ passkeyChallengeId: init.challengeId, passkeyCredential: credential })
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Passkey falhou. Use o PIN.")
    }
  }

  function submitPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!pin.trim()) {
      setAuthError("Digite seu PIN para continuar.")
      return
    }
    executePayment({ pin })
  }

  const addressError = destination && !destinationValid ? "Endereço inválido" : ""

  return (
    <main className="min-h-screen bg-[#07111f] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-6 md:grid-cols-[0.9fr_1.1fr]">
        <section className="min-w-0 space-y-5">
          <div className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.22em] text-cyan-100">
            Envio externo
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">Enviar para carteira Stellar</h1>
          <p className="max-w-2xl text-base leading-7 text-slate-300">
            Use este fluxo para mandar USDC ou XLM para uma chave pública fora do ecossistema TalkToStellar.
          </p>
        </section>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl">
          <div className="mb-5 grid grid-cols-5 gap-2 text-xs">
            {["Destino", "Valor", "Revisão", "Auth", "Envio"].map((label, index) => (
              <div key={label} className={`truncate rounded-lg px-2 py-2 text-center ${index <= (step === "form" ? (destinationValid ? 1 : 0) : step === "review" ? 2 : step === "auth" ? 3 : 4) ? "bg-cyan-300/20 text-cyan-100" : "bg-white/5 text-slate-400"}`}>
                {label}
              </div>
            ))}
          </div>

          {step === "form" && (
            <div className="space-y-5">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-200">Chave pública de destino</span>
                <div className="relative">
                  <input
                    value={destination}
                    onChange={(event) => setDestination(event.target.value.trim())}
                    placeholder="GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pr-11 font-mono text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60"
                  />
                  {destination && (
                    destinationValid
                      ? <CheckCircle2 className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-emerald-300" />
                      : <XCircle className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-rose-300" />
                  )}
                </div>
                {addressError && <p className="text-sm font-semibold text-rose-300">{addressError}</p>}
              </label>

              {destinationValid && (
                <>
                  <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-slate-200">Saldo disponível: {previewStatus === "loading" ? "carregando..." : `${preview?.available_balance || "0"} ${asset}`}</span>
                      <input
                        value={amount}
                        onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                        type="number"
                        min="0"
                        step="0.0000001"
                        placeholder="0.00"
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60"
                      />
                    </label>
                    <label className="block space-y-2">
                      <span className="text-sm font-semibold text-slate-200">Ativo</span>
                      <select
                        value={asset}
                        onChange={(event) => setAsset(normalizeAsset(event.target.value))}
                        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/60"
                      >
                        <option value="USDC">USDC</option>
                        <option value="XLM">XLM</option>
                      </select>
                    </label>
                  </div>
                  <p className="text-sm text-slate-300">Taxa estimada: {preview?.estimated_fee_display || "carregando..."}</p>
                  {preview?.destination_warning && <p className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">{preview.destination_warning}</p>}
                  {!destinationAcceptsAsset && <p className="text-sm font-semibold text-rose-300">A carteira de destino não aceita USDC. Tente enviar XLM ou peça ao destinatário para configurar a conta.</p>}
                  {missingAccountNeedsOneXlm && <p className="text-sm font-semibold text-rose-300">Esta conta ainda não existe na rede. O envio criará a conta mas requer mínimo de 1 XLM.</p>}
                  {amountValid && !enoughBalance && <p className="text-sm font-semibold text-rose-300">Saldo insuficiente para esse envio.</p>}
                  {previewStatus === "error" && <p className="text-sm font-semibold text-rose-300">{preview?.error || "Falha ao validar envio."}</p>}
                  <button
                    type="button"
                    disabled={!canReview}
                    onClick={() => setStep("review")}
                    className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Revisar envio
                  </button>
                </>
              )}
            </div>
          )}

          {step === "review" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-semibold text-amber-100">
                <ShieldAlert className="mb-2 h-5 w-5" />
                Este endereço está fora do ecossistema TalkToStellar. Verifique antes de continuar.
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Destino</p>
                <p className="mt-2 font-mono text-lg font-bold text-white">{shortKey(destination)}</p>
                <button onClick={copyDestination} className="mt-2 inline-flex max-w-full items-center gap-2 text-left font-mono text-xs text-cyan-100">
                  <Copy className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 break-all">{destination}</span>
                </button>
                {copied && <p className="mt-1 text-xs text-emerald-300">Copiado.</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white/5 p-4"><p className="text-slate-400">Valor</p><p className="mt-1 font-bold">{amount} {asset}</p></div>
                <div className="rounded-xl bg-white/5 p-4"><p className="text-slate-400">Taxa estimada</p><p className="mt-1 font-bold">{preview?.estimated_fee_display || "-"}</p></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button className="rounded-xl border border-white/10 px-4 py-3 font-bold text-slate-200" onClick={() => setStep("form")}>Cancelar</button>
                <button className="rounded-xl bg-cyan-300 px-4 py-3 font-bold text-slate-950" onClick={() => { setStep("auth"); void authenticateWithPasskey(); }}>Confirmar envio</button>
              </div>
            </div>
          )}

          {step === "auth" && (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">Confirme com Passkey. Se não funcionar, use seu PIN.</p>
              {authError && <p className="rounded-xl border border-rose-300/30 bg-rose-300/10 p-3 text-sm text-rose-100">{authError}</p>}
              <button className="w-full rounded-xl bg-indigo-400 px-4 py-3 font-bold text-white" onClick={authenticateWithPasskey}>Tentar Passkey novamente</button>
              <form onSubmit={submitPin} className="space-y-3">
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  type="password"
                  inputMode="numeric"
                  placeholder="PIN"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
                />
                <button className="w-full rounded-xl bg-cyan-300 px-4 py-3 font-bold text-slate-950">Confirmar com PIN</button>
              </form>
            </div>
          )}

          {step === "sending" && (
            <div className="flex items-center gap-3 rounded-xl bg-white/5 p-4 text-cyan-100">
              <Loader2 className="h-5 w-5 animate-spin" />
              Enviando...
            </div>
          )}

          {step === "done" && result?.success && (
            <div className="space-y-4 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4">
              <p className="text-xl font-bold text-emerald-200">Envio concluído</p>
              <p>Valor: {result.amount} {result.asset}</p>
              <p className="font-mono text-sm">Destino: {shortKey(result.destination || "")}</p>
              <p className="font-mono text-sm">Transação: {shortKey(result.tx_hash || "")}</p>
              {result.receipt_url && <a className="inline-flex rounded-xl bg-emerald-300 px-4 py-3 font-bold text-slate-950" href={result.receipt_url} target="_blank" rel="noreferrer">Abrir comprovante</a>}
              <Link className="block rounded-xl border border-white/10 px-4 py-3 text-center font-bold text-white" href="/chat">Voltar ao chat</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
