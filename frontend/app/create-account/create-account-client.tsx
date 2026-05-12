"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { startRegistration } from '@simplewebauthn/browser'
import { useSearchParams } from "next/navigation"
import { saveClientSession } from "@/lib/session"
import { idempotentFetch } from "@/lib/idempotency"
import { Spinner, TypingDots } from "@/components/ui/feedback"

type FinalizeResponse = {
  success: boolean
  sessionId?: string
  sessionToken?: string
  userId?: string
  passkeySessionToken?: string
  message?: string
  error?: string
}

function generateBrowserId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function extractTokenFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return String(parsed.searchParams.get("token") || "")
  } catch {
    return ""
  }
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

type RecoveryResult =
  | { mode: "token"; token: string }
  | { mode: "existing"; sessionId?: string; sessionToken?: string }
  | { mode: "none" }

function getPasskeyErrorMessage(error: any): string {
  const name = String(error?.name || "")
  const message = String(error?.message || error || "")
  const normalized = message.toLowerCase()

  if (name === "NotAllowedError") {
    return "A biometria foi cancelada ou expirou. Toque em \"Ativar biometria\" e confirme com digital/Face ID."
  }

  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "A biometria precisa abrir no domínio correto e com HTTPS. Verifique PASSKEY_RP_ID/PASSKEY_ORIGIN no backend."
  }

  if (normalized.includes("not supported")) {
    return "Este navegador não liberou Passkey neste contexto. Abra no navegador principal do celular, não em modo anônimo."
  }

  return message || "Falha ao ativar biometria."
}

export default function CreateAccountClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const rawNextPath = searchParams.get("next") || "/chat"
  const nextPath = rawNextPath.startsWith("/") && !rawNextPath.startsWith("//") ? rawNextPath : "/chat"
  const forceNewAccount = searchParams.get("force_new") === "1" || searchParams.get("new_account") === "1"
  const isClaimPaymentContext = searchParams.get("context") === "claim-payment" || nextPath.startsWith("/claim-payment")

  const [token, setToken] = useState(tokenFromUrl)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [cpf, setCpf] = useState("")
  const [pin, setPin] = useState("")
  const [pinConfirm, setPinConfirm] = useState("")
  const [pinError, setPinError] = useState("")
  const [requestPasskey, setRequestPasskey] = useState(true)
  const [status, setStatus] = useState("ready")
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "registering" | "authenticating" | "done" | "error">("idle")
  const [passkeyError, setPasskeyError] = useState("")
  const [result, setResult] = useState<FinalizeResponse | null>(null)
  const [existingEmail, setExistingEmail] = useState("")
  const [existingPin, setExistingPin] = useState("")
  const [existingStatus, setExistingStatus] = useState<"idle" | "submitting" | "done" | "error">("idle")
  const [existingError, setExistingError] = useState("")
  const [validation, setValidation] = useState<any>(initialValidation)
  const [existingAccountDetected, setExistingAccountDetected] = useState(false)
  const [telegramDone, setTelegramDone] = useState(false)
  const tokenPayload = useMemo(() => validation?.payload || decodeJwtPayload(token), [validation, token])
  const currentStep = status === "submitting" ? 2 : status === "done" ? 3 : 1
  const isTelegramContext = String(tokenPayload?.provider || "").trim().toLowerCase() === "telegram"
  const loginHref = useMemo(() => {
    const params = new URLSearchParams()
    if (token) {
      params.set("token", token)
    }
    if (rawNextPath && rawNextPath !== "/chat") {
      params.set("next", rawNextPath)
    }
    const query = params.toString()
    return query ? `/login?${query}` : "/login"
  }, [rawNextPath, token])

  function finishTelegramFlow() {
    setTelegramDone(true)
    window.setTimeout(() => {
      window.close()
    }, 700)
  }

  async function recoverOnboardingContextFromBackend(forceNewAccount = false, browserIdOverride?: string): Promise<RecoveryResult> {
    let browserId = browserIdOverride || localStorage.getItem("talk-to-stellar.browserId")
    if (!browserId) {
      browserId = generateBrowserId()
      localStorage.setItem("talk-to-stellar.browserId", browserId)
    }
    const response = await idempotentFetch(`/api/external/check-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "web",
        provider_user_id: browserId,
        force_new_account: forceNewAccount,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (payload?.exists === true) {
      return {
        mode: "existing",
        sessionId: payload?.sessionId ? String(payload.sessionId) : undefined,
        sessionToken: payload?.sessionToken ? String(payload.sessionToken) : undefined,
      }
    }
    const creationUrl = String(payload?.creationUrl || "")
    const recoveredToken = extractTokenFromUrl(creationUrl)
    if (recoveredToken) {
      return { mode: "token", token: recoveredToken }
    }
    return { mode: "none" }
  }

  async function recoverFreshOnboardingToken(): Promise<{ token?: string; browserId?: string }> {
    const freshBrowserId = generateBrowserId()
    const recovered = await recoverOnboardingContextFromBackend(true, freshBrowserId)
    if (recovered.mode === "token" && recovered.token) {
      localStorage.setItem("talk-to-stellar.browserId", freshBrowserId)
      return { token: recovered.token, browserId: freshBrowserId }
    }
    return {}
  }

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
    }
  }, [tokenFromUrl])

  useEffect(() => {
    async function validateToken() {
      if (!token) return
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`)
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          setValidation({ success: true, valid: true, message: "Link recebido. Continue para finalizar sua conta." })
          return
        }
        const msg = String(payload?.message || "")
        if (msg.toLowerCase().includes("fetch failed")) {
          setValidation({ success: true, valid: true, message: "Link recebido. Continue para finalizar sua conta." })
          return
        }
        setValidation(payload)
      } catch (error) {
        setValidation({ success: true, valid: true, message: "Link recebido. Continue para finalizar sua conta." })
      }
    }

    validateToken()
  }, [token])

  useEffect(() => {
    async function recoverTokenWhenMissing() {
      if (token.trim()) return
      try {
        const recovered = await recoverOnboardingContextFromBackend(forceNewAccount)

        if (recovered.mode === "existing" && !forceNewAccount) {
          setExistingAccountDetected(true)
          setValidation({
            success: true,
            valid: false,
            message: 'Conta encontrada neste navegador. Você pode entrar com e-mail e PIN ou preencher o formulário para criar uma nova conta.',
          })
          return
        }

        if (recovered.mode === "token") {
          setExistingAccountDetected(false)
          setToken(recovered.token)
          setValidation({
            success: true,
            valid: true,
            message: isClaimPaymentContext
              ? "Link de criação pronto. Depois do cadastro, você volta automaticamente para receber."
              : "Link recuperado automaticamente.",
          })
        }
      } catch {
        // keep page usable for manual retry
      }
    }

    recoverTokenWhenMissing()
  }, [forceNewAccount, isClaimPaymentContext, token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPinError("")

    if (!/^\d{4,8}$/.test(pin)) {
      setPinError("PIN deve conter de 4 a 8 dígitos numéricos.")
      return
    }
    if (pin !== pinConfirm) {
      setPinError("PIN e confirmação precisam ser iguais.")
      return
    }

    setStatus("submitting")
    setResult(null)

    try {
      let finalToken = token
      if (!finalToken.trim()) {
        const fresh = await recoverFreshOnboardingToken()
        if (fresh.token) {
          setExistingAccountDetected(false)
          finalToken = fresh.token
          setToken(finalToken)
        } else {
          const recovered = await recoverOnboardingContextFromBackend(true)
          if (recovered.mode === "existing") {
            setExistingAccountDetected(true)
            throw new Error("Não foi possível gerar um novo link de criação agora. Tente novamente ou use a opção \"Já tenho conta\" para entrar.")
          }
          if (recovered.mode === "token") {
            setExistingAccountDetected(false)
            finalToken = recovered.token
            setToken(finalToken)
          }
        }
      }
      if (!finalToken.trim()) {
        throw new Error("Não foi possível validar seu link agora. Solicite um novo acesso no Telegram e tente novamente.")
      }

      let browserId = localStorage.getItem("talk-to-stellar.browserId")
      if (!browserId) {
        browserId = generateBrowserId()
        localStorage.setItem("talk-to-stellar.browserId", browserId)
      }

      const response = await idempotentFetch(`/api/external/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: finalToken,
          name: name || undefined,
          email: email || undefined,
          phone_number: phoneNumber || undefined,
          cpf: cpf || undefined,
          pin,
          browser_id: browserId,
        }),
      })

      const payload = (await response.json()) as FinalizeResponse
      setResult(payload)
      setStatus(response.ok ? "done" : "error")

      if (response.ok && payload.sessionToken) {
        try {
          localStorage.setItem('talk-to-stellar.sessionToken', payload.sessionToken)
        } catch (storageError) {
          // ignore storage failures
        }
      }
      if (response.ok && payload.success) {
        saveClientSession(payload.sessionId, payload.sessionToken)
      }
      if (response.ok && payload.sessionId) {
        try {
          localStorage.setItem('talk-to-stellar.sessionId', payload.sessionId)
        } catch (storageError) {
          // ignore storage failures
        }
      }

      if (response.ok && payload.success && requestPasskey) {
        setPasskeyStatus("registering")
        setPasskeyError("")
        void registerAndSignInWithPasskey(payload)
        return
      }

      if (response.ok && payload.success) {
        if (isTelegramContext) {
          finishTelegramFlow()
        } else {
          window.location.href = nextPath
        }
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao finalizar conta"
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  async function registerAndSignInWithPasskey(baseResult?: FinalizeResponse) {
    const currentResult = baseResult || result
    const userId = currentResult?.userId
    if (!userId) {
      setResult({ success: false, error: 'Não foi possível iniciar o acesso seguro no momento' })
      return
    }

    if (!window.PublicKeyCredential) {
      setPasskeyStatus('error')
      setPasskeyError('Este navegador não suporta Passkey/WebAuthn.')
      return
    }

    setPasskeyStatus('registering')
    setPasskeyError("")

    try {
      const initRes = await idempotentFetch(`/api/passkeys/register-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const initPayload = await initRes.json()
      if (!initRes.ok || !initPayload.success) throw new Error(initPayload.message || 'Falha ao iniciar configuração de acesso seguro')

      const credential = await startRegistration({ optionsJSON: initPayload.options })

      setPasskeyStatus('registering')
      const completeRes = await idempotentFetch(`/api/passkeys/register-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          challenge_id: initPayload.challengeId,
          credential,
        }),
      })
      const completePayload = await completeRes.json()
      if (!completeRes.ok || !completePayload.success) throw new Error(completePayload.message || 'Falha ao concluir configuração de acesso seguro')

      setPasskeyStatus('done')
      setResult({
        success: true,
        userId,
        sessionId: currentResult?.sessionId,
        sessionToken: currentResult?.sessionToken,
        passkeySessionToken: currentResult?.sessionToken,
        message: 'Biometria ativada com sucesso',
      })
      if (isTelegramContext) {
        finishTelegramFlow()
      } else {
        window.location.href = nextPath
      }
    } catch (err: any) {
      setPasskeyStatus('error')
      setPasskeyError(getPasskeyErrorMessage(err))
    }
  }

  async function handleLinkExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setExistingStatus("submitting")
    setExistingError("")

    try {
      let browserId = localStorage.getItem("talk-to-stellar.browserId")
      if (!browserId) {
        browserId = generateBrowserId()
        localStorage.setItem("talk-to-stellar.browserId", browserId)
      }
      const tokenPayload = validation?.payload || decodeJwtPayload(token)
      const externalProvider = String(tokenPayload?.provider || "").trim().toLowerCase()
      const externalProviderUserId = String(tokenPayload?.provider_user_id || "").trim()
      const linkProvider = externalProvider && externalProviderUserId ? externalProvider : "web"
      const linkProviderUserId = externalProvider && externalProviderUserId ? externalProviderUserId : browserId

      const response = await idempotentFetch(`/api/external/link-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: linkProvider,
          provider_user_id: linkProviderUserId,
          token: externalProvider && externalProviderUserId ? token : undefined,
          email: existingEmail,
          pin: existingPin,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Não foi possível entrar com e-mail e PIN.")
      }

      if (payload?.sessionId) {
        localStorage.setItem("talk-to-stellar.sessionId", String(payload.sessionId))
      }
      if (payload?.sessionToken) {
        localStorage.setItem("talk-to-stellar.sessionToken", String(payload.sessionToken))
      }

      setExistingStatus("done")
      if (isTelegramContext) {
        finishTelegramFlow()
      } else {
        window.location.href = nextPath
      }
    } catch (error) {
      setExistingStatus("error")
      setExistingError(error instanceof Error ? error.message : "Falha ao entrar com e-mail e PIN.")
    }
  }

  if (telegramDone) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-6 text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-6 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-200">Telegram conectado</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Sua conta foi vinculada.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Volte ao Telegram e envie sua próxima mensagem. Esta tela pode ser fechada.
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12 sm:px-6">
        <div className="grid min-w-0 w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur sm:p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-cyan-200">
              Criar conta
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                {isClaimPaymentContext ? "Crie sua conta para receber" : "Finalize sua conta TalkToStellar"}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                {isClaimPaymentContext
                  ? "Cadastre sua conta global e volte automaticamente ao link de pagamento para confirmar o recebimento."
                  : "Preencha seus dados para concluir o cadastro e começar a usar sua conta global com segurança."}
              </p>
              {validation && (
                <div className="mt-3 rounded-md bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <strong>Status do link: </strong>
                  {token && validation.valid ? (
                    <span className="text-emerald-300">Link válido</span>
                  ) : validation.message ? (
                    <span className="text-cyan-200">{validation.message}</span>
                  ) : (
                    <span className="text-rose-300">Link inválido ou ausente</span>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 text-xs">
              {["Identidade", "Segurança", "Conta pronta"].map((step, index) => (
                <motion.div key={step} layout className={`rounded-xl px-3 py-2 text-center transition ${currentStep >= index + 1 ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400"}`}>
                  {step}
                </motion.div>
              ))}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">1. Acesse</p>
                <p className="mt-2 text-sm text-slate-200">
                  {isClaimPaymentContext
                    ? "Você chegou por um link de pagamento. A conta criada aqui será usada para receber."
                    : "Abra o link recebido para iniciar o processo de criação da conta."}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">2. Conclua</p>
                <p className="mt-2 text-sm text-slate-200">
                  Informe seus dados, crie um PIN e confirme o recebimento depois do cadastro.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
              Dica:
              <span className="ml-2 break-all font-mono text-cyan-100">
                Se o link não abrir, volte ao Telegram e solicite um novo acesso.
              </span>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
                Verificação do link:
                <span className="ml-2 break-all font-mono text-cyan-100">
                  {token ? 'pronto' : existingAccountDetected ? 'novo link será gerado ao finalizar' : 'link ausente'}
                </span>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Nome</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  type="text"
                  placeholder="Seu nome"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">E-mail</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="voce@exemplo.com"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Telefone</span>
                <input
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  type="tel"
                  placeholder="+55 11 99999-9999"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">CPF</span>
                <input
                  value={cpf}
                  onChange={(event) => setCpf(event.target.value)}
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">PIN (4 a 8 dígitos)</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Crie seu PIN"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Confirmar PIN</span>
                <input
                  value={pinConfirm}
                  onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Confirme seu PIN"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={requestPasskey}
                  onChange={(event) => setRequestPasskey(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-900"
                />
                <span>Ativar passkey agora (recomendado para login rápido e seguro).</span>
              </label>

              {pinError && <p className="text-rose-300">{pinError}</p>}

              <button
                type="submit"
                disabled={status === "submitting" || !pin.trim() || !pinConfirm.trim()}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? <span className="inline-flex items-center gap-2"><Spinner />Finalizando conta...</span> : "Finalizar conta"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Status</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Aguardando validação do link.</p>}
              {status === "submitting" && <div className="mt-3 inline-flex items-center gap-2 text-slate-300"><TypingDots />Criando conta e preparando wallet...</div>}
              <AnimatePresence mode="wait">
              {status === "done" && result?.success && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-1 text-emerald-300">
                  <p>Conta criada com sucesso.</p>
                </motion.div>
              )}
              {result?.success && (
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => registerAndSignInWithPasskey()}
                    disabled={passkeyStatus === 'registering'}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passkeyStatus === 'registering'
                      ? 'Abrindo biometria...'
                      : 'Ativar biometria'}
                  </button>
                  <p className="text-xs text-slate-400">
                    Toque no botão para abrir a confirmação por digital, Face ID ou desbloqueio do celular.
                  </p>
                  {passkeyError && <p className="text-xs text-rose-300">{passkeyError}</p>}
                </div>
              )}
              {status === "error" && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-rose-300">{result?.error || result?.message || "Algo deu errado."}</motion.p>}
              {passkeyStatus === 'done' && result?.passkeySessionToken && (
                <p className="mt-2 break-all text-emerald-300">Biometria ativada com sucesso.</p>
              )}
              </AnimatePresence>
            </div>

            <a
              href={loginHref}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Já tenho conta
            </a>
          </section>
        </div>
      </div>
    </main>
  )
}
