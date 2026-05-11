// src/components/chat-window.tsx

"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, MoreVertical, Phone, Send, Smile, Paperclip, Mic, Video, Search } from "lucide-react";

type Message = {
  id: string;
  backendId?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
};

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
        { id: "agent-welcome", role: "assistant", content: "Olá! Posso ajudar com saldo, envio e contatos da sua carteira.", createdAt: new Date() },
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
    // Try to get from sessionStorage, or generate new
    const storedSessionId = typeof window !== 'undefined' 
      ? sessionStorage.getItem(`chat-session-${chatId}`)
      : null;
    
    const newSessionId = storedSessionId || generateSessionId();
    setSessionId(newSessionId);

    // Store it for subsequent messages
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`chat-session-${chatId}`, newSessionId);
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
    localStorage.removeItem("talk-to-stellar.sessionId");
    localStorage.removeItem("talk-to-stellar.sessionToken");
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
      const response = await fetch('/api/chat', {
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

      setMessages(prev => [...prev, botMessage]);

      if (isLogoutResponse(botResponse, data.action)) {
        try {
          await fetch('/api/logout', {
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
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return (
      <p className="whitespace-pre-wrap">
        {parts.map((part, idx) => {
          if (/^https?:\/\/[^\s]+$/i.test(part)) {
            return (
              <a key={idx} href={part} target="_blank" rel="noopener noreferrer" className="underline text-cyan-300 break-all">
                {part}
              </a>
            );
          }
          return <React.Fragment key={idx}>{part}</React.Fragment>;
        })}
      </p>
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
            <p className="text-xs text-[#8696a0]">{isLoading ? "digitando..." : "online"}</p>
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
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[84%] rounded-lg px-3 py-2 text-[14.2px] shadow-md sm:max-w-[65%] ${m.role === "user" ? "bg-[#005c4b] text-white" : "bg-[#202c33] text-white"}`}>
                {renderMessageContent(m.content)}
                <div className="text-right text-[11px] text-[#ffffff99] mt-1">{formatTime(m.createdAt)}</div>
              </div>
            </div>
          ))}
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
            className="h-11 flex-1 rounded-lg border-none bg-[#2a3942] px-4 text-[#e9edef] placeholder:text-[#8696a0]"
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
