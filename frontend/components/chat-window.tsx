// src/components/chat-window.tsx

"use client";

import React, { useState, useEffect, useRef, FormEvent } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MoreVertical, Phone, Send, Smile, Paperclip, Mic, Video, Search } from "lucide-react";

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
};

function getBackendBaseUrl() {
  const explicitBase = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_AGENT_API_URL;
  if (!explicitBase) {
    return "http://localhost:3001";
  }
  return explicitBase.replace(/\/api\/agent\/query$/, "").replace(/\/$/, "");
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

export function ChatWindow({ chatId }: { chatId: string }) {
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
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPin, setLoginPin] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // --- Initialize session ID on mount ---
  useEffect(() => {
    // Generate a UUID for this chat session
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
    setNeedsOnboarding(false);
    setOnboardingUrl('');
    setLoginEmail('');
    setLoginPin('');
    setLoginError('');
  }, [chatId]);
  
  // --- Refs para controlar os elementos da tela ---
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null); // Ref para a área de scroll

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

      let resolvedSessionId = storedSessionId || sessionId;

      if (!storedSessionId) {
        let browserId = localStorage.getItem("talk-to-stellar.browserId");
        if (!browserId) {
          browserId = generateBrowserId();
          localStorage.setItem("talk-to-stellar.browserId", browserId);
        }

        const checkResponse = await fetch(`${getBackendBaseUrl()}/api/external/check-account`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "web",
            provider_user_id: browserId,
          }),
        });

        const checkPayload = await checkResponse.json().catch(() => ({}));
        if (checkPayload?.exists && checkPayload?.sessionId) {
          resolvedSessionId = String(checkPayload.sessionId);
          localStorage.setItem("talk-to-stellar.sessionId", resolvedSessionId);
        } else if (checkPayload?.onboardingRequired && checkPayload?.creationUrl) {
          setNeedsOnboarding(true);
          setOnboardingUrl(String(checkPayload.creationUrl));
          setMessages((prev) => [
            ...prev,
            {
              id: `onboarding-${Date.now()}`,
              role: "assistant",
              content:
                `Para continuar, você precisa criar sua conta.\n` +
                `Abra este link: ${String(checkPayload.creationUrl)}\n\n` +
                `Se já tem conta, use a opção abaixo para entrar com e-mail + PIN.`,
              createdAt: new Date(),
            },
          ]);
          return;
        }
      }

      // Use the Next.js route handler which handles UUID generation and forwards to backend
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          session_id: resolvedSessionId,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Falha na resposta da API');
      }

      const data = await response.json();
      
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

  const handleLinkExisting = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      let browserId = localStorage.getItem("talk-to-stellar.browserId");
      if (!browserId) {
        browserId = generateBrowserId();
        localStorage.setItem("talk-to-stellar.browserId", browserId);
      }

      const response = await fetch(`${getBackendBaseUrl()}/api/external/link-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "web",
          provider_user_id: browserId,
          email: loginEmail,
          pin: loginPin,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Não foi possível entrar com e-mail e PIN.');
      }

      if (payload?.sessionId) {
        const linkedSessionId = String(payload.sessionId);
        localStorage.setItem("talk-to-stellar.sessionId", linkedSessionId);
        setSessionId(linkedSessionId);
      }

      setNeedsOnboarding(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `linked-${Date.now()}`,
          role: "assistant",
          content: "Conta vinculada com sucesso. Agora você pode continuar no chat.",
          createdAt: new Date(),
        },
      ]);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Falha ao vincular conta.');
    }
  };
  
  return (
    <div className="flex flex-col h-full bg-[#0b141a] relative">
       {/* Header (Fixo no topo) */}
       <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-[#202c33] border-l border-[#313d45]">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={selectedMeta.avatar} />
            <AvatarFallback className="bg-[#00a884] text-white">●</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-normal text-[#e9edef] text-[17px]">{selectedMeta.title}</h2>
            <p className="text-xs text-[#8696a0]">{isLoading ? "digitando..." : "online"}</p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-[#aebac1]"><Video className="h-5 w-5 cursor-pointer"/><Phone className="h-5 w-5 cursor-pointer"/><Search className="h-5 w-5 cursor-pointer"/><MoreVertical className="h-5 w-5 cursor-pointer"/></div>
      </div>

      <ScrollArea className="flex-1 min-h-0" style={{ backgroundImage: `url('/bg-chat-tile-light.png')`, backgroundRepeat: 'repeat' }}>
        {/* Adicionamos a ref diretamente ao Viewport da ScrollArea */}
        <div ref={scrollAreaViewportRef} className="h-full w-full overflow-y-auto">
          <div className="p-4 space-y-2">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[65%] rounded-lg px-3 py-2 text-[14.2px] shadow-md ${m.role === "user" ? "bg-[#005c4b] text-white" : "bg-[#202c33] text-white"}`}>
                  {renderMessageContent(m.content)}
                  <div className="text-right text-[11px] text-[#ffffff99] mt-1">{formatTime(m.createdAt)}</div>
                </div>
              </div>
            ))}
            {needsOnboarding && chatId === "agent" && (
              <div className="flex justify-start">
                <div className="max-w-[75%] rounded-lg px-3 py-3 text-[14.2px] shadow-md bg-[#202c33] text-white space-y-3">
                  {onboardingUrl && (
                    <a
                      href={onboardingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-400"
                    >
                      Criar conta agora
                    </a>
                  )}
                  <form onSubmit={handleLinkExisting} className="space-y-2">
                    <p className="text-sm text-slate-300">Já tenho conta</p>
                    <Input
                      value={loginEmail}
                      onChange={(event) => setLoginEmail(event.target.value)}
                      type="email"
                      placeholder="Seu e-mail"
                      className="bg-[#2a3942] border-none text-[#e9edef] placeholder:text-[#8696a0] h-9"
                    />
                    <Input
                      value={loginPin}
                      onChange={(event) => setLoginPin(event.target.value)}
                      type="password"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Seu PIN"
                      className="bg-[#2a3942] border-none text-[#e9edef] placeholder:text-[#8696a0] h-9"
                    />
                    {loginError && <p className="text-xs text-rose-300">{loginError}</p>}
                    <Button
                      type="submit"
                      className="h-9 rounded-lg bg-emerald-500 px-3 text-sm font-semibold text-white hover:bg-emerald-400"
                      disabled={!loginEmail.trim() || !loginPin.trim()}
                    >
                      Entrar com e-mail + PIN
                    </Button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Input de Mensagem (Fixo embaixo) */}
      <div className="flex-shrink-0 px-4 py-3 bg-[#202c33]">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Smile className="h-6 w-6 text-[#8696a0]" />
          <Paperclip className="h-6 w-6 text-[#8696a0]" />
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Digite uma mensagem"
            className="flex-1 bg-[#2a3942] border-none text-[#e9edef] placeholder:text-[#8696a0] rounded-lg h-10 px-4"
            disabled={isLoading}
          />
          {input.trim() ? (
            <Button type="submit" size="icon" className="bg-transparent hover:bg-transparent text-[#8696a0] rounded-full h-10 w-10" disabled={isLoading}>
              <Send className="h-6 w-6" />
            </Button>
          ) : (
            <Mic className="h-6 w-6 text-[#8696a0]" />
          )}
        </form>
      </div>
    </div>
  );
}
