"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { normalizeClientSessionSource, scopedClientStorageKey } from "@/lib/session"
import { OperationalCard, OperationalPage, StatusPill } from "@/components/layout/OperationalShell"

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
  const logoutScope = normalizeClientSessionSource(provider) || "web"
  const providerUserId = String(searchParams.get("provider_user_id") || tokenPayload?.provider_user_id || "").trim()
  const sessionIdFromUrl = String(searchParams.get("session_id") || tokenPayload?.session_id || "").trim()
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
    }
    closeIntermediatePage()
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
        for (const key of [
          "talk-to-stellar.sessionId",
          "talk-to-stellar.sessionToken",
          "talk-to-stellar.sessionCreatedAt",
          "talk-to-stellar.sessionLastSeenAt",
        ]) {
          localStorage.removeItem(scopedClientStorageKey(key, logoutScope))
          if (logoutScope === "web") localStorage.removeItem(key)
        }
        if (logoutScope === "web") localStorage.removeItem("talk-to-stellar.browserId")
        localStorage.setItem(scopedClientStorageKey("talk-to-stellar.logoutRefreshAt", logoutScope), new Date().toISOString())
        const chatSessionKey = scopedClientStorageKey("chat-session-agent", logoutScope)
        sessionStorage.removeItem(chatSessionKey)
        sessionStorage.setItem(chatSessionKey, generateSessionId())
      }
      setStatus("done")
      setMessage("You signed out successfully.")
    } catch {
      setStatus("error")
      setMessage("Could not complete sign-out now. Try again.")
    }
  }

  return (
    <OperationalPage size="sm" frameClassName="flex min-h-screen items-center">
        <OperationalCard className="min-w-0 w-full overflow-hidden p-8">
          <StatusPill tone={status === "done" ? "confirm" : status === "error" ? "error" : "gold"}>
            {status === "done" ? "Done" : status === "error" ? "Needs attention" : "Account"}
          </StatusPill>
          <h1 className="text-3xl font-semibold text-tts-deep">Sign out</h1>
          <p className="mt-3 text-tts-muted">{status === "loading" ? "Ending your session..." : message || "Confirm to end your current session."}</p>
          {status === "done" && (
            <p className="mt-2 text-xs text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
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
        </OperationalCard>
    </OperationalPage>
  )
}
