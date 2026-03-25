// src/components/chat-sidebar.tsx

"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MoreVertical, MessageCircle, Users } from "lucide-react";

interface ChatSidebarProps {
  selectedChat: string | null;
  onSelectChat: (chatId: string | null) => void;
}

export function ChatSidebar({ selectedChat, onSelectChat }: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const conversations = [
    {
      id: "agent",
      title: "TalkToStellar Agent",
      lastMessage: "Olá! Como posso ajudá-lo com suas operações na rede Stellar?",
      lastMessageTime: new Date().toISOString(),
      avatar: "/stellar-logo.png",
      isBot: true,
    },
    {
      id: "contact-1",
      title: "Ana Silva",
      lastMessage: "Obrigada pela transferência! 😊",
      lastMessageTime: new Date(Date.now() - 3600000).toISOString(),
      avatar: "/avatar-ana.svg",
    },
    {
      id: "contact-2",
      title: "Carlos Souza",
      lastMessage: "Pode me enviar aquela proposta que comentamos?",
      lastMessageTime: new Date(Date.now() - 7200000).toISOString(),
      avatar: "/avatar-carlos.svg",
    },
    {
      id: "contact-3",
      title: "Marina Costa",
      lastMessage: "Ótimo trabalho no projeto! 👏",
      lastMessageTime: new Date(Date.now() - 10800000).toISOString(),
      avatar: "/avatar-marina.svg",
    },
    {
      id: "contact-4",
      title: "Fernando Oliveira",
      lastMessage: "Consegui resolver o problema. Valeu a ajuda!",
      lastMessageTime: new Date(Date.now() - 14400000).toISOString(),
      avatar: "/avatar-fernando.svg",
    },
    {
      id: "contact-5",
      title: "Juliana Lima",
      lastMessage: "Vamos agendar uma reunião para discutir os detalhes",
      lastMessageTime: new Date(Date.now() - 18000000).toISOString(),
      avatar: "/avatar-juliana.svg",
    },
    {
      id: "contact-6",
      title: "Roberto Dias",
      lastMessage: "Recebi o pagamento, tudo certo por aqui! ✅",
      lastMessageTime: new Date(Date.now() - 21600000).toISOString(),
      avatar: "/avatar-roberto.svg",
    },
    {
      id: "contact-7",
      title: "Patricia Ferreira",
      lastMessage: "Fique à vontade para me chamar quando precisar",
      lastMessageTime: new Date(Date.now() - 25200000).toISOString(),
      avatar: "/avatar-patricia.svg",
    },
    {
      id: "contact-8",
      title: "Leonardo Santos",
      lastMessage: "Vamos conversar em breve? Tenho novidades para contar",
      lastMessageTime: new Date(Date.now() - 28800000).toISOString(),
      avatar: "/avatar-leonardo.svg",
    },
    {
      id: "contact-9",
      title: "Isabella Rodrigues",
      lastMessage: "Suas análises foram muito úteis para o projeto",
      lastMessageTime: new Date(Date.now() - 32400000).toISOString(),
      avatar: "/avatar-isabella.svg",
    },
    {
      id: "contact-10",
      title: "Gustavo Martins",
      lastMessage: "Vamos combinar uma hora para conversar",
      lastMessageTime: new Date(Date.now() - 36000000).toISOString(),
      avatar: "/avatar-gustavo.svg",
    },
  ];

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  
  const filteredConversations = conversations.filter(
    (chat) => chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed left-0 top-0 h-full w-[400px] flex flex-col bg-[#111b21] border-r border-[#313d45]">
      <div className="flex items-center justify-between px-4 py-4 bg-[#202c33]">
        <h1 className="text-[#e9edef] text-[19px] font-bold">WhatsApp</h1>
        <div className="flex items-center gap-5 text-[#aebac1]"><Users className="h-5 w-5" /><MessageCircle className="h-5 w-5" /><MoreVertical className="h-5 w-5" /></div>
      </div>
      <div className="px-3 py-3 bg-[#0b141a]">
        <div className="relative"><Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[#8696a0]" /><Input placeholder="Pesquisar..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-12 pr-4 py-2 bg-[#202c33] border-none rounded-lg h-9" /></div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-0">
          {filteredConversations.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-[#202c33] border-b border-[#313d45]/20 ${
                selectedChat === chat.id ? "bg-[#2a3942]" : ""
              }`}
            >
              <Avatar className="h-12 w-12">
                <AvatarImage src={chat.avatar} />
                <AvatarFallback className={chat.isBot ? "bg-[#00a884]" : "bg-[#6b7280]"}>
                  {chat.title.split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between">
                  <h3 className="font-normal text-[#e9edef] truncate text-[17px]">{chat.title}</h3>
                  <span className="text-xs text-[#8696a0]">{formatTime(chat.lastMessageTime)}</span>
                </div>
                <p className="text-sm text-[#8696a0] truncate">{chat.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}