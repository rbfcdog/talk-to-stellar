"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"

function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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

export default function LogoutClient() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [message, setMessage] = useState("")
  const completionRef = useRef(false)
  const token = String(searchParams.get("token") || "").trim()
  const tokenPayload = useMemo(() => decodeJwtPayload(token), [token])
  const provider = String(searchParams.get("provider") || searchParams.get("source") || tokenPayload?.provider || tokenPayload?.source || "").trim().toLowerCase()
  const providerUserId = String(searchParams.get("provider_user_id") || tokenPayload?.provider_user_id || "").trim()
  const sessionIdFromUrl = String(searchParams.get("session_id") || tokenPayload?.session_id || "").trim()
  const providerLabel = provider === "telegram"
    ? "Telegram"
    : provider === "whatsapp" || provider === "phone"
      ? "WhatsApp"
      : provider
  const isLinkLogout = Boolean(token)

  function redirectToUsed(customMessage?: string) {
    const params = new URLSearchParams()
    if (customMessage) params.set("message", customMessage)
    const query = params.toString()
    window.location.replace(`/link-used${query ? `?${query}` : ""}`)
  }

  const currentSessionId = useMemo(() => {
    if (sessionIdFromUrl) return sessionIdFromUrl
    return ""
  }, [sessionIdFromUrl])

  useEffect(() => {
    if (!isLinkLogout) return

    let active = true
    async function validateToken() {
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (!active) return
        if (!response.ok || payload?.valid === false || payload?.used || payload?.alreadyCompleted || payload?.expired) {
          const reason = String(payload?.message || "")
          redirectToUsed(reason || "This logout link has already been used.")
          return
        }
      } catch {
        redirectToUsed("Could not validate this logout link.")
      }
    }
    void validateToken()

    return () => {
      active = false
    }
  }, [isLinkLogout, token])

  useEffect(() => {
    if (status !== "done" || completionRef.current) return
    completionRef.current = true
    if (isLinkLogout) {
      enqueueWebChatFeedback(`Signed out.\n${message || "Your session has ended."}`)
      closeIntermediatePage()
      return
    }
    const redirect = window.setTimeout(() => {
      window.location.replace("/chat")
    }, 900)
    return () => window.clearTimeout(redirect)
  }, [isLinkLogout, status, message])

  async function handleConfirmLogout() {
    setStatus("loading")
    try {
      const response = await idempotentFetch("/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: currentSessionId || undefined,
          token: token || undefined,
          provider: provider || undefined,
          provider_user_id: providerUserId || undefined,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success === false) {
        const errorMessage = String(payload?.error || payload?.message || "")
        if (payload?.alreadyUsed || payload?.expired || errorMessage.toLowerCase().includes("já foi utilizado")) {
          redirectToUsed(payload?.expired ? "This link expired. Request a new link." : "This logout link has already been used.")
          return
        }
        throw new Error(errorMessage || "Failed to end the session on the server.")
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("talk-to-stellar.sessionId")
        localStorage.removeItem("talk-to-stellar.sessionToken")
        localStorage.removeItem("talk-to-stellar.sessionCreatedAt")
        localStorage.removeItem("talk-to-stellar.sessionLastSeenAt")
        localStorage.setItem("talk-to-stellar.logoutRefreshAt", new Date().toISOString())
        sessionStorage.removeItem("chat-session-agent")
        sessionStorage.setItem("chat-session-agent", generateSessionId())
      }
      setStatus("done")
      setMessage(isLinkLogout && providerLabel ? `Signed out. Go back to ${providerLabel} to continue.` : "You signed out successfully.")
    } catch {
      setStatus("error")
      setMessage("Could not complete sign-out now. Try again.")
    }
  }

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-12 sm:px-6">
        <div className="min-w-0 w-full overflow-hidden rounded-[2rem] border border-tts-border bg-tts-surface p-8 shadow-2xl backdrop-blur">
          <h1 className="text-3xl font-semibold text-tts-surface">Sign out</h1>
          <p className="mt-3 text-tts-deep">{status === "loading" ? "Ending your session..." : message || "Confirm to end your current session."}</p>
          {status === "done" && isLinkLogout && (
            <p className="mt-2 text-xs text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
          )}
          {status === "done" && !isLinkLogout && (
            <p className="mt-2 text-xs text-tts-muted">Returning to chat...</p>
          )}
          <div className="mt-6 flex min-w-0 flex-wrap gap-3">
            {status !== "done" && (
              <button
                type="button"
                onClick={handleConfirmLogout}
                disabled={status === "loading"}
                className="inline-flex items-center justify-center rounded-2xl bg-tts-confirm px-4 py-3 text-sm font-semibold text-tts-deep transition hover:bg-tts-confirm disabled:opacity-60"
              >
                {status === "loading" ? "Signing out..." : "Confirm sign-out"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
