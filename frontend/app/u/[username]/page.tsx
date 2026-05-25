"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowRight, Loader2, WalletCards } from "lucide-react"
import { getClientSession } from "@/lib/session"

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
      const { sessionId, authenticated } = await getClientSession()
      const normalizedAmount = amount.trim().replace(",", ".")
      if (!normalizedAmount || !Number.isFinite(Number(normalizedAmount)) || Number(normalizedAmount) <= 0) {
        throw new Error("Enter an amount greater than zero.")
      }

      if (!sessionId || !authenticated) {
        const next = `/u/${encodeURIComponent(username)}`
        router.push(`/login?next=${encodeURIComponent(next)}`)
        return
      }

      const response = await fetch(`/api/financial/u/${encodeURIComponent(username)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          amount: normalizedAmount,
          asset_code: asset,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success || !payload?.url) {
        throw new Error(payload?.message || "Could not start the payment now.")
      }

      window.location.href = String(payload.url)
    } catch (error) {
      setSubmitStatus("error")
      setSubmitMessage(error instanceof Error ? error.message : "Failed to start payment.")
      submitLockRef.current = false
    }
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tts-bg px-4 text-tts-deep">
        <p className="text-sm text-tts-deep">Loading payment link...</p>
      </main>
    )
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tts-bg px-4 text-tts-deep">
        <section className="w-full max-w-md rounded-lg border border-tts-border bg-tts-surface p-6">
          <h1 className="text-2xl font-semibold text-tts-surface">Link not found</h1>
          <p className="mt-3 text-sm text-tts-deep">Check the address or ask the recipient for a new link.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-tts-bg px-4 py-10 text-tts-deep">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center">
        <section className="w-full rounded-lg border border-tts-border bg-tts-deep/40 p-5 shadow-2xl sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-tts-confirm bg-tts-confirm/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.22em] text-tts-confirm">
            <WalletCards className="h-4 w-4" />
            Payment link
          </div>

          <h1 className="mt-5 text-3xl font-semibold text-tts-surface">Pay {name}</h1>
          <p className="mt-3 text-sm leading-6 text-tts-deep">
            Enter the amount and continue to authorize the payment from your TalkToStellar account.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-tts-deep">Amount</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
                inputMode="decimal"
                placeholder="500"
                className="w-full rounded-lg border border-tts-border bg-tts-surface px-4 py-3 text-sm text-tts-surface outline-none placeholder:text-tts-muted focus:border-tts-confirm"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-tts-deep">Currency</span>
              <select
                value={asset}
                onChange={(event) => setAsset(event.target.value)}
                className="w-full rounded-lg border border-tts-border bg-tts-surface px-4 py-3 text-sm text-tts-surface outline-none focus:border-tts-confirm"
              >
                <option value="USDC">US$</option>
                <option value="BRL">R$</option>
                <option value="EUR">€</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={handlePayNow}
            disabled={submitStatus === "submitting" || submitLockRef.current}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-tts-confirm px-4 py-3 text-sm font-semibold text-tts-deep transition hover:bg-tts-confirm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitStatus === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating confirmation...
              </>
            ) : (
              <>
                Continue payment
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          {submitStatus === "error" && submitMessage && (
            <p className="mt-3 text-sm text-tts-error">{submitMessage}</p>
          )}
        </section>
      </div>
    </main>
  )
}
