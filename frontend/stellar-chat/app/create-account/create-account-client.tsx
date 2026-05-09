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

function getBackendBaseUrl() {
  const explicitBase = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_AGENT_API_URL
  if (!explicitBase) {
    return "http://localhost:3001"
  }

  return explicitBase.replace(/\/api\/agent\/query$/, "").replace(/\/$/, "")
}

function getFrontendBaseUrl() {
  return process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000"
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

  const [token, setToken] = useState(tokenFromUrl)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState("ready")
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "registering" | "authenticating" | "done" | "error">("idle")
  const [result, setResult] = useState<FinalizeResponse | null>(null)
  const [validation] = useState<any>(initialValidation)

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
    }
  }, [tokenFromUrl])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("submitting")
    setResult(null)

    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/external/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name || undefined,
          email: email || undefined,
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to finalize account"
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  async function registerAndSignInWithPasskey() {
    const userId = result?.userId || result?.sessionId
    if (!userId) {
      setResult({ success: false, error: 'No user/session id available to register a passkey' })
      return
    }

    setPasskeyStatus('registering')

    try {
      const initRes = await fetch(`${getBackendBaseUrl()}/api/passkeys/register-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const initPayload = await initRes.json()
      if (!initRes.ok || !initPayload.success) throw new Error(initPayload.message || 'register-init failed')

      const credential = await startRegistration({ optionsJSON: initPayload.options })

      setPasskeyStatus('registering')
      const completeRes = await fetch(`${getBackendBaseUrl()}/api/passkeys/register-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, attestationResponse: credential }),
      })
      const completePayload = await completeRes.json()
      if (!completeRes.ok || !completePayload.success) throw new Error(completePayload.message || 'register-complete failed')

      setPasskeyStatus('authenticating')
      const authInitRes = await fetch(`${getBackendBaseUrl()}/api/passkeys/auth-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const authInitPayload = await authInitRes.json()
      if (!authInitRes.ok || !authInitPayload.success) throw new Error(authInitPayload.message || 'auth-init failed')

      const authCredential = await startAuthentication({ optionsJSON: authInitPayload.options })
      const authCompleteRes = await fetch(`${getBackendBaseUrl()}/api/passkeys/auth-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          challenge_id: authInitPayload.challengeId,
          credential: authCredential,
        }),
      })
      const authCompletePayload = await authCompleteRes.json()
      if (!authCompleteRes.ok || !authCompletePayload.success) throw new Error(authCompletePayload.message || 'auth-complete failed')

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
        sessionId: result?.sessionId,
        sessionToken: result?.sessionToken,
        passkeySessionToken: authCompletePayload.sessionToken,
        message: 'Passkey registered and signed in successfully',
      })
    } catch (err: any) {
      setPasskeyStatus('error')
      setResult({ success: false, error: String(err?.message || err) })
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <section className="space-y-6">
            <div className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-cyan-200">
              Account onboarding
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Complete your TalkToStellar account
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                This page is the client-side example for the dynamic onboarding URL.
                The backend creates a 24-hour JWT and sends users here when the Telegram bot
                sees a sender that does not yet have an account.
              </p>
              {validation && (
                <div className="mt-3 rounded-md bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <strong>Status: </strong>
                  {validation.valid ? (
                    <span className="text-emerald-300">Valid token</span>
                  ) : (
                    <span className="text-rose-300">{validation.message || 'Invalid or missing token'}</span>
                  )}
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">1. Token</p>
                <p className="mt-2 text-sm text-slate-200">
                  The JWT is loaded automatically from the onboarding link.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">2. Finalize</p>
                <p className="mt-2 text-sm text-slate-200">
                  Submit your name and email to create the session and wallet.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
              Example dynamic URL:
              <span className="ml-2 break-all font-mono text-cyan-100">
                {getFrontendBaseUrl()}/create-account?token=&lt;jwt&gt;
              </span>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
                JWT loaded automatically from the link.
                <span className="ml-2 break-all font-mono text-cyan-100">{token ? 'ready' : 'missing token'}</span>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  type="text"
                  placeholder="Your name"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <button
                type="submit"
                disabled={status === "submitting" || !token.trim()}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? "Finalizing account..." : "Finalize account"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Result</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Waiting for the token.</p>}
              {status === "done" && result?.success && (
                <div className="mt-2 space-y-1 text-emerald-300">
                  <p>Account created successfully.</p>
                  <p className="break-all font-mono text-xs">sessionId: {result.sessionId}</p>
                  <p className="break-all font-mono text-xs">sessionToken: {result.sessionToken}</p>
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
                      ? 'Creating passkey...'
                      : passkeyStatus === 'authenticating'
                        ? 'Signing in with passkey...'
                        : 'Register and sign in with passkey'}
                  </button>
                  <p className="text-xs text-slate-400">
                    This will create a passkey and immediately sign you in, storing the session token for the app.
                  </p>
                </div>
              )}
              {status === "error" && (
                <p className="mt-2 text-rose-300">{result?.error || result?.message || "Something went wrong."}</p>
              )}
              {passkeyStatus === 'done' && result?.passkeySessionToken && (
                <p className="mt-2 break-all text-emerald-300">Passkey session token saved for reuse.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
