"use client"

import { useMemo, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"
import { saveClientSession } from "@/lib/session"
import { KeyRound, LogIn, ShieldCheck } from "lucide-react"

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

function getPasskeyErrorMessage(error: any): string {
  const name = String(error?.name || "")
  const message = String(error?.message || error || "")
  const normalized = message.toLowerCase()

  if (name === "NotAllowedError") {
    return "A biometria foi cancelada ou expirou. Toque em \"Entrar com Passkey\" e confirme no celular."
  }
  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "A Passkey precisa abrir no domínio correto e com HTTPS."
  }
  if (normalized.includes("registrationrequired")) {
    return "Ainda não existe Passkey registrada para esta conta. Entre com PIN e ative a biometria no cadastro."
  }

  return message || "Não foi possível entrar com Passkey."
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

export default function LoginClient({ expired }: { expired?: boolean }) {
  const searchParams = useSearchParams()
  const rawNextPath = searchParams.get("next") || "/chat"
  const nextPath = rawNextPath.startsWith("/") && !rawNextPath.startsWith("//") ? rawNextPath : "/chat"
  const externalToken = searchParams.get("token") || ""
  const externalPayload = useMemo(() => decodeJwtPayload(externalToken), [externalToken])
  const externalProvider = String(externalPayload?.provider || "").trim().toLowerCase()
  const externalProviderUserId = String(externalPayload?.provider_user_id || "").trim()
  const hasExternalContext = Boolean(externalToken && externalProvider && externalProviderUserId)
  const isTelegramContext = externalProvider === "telegram"
  const [email, setEmail] = useState("")
  const [pin, setPin] = useState("")
  const [status, setStatus] = useState<"idle" | "pin" | "passkey" | "error">("idle")
  const [error, setError] = useState("")
  const [externalDone, setExternalDone] = useState(false)

  function getBrowserId() {
    let browserId = localStorage.getItem("talk-to-stellar.browserId")
    if (!browserId) {
      browserId = generateBrowserId()
      localStorage.setItem("talk-to-stellar.browserId", browserId)
    }
    return browserId
  }

  function finishLogin() {
    if (isTelegramContext) {
      setExternalDone(true)
      window.setTimeout(() => {
        window.close()
      }, 700)
      return
    }

    window.location.href = nextPath
  }

  async function linkExternalSession(sessionId?: string, sessionToken?: string) {
    if (!hasExternalContext) return
    if (!sessionId || !sessionToken) {
      throw new Error("Não foi possível vincular o Telegram a esta sessão.")
    }

    const response = await fetch(`/api/external/link-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: externalToken,
        session_id: sessionId,
        session_token: sessionToken,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.message || "Não foi possível vincular o Telegram a esta sessão.")
    }
  }

  async function handlePinLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("pin")
    setError("")

    try {
      if (externalToken && !hasExternalContext) {
        throw new Error("Link externo inválido. Volte ao Telegram e solicite um novo acesso.")
      }

      const response = await fetch(`/api/external/link-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: hasExternalContext ? externalProvider : "web",
          provider_user_id: hasExternalContext ? externalProviderUserId : getBrowserId(),
          token: hasExternalContext ? externalToken : undefined,
          email,
          pin,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Não foi possível entrar com e-mail e PIN.")
      }

      saveClientSession(
        payload?.sessionId ? String(payload.sessionId) : undefined,
        payload?.sessionToken ? String(payload.sessionToken) : undefined
      )
      finishLogin()
    } catch (err) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Falha ao entrar com e-mail e PIN.")
    }
  }

  async function handlePasskeyLogin() {
    if (!email.trim()) {
      setStatus("error")
      setError("Informe seu e-mail para entrar com Passkey.")
      return
    }

    if (!window.PublicKeyCredential) {
      setStatus("error")
      setError("Este navegador não suporta Passkey/WebAuthn.")
      return
    }

    setStatus("passkey")
    setError("")

    try {
      if (externalToken && !hasExternalContext) {
        throw new Error("Link externo inválido. Volte ao Telegram e solicite um novo acesso.")
      }

      const initRes = await fetch(`/api/passkeys/auth-init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const initPayload = await initRes.json().catch(() => ({}))
      if (!initRes.ok || !initPayload.success) {
        throw new Error(initPayload.message || "Falha ao iniciar Passkey.")
      }
      if (initPayload.registrationRequired) {
        throw new Error("registrationRequired")
      }

      const credential = await startAuthentication({ optionsJSON: initPayload.options })
      const completeRes = await fetch(`/api/passkeys/auth-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: initPayload.userId,
          challenge_id: initPayload.challengeId,
          credential,
        }),
      })
      const completePayload = await completeRes.json().catch(() => ({}))
      if (!completeRes.ok || !completePayload.success) {
        throw new Error(completePayload.message || "Falha ao concluir Passkey.")
      }

      saveClientSession(
        completePayload?.sessionId ? String(completePayload.sessionId) : undefined,
        completePayload?.sessionToken ? String(completePayload.sessionToken) : undefined
      )
      getBrowserId()
      await linkExternalSession(
        completePayload?.sessionId ? String(completePayload.sessionId) : undefined,
        completePayload?.sessionToken ? String(completePayload.sessionToken) : undefined
      )
      finishLogin()
    } catch (err: any) {
      setStatus("error")
      setError(getPasskeyErrorMessage(err))
    }
  }

  if (externalDone) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-6 text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-6 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-200">
            {isTelegramContext ? "Telegram conectado" : "Conta conectada"}
          </p>
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
        <div className="grid min-w-0 w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur sm:p-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-200">
              <ShieldCheck className="h-4 w-4" />
              TalkToStellar
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Entrar na sua conta
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Use seu PIN ou Passkey para voltar ao chat, confirmar pagamentos e receber links com segurança.
              </p>
              {expired && (
                <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                  Sua sessão expirou. Entre novamente para continuar.
                </p>
              )}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-400">PIN</p>
                <p className="mt-2 text-sm text-slate-200">Acesso rápido para a conta já criada.</p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Passkey</p>
                <p className="mt-2 text-sm text-slate-200">Biometria ou desbloqueio do aparelho quando disponível.</p>
              </div>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handlePinLogin}>
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
                <span className="text-sm font-medium text-slate-200">PIN</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Digite seu PIN"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              {error && <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p>}

              <button
                type="submit"
                disabled={status === "pin" || !email.trim() || !pin.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                {status === "pin" ? "Entrando..." : "Entrar com PIN"}
              </button>
            </form>

            <button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={status === "passkey" || !email.trim()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {status === "passkey" ? "Abrindo biometria..." : "Entrar com Passkey"}
            </button>

            <p className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-300">
              Por segurança, sua sessão dura 24 horas. Depois disso, você entra de novo antes de continuar.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
