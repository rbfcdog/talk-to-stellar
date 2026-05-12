// src/components/chat-window.tsx

"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, MoreVertical, Phone, Send, Smile, Paperclip, Mic, Video, Search, ExternalLink } from "lucide-react";
import { clearClientSession, isClientSessionExpired, redirectToExpiredLogin, touchClientSessionActivity } from "@/lib/session";
import { idempotentFetch } from "@/lib/idempotency";
import { Shimmer, TypingDots } from "@/components/ui/feedback";

type Message = {
  id: string;
  backendId?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
};

function getFriendlyLinkLabel(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/$/, "");
    if (path.endsWith("/confirm-payment")) return "Abrir confirmação de pagamento";
    if (path.endsWith("/confirm-conversion")) return "Abrir confirmação de conversão";
    if (path.endsWith("/create-account")) return "Criar ou entrar na conta";
    if (path.endsWith("/change-pin")) return "Redefinir PIN";
    if (path.endsWith("/pay-anyone")) return "Abrir link de pagamento";
    if (path.endsWith("/claim-payment")) return "Resgatar pagamento";
    if (url.hostname.includes("wa.me")) return "Compartilhar no WhatsApp";
    return "Abrir link";
  } catch {
    return "Abrir link";
  }
}

function getFriendlyLinkMeta(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return rawUrl.replace(/^https?:\/\//i, "").slice(0, 48);
  }
}

function decodeSvgDataUrl(dataUrl: string) {
  const base64 = dataUrl.replace(/^data:image\/svg\+xml;base64,/, "");
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

function generateBrowserId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function ChatWindow({ chatId, onBack }: { chatId: string; onBack?: () => void }) {
  const chatMeta: Record<string, { title: string; avatar: string; isBot?: boolean; starter: Message[] }> = {
    agent: {
      title: "TalkToStellar",
      avatar: "/talktostellar.png",
      isBot: true,
      starter: [
        { id: "agent-welcome", role: "assistant", content: "Olá! Vou carregar seu saldo e os principais comandos da sessão. Você também pode digitar \"ajuda\" a qualquer momento.", createdAt: new Date() },
      ],
    },
    "contact-1": {
      title: "Ana Silva",
      avatar: "/avatar-ana.svg",
      starter: [
        { id: "c1-a1", role: "assistant", content: "Oi! Quando quiser, já pode enviar para minha carteira.", createdAt: new Date() },
      ],
    },
    "contact-2": {
      title: "Carlos Souza",
      avatar: "/avatar-carlos.svg",
      starter: [
        { id: "c2-a1", role: "assistant", content: "Me manda o valor de hoje por aqui.", createdAt: new Date() },
      ],
    },
    "contact-3": { title: "Marina Costa", avatar: "/avatar-marina.svg", starter: [{ id: "c3-a1", role: "assistant", content: "Deixa esse contato fixo para pagamentos rápidos.", createdAt: new Date() }] },
    "contact-4": { title: "Fernando Oliveira", avatar: "/avatar-fernando.svg", starter: [{ id: "c4-a1", role: "assistant", content: "Cobrança principal continua por essa carteira.", createdAt: new Date() }] },
    "contact-5": { title: "Juliana Lima", avatar: "/avatar-juliana.svg", starter: [{ id: "c5-a1", role: "assistant", content: "Pode usar esse contato para pagamentos recorrentes.", createdAt: new Date() }] },
    "contact-6": { title: "Roberto Dias", avatar: "/avatar-roberto.svg", starter: [{ id: "c6-a1", role: "assistant", content: "Confirma saldo e envia para o meu endereço padrão.", createdAt: new Date() }] },
    "contact-7": { title: "Patricia Ferreira", avatar: "/avatar-patricia.svg", starter: [{ id: "c7-a1", role: "assistant", content: "Esse contato é para transferências internas.", createdAt: new Date() }] },
    "contact-8": { title: "Leonardo Santos", avatar: "/avatar-leonardo.svg", starter: [{ id: "c8-a1", role: "assistant", content: "Movimentações em XLM ficam por aqui.", createdAt: new Date() }] },
    "contact-9": { title: "Isabella Rodrigues", avatar: "/avatar-isabella.svg", starter: [{ id: "c9-a1", role: "assistant", content: "Esse é meu contato preferencial para receber.", createdAt: new Date() }] },
    "contact-10": { title: "Gustavo Martins", avatar: "/avatar-gustavo.svg", starter: [{ id: "c10-a1", role: "assistant", content: "Prioriza esse canal para transações urgentes.", createdAt: new Date() }] },
  };

  const selectedMeta = chatMeta[chatId] || chatMeta.agent;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');

  const generateSessionId = (): string => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
  
  // --- Initialize session ID on mount ---
  useEffect(() => {
    if (chatId === "agent" && isClientSessionExpired()) {
      redirectToExpiredLogin();
      return;
    }

    // Try to get from sessionStorage, or generate new
    const storedSessionId = typeof window !== 'undefined' 
      ? localStorage.getItem("talk-to-stellar.sessionId") || sessionStorage.getItem(`chat-session-${chatId}`)
      : null;
    
    const newSessionId = storedSessionId || generateSessionId();
    setSessionId(newSessionId);

    // Store it for subsequent messages
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`chat-session-${chatId}`, newSessionId);
      if (chatId === "agent") {
        touchClientSessionActivity();
      }
    }
  }, [chatId]);

  useEffect(() => {
    setMessages(selectedMeta.starter.map((message) => ({ ...message, createdAt: new Date() })));
  }, [chatId]);
  
  // --- Refs para controlar os elementos da tela ---
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null); // Ref para a área de scroll
  const pollInFlightRef = useRef(false);

  // --- CORREÇÃO DE AUTO-SCROLL (MAIS ROBUSTO) ---
  useEffect(() => {
    // Esta função rola a área de chat para o final.
    const scrollToBottom = () => {
      if (scrollAreaViewportRef.current) {
        scrollAreaViewportRef.current.scrollTop = scrollAreaViewportRef.current.scrollHeight;
      }
    };
    
    // Usamos um pequeno timeout para garantir que o React já renderizou a nova mensagem na tela
    // antes de tentarmos rolar. Isso resolve problemas de timing.
    const timer = setTimeout(scrollToBottom, 50);

    // Limpamos o timeout se o componente for desmontado para evitar erros.
    return () => clearTimeout(timer);
  }, [messages, isLoading]); // Roda sempre que as mensagens ou o estado de 'loading' mudam.

  const mergeServerMessages = (serverMessages: any[]) => {
    if (!Array.isArray(serverMessages) || serverMessages.length === 0) return;

    setMessages((prev) => {
      const backendIds = new Set(prev.map((message) => message.backendId).filter(Boolean));
      const contentKeys = new Set(prev.map((message) => `${message.role}:${message.content}`));
      const nextMessages = serverMessages
        .map((message) => ({
          id: `server-${message.id}`,
          backendId: String(message.id),
          role: message.role === "user" ? "user" : "assistant",
          content: String(message.content || ""),
          createdAt: message.created_at ? new Date(message.created_at) : new Date(),
        } as Message))
        .filter((message) => {
          if (!message.content) return false;
          if (backendIds.has(message.backendId)) return false;
          if (contentKeys.has(`${message.role}:${message.content}`)) return false;
          return true;
        });

      return nextMessages.length > 0 ? [...prev, ...nextMessages] : prev;
    });
  };

  const fetchServerMessages = async () => {
    if (chatId !== "agent" || !sessionId || pollInFlightRef.current) return;
    if (isClientSessionExpired()) {
      redirectToExpiredLogin();
      return;
    }

    const storedSessionId = typeof window !== "undefined"
      ? localStorage.getItem("talk-to-stellar.sessionId")
      : null;
    const resolvedSessionId = storedSessionId || sessionId;
    if (!resolvedSessionId) return;

    pollInFlightRef.current = true;
    try {
      const response = await fetch(`/api/chat?session_id=${encodeURIComponent(resolvedSessionId)}&limit=50`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      mergeServerMessages(data.messages || []);
    } catch (error) {
      console.error("Erro ao sincronizar mensagens:", error);
    } finally {
      pollInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (chatId !== "agent" || !sessionId) return;

    fetchServerMessages();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchServerMessages();
      }
    }, 4000);

    return () => window.clearInterval(interval);
  }, [chatId, sessionId]);

  const resetClientSession = () => {
    if (typeof window === "undefined") return;
    clearClientSession();
    const newSessionId = generateSessionId();
    sessionStorage.setItem(`chat-session-${chatId}`, newSessionId);
    setSessionId(newSessionId);
  };

  const isLogoutResponse = (message: string, action?: string | null) => {
    if (String(action || "").toLowerCase() === "logout_wallet") return true;
    const normalized = String(message || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return (
      normalized.includes("deslogado com sucesso") ||
      normalized.includes("sessao encerrada com sucesso") ||
      normalized.includes("voce saiu da wallet")
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    if (chatId === "agent" && isClientSessionExpired()) {
      redirectToExpiredLogin();
      return;
    }
    
    if (!sessionId) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Aguarde um momento enquanto iniciamos a sessão...',
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input,
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      if (chatId !== "agent") {
        const localReply: Message = {
          id: `contact-${Date.now()}`,
          role: "assistant",
          content: `${selectedMeta.title}: mensagem recebida. Vou considerar esse valor para a próxima transferência.`,
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, localReply]);
        return;
      }

      const storedSessionId = typeof window !== "undefined"
        ? localStorage.getItem("talk-to-stellar.sessionId")
        : null;
      const resolvedSessionId = storedSessionId || sessionId;
      let browserId = localStorage.getItem("talk-to-stellar.browserId");
      if (!browserId) {
        browserId = generateBrowserId();
        localStorage.setItem("talk-to-stellar.browserId", browserId);
      }

      // Use the Next.js route handler which handles UUID generation and forwards to backend
      const response = await idempotentFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          session_id: resolvedSessionId,
          source: "web",
          metadata: {
            browser_id: browserId,
          },
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Falha na resposta da API');
      }

      const data = await response.json();
      if (data.session_id && typeof window !== "undefined") {
        localStorage.setItem("talk-to-stellar.sessionId", data.session_id);
        sessionStorage.setItem(`chat-session-${chatId}`, data.session_id);
        setSessionId(data.session_id);
        touchClientSessionActivity();
      }
      
      // Handle error responses that still return 200
      if (data.error) {
        throw new Error(data.error);
      }
      
      const botResponse = data.content || data.message || 'Sem resposta recebida';
      
      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: botResponse,
        createdAt: new Date(),
      };

      setMessages(prev => {
        const alreadyRendered = prev.some((message) =>
          message.role === botMessage.role && message.content === botMessage.content
        );
        return alreadyRendered ? prev : [...prev, botMessage];
      });
      touchClientSessionActivity();

      if (isLogoutResponse(botResponse, data.action)) {
        try {
          await idempotentFetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: resolvedSessionId,
            }),
          });
        } catch {
          // ignore, client reset below is still required
        }
        resetClientSession();
      }

    } catch (error) {
      console.error("Erro no handleSubmit:", error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `Desculpe, ocorreu um erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // --- CORREÇÃO DE AUTO-FOCO ---
      // Garante que, após todo o processo, o cursor volte para a caixa de texto.
      inputRef.current?.focus(); 
    }
  };

  const formatTime = (timestamp?: Date) => {
    if (!timestamp) return "";
    return timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessageContent = (content: string) => {
    const receiptImageMatch = content.match(/RECEIPT_IMAGE_DATA_URL:(data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+)/);
    if (receiptImageMatch?.[1]) {
      const text = content.replace(/RECEIPT_IMAGE_DATA_URL:data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/, '').trim();
      const inlineSvg = decodeSvgDataUrl(receiptImageMatch[1]);
      return (
        <div className="space-y-2">
          {text && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</p>}
          {inlineSvg ? (
            <div
              aria-label="Comprovante financeiro"
              className="max-h-[520px] w-full max-w-[320px] overflow-hidden rounded-xl border border-white/10 bg-slate-950 shadow-lg [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: inlineSvg }}
            />
          ) : (
            <img
              src={receiptImageMatch[1]}
              alt="Comprovante financeiro"
              className="max-h-[520px] w-full max-w-[320px] rounded-xl border border-white/10 bg-slate-950 object-contain shadow-lg"
            />
          )}
        </div>
      );
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return (
      <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {parts.map((part, idx) => {
          if (/^https?:\/\/[^\s]+$/i.test(part)) {
            return (
              <a
                key={idx}
                href={part}
                target="_blank"
                rel="noopener noreferrer"
                className="my-2 flex max-w-[280px] items-center gap-3 rounded-lg border border-[#2a3942] bg-[#182229] px-3 py-2 text-[#e9edef] no-underline shadow-sm transition hover:bg-[#1f2c34]"
                title={part}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-[#06261d]">
                  <ExternalLink className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{getFriendlyLinkLabel(part)}</span>
                  <span className="block truncate text-xs text-[#8696a0]">{getFriendlyLinkMeta(part)}</span>
                </span>
              </a>
            );
          }
          return <React.Fragment key={idx}>{part}</React.Fragment>;
        })}
      </div>
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#0b141a]">
       <div className="flex-shrink-0 flex items-center justify-between gap-3 border-l border-[#313d45] bg-[#202c33] px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#aebac1] hover:bg-white/5 md:hidden"
            aria-label="Voltar para a lista de contatos"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar className="h-10 w-10">
            <AvatarImage src={selectedMeta.avatar} />
            <AvatarFallback className="bg-[#00a884] text-white">●</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="truncate text-[17px] font-normal text-[#e9edef]">{selectedMeta.title}</h2>
            <p className="text-xs text-[#8696a0]">
              {isLoading ? <TypingDots className="text-[#8ea4b1]" /> : "online"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[#aebac1] sm:gap-5">
          <Video className="h-5 w-5 cursor-pointer"/>
          <Phone className="h-5 w-5 cursor-pointer"/>
          <Search className="h-5 w-5 cursor-pointer"/>
          <MoreVertical className="h-5 w-5 cursor-pointer"/>
        </div>
      </div>

      <div
        ref={scrollAreaViewportRef}
        className="flex-1 min-h-0 overflow-y-auto"
        style={{ backgroundImage: `url('/bg-chat-tile-light.png')`, backgroundRepeat: "repeat" }}
      >
        <div className="space-y-2 p-3 sm:p-4">
          {messages.length === 0 && (
            <div className="space-y-3 py-2">
              <Shimmer className="h-16 w-[72%] rounded-2xl" />
              <Shimmer className="ml-auto h-14 w-[58%] rounded-2xl" />
            </div>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`min-w-0 max-w-[84%] overflow-hidden rounded-2xl px-3 py-2 text-[14.2px] shadow-md transition-transform duration-150 hover:-translate-y-0.5 sm:max-w-[65%] ${m.role === "user" ? "bg-[#005c4b] text-white" : "bg-[#202c33] text-white"}`}>
                  {renderMessageContent(m.content)}
                  <div className="mt-1 text-right text-[11px] text-[#ffffff99]">{formatTime(m.createdAt)}</div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex justify-start"
              >
                <div className="rounded-2xl bg-[#202c33] px-4 py-3 text-[#9cb4c1] shadow-md">
                  <TypingDots />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Input de Mensagem (Fixo embaixo) */}
      <div className="sticky bottom-0 z-10 flex-shrink-0 border-t border-[#313d45] bg-[#202c33] px-3 py-3 sm:px-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 sm:gap-3">
          <Smile className="hidden h-6 w-6 text-[#8696a0] sm:block" />
          <Paperclip className="hidden h-6 w-6 text-[#8696a0] sm:block" />
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite uma mensagem"
            className="h-11 flex-1 rounded-xl border-none bg-[#2a3942] px-4 text-[#e9edef] placeholder:text-[#8696a0] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
            disabled={isLoading}
          />
          {input.trim() ? (
            <Button type="submit" size="icon" className="h-10 w-10 rounded-full bg-transparent text-[#8696a0] hover:bg-transparent" disabled={isLoading}>
              <Send className="h-6 w-6" />
            </Button>
          ) : (
            <Mic className="h-6 w-6 shrink-0 text-[#8696a0]" />
          )}
        </form>
      </div>
    </div>
  );
}
