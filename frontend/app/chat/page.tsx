"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatWindow } from "@/components/chat/chat-window"
import { WelcomeScreen } from "@/components/chat/welcome-screen"

export default function ChatPage() {
  const searchParams = useSearchParams()
  const [selectedChat, setSelectedChat] = useState<string | null>("agent")
  const initialPrompt = useMemo(() => searchParams.get("prompt") || searchParams.get("q") || "", [searchParams])

  useEffect(() => {
    if (initialPrompt) setSelectedChat("agent")
  }, [initialPrompt])

  return (
    <div className="tts-op-page flex h-screen flex-col overflow-hidden bg-tts-bg text-tts-deep md:flex-row">
      <div className={`w-full md:h-screen md:w-[260px] md:flex-shrink-0 md:overflow-hidden ${selectedChat ? "hidden md:block" : "block"}`}>
        <div className="h-full min-h-0 md:sticky md:top-0">
          <ChatSidebar selectedChat={selectedChat} onSelectChat={setSelectedChat} />
        </div>
      </div>

      <div className={`${selectedChat ? "flex" : "hidden md:flex"} h-full min-h-0 flex-1 min-w-0 flex-col overflow-hidden`}>
        {selectedChat ? (
          <ChatWindow chatId={selectedChat} onBack={() => setSelectedChat(null)} initialPrompt={initialPrompt} />
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}
