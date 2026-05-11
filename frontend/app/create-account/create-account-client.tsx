"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { useSearchParams } from "next/navigation"

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

type RecoveryResult =
  | { mode: "token"; token: string }
  | { mode: "existing"; sessionId?: string; sessionToken?: string }
  | { mode: "none" }

export default function CreateAccountClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])

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
  const [result, setResult] = useState<FinalizeResponse | null>(null)
  const [existingEmail, setExistingEmail] = useState("")
  const [existingPin, setExistingPin] = useState("")
  const [existingStatus, setExistingStatus] = useState<"idle" | "submitting" | "done" | "error">("idle")
  const [existingError, setExistingError] = useState("")
  const [validation, setValidation] = useState<any>(initialValidation)
  const [existingAccountDetected, setExistingAccountDetected] = useState(false)

  async function recoverOnboardingContextFromBackend(forceNewAccount = false): Promise<RecoveryResult> {
    let browserId = localStorage.getItem("talk-to-stellar.browserId")
    if (!browserId) {
      browserId = generateBrowserId()
      localStorage.setItem("talk-to-stellar.browserId", browserId)
    }

    const response = await fetch(`/api/external/check-account`, {
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
        const recovered = await recoverOnboardingContextFromBackend()

        if (recovered.mode === "existing") {
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
          setValidation({ success: true, valid: true, message: "Link recuperado automaticamente." })
        }
      } catch {
        // keep page usable for manual retry
      }
    }

    recoverTokenWhenMissing()
  }, [token])

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
      if (!finalToken.trim()) {
        throw new Error("Não foi possível validar seu link agora. Solicite um novo acesso no Telegram e tente novamente.")
      }

      let browserId = localStorage.getItem("talk-to-stellar.browserId")
      if (!browserId) {
        browserId = generateBrowserId()
        localStorage.setItem("talk-to-stellar.browserId", browserId)
      }

      const response = await fetch(`/api/external/finalize`, {
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
      if (response.ok && payload.sessionId) {
        try {
          localStorage.setItem('talk-to-stellar.sessionId', payload.sessionId)
        } catch (storageError) {
          // ignore storage failures
        }
      }

      if (response.ok && payload.success && requestPasskey) {
        await registerAndSignInWithPasskey(payload)
        window.location.href = "/chat"
        return
      }

      if (response.ok && payload.success) {
        window.location.href = "/chat"
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
    const userId = currentResult?.userId || currentResult?.sessionId
    if (!userId) {
      setResult({ success: false, error: 'Não foi possível iniciar o acesso seguro no momento' })
      return
    }

    setPasskeyStatus('registering')

    try {
      const initRes = await fetch(`/api/passkeys/register-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const initPayload = await initRes.json()
      if (!initRes.ok || !initPayload.success) throw new Error(initPayload.message || 'Falha ao iniciar configuração de acesso seguro')

      const credential = await startRegistration({ optionsJSON: initPayload.options })

      setPasskeyStatus('registering')
      const completeRes = await fetch(`/api/passkeys/register-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, attestationResponse: credential }),
      })
      const completePayload = await completeRes.json()
      if (!completeRes.ok || !completePayload.success) throw new Error(completePayload.message || 'Falha ao concluir configuração de acesso seguro')

      setPasskeyStatus('authenticating')
      const authInitRes = await fetch(`/api/passkeys/auth-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const authInitPayload = await authInitRes.json()
      if (!authInitRes.ok || !authInitPayload.success) throw new Error(authInitPayload.message || 'Falha ao iniciar entrada com acesso seguro')

      const authCredential = await startAuthentication({ optionsJSON: authInitPayload.options })
      const authCompleteRes = await fetch(`/api/passkeys/auth-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          challenge_id: authInitPayload.challengeId,
          credential: authCredential,
        }),
      })
      const authCompletePayload = await authCompleteRes.json()
      if (!authCompleteRes.ok || !authCompletePayload.success) throw new Error(authCompletePayload.message || 'Falha ao concluir entrada com acesso seguro')

      if (authCompletePayload.sessionToken) {
        try {
          localStorage.setItem('talk-to-stellar.sessionToken', authCompletePayload.sessionToken)
        } catch (storageError) {
          // ignore storage failures
        }
      }

      setPasskeyStatus('done')
      setResult({
        success: true,
        userId,
        sessionId: currentResult?.sessionId,
        sessionToken: currentResult?.sessionToken,
        passkeySessionToken: authCompletePayload.sessionToken,
        message: 'Acesso seguro ativado e entrada concluída com sucesso',
      })
    } catch (err: any) {
      setPasskeyStatus('error')
      setResult({ success: false, error: String(err?.message || err) })
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

      const response = await fetch(`/api/external/link-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "web",
          provider_user_id: browserId,
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
      window.location.href = "/chat"
    } catch (error) {
      setExistingStatus("error")
      setExistingError(error instanceof Error ? error.message : "Falha ao entrar com e-mail e PIN.")
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <section className="space-y-6">
            <div className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-cyan-200">
              Criar conta
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Finalize sua conta TalkToStellar
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Preencha seus dados para concluir o cadastro e começar a usar sua carteira com segurança.
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">1. Acesse</p>
                <p className="mt-2 text-sm text-slate-200">
                  Abra o link recebido para iniciar o processo de criação da conta.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">2. Conclua</p>
                <p className="mt-2 text-sm text-slate-200">
                  Informe nome, e-mail, telefone e CPF para ativar sua conta.
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

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
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
                {status === "submitting" ? "Finalizando conta..." : "Finalizar conta"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Status</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Aguardando validação do link.</p>}
              {status === "done" && result?.success && (
                <div className="mt-2 space-y-1 text-emerald-300">
                  <p>Conta criada com sucesso.</p>
                </div>
              )}
              {result?.success && (
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => registerAndSignInWithPasskey()}
                    disabled={passkeyStatus === 'registering' || passkeyStatus === 'authenticating'}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passkeyStatus === 'registering'
                      ? 'Configurando acesso seguro...'
                      : passkeyStatus === 'authenticating'
                        ? 'Entrando com acesso seguro...'
                        : 'Ativar acesso seguro'}
                  </button>
                  <p className="text-xs text-slate-400">
                    Ative o acesso seguro para entrar mais rápido nas próximas vezes.
                  </p>
                </div>
              )}
              {status === "error" && (
                <p className="mt-2 text-rose-300">{result?.error || result?.message || "Algo deu errado."}</p>
              )}
              {passkeyStatus === 'done' && result?.passkeySessionToken && (
                <p className="mt-2 break-all text-emerald-300">Acesso seguro ativado com sucesso.</p>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Já tenho conta</p>
              <form className="mt-3 space-y-3" onSubmit={handleLinkExisting}>
                <input
                  value={existingEmail}
                  onChange={(event) => setExistingEmail(event.target.value)}
                  type="email"
                  placeholder="Seu e-mail"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
                <input
                  value={existingPin}
                  onChange={(event) => setExistingPin(event.target.value)}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Seu PIN"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
                {existingError && <p className="text-rose-300">{existingError}</p>}
                <button
                  type="submit"
                  disabled={existingStatus === "submitting" || !existingEmail.trim() || !existingPin.trim()}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {existingStatus === "submitting" ? "Entrando..." : "Entrar com e-mail + PIN"}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
