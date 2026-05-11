// src/components/chat-sidebar.tsx

"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MoreVertical, MessageCircle, Users, User } from "lucide-react";

interface ChatSidebarProps {
  selectedChat: string | null;
  onSelectChat: (chatId: string | null) => void;
}

export function ChatSidebar({ selectedChat, onSelectChat }: ChatSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const conversations = [
    {
      id: "agent",
      title: "TalkToStellar",
      lastMessage: "Olá! Como posso ajudar com sua carteira, saldo e contatos hoje?",
      lastMessageTime: new Date().toISOString(),
      avatar: "/talktostellar.png",
      isBot: true,
    },
    {
      id: "contact-1",
      title: "Ana Silva",
      lastMessage: "Recebido. Pode me pagar pela carteira agora.",
      lastMessageTime: new Date(Date.now() - 3600000).toISOString(),
      avatar: "/avatar-ana.svg",
    },
    {
      id: "contact-2",
      title: "Carlos Souza",
      lastMessage: "Me envia o valor para a carteira de hoje.",
      lastMessageTime: new Date(Date.now() - 7200000).toISOString(),
      avatar: "/avatar-carlos.svg",
    },
    {
      id: "contact-3",
      title: "Marina Costa",
      lastMessage: "Deixe este contato fixo para transferências rápidas.",
      lastMessageTime: new Date(Date.now() - 10800000).toISOString(),
      avatar: "/avatar-marina.svg",
    },
    {
      id: "contact-4",
      title: "Fernando Oliveira",
      lastMessage: "Cobrança agendada para a carteira principal.",
      lastMessageTime: new Date(Date.now() - 14400000).toISOString(),
      avatar: "/avatar-fernando.svg",
    },
    {
      id: "contact-5",
      title: "Juliana Lima",
      lastMessage: "Separar este contato para pagamentos recorrentes.",
      lastMessageTime: new Date(Date.now() - 18000000).toISOString(),
      avatar: "/avatar-juliana.svg",
    },
    {
      id: "contact-6",
      title: "Roberto Dias",
      lastMessage: "Confirmo saldo e endereço da carteira antes do envio.",
      lastMessageTime: new Date(Date.now() - 21600000).toISOString(),
      avatar: "/avatar-roberto.svg",
    },
    {
      id: "contact-7",
      title: "Patricia Ferreira",
      lastMessage: "Usar para saques e transferências internas.",
      lastMessageTime: new Date(Date.now() - 25200000).toISOString(),
      avatar: "/avatar-patricia.svg",
    },
    {
      id: "contact-8",
      title: "Leonardo Santos",
      lastMessage: "Contato de apoio para movimentações em XLM.",
      lastMessageTime: new Date(Date.now() - 28800000).toISOString(),
      avatar: "/avatar-leonardo.svg",
    },
    {
      id: "contact-9",
      title: "Isabella Rodrigues",
      lastMessage: "Contato preferencial para receber pagamentos.",
      lastMessageTime: new Date(Date.now() - 32400000).toISOString(),
      avatar: "/avatar-isabella.svg",
    },
    {
      id: "contact-10",
      title: "Gustavo Martins",
      lastMessage: "Contato rápido para transações prioritárias.",
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
    <div className="flex h-full min-h-0 w-full flex-col border-r border-[#313d45] bg-[#111b21]">
      <div className="flex items-center justify-between gap-3 bg-[#202c33] px-4 py-4">
        <h1 className="text-[19px] font-bold text-[#e9edef]">WhatsDap</h1>
        <div className="flex items-center gap-4 text-[#aebac1]">
          <Users className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <MoreVertical className="h-5 w-5" />
        </div>
      </div>
      <div className="bg-[#0b141a] px-3 py-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
          <Input
            placeholder="Pesquisar contatos da carteira..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 rounded-lg border-none bg-[#202c33] pl-12 pr-4 text-sm text-[#e9edef] placeholder:text-[#8696a0]"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-0">
          {filteredConversations.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              className={`flex cursor-pointer items-center gap-3 border-b border-[#313d45]/20 px-3 py-3 hover:bg-[#202c33] ${
                selectedChat === chat.id ? "bg-[#2a3942]" : ""
              }`}
            >
              <Avatar className="h-12 w-12 shrink-0">
                {chat.isBot && <AvatarImage src={chat.avatar} />}
                <AvatarFallback className={chat.isBot ? "bg-[#00a884] text-white" : "bg-[#6b7280] text-white flex items-center justify-center"}>
                  {chat.isBot ? (
                    <span className="text-xl">T</span>
                  ) : (
                    <User className="h-6 w-6" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="truncate text-[17px] font-normal text-[#e9edef]">{chat.title}</h3>
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
