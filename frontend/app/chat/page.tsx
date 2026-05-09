"use client"

import { useEffect, useState } from "react"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatWindow } from "@/components/chat-window"
import { WelcomeScreen } from "@/components/welcome-screen"

function getBackendBaseUrl() {
  const explicitBase = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_AGENT_API_URL
  if (!explicitBase) {
    return "http://localhost:3001"
  }

  return explicitBase.replace(/\/api\/agent\/query$/, "").replace(/\/$/, "")
}

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

export default function ChatPage() {
  const [selectedChat, setSelectedChat] = useState<string | null>(null)
  const [checkingAccess, setCheckingAccess] = useState(true)

  useEffect(() => {
    let isCancelled = false

    async function ensureOnboardingForBrowser() {
      try {
        const storedSessionToken = localStorage.getItem("talk-to-stellar.sessionToken")
        if (storedSessionToken) {
          if (!isCancelled) setCheckingAccess(false)
          return
        }

        let browserId = localStorage.getItem("talk-to-stellar.browserId")
        if (!browserId) {
          browserId = generateBrowserId()
          localStorage.setItem("talk-to-stellar.browserId", browserId)
        }

        const response = await fetch(`${getBackendBaseUrl()}/api/external/check-account`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "web",
            provider_user_id: browserId,
          }),
        })

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(payload?.message || "Falha ao validar acesso")
        }

        if (payload?.onboardingRequired && payload?.creationUrl) {
          window.location.href = String(payload.creationUrl)
          return
        }

        if (payload?.exists === true && payload?.sessionId) {
          localStorage.setItem("talk-to-stellar.sessionId", String(payload.sessionId))
        }

        if (!isCancelled) setCheckingAccess(false)
      } catch {
        if (!isCancelled) {
          // Em caso de erro de rede/API, segue para o chat web em vez de bloquear o usuário.
          setCheckingAccess(false)
        }
      }
    }

    ensureOnboardingForBrowser()
    return () => {
      isCancelled = true
    }
  }, [])

  if (checkingAccess) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#111b21] text-[#e9edef]">
        <p className="text-sm">Verificando acesso...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#111b21] text-white">
      <ChatSidebar selectedChat={selectedChat} onSelectChat={setSelectedChat} />

      <div className="flex-1 flex flex-col ml-[400px]">
        {selectedChat ? <ChatWindow chatId={selectedChat} /> : <WelcomeScreen />}
      </div>
    </div>
  )
}
