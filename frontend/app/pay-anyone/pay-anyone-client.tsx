"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Copy, Link2, Send, ShieldCheck } from "lucide-react"
import { idempotentFetch } from "@/lib/idempotency"
import { getClientSession } from "@/lib/session"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { Spinner, TypingDots, Shimmer } from "@/components/shared/feedback"

type CreatePayLinkResponse = {
  success?: boolean
  url?: string
  message?: string
}

type LinkMode = "send" | "receive"

function normalizeAssetCode(value: string) {
  const code = String(value || "").toUpperCase().replace(/^USD$/, "USDC")
  if (code === "TESOURO") return "BRL"
  if (code === "EUR" || code === "EURC") return "CETES"
  return code
}

function displayAsset(assetCode: string) {
  const code = normalizeAssetCode(assetCode)
  if (code === "USDC") return "US$"
  if (code === "BRL") return "R$"
  if (code === "CETES") return "CETES"
  return code
}

function friendlyName(value: string) {
  const raw = String(value || "").trim()
  if (!raw) return "user"
  const base = raw.includes("@") ? raw.split("@")[0] : raw
  return base.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim() || "user"
}

export default function PayAnyoneClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sessionId, setSessionId] = useState("")
  const [mode, setMode] = useState<LinkMode>("send")
  const [userName, setUserName] = useState("user")
  const [recipientName, setRecipientName] = useState("")
  const [amount, setAmount] = useState("15")
  const [assetCode, setAssetCode] = useState("USDC")
  const [destinationAssetCode, setDestinationAssetCode] = useState("USDC")
  const [pin, setPin] = useState("")
  const [expiresAtLocal, setExpiresAtLocal] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle")
  const [result, setResult] = useState<CreatePayLinkResponse | null>(null)
  const [copied, setCopied] = useState(false)
  const [booting, setBooting] = useState(true)
  const submitLockRef = useRef(false)

  useEffect(() => {
    getClientSession().then(({ sessionId: storedSessionId, authenticated }) => {
      const storedUserName = localStorage.getItem("talk-to-stellar.userName") || ""
      setSessionId(storedSessionId)
      setUserName(friendlyName(storedUserName || storedSessionId))
      setMode(searchParams.get("mode") === "receive" ? "receive" : "send")
      setRecipientName(searchParams.get("recipient") || "")
      setAmount(searchParams.get("amount") || "15")
      const sourceAsset = normalizeAssetCode(searchParams.get("asset") || "USDC")
      setAssetCode(sourceAsset)
      setDestinationAssetCode(normalizeAssetCode(searchParams.get("receive_asset") || searchParams.get("destination_asset") || sourceAsset))
      const expiresAtFromQuery = String(searchParams.get("expires_at") || "").trim()
      if (expiresAtFromQuery) {
        const parsed = new Date(expiresAtFromQuery)
        if (Number.isFinite(parsed.getTime())) {
          const localValue = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
          setExpiresAtLocal(localValue)
        }
      }

      if (!storedSessionId || !authenticated) {
        const next = `/pay-anyone${window.location.search || ""}`
        router.replace(`/login?next=${encodeURIComponent(next)}`)
      }
      setBooting(false)
    })
  }, [router, searchParams])

  useEffect(() => {
    if (!sessionId) return
    let active = true
    async function loadProfileName() {
      try {
        const response = await fetch(`/api/financial/global-profile/${encodeURIComponent(sessionId)}`, {
          cache: "no-store",
        })
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

  useEffect(() => {
    if (status !== "done" || mode === "receive") return
    closeIntermediatePage()
  }, [mode, status])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLockRef.current) return
    submitLockRef.current = true
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
          throw new Error(payload?.message || "Could not create your receive link.")
        }
        const link = String(profile.public_link)
        const displayName = friendlyName(String(profile.display_name || profile.username || userName))
        setUserName(displayName)
        localStorage.setItem("talk-to-stellar.userName", displayName)
        setResult({
          success: true,
          url: link,
          message: `Share this link to receive payments. The payer opens it, enters the amount, and sends it to your account.`,
        })
        enqueueWebChatFeedback(`Receive link created.\nShare this link with your customer:\n${link}`)
        setStatus("done")
        return
      }

      const response = await idempotentFetch("/api/external/pay-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          recipient_name: recipientName || undefined,
          amount,
          asset_code: assetCode,
          destination_asset_code: destinationAssetCode,
          expires_at: expiresAtLocal ? new Date(expiresAtLocal).toISOString() : undefined,
          pin,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      setResult(payload)
      const success = response.ok && payload?.success
      setStatus(success ? "done" : "error")
      if (!success) {
        submitLockRef.current = false
      }
      if (response.ok && payload?.success && payload?.url) {
        enqueueWebChatFeedback([
          "Payment link created.",
          payload.message ? String(payload.message) : "",
          String(payload.url),
        ].filter(Boolean).join("\n"))
      }
    } catch (error) {
      setResult({ success: false, message: error instanceof Error ? error.message : "Failed to create link." })
      submitLockRef.current = false
      setStatus("error")
    }
  }

  async function copyLink() {
    if (!result?.url) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
  }

  const loggedIn = Boolean(sessionId)
  const shareText = result?.message && result?.url ? `${result.message}\n${result.url}` : result?.url || ""
  const whatsappUrl = shareText ? `https://wa.me/?text=${encodeURIComponent(shareText)}` : "#"
  const isReceiveMode = mode === "receive"
  const submitLocked = status === "submitting" || status === "done" || submitLockRef.current

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 md:grid-cols-[0.95fr_1.05fr]">
        <section className="min-w-0 space-y-6 overflow-hidden">
          <div className="inline-flex items-center gap-2 rounded-full border border-tts-confirm bg-tts-confirm/10 px-4 py-1 text-xs font-medium uppercase tracking-normal text-tts-confirm">
            <ShieldCheck className="h-4 w-4" />
            Pay Anyone
          </div>
          <div className="space-y-4">
            <p className="text-lg font-semibold text-tts-confirm">Welcome, {userName}</p>
            <h1 className="max-w-xl text-2xl font-bold text-tts-deep md:text-3xl">
              {isReceiveMode ? "Receive money through your global link" : "Send money to someone who does not have an account yet"}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-tts-muted">
              {isReceiveMode
                ? "Share your link with customers. They open it, enter the amount, and pay directly to your account."
                : "Your PIN authorizes link creation. The recipient must sign in or create their own global account to receive the amount."}
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-3">
            {(isReceiveMode ? ["Create", "Share", "Receive"] : ["Create", "Share", "Receive"]).map((label, index) => (
              <div key={label} className="min-w-0 overflow-hidden rounded-xl border border-tts-border bg-tts-surface p-4">
                <p className="text-xs uppercase tracking-normal text-tts-muted">{index + 1}. {label}</p>
                <p className="mt-2 text-sm text-tts-deep">
                  {index === 0 && (isReceiveMode ? "Generate your public receive link." : "Enter amount, recipient, and PIN.")}
                  {index === 1 && "Send the link through your preferred channel."}
                  {index === 2 && (isReceiveMode ? "The payment lands in your account." : "The recipient receives it in their own account.")}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-tts-border bg-tts-bg p-5 shadow-sm md:p-6">
          {booting && (
            <div className="mb-5 space-y-3">
              <Shimmer className="h-12 w-full rounded-xl" />
              <Shimmer className="h-24 w-full rounded-xl" />
            </div>
          )}
          {!loggedIn && (
            <div className="mb-5 rounded-xl border border-tts-gold bg-tts-gold-bg p-4 text-sm text-tts-gold">
              Sign in before creating a payment link.
              <Link href="/login?next=/pay-anyone" className="ml-2 font-semibold text-tts-gold underline">
                Sign in
              </Link>
            </div>
          )}

          <div className="mb-5 grid rounded-xl border border-tts-border bg-tts-surface p-1 text-sm sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                submitLockRef.current = false
                setMode("send")
                setStatus("idle")
                setResult(null)
                setCopied(false)
              }}
              className={`rounded-md px-4 py-2 font-semibold transition ${!isReceiveMode ? "bg-tts-confirm text-tts-deep" : "text-tts-deep hover:bg-tts-surface"}`}
            >
              Send
            </button>
            <button
              type="button"
              onClick={() => {
                submitLockRef.current = false
                setMode("receive")
                setStatus("idle")
                setResult(null)
                setCopied(false)
              }}
              className={`rounded-md px-4 py-2 font-semibold transition ${isReceiveMode ? "bg-tts-confirm text-tts-deep" : "text-tts-deep hover:bg-tts-surface"}`}
            >
              Receive
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {!isReceiveMode && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-tts-deep">Recipient name</span>
                <input
                  value={recipientName}
                  onChange={(event) => setRecipientName(event.target.value)}
                  placeholder="John"
                  className="w-full rounded-xl border border-tts-border bg-tts-surface px-4 py-3 text-sm text-tts-deep outline-none placeholder:text-tts-muted focus:border-tts-confirm"
                />
              </label>
            )}

            {!isReceiveMode && <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_130px_130px]">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-tts-deep">Amount</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
                  inputMode="decimal"
                  placeholder="15"
                  className="w-full rounded-xl border border-tts-border bg-tts-surface px-4 py-3 text-sm text-tts-deep outline-none placeholder:text-tts-muted focus:border-tts-confirm"
                />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-tts-deep">You pay</span>
                <select
                  value={assetCode}
                  onChange={(event) => setAssetCode(event.target.value)}
                  className="w-full rounded-xl border border-tts-border bg-tts-surface px-4 py-3 text-sm text-tts-deep outline-none focus:border-tts-confirm"
                >
                  <option value="USDC">US$</option>
                  <option value="BRL">R$</option>
                  <option value="CETES">CETES</option>
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-tts-deep">Receives in</span>
                <select
                  value={destinationAssetCode}
                  onChange={(event) => setDestinationAssetCode(event.target.value)}
                  className="w-full rounded-xl border border-tts-border bg-tts-surface px-4 py-3 text-sm text-tts-deep outline-none focus:border-tts-confirm"
                >
                  <option value="USDC">US$</option>
                  <option value="BRL">R$</option>
                  <option value="CETES">CETES</option>
                </select>
              </label>
              <label className="block space-y-2 sm:col-span-3">
                <span className="text-sm font-medium text-tts-deep">Expires at (optional)</span>
                <input
                  value={expiresAtLocal}
                  onChange={(event) => setExpiresAtLocal(event.target.value)}
                  type="datetime-local"
                  className="w-full rounded-xl border border-tts-border bg-tts-surface px-4 py-3 text-sm text-tts-deep outline-none focus:border-tts-confirm"
                />
              </label>
            </div>}

            {isReceiveMode && (
              <div className="rounded-xl border border-tts-confirm bg-tts-confirm/10 p-4 text-sm text-tts-confirm">
                Your receive link is fixed. The customer chooses the amount on the public page and the payment is identified as an incoming payment for you.
              </div>
            )}

            {!isReceiveMode && destinationAssetCode !== assetCode && (
              <p className="rounded-xl border border-tts-gold bg-tts-gold-bg px-3 py-2 text-sm text-tts-gold">
                The link debits {amount || "0"} {displayAsset(assetCode)} from your account and the recipient receives it in {displayAsset(destinationAssetCode)} when they sign in.
              </p>
            )}

            {!isReceiveMode && (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-tts-deep">Your PIN</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Authorize link creation"
                  className="w-full rounded-xl border border-tts-border bg-tts-surface px-4 py-3 text-sm text-tts-deep outline-none placeholder:text-tts-muted focus:border-tts-confirm"
                />
              </label>
            )}

            <button
              type="submit"
              disabled={!loggedIn || submitLocked || (!isReceiveMode && (!amount.trim() || !pin.trim()))}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-tts-confirm px-4 py-3 text-sm font-semibold text-tts-deep transition hover:bg-tts-confirm disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Link2 className="h-4 w-4" />
              {status === "submitting"
                ? <span className="inline-flex items-center gap-2"><Spinner />Creating link...</span>
                : isReceiveMode ? "Create receive link" : "Create payment link"}
            </button>
          </form>

          <div className="mt-5 rounded-xl border border-tts-border bg-tts-bg p-4 text-sm">
              <p className="font-medium text-tts-deep">Link</p>
            {status === "idle" && (
              <p className="mt-2 text-tts-muted">
                {isReceiveMode ? "The link appears here after creation." : "The link appears here after authorization."}
              </p>
            )}
            {status === "submitting" && <div className="mt-2 inline-flex items-center gap-2 text-tts-deep"><TypingDots />Generating secure link...</div>}
            {status === "error" && <p className="mt-2 text-tts-error">{result?.message || "Could not create the link."}</p>}
            <AnimatePresence mode="wait">
            {status === "done" && result?.url && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-3">
                <p className="break-all rounded-xl bg-tts-surface p-3 font-mono text-xs text-tts-deep">{result.url}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-tts-border bg-tts-surface px-4 py-2 font-semibold text-tts-deep transition hover:bg-tts-bg"
                  >
                    <Copy className="h-4 w-4" />
                    {copied ? "Copied" : "Copy"}
                  </button>
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-tts-gold px-4 py-2 font-semibold text-tts-deep transition hover:bg-tts-confirm"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </a>
                </div>
                <p className="text-tts-deep">{result.message}</p>
                <p className="text-xs text-tts-muted">
                  {isReceiveMode ? "This page stays open so you can copy and share the link." : INTERMEDIATE_PAGE_CLOSE_COPY}
                </p>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </main>
  )
}
