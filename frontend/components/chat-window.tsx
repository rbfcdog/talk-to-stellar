// src/components/chat-window.tsx

"use client";

import React, { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, MoreVertical, Phone, Send, Smile, Paperclip, Mic, Video, Search, ExternalLink } from "lucide-react";
import { clearClientSession, isClientSessionExpired, redirectToExpiredLogin, touchClientSessionActivity } from "@/lib/session";
import { idempotentFetch } from "@/lib/idempotency";
import { consumeWebChatFeedback, WEB_CHAT_FEEDBACK_CHANNEL, WEB_CHAT_FEEDBACK_EVENT, type WebChatFeedback } from "@/lib/web-feedback";
import { Shimmer, TypingDots } from "@/components/ui/feedback";
import { useLanguage } from "@/lib/i18n";

type Message = {
  id: string;
  backendId?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
};

const SERVER_MESSAGE_SYNC_INTERVAL_MS = 1500;
const STELLAR_PUBLIC_KEY_REGEX = /\bG[A-Z2-7]{55}\b/gi;

function sanitizeVisibleChatText(content: string): string {
  return String(content || "")
    .replace(STELLAR_PUBLIC_KEY_REGEX, "[chave oculta]")
    .replace(/public_key\s*=\s*[^\s|]+/gi, "public_key=[oculto]");
}

function normalizeMessageContentForDedupe(content: string): string {
  return String(content || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[-.,;:!?()[\]{}'"`´]/g, "")
    .trim()
    .toLowerCase();
}

function extractMessageUrls(content: string): string[] {
  return Array.from(String(content || "").matchAll(/https?:\/\/[^\s)]+/gi))
    .map((match) => match[0].replace(/[.,;]+$/, ""));
}

function isLoginStatusDuplicate(a: string, b: string): boolean {
  const left = normalizeMessageContentForDedupe(a);
  const right = normalizeMessageContentForDedupe(b);
  const hasLoginStatus = (value: string) => (
    value.includes("login concluido") ||
    value.includes("entrada concluida") ||
    value.includes("sign in completed") ||
    value.includes("signin completed") ||
    value.includes("login complete")
  );
  const hasConnectedStatus = (value: string) => (
    value.includes("conta conectada") ||
    value.includes("sua conta esta conectada") ||
    value.includes("connected account") ||
    value.includes("account is connected") ||
    value.includes("your account is connected")
  );
  return hasLoginStatus(left) && hasLoginStatus(right) && hasConnectedStatus(left) && hasConnectedStatus(right);
}

function isDuplicateChatMessage(a: Pick<Message, "role" | "content">, b: Pick<Message, "role" | "content">): boolean {
  if (a.role !== b.role) return false;

  const left = normalizeMessageContentForDedupe(a.content);
  const right = normalizeMessageContentForDedupe(b.content);
  if (!left || !right) return false;
  if (left === right) return true;

  const leftUrls = extractMessageUrls(a.content);
  const rightUrls = new Set(extractMessageUrls(b.content));
  if (leftUrls.some((url) => rightUrls.has(url))) return true;

  return isLoginStatusDuplicate(a.content, b.content);
}

function getStoredChatSessionId(chatId: string): string {
  if (typeof window === "undefined") return "";
  return (
    localStorage.getItem("talk-to-stellar.sessionId") ||
    sessionStorage.getItem(`chat-session-${chatId}`) ||
    ""
  );
}

function getFriendlyLinkLabel(rawUrl: string, t: (key: string) => string) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/$/, "");
    if (path.endsWith("/confirm-payment")) return t("chat_link_payment");
    if (path.endsWith("/confirm-conversion")) return t("chat_link_conversion");
    if (path.endsWith("/create-account")) return t("chat_link_account");
    if (path.endsWith("/change-pin")) return t("chat_link_pin");
    if (path.endsWith("/pay-anyone")) return t("chat_link_pay_anyone");
    if (path.endsWith("/claim-payment")) return t("chat_link_claim");
    if (path.endsWith("/pix-ramp") || path.endsWith("/pix-on") || path.endsWith("/pix-off")) return t("chat_link_pix");
    if (url.hostname.includes("wa.me")) return t("chat_link_whatsapp");
    return t("chat_link_generic");
  } catch {
    return t("chat_link_generic");
  }
}

function getFriendlyLinkMeta(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.toString();
  } catch {
    return rawUrl;
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

function getOrCreateBrowserId(): string {
  if (typeof window === "undefined") return "";
  let browserId = localStorage.getItem("talk-to-stellar.browserId");
  if (!browserId) {
    browserId = generateBrowserId();
    localStorage.setItem("talk-to-stellar.browserId", browserId);
  }
  return browserId;
}

export function ChatWindow({ chatId, onBack }: { chatId: string; onBack?: () => void }) {
  const { language, t } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const chatMeta: Record<string, { title: string; avatar: string; isBot?: boolean; starter: Message[] }> = {
    agent: {
      title: "TalkToStellar",
      avatar: "/talktostellar.png",
      isBot: true,
      starter: [
        { id: "agent-welcome", role: "assistant", content: t("chat_agent_welcome"), createdAt: new Date() },
      ],
    },
    "contact-1": {
      title: "Ana Silva",
      avatar: "/avatar-ana.svg",
      starter: [
        { id: "c1-a1", role: "assistant", content: L("Oi! Quando quiser, já pode enviar para minha conta.", "Hi. You can send to my account whenever you want."), createdAt: new Date() },
      ],
    },
    "contact-2": {
      title: "Carlos Souza",
      avatar: "/avatar-carlos.svg",
      starter: [
        { id: "c2-a1", role: "assistant", content: L("Me manda o valor de hoje por aqui.", "Send me today's amount here."), createdAt: new Date() },
      ],
    },
    "contact-3": { title: "Marina Costa", avatar: "/avatar-marina.svg", starter: [{ id: "c3-a1", role: "assistant", content: L("Deixa esse contato fixo para pagamentos rápidos.", "Keep this contact pinned for quick payments."), createdAt: new Date() }] },
    "contact-4": { title: "Fernando Oliveira", avatar: "/avatar-fernando.svg", starter: [{ id: "c4-a1", role: "assistant", content: L("Cobrança principal continua por essa conta.", "The main charge still goes through this account."), createdAt: new Date() }] },
    "contact-5": { title: "Juliana Lima", avatar: "/avatar-juliana.svg", starter: [{ id: "c5-a1", role: "assistant", content: L("Pode usar esse contato para pagamentos recorrentes.", "You can use this contact for recurring payments."), createdAt: new Date() }] },
    "contact-6": { title: "Roberto Dias", avatar: "/avatar-roberto.svg", starter: [{ id: "c6-a1", role: "assistant", content: L("Confirma saldo e envia para o meu endereço padrão.", "Check your balance and send to my default address."), createdAt: new Date() }] },
    "contact-7": { title: "Patricia Ferreira", avatar: "/avatar-patricia.svg", starter: [{ id: "c7-a1", role: "assistant", content: L("Esse contato é para transferências internas.", "This contact is for internal transfers."), createdAt: new Date() }] },
    "contact-8": { title: "Leonardo Santos", avatar: "/avatar-leonardo.svg", starter: [{ id: "c8-a1", role: "assistant", content: L("Movimentações em US$ ficam por aqui.", "US$ movements stay here."), createdAt: new Date() }] },
    "contact-9": { title: "Isabella Rodrigues", avatar: "/avatar-isabella.svg", starter: [{ id: "c9-a1", role: "assistant", content: L("Esse é meu contato preferencial para receber.", "This is my preferred receiving contact."), createdAt: new Date() }] },
    "contact-10": { title: "Gustavo Martins", avatar: "/avatar-gustavo.svg", starter: [{ id: "c10-a1", role: "assistant", content: L("Prioriza esse canal para transações urgentes.", "Prioritize this channel for urgent transactions."), createdAt: new Date() }] },
  };

  const selectedMeta = chatMeta[chatId] || chatMeta.agent;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const previousChatIdRef = useRef(chatId);

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
  }, [chatId, t]);

  useEffect(() => {
    const starterIds = new Set(Object.values(chatMeta).flatMap((meta) => meta.starter.map((message) => message.id)));
    const localizedStarter = selectedMeta.starter.map((message) => ({ ...message, createdAt: new Date() }));
    setMessages((prev) => {
      const chatChanged = previousChatIdRef.current !== chatId;
      previousChatIdRef.current = chatId;
      if (chatChanged) return localizedStarter;
      const hasConversationMessages = prev.some((message) => !starterIds.has(message.id));
      return hasConversationMessages ? prev : localizedStarter;
    });
  }, [chatId, language]);

  const appendWebFeedback = (items: WebChatFeedback[]) => {
    if (!Array.isArray(items) || items.length === 0) return;
    setMessages((prev) => {
      const existingIds = new Set(prev.map((message) => message.id));
      const merged = [...prev];
      const next = items
        .map((item) => ({
          id: `web-feedback-${item.id}`,
          role: "assistant" as const,
          content: item.content,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
        }))
        .filter((message) => {
          if (!message.content.trim()) return false;
          if (existingIds.has(message.id)) return false;
          if (merged.some((existing) => isDuplicateChatMessage(existing, message))) return false;
          existingIds.add(message.id);
          merged.push(message);
          return true;
        });

      return next.length ? merged : prev;
    });
  };

  const consumeQueuedWebFeedback = () => {
    appendWebFeedback(consumeWebChatFeedback());
  };

  useEffect(() => {
    if (chatId !== "agent" || typeof window === "undefined") return;
    consumeQueuedWebFeedback();

    const onFeedback = (event: Event) => {
      const detail = (event as CustomEvent<WebChatFeedback>).detail;
      if (detail?.content) appendWebFeedback([detail]);
      consumeQueuedWebFeedback();
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "talk-to-stellar.webChatFeedbackQueue") {
        consumeQueuedWebFeedback();
      }
    };
    const onFocus = () => consumeQueuedWebFeedback();

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(WEB_CHAT_FEEDBACK_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data?.content) appendWebFeedback([event.data]);
        consumeQueuedWebFeedback();
      };
    } catch {}

    window.addEventListener(WEB_CHAT_FEEDBACK_EVENT, onFeedback);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener(WEB_CHAT_FEEDBACK_EVENT, onFeedback);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      try {
        channel?.close();
      } catch {}
    };
  }, [chatId]);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollAreaViewportRef = useRef<HTMLDivElement>(null);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollAreaViewportRef.current) {
        scrollAreaViewportRef.current.scrollTop = scrollAreaViewportRef.current.scrollHeight;
      }
    };
    
    const timer = setTimeout(scrollToBottom, 50);

    return () => clearTimeout(timer);
  }, [messages, isLoading]);

  const mergeServerMessages = useCallback((serverMessages: any[]) => {
    if (!Array.isArray(serverMessages) || serverMessages.length === 0) return;

    setMessages((prev) => {
      const backendIds = new Set(prev.map((message) => message.backendId).filter(Boolean));
      const merged = [...prev.filter((message) => message.id !== "agent-welcome")];
      let changed = false;
      const incomingMessages = serverMessages
        .map((message) => ({
          id: `server-${message.id}`,
          backendId: String(message.id),
          role: message.role === "user" ? "user" : "assistant",
          content: String(message.content || ""),
          createdAt: message.created_at ? new Date(message.created_at) : new Date(),
        } as Message))
        .filter((message) => message.content && !backendIds.has(message.backendId));

      for (const message of incomingMessages) {
        const localIndex = merged.findIndex((existing) => !existing.backendId && isDuplicateChatMessage(existing, message));
        if (localIndex >= 0) {
          merged[localIndex] = {
            ...message,
            createdAt: message.createdAt || merged[localIndex].createdAt,
          };
          backendIds.add(message.backendId);
          changed = true;
          continue;
        }

        if (merged.some((existing) => isDuplicateChatMessage(existing, message))) {
          backendIds.add(message.backendId);
          continue;
        }

        merged.push(message);
        backendIds.add(message.backendId);
        changed = true;
      }

      if (!changed) return prev;

      return merged.sort((a, b) => {
        const aTime = a.createdAt?.getTime() || 0;
        const bTime = b.createdAt?.getTime() || 0;
        return aTime - bTime;
      });
    });
  }, []);

  const resetChatAfterLogout = useCallback(() => {
    if (typeof window === "undefined") return;
    clearClientSession();
    const newSessionId = generateSessionId();
    sessionStorage.setItem(`chat-session-${chatId}`, newSessionId);
    setSessionId(newSessionId);
    setMessages(selectedMeta.starter.map((message) => ({ ...message, createdAt: new Date() })));
    window.location.reload();
  }, [chatId, selectedMeta.starter]);

  const fetchServerMessages = useCallback(async () => {
    if (chatId !== "agent" || !sessionId || pollInFlightRef.current) return;
    if (isClientSessionExpired()) {
      redirectToExpiredLogin();
      return;
    }

    const resolvedSessionId = getStoredChatSessionId(chatId) || sessionId;
    if (!resolvedSessionId) return;
    const browserId = getOrCreateBrowserId();
    const params = new URLSearchParams({
      session_id: resolvedSessionId,
      limit: "50",
    });
    const sessionToken = typeof window !== "undefined"
      ? localStorage.getItem("talk-to-stellar.sessionToken") || ""
      : "";
    if (browserId) {
      params.set("browser_id", browserId);
    }

    pollInFlightRef.current = true;
    try {
      const response = await fetch(`/api/chat?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          ...(sessionToken ? { "X-Session-Token": sessionToken } : {}),
        },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data.session_id && data.session_id !== resolvedSessionId && typeof window !== "undefined") {
        localStorage.setItem("talk-to-stellar.sessionId", data.session_id);
        sessionStorage.setItem(`chat-session-${chatId}`, data.session_id);
        setSessionId(data.session_id);
        touchClientSessionActivity();
      }
      mergeServerMessages(data.messages || []);
    } catch (error) {
      console.error("Error syncing messages:", error);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [chatId, mergeServerMessages, sessionId]);

  useEffect(() => {
    if (chatId !== "agent" || !sessionId) return;

    fetchServerMessages();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchServerMessages();
      }
    }, SERVER_MESSAGE_SYNC_INTERVAL_MS);

    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") {
        fetchServerMessages();
      }
    };
    const syncOnSessionChange = (event: StorageEvent) => {
      if (!event.key || event.key === "talk-to-stellar.sessionId") {
        fetchServerMessages();
      }
    };

    window.addEventListener("focus", fetchServerMessages);
    window.addEventListener("visibilitychange", syncWhenVisible);
    window.addEventListener("storage", syncOnSessionChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", fetchServerMessages);
      window.removeEventListener("visibilitychange", syncWhenVisible);
      window.removeEventListener("storage", syncOnSessionChange);
    };
  }, [chatId, fetchServerMessages, sessionId]);

  useEffect(() => {
    if (chatId !== "agent" || typeof window === "undefined") return;

    const syncSoon = () => {
      window.setTimeout(fetchServerMessages, 250);
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === "talk-to-stellar.webChatFeedbackQueue") {
        syncSoon();
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(WEB_CHAT_FEEDBACK_CHANNEL);
      channel.onmessage = syncSoon;
    } catch {}

    window.addEventListener(WEB_CHAT_FEEDBACK_EVENT, syncSoon);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(WEB_CHAT_FEEDBACK_EVENT, syncSoon);
      window.removeEventListener("storage", onStorage);
      try {
        channel?.close();
      } catch {}
    };
  }, [chatId, fetchServerMessages]);

  useEffect(() => {
    if (chatId !== "agent" || typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key === "talk-to-stellar.logoutRefreshAt" && event.newValue) {
        resetChatAfterLogout();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [chatId, resetChatAfterLogout]);

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
        content: t("chat_wait_session"),
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
          content: `${selectedMeta.title}: message received. I will consider this amount for the next transfer.`,
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, localReply]);
        return;
      }

      const storedSessionId = typeof window !== "undefined"
        ? localStorage.getItem("talk-to-stellar.sessionId")
        : null;
      const resolvedSessionId = storedSessionId || sessionId;
      const browserId = getOrCreateBrowserId();
      const sessionToken = typeof window !== "undefined"
        ? localStorage.getItem("talk-to-stellar.sessionToken") || ""
        : "";

      // Use the Next.js route handler which handles UUID generation and forwards to backend
      const response = await idempotentFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          session_id: resolvedSessionId,
          session_token: sessionToken || undefined,
          source: "web",
          language,
          metadata: {
            browser_id: browserId,
            language,
          },
        }),
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || t("chat_api_error"));
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
      
      const botResponse = data.content || data.message || t("chat_no_response");
      
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
          const sessionToken = localStorage.getItem('talk-to-stellar.sessionToken') || '';
          await idempotentFetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: resolvedSessionId,
              session_token: sessionToken || undefined,
            }),
          });
        } catch {
          // ignore, client reset below is still required
        }
        resetClientSession();
      }

    } catch (error) {
      console.error("Error in handleSubmit:", error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `${t("chat_error_prefix")}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus(); 
    }
  };

  const formatTime = (timestamp?: Date) => {
    if (!timestamp) return "";
    return timestamp.toLocaleTimeString(language === "en" ? "en-US" : "pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessageContent = (content: string) => {
    const safeContent = sanitizeVisibleChatText(content)
      .replace(/RECEIPT_IMAGE_DATA_URL:data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g, '')
      .trim();

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = safeContent.split(urlRegex);
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
                className="my-2 flex max-w-full items-center gap-3 rounded-lg border border-[#2a3942] bg-[#182229] px-3 py-2 text-[#e9edef] no-underline shadow-sm transition hover:bg-[#1f2c34]"
                title={part}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-[#06261d]">
                  <ExternalLink className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block truncate text-sm font-medium">{getFriendlyLinkLabel(part, t)}</span>
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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#aebac1] hover:bg-white/5 md:hidden"
            aria-label="Back to contacts list"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar className="h-10 w-10">
            <AvatarImage src={selectedMeta.avatar} />
            <AvatarFallback className="bg-[#00a884] text-white">●</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 overflow-hidden">
            <h2 className="truncate text-[17px] font-normal text-[#e9edef]">{selectedMeta.title}</h2>
            <p className="truncate text-xs text-[#8696a0]">
              {isLoading ? <TypingDots className="text-[#8ea4b1]" /> : t("chat_online")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-[#aebac1] sm:gap-5">
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

      <div className="sticky bottom-0 z-10 flex-shrink-0 border-t border-[#313d45] bg-[#202c33] px-3 py-3 sm:px-4">
        <form onSubmit={handleSubmit} className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Smile className="hidden h-6 w-6 text-[#8696a0] sm:block" />
          <Paperclip className="hidden h-6 w-6 text-[#8696a0] sm:block" />
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chat_input_placeholder")}
            className="h-11 min-w-0 flex-1 truncate rounded-xl border-none bg-[#2a3942] px-4 text-[#e9edef] placeholder:text-[#8696a0] transition-all duration-200 focus-visible:ring-2 focus-visible:ring-emerald-400/40"
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
