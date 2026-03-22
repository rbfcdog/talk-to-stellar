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

export function ChatWindow({ chatId }: { chatId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          session_id: `web-${chatId}`,
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Falha na resposta da API');
      }

      const data = await response.json();
      
      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: data.content || 'No response content returned by the agent.',
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, botMessage]);

    } catch (error) {
      console.error("Erro no handleSubmit:", error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro ao buscar a resposta.',
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
  
  return (
    <div className="flex flex-col h-full bg-[#0b141a] relative">
       {/* Header (Fixo no topo) */}
       <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-[#202c33] border-l border-[#313d45]">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10"><AvatarImage src="/stellar-logo.png" /><AvatarFallback className="bg-[#00a884] text-white">SA</AvatarFallback></Avatar>
          <div>
            <h2 className="font-normal text-[#e9edef] text-[17px]">TalkToStellar</h2>
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
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  <div className="text-right text-[11px] text-[#ffffff99] mt-1">{formatTime(m.createdAt)}</div>
                </div>
              </div>
            ))}
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