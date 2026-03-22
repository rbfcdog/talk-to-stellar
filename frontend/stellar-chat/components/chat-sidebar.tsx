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
      id: "intro",
      title: "O que é TalkToStellar?",
      lastMessage: "Um assistente de IA conversacional para gerenciar sua conta blockchain Stellar",
      lastMessageTime: new Date().toISOString(),
      avatar: "/stellar-logo.png",
      isBot: true,
    },
    {
      id: "features-1",
      title: "Gerenciamento de Contatos",
      lastMessage: "Adicione, liste e procure seus contatos na rede Stellar de forma simples",
      lastMessageTime: new Date(Date.now() - 3600000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "features-2",
      title: "Pagamentos Seguros",
      lastMessage: "Envie pagamentos com criptografias e confirme com sua chave secreta",
      lastMessageTime: new Date(Date.now() - 7200000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "features-3",
      title: "Saldo e Histórico",
      lastMessage: "Verifique seu saldo de conta e histórico completo de operações",
      lastMessageTime: new Date(Date.now() - 10800000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "features-4",
      title: "Pagamentos Cruzados",
      lastMessage: "Realize pagamentos em múltiplos ativos com conversão automática de caminho",
      lastMessageTime: new Date(Date.now() - 14400000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "features-5",
      title: "Integração PIX",
      lastMessage: "Deposite fundos via PIX, o sistema de pagamentos instantâneos brasileiro",
      lastMessageTime: new Date(Date.now() - 18000000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "how-to-1",
      title: "Como Começar",
      lastMessage: "Digite uma mensagem para iniciar! O assistente responderá em português",
      lastMessageTime: new Date(Date.now() - 21600000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "how-to-2",
      title: "Comandos Naturais",
      lastMessage: "Use linguagem natural: 'qual é meu saldo?', 'enviar 100 USDC para...'",
      lastMessageTime: new Date(Date.now() - 25200000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "security",
      title: "Segurança",
      lastMessage: "Suas chaves secretas são sempre protegidas. Você controla cada transação",
      lastMessageTime: new Date(Date.now() - 28800000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "stellar-network",
      title: "Rede Stellar",
      lastMessage: "Construído na rede Stellar, protocolo aberto de pagamentos descentralizado",
      lastMessageTime: new Date(Date.now() - 32400000).toISOString(),
      avatar: "/stellar-logo.png",
    },
    {
      id: "support",
      title: "Suporte e Ajuda",
      lastMessage: "Pergunte sobre qualquer funcionalidade ou operação que deseje realizar",
      lastMessageTime: new Date(Date.now() - 36000000).toISOString(),
      avatar: "/stellar-logo.png",
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
        <h1 className="text-[#e9edef] text-[19px] font-bold">StellarWhatsApp</h1>
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