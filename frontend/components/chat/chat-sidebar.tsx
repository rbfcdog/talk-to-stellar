"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/shared/logo";

interface ChatSidebarProps {
  selectedChat: string | null;
  onSelectChat: (chatId: string | null) => void;
}

const STELLAR_PUBLIC_KEY_REGEX = /\bG[A-Z2-7]{55}\b/gi;

function sanitizeVisiblePreview(content: string, hiddenKeyLabel: string): string {
  return String(content || "")
    .replace(/\s+/g, " ")
    .replace(STELLAR_PUBLIC_KEY_REGEX, hiddenKeyLabel)
    .replace(/public_key\s*=\s*[^\s|]+/gi, `public_key=${hiddenKeyLabel}`)
    .replace(/stellar:mainnet/gi, "global account")
    .replace(/\bUSDC\b/g, "USD");
}

export function ChatSidebar({ selectedChat, onSelectChat }: ChatSidebarProps) {
  const { language, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [agentPreview, setAgentPreview] = useState<{
    content: string;
    createdAt?: string;
  } | null>(null);
  const hiddenKeyLabel = language === "pt-BR" ? "[chave oculta]" : "[hidden key]";
  const L = (pt: string, en: string) => (language === "pt-BR" ? pt : en);

  const baseConversations = useMemo(
    () => [
      {
        id: "agent",
        title: "TalkToStellar",
        lastMessage: t("chat_sidebar_preview"),
        lastMessageTime: new Date().toISOString(),
        isBot: true,
      },
      {
        id: "contact-1",
        title: "Ana Silva",
        lastMessage: L(
          "Recebido. Você já pode me pagar pela conta.",
          "Received. You can pay me through the account now.",
        ),
        lastMessageTime: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "contact-2",
        title: "Carlos Souza",
        lastMessage: L(
          "Envie o valor de hoje para a conta.",
          "Send me today's amount to the account.",
        ),
        lastMessageTime: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: "contact-3",
        title: "Marina Costa",
        lastMessage: L(
          "Fixe este contato para transferências rápidas.",
          "Pin this contact for quick transfers.",
        ),
        lastMessageTime: new Date(Date.now() - 10800000).toISOString(),
      },
      {
        id: "contact-4",
        title: "Fernando Oliveira",
        lastMessage: L(
          "Pagamento agendado para a conta principal.",
          "Payment scheduled for the main account.",
        ),
        lastMessageTime: new Date(Date.now() - 14400000).toISOString(),
      },
      {
        id: "contact-5",
        title: "Juliana Lima",
        lastMessage: L(
          "Guarde este contato para pagamentos recorrentes.",
          "Keep this contact for recurring payments.",
        ),
        lastMessageTime: new Date(Date.now() - 18000000).toISOString(),
      },
    ],
    [language, t],
  );

  useEffect(() => {
    let cancelled = false;

    const loadLastAgentMessage = async () => {
      const sessionPayload = await fetch("/api/session", { cache: "no-store" })
        .then((response) => response.json())
        .catch(() => ({}));
      const sessionId = String(sessionPayload?.session_id || "").trim();
      if (!sessionId) return;

      try {
        const response = await fetch(
          `/api/chat?session_id=${encodeURIComponent(sessionId)}&limit=1`,
          { method: "GET", cache: "no-store" },
        );
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        const message = Array.isArray(payload?.messages) ? payload.messages[0] : null;
        if (!message) return;

        const role = String(message.role || "").toLowerCase();
        const content = sanitizeVisiblePreview(
          String(message.content || "").trim(),
          hiddenKeyLabel,
        );
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
    return date.toLocaleTimeString(language === "en" ? "en-US" : "pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredConversations = conversations.filter((chat) =>
    chat.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col border-r border-tts-border bg-tts-surface/95 shadow-sm backdrop-blur">
      <header className="flex items-center gap-2 border-b border-tts-border px-4 py-3 text-tts-deep">
        <Logo size={20} />
        <span className="text-sm font-bold tracking-tight">
          TalkToStellar
        </span>
      </header>

      <div className="border-b border-tts-border bg-tts-bg/60 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tts-muted">
          {L("Saldo disponível", "Available balance")}
        </p>
        <p className="mt-1 flex items-baseline gap-1.5 font-mono-financial">
          <span className="text-xl font-bold text-tts-deep">184.27</span>
          <span className="text-sm font-bold text-tts-gold">USD</span>
        </p>
        <p className="mt-1 font-mono text-[10px] tracking-tight text-tts-muted">
          {L("Conta global", "Global account")}
        </p>
      </div>

      <div className="border-b border-tts-border px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tts-muted" />
          <Input
            placeholder={t("chat_search_placeholder")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <ul className="flex flex-col gap-1 px-2 py-2">
          {filteredConversations.map((chat) => {
            const isActive = selectedChat === chat.id;
            const isInteractive = chat.isBot;
            return (
              <li key={chat.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (isInteractive) onSelectChat(chat.id);
                  }}
                  disabled={!isInteractive}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                    isActive
                      ? "border-tts-gold-br bg-tts-gold-bg font-medium text-tts-deep"
                      : isInteractive
                        ? "border-transparent text-tts-muted hover:border-tts-border hover:bg-tts-bg hover:text-tts-deep"
                        : "cursor-default border-transparent text-tts-muted/70",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {chat.title}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-tts-muted">
                      {formatTime(chat.lastMessageTime)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-tts-muted">
                    {chat.lastMessage}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      <a
        href="#"
        className="border-t border-tts-border px-4 py-3 text-[11px] text-tts-muted transition-colors hover:text-tts-deep"
      >
        {L("Ver histórico completo →", "View full history →")}
      </a>
    </div>
  );
}
