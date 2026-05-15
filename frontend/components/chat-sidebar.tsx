// src/components/chat-sidebar.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, MoreVertical, MessageCircle, Users, User } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface ChatSidebarProps {
  selectedChat: string | null;
  onSelectChat: (chatId: string | null) => void;
}

const STELLAR_PUBLIC_KEY_REGEX = /\bG[A-Z2-7]{55}\b/gi;

function sanitizeVisiblePreview(content: string, hiddenKeyLabel: string): string {
  return String(content || "")
    .replace(/\s+/g, " ")
    .replace(STELLAR_PUBLIC_KEY_REGEX, hiddenKeyLabel)
    .replace(/public_key\s*=\s*[^\s|]+/gi, `public_key=${hiddenKeyLabel}`);
}

export function ChatSidebar({ selectedChat, onSelectChat }: ChatSidebarProps) {
  const { language, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [agentPreview, setAgentPreview] = useState<{
    content: string;
    createdAt?: string;
  } | null>(null);
  const hiddenKeyLabel = language === "pt-BR" ? "[chave oculta]" : "[hidden key]";
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;

  const peopleFallbackColors = [
    "bg-rose-500",
    "bg-sky-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-cyan-500",
    "bg-lime-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-orange-500",
  ];

  const baseConversations = useMemo(() => [
    {
      id: "agent",
      title: "TalkToStellar",
      lastMessage: t("chat_sidebar_preview"),
      lastMessageTime: new Date().toISOString(),
      avatar: "/talktostellar.png",
      isBot: true,
    },
    {
      id: "contact-1",
      title: "Ana Silva",
      lastMessage: L("Recebido. Você já pode me pagar pela carteira.", "Received. You can pay me through the wallet now."),
      lastMessageTime: new Date(Date.now() - 3600000).toISOString(),
      avatar: "/avatar-ana.svg",
    },
    {
      id: "contact-2",
      title: "Carlos Souza",
      lastMessage: L("Envie o valor de hoje para a carteira.", "Send me today's amount to the wallet."),
      lastMessageTime: new Date(Date.now() - 7200000).toISOString(),
      avatar: "/avatar-carlos.svg",
    },
    {
      id: "contact-3",
      title: "Marina Costa",
      lastMessage: L("Fixe este contato para transferências rápidas.", "Pin this contact for quick transfers."),
      lastMessageTime: new Date(Date.now() - 10800000).toISOString(),
      avatar: "/avatar-marina.svg",
    },
    {
      id: "contact-4",
      title: "Fernando Oliveira",
      lastMessage: L("Pagamento agendado para a carteira principal.", "Payment scheduled for the main wallet."),
      lastMessageTime: new Date(Date.now() - 14400000).toISOString(),
      avatar: "/avatar-fernando.svg",
    },
    {
      id: "contact-5",
      title: "Juliana Lima",
      lastMessage: L("Guarde este contato para pagamentos recorrentes.", "Keep this contact for recurring payments."),
      lastMessageTime: new Date(Date.now() - 18000000).toISOString(),
      avatar: "/avatar-juliana.svg",
    },
    {
      id: "contact-6",
      title: "Roberto Dias",
      lastMessage: L("Confirmo saldo e endereço antes do envio.", "I confirm balance and wallet address before sending."),
      lastMessageTime: new Date(Date.now() - 21600000).toISOString(),
      avatar: "/avatar-roberto.svg",
    },
    {
      id: "contact-7",
      title: "Patricia Ferreira",
      lastMessage: L("Use para retiradas e transferências internas.", "Use for withdrawals and internal transfers."),
      lastMessageTime: new Date(Date.now() - 25200000).toISOString(),
      avatar: "/avatar-patricia.svg",
    },
    {
      id: "contact-8",
      title: "Leonardo Santos",
      lastMessage: L("Contato de suporte para movimentos em XLM.", "Support contact for XLM movements."),
      lastMessageTime: new Date(Date.now() - 28800000).toISOString(),
      avatar: "/avatar-leonardo.svg",
    },
    {
      id: "contact-9",
      title: "Isabella Rodrigues",
      lastMessage: L("Contato preferencial para receber pagamentos.", "Preferred contact for receiving payments."),
      lastMessageTime: new Date(Date.now() - 32400000).toISOString(),
      avatar: "/avatar-isabella.svg",
    },
    {
      id: "contact-10",
      title: "Gustavo Martins",
      lastMessage: L("Contato rápido para transações prioritárias.", "Quick contact for priority transactions."),
      lastMessageTime: new Date(Date.now() - 36000000).toISOString(),
      avatar: "/avatar-gustavo.svg",
    },
  ], [language, t]);

  useEffect(() => {
    let cancelled = false;

    const loadLastAgentMessage = async () => {
      const sessionId = typeof window !== "undefined"
        ? localStorage.getItem("talk-to-stellar.sessionId")
        : null;
      if (!sessionId) return;

      try {
        const response = await fetch(`/api/chat?session_id=${encodeURIComponent(sessionId)}&limit=1`, {
          method: "GET",
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        const message = Array.isArray(payload?.messages) ? payload.messages[0] : null;
        if (!message) return;

        const role = String(message.role || "").toLowerCase();
        const content = sanitizeVisiblePreview(String(message.content || "").trim(), hiddenKeyLabel);
        if (!content || role !== "assistant") return;

        if (!cancelled) {
          setAgentPreview({
            content,
            createdAt: String(message.created_at || ""),
          });
        }
      } catch {
        // keep current preview if polling fails
      }
    };

    loadLastAgentMessage();
    const interval = window.setInterval(loadLastAgentMessage, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [hiddenKeyLabel]);

  const conversations = useMemo(() => {
    return baseConversations.map((chat) => {
      if (chat.id !== "agent" || !agentPreview?.content) return chat;
      return {
        ...chat,
        lastMessage: agentPreview.content,
        lastMessageTime: agentPreview.createdAt || chat.lastMessageTime,
      };
    });
  }, [agentPreview, baseConversations]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(language === "en" ? "en-US" : "pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  
  const filteredConversations = conversations.filter(
    (chat) => chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-[#313d45] bg-[#111b21]">
      <div className="flex items-center justify-between gap-3 bg-[#202c33] px-4 py-4">
        <h1 className="min-w-0 flex-1 truncate text-[19px] font-bold text-[#e9edef]">TalkToStellar</h1>
        <div className="flex shrink-0 items-center gap-4 text-[#aebac1]">
          <Users className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <MoreVertical className="h-5 w-5" />
        </div>
      </div>
      <div className="bg-[#0b141a] px-3 py-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8696a0]" />
          <Input
            placeholder={t("chat_search_placeholder")}
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
              onClick={() => {
                if (chat.isBot) onSelectChat(chat.id);
              }}
              className={`flex items-center gap-3 border-b border-[#313d45]/20 px-3 py-3 ${
                chat.isBot ? "cursor-pointer hover:bg-[#202c33]" : "cursor-default opacity-90"
              } ${
                selectedChat === chat.id ? "bg-[#2a3942]" : ""
              }`}
            >
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={chat.avatar} />
                <AvatarFallback className={chat.isBot ? "bg-[#00a884] text-white" : `${peopleFallbackColors[Math.max(0, Number(String(chat.id).replace(/\D/g, "")) - 1) % peopleFallbackColors.length]} text-white flex items-center justify-center`}>
                  {chat.isBot ? (
                    <span className="text-xl">T</span>
                  ) : (
                    <User className="h-6 w-6" />
                  )}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[17px] font-normal text-[#e9edef]">{chat.title}</h3>
                  <span className="shrink-0 text-xs text-[#8696a0]">{formatTime(chat.lastMessageTime)}</span>
                </div>
                <p className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap break-normal text-sm text-[#8696a0]">{chat.lastMessage}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
