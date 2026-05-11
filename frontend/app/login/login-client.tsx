"use client"

import { useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"
import { saveClientSession } from "@/lib/session"

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

export default function LoginClient({ expired }: { expired?: boolean }) {
  const searchParams = useSearchParams()
  const rawNextPath = searchParams.get("next") || "/chat"
  const nextPath = rawNextPath.startsWith("/") && !rawNextPath.startsWith("//") ? rawNextPath : "/chat"
  const [email, setEmail] = useState("")
  const [pin, setPin] = useState("")
  const [status, setStatus] = useState<"idle" | "pin" | "passkey" | "error">("idle")
  const [error, setError] = useState("")

  function getBrowserId() {
    let browserId = localStorage.getItem("talk-to-stellar.browserId")
    if (!browserId) {
      browserId = generateBrowserId()
      localStorage.setItem("talk-to-stellar.browserId", browserId)
    }
    return browserId
  }

  async function handlePinLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("pin")
    setError("")

    try {
      const response = await fetch(`/api/external/link-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "web",
          provider_user_id: getBrowserId(),
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
      window.location.href = nextPath
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
      window.location.href = nextPath
    } catch (err: any) {
      setStatus("error")
      setError(getPasskeyErrorMessage(err))
    }
  }

  return (
    <main className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-10">
        <section className="w-full rounded-2xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">TalkToStellar</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Entrar na sua conta</h1>
          {expired && (
            <p className="mt-3 rounded-md border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
              Sua sessão expirou.
            </p>
          )}
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Por segurança, sua sessão dura 1 hora. Entre novamente com PIN ou Passkey registrada.
          </p>

          <form className="mt-6 space-y-3" onSubmit={handlePinLogin}>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              placeholder="Seu e-mail"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
            />
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              type="password"
              inputMode="numeric"
              maxLength={8}
              placeholder="Seu PIN"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-cyan-400/60"
            />

            {error && <p className="text-sm text-rose-300">{error}</p>}

            <button
              type="submit"
              disabled={status === "pin" || !email.trim() || !pin.trim()}
              className="w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "pin" ? "Entrando..." : "Entrar com PIN"}
            </button>
          </form>

          <button
            type="button"
            onClick={handlePasskeyLogin}
            disabled={status === "passkey" || !email.trim()}
            className="mt-3 w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "passkey" ? "Abrindo biometria..." : "Entrar com Passkey"}
          </button>
        </section>
      </div>
    </main>
  )
}
