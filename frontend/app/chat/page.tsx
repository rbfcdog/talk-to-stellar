"use client"

import { useState } from "react"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatWindow } from "@/components/chat-window"
import { WelcomeScreen } from "@/components/welcome-screen"

export default function ChatPage() {
  const [selectedChat, setSelectedChat] = useState<string | null>(null)

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-[#111b21] text-white md:flex-row">
      <div className={`${selectedChat ? "hidden md:flex" : "flex"} w-full md:w-[400px] md:flex-shrink-0`}>
        <ChatSidebar selectedChat={selectedChat} onSelectChat={setSelectedChat} />
      </div>

      <div className={`${selectedChat ? "flex" : "hidden md:flex"} flex-1 min-w-0 flex-col`}>
        {selectedChat ? (
          <ChatWindow chatId={selectedChat} onBack={() => setSelectedChat(null)} />
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  )
}
