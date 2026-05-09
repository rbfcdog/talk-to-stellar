"use client"

import { useState } from "react"
import { ChatSidebar } from "@/components/chat-sidebar"
import { ChatWindow } from "@/components/chat-window"
import { WelcomeScreen } from "@/components/welcome-screen"

export default function ChatPage() {
  const [selectedChat, setSelectedChat] = useState<string | null>(null)

  return (
    <div className="flex h-screen bg-[#111b21] text-white">
      <ChatSidebar selectedChat={selectedChat} onSelectChat={setSelectedChat} />

      <div className="flex-1 flex flex-col ml-[400px]">
        {selectedChat ? <ChatWindow chatId={selectedChat} /> : <WelcomeScreen />}
      </div>
    </div>
  )
}
