"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

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
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [message, setMessage] = useState("")

  const currentSessionId = useMemo(() => {
    if (typeof window === "undefined") return ""
    return String(localStorage.getItem("talk-to-stellar.sessionId") || "").trim()
  }, [])

  useEffect(() => {
    let mounted = true
    async function runLogout() {
      setStatus("loading")
      try {
        if (currentSessionId) {
          await fetch("/api/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: currentSessionId }),
          })
        }
      } catch {
      } finally {
        if (typeof window !== "undefined") {
          localStorage.removeItem("talk-to-stellar.sessionId")
          localStorage.removeItem("talk-to-stellar.sessionToken")
          sessionStorage.removeItem("chat-session-agent")
          sessionStorage.setItem("chat-session-agent", generateSessionId())
        }
        if (!mounted) return
        setStatus("done")
        setMessage("Você saiu da conta com sucesso.")
      }
    }
    runLogout()
    return () => {
      mounted = false
    }
  }, [currentSessionId])

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-12">
        <div className="w-full rounded-[2rem] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
          <h1 className="text-3xl font-semibold text-white">Sair da conta</h1>
          <p className="mt-3 text-slate-300">
            {status === "loading" ? "Encerrando sua sessão..." : message || "Processando logout..."}
          </p>
          <div className="mt-6">
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

