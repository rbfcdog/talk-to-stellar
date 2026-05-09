"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"

type ValidationResult = {
  success?: boolean
  valid?: boolean
  payload?: any
  message?: string
}

type ConfirmResponse = {
  success: boolean
  paymentConfirmed?: boolean
  sessionId?: string
  userId?: string
  destination?: string
  destinationName?: string
  amount?: string
  hash?: string
  message?: string
  error?: string
}

type PasskeyInitResponse = {
  success: boolean
  registrationRequired?: boolean
  options?: any
  challengeId?: string
  transaction?: any
  userId?: string
  message?: string
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

export default function ConfirmPaymentClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const publicKeyFromUrl = useMemo(() => searchParams.get("public_key") || searchParams.get("destination_public_key") || '', [searchParams])
  const router = useRouter()

  const [token, setToken] = useState(tokenFromUrl)
  const [publicKey, setPublicKey] = useState(publicKeyFromUrl)
  const [status, setStatus] = useState("ready")
  const [result, setResult] = useState<ConfirmResponse | null>(null)
  const [passkeyMessage, setPasskeyMessage] = useState<string>('')
  const [validation] = useState<ValidationResult>(initialValidation)

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
      // Preserve public key from URL before we strip query params for privacy
      if (publicKeyFromUrl) setPublicKey(publicKeyFromUrl)
      // remove token from URL to avoid leaking it in history/refs
      try {
        // keep the same pathname (no token/query)
        router.replace(window.location.pathname)
      } catch (err) {
        // ignore in environments where router/window aren't available
      }
    }
  }, [tokenFromUrl])

  async function startPasskeyAuthForPayment(currentToken: string, currentPublicKey: string) {
    const initRes = await fetch(`${getBackendBaseUrl()}/api/passkeys/auth-init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken, public_key: currentPublicKey || undefined }),
    })
    const initPayload = (await initRes.json()) as PasskeyInitResponse
    if (!initRes.ok || !initPayload.success) {
      throw new Error(initPayload.message || 'Could not start passkey authorization')
    }

    if (initPayload.registrationRequired) {
      throw new Error('This account does not have a passkey yet. Create one from onboarding, then try again.')
    }

    if (!initPayload.options || !initPayload.challengeId) {
      throw new Error('Passkey challenge was not returned by the backend')
    }

    const credential = await startAuthentication({ optionsJSON: initPayload.options })
    return {
      challenge_id: initPayload.challengeId,
      credential,
      transaction: initPayload.transaction,
      userId: initPayload.userId,
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("authorizing-passkey")
    setResult(null)
    setPasskeyMessage('Starting passkey confirmation...')

    try {
      const passkey = await startPasskeyAuthForPayment(token, publicKey || publicKeyFromUrl)
      setPasskeyMessage('Passkey verified. Submitting payment...')
      setStatus("submitting")

      const response = await fetch(`${getBackendBaseUrl()}/api/external/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          public_key: publicKey || publicKeyFromUrl || undefined,
          passkey,
        }),
      })

      const payload = (await response.json()) as ConfirmResponse
      setResult(payload)
      setStatus(response.ok ? "done" : "error")

      // On success, ensure token is removed from URL (double-safety)
      if (response.ok) {
        setPasskeyMessage('Payment confirmed successfully.')
        try {
          router.replace(window.location.pathname)
        } catch (err) {
          // ignore
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to confirm payment"
      setResult({ success: false, error: message })
      setPasskeyMessage(message)
      setStatus("error")
    }
  }

  const payload = validation?.payload || {}

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <section className="space-y-6">
            <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-emerald-200">
              Payment confirmation
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Confirm this payment
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                This page opens from the payment link generated by the backend. For now, the flow is a single button: review the payment details and confirm it.
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
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Payment</p>
                <p className="mt-2 text-sm text-slate-200">
                  {payload.amount ? `${payload.amount} XLM` : 'Amount loaded from the token'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Recipient</p>
                <p className="mt-2 text-sm text-slate-200">
                  {payload.destination_name || payload.destination || 'Recipient loaded from the token'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-50">
              Example dynamic URL:
              <span className="ml-2 break-all font-mono text-emerald-100">
                {getFrontendBaseUrl()}/confirm-payment?token=&lt;jwt&gt;
              </span>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-50">
                JWT loaded automatically from the link.
                <span className="ml-2 break-all font-mono text-emerald-100">{token ? 'ready' : 'missing token'}</span>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">Review</p>
                <p className="mt-2 text-slate-300">Amount: {payload.amount || '—'}</p>
                <p className="text-slate-300">Destination: {payload.destination_name || payload.destination || '—'}</p>
                <p className="mt-3 text-slate-400">
                  The payment JWT is decoded by the backend to resolve the correct authenticated user before passkey authorization.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">Passkey status</p>
                <p className="mt-2 text-slate-300">
                  {passkeyMessage || 'Press confirm to start passkey verification.'}
                </p>
              </div>
              <button
                type="submit"
                disabled={["authorizing-passkey", "submitting"].includes(status) || !token.trim()}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "authorizing-passkey"
                  ? "Checking passkey..."
                  : status === "submitting"
                    ? "Confirming payment..."
                    : "Confirm payment"}
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Result</p>
              {status === "ready" && <p className="mt-2 text-slate-400">Waiting for confirmation.</p>}
              {status === "done" && result?.success && (
                <div className="mt-2 space-y-1 text-emerald-300">
                  <p>Payment confirmed successfully.</p>
                  <p className="break-all font-mono text-xs">hash: {result.hash}</p>
                  <p className="break-all font-mono text-xs">destination: {result.destinationName || result.destination}</p>
                </div>
              )}
              {status === "error" && (
                <p className="mt-2 text-rose-300">{result?.error || result?.message || "Something went wrong."}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
