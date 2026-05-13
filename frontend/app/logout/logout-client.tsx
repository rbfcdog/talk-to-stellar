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

  const currentSessionId = useMemo(() => {
    if (sessionIdFromUrl) return sessionIdFromUrl
    if (typeof window === "undefined") return ""
    return String(localStorage.getItem("talk-to-stellar.sessionId") || "").trim()
  }, [sessionIdFromUrl])

  useEffect(() => {
    if (!currentSessionId && !token) {
      const doneMessage = "Nenhuma sessão ativa encontrada. Você já está deslogado."
      setStatus("done")
      setMessage(doneMessage)
    }
  }, [currentSessionId, token])

  useEffect(() => {
    if (status !== "done" || completionRef.current) return
    completionRef.current = true
    enqueueWebChatFeedback(`Saída concluída.\n${message || "Sua sessão foi encerrada."}`)
    closeIntermediatePage()
  }, [status, message])

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
          setStatus("done")
          setMessage(payload?.expired ? "Este link já expirou. Solicite um novo logout." : "Este link de logout já foi utilizado.")
          return
        }
        throw new Error(errorMessage || "Falha ao encerrar sessão no servidor.")
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem("talk-to-stellar.sessionId")
        localStorage.removeItem("talk-to-stellar.sessionToken")
        localStorage.removeItem("talk-to-stellar.sessionCreatedAt")
        sessionStorage.removeItem("chat-session-agent")
        sessionStorage.setItem("chat-session-agent", generateSessionId())
      }
      setStatus("done")
      setMessage(providerLabel ? `Logout concluído. Volte ao ${providerLabel} para continuar.` : "Você saiu da conta com sucesso.")
    } catch {
      setStatus("error")
      setMessage("Não foi possível concluir o logout agora. Tente novamente.")
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-12 sm:px-6">
        <div className="min-w-0 w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <h1 className="text-3xl font-semibold text-white">Sair da conta</h1>
          <p className="mt-3 text-slate-300">{status === "loading" ? "Encerrando sua sessão..." : message || "Confirme para encerrar sua sessão atual."}</p>
          {status === "done" && (
            <p className="mt-2 text-xs text-slate-400">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
          )}
          <div className="mt-6 flex min-w-0 flex-wrap gap-3">
            {status !== "done" && (
              <button
                type="button"
                onClick={handleConfirmLogout}
                disabled={status === "loading"}
                className="inline-flex items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-60"
              >
                {status === "loading" ? "Saindo..." : "Confirmar logout"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
