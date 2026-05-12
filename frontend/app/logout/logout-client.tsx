"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

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

export default function LogoutClient() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [message, setMessage] = useState("")
  const provider = String(searchParams.get("provider") || searchParams.get("source") || "").trim().toLowerCase()
  const providerUserId = String(searchParams.get("provider_user_id") || "").trim()
  const sessionIdFromUrl = String(searchParams.get("session_id") || "").trim()
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
    if (!currentSessionId) {
      setMessage("Nenhuma sessão ativa encontrada. Você já está deslogado.")
    }
  }, [currentSessionId])

  async function handleConfirmLogout() {
    setStatus("loading")
    try {
      if (currentSessionId) {
        await fetch("/api/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: currentSessionId,
            provider: provider || undefined,
            provider_user_id: providerUserId || undefined,
          }),
        })
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
            <Link
              href="/chat"
              className="inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Voltar para o chat
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
