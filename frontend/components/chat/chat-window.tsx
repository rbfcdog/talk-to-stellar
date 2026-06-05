// src/components/chat-window.tsx

"use client";

import { Fragment, useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, MoreVertical, Phone, Send, Video, Search, ExternalLink } from "lucide-react";
import {
  clearClientSession,
  currentClientSessionScope,
  getClientSession,
  isClientSessionExpired,
  normalizeClientSessionSource,
  scopedClientStorageKey,
  touchClientSessionActivity,
} from "@/lib/session";
import { buildIdempotencyKey, idempotentFetch } from "@/lib/idempotency";
import { publicErrorPayload } from "@/lib/public-errors";
import { consumeWebChatFeedback, WEB_CHAT_FEEDBACK_CHANNEL, WEB_CHAT_FEEDBACK_EVENT, type WebChatFeedback } from "@/lib/web-feedback";
import { Shimmer, TypingDots } from "@/components/shared/feedback";
import { useLanguage } from "@/lib/i18n";
import { isDuplicateChatMessage, mergeChatMessages, shouldAppendImmediateAssistantMessage } from "@/lib/chat-message-merge";

type Message = {
  id: string;
  backendId?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt?: Date;
};

const SERVER_MESSAGE_SYNC_INTERVAL_MS = 1500;
const CHAT_POST_TIMEOUT_MS = 45000;
const STELLAR_PUBLIC_KEY_REGEX = /\bG[A-Z2-7]{55}\b/gi;

function sanitizeVisibleChatText(content: string): string {
  return String(content || "")
    .replace(STELLAR_PUBLIC_KEY_REGEX, "[chave oculta]")
    .replace(/public_key\s*=\s*[^\s|]+/gi, "public_key=[oculto]")
    .replace(/stellar:mainnet/gi, "conta global")
    .replace(/\bUSDC\b/g, "USD");
}

function chatSessionStorageKey(chatId: string, source: string): string {
  return scopedClientStorageKey(`chat-session-${chatId}`, source || "web");
}

function getStoredChatSessionId(chatId: string, source: string): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(chatSessionStorageKey(chatId, source)) || "";
}

function setStoredChatSessionId(chatId: string, source: string, value: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(chatSessionStorageKey(chatId, source), value);
}

function getFriendlyLinkLabel(rawUrl: string, t: (key: string) => string) {
  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/$/, "");
    if (path.endsWith("/confirm-payment")) return t("chat_link_payment");
    if (path.endsWith("/confirm-conversion")) return t("chat_link_conversion");
    if (path.endsWith("/convert")) return t("chat_link_convert");
    if (path.endsWith("/yield") || path.endsWith("/review") || path.endsWith("/rendimentos") || path.endsWith("/rendimento")) return t("chat_link_yield");
    if (path.endsWith("/money-cycle")) return t("chat_link_money_cycle");
    if (path.endsWith("/create-account")) return t("chat_link_account");
    if (path.endsWith("/change-pin")) return t("chat_link_pin");
    if (path.endsWith("/pay-anyone")) return t("chat_link_pay_anyone");
    if (path.endsWith("/claim-payment")) return t("chat_link_claim");
    if (path.endsWith("/pix-ramp") || path.endsWith("/pix-on") || path.endsWith("/pix-off")) return t("chat_link_pix");
    if (path.endsWith("/balance")) return t("chat_link_balance");
    if (path.endsWith("/transactions")) return t("chat_link_history");
    if (path.startsWith("/profile/") || path.startsWith("/u/")) return t("chat_link_profile");
    if (path.endsWith("/send-external")) return t("chat_link_external_send");
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

function generateLocalMessageId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function idempotentFetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await idempotentFetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function ChatWindow({ chatId, onBack, initialPrompt = "" }: { chatId: string; onBack?: () => void; initialPrompt?: string }) {
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
  const [retryText, setRetryText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [browserSessionExpired, setBrowserSessionExpired] = useState(false);
  const previousChatIdRef = useRef(chatId);
  const appliedInitialPromptRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const browserSessionExpiredRef = useRef(false);
  const expiredNoticeShownRef = useRef(false);
  const clientSessionSource = typeof window === "undefined" ? "web" : currentClientSessionScope();
  const externalSessionSource = normalizeClientSessionSource(clientSessionSource);
  const externalPriorityChat = externalSessionSource === "whatsapp" || externalSessionSource === "telegram";
  const logoutRefreshStorageKey = scopedClientStorageKey("talk-to-stellar.logoutRefreshAt", clientSessionSource);

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

  const appendExpiredSessionNotice = useCallback(() => {
    if (expiredNoticeShownRef.current) return;
    expiredNoticeShownRef.current = true;
    const notice: Message = {
      id: `session-expired-${Date.now()}`,
      role: "assistant",
      content: L(
        "Sua sessão do navegador expirou. Envie uma mensagem, como \"login\", para receber aqui um novo link de acesso.",
        "Your browser session expired. Send a message, such as \"login\", to receive a new access link here.",
      ),
      createdAt: new Date(),
    };
    setMessages((prev) => (prev.some((message) => message.id.startsWith("session-expired-")) ? prev : [...prev, notice]));
  }, [language]);

  const beginExpiredBrowserSession = useCallback((appendNotice = true) => {
    if (typeof window === "undefined") return "";

    clearClientSession();
    if (!externalPriorityChat) localStorage.removeItem("talk-to-stellar.browserId");
    const newSessionId = generateSessionId();
    setStoredChatSessionId(chatId, clientSessionSource, newSessionId);
    setSessionId(newSessionId);
    browserSessionExpiredRef.current = true;
    setBrowserSessionExpired(true);
    if (appendNotice) appendExpiredSessionNotice();
    return newSessionId;
  }, [appendExpiredSessionNotice, chatId]);

  const restoreAuthenticatedBrowserSession = useCallback(async () => {
    const { sessionId: cookieSessionId, authenticated } = await getClientSession();
    if (!authenticated || !cookieSessionId || typeof window === "undefined") return "";

    setStoredChatSessionId(chatId, clientSessionSource, cookieSessionId);
    setSessionId(cookieSessionId);
    browserSessionExpiredRef.current = false;
    setBrowserSessionExpired(false);
    expiredNoticeShownRef.current = false;
    touchClientSessionActivity();
    return cookieSessionId;
  }, [chatId]);
  
  // --- Initialize session ID on mount ---
  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      if (chatId === "agent" && isClientSessionExpired()) {
        const restoredSessionId = await restoreAuthenticatedBrowserSession();
        if (!cancelled && !restoredSessionId) beginExpiredBrowserSession(true);
        return;
      }

      const storedSessionId = typeof window !== 'undefined'
        ? getStoredChatSessionId(chatId, clientSessionSource)
        : null;

      const newSessionId = storedSessionId || generateSessionId();
      if (cancelled) return;
      setSessionId(newSessionId);

      // Store it for subsequent messages
      if (typeof window !== 'undefined') {
        setStoredChatSessionId(chatId, clientSessionSource, newSessionId);
        if (chatId === "agent") {
          touchClientSessionActivity();
          getClientSession().then(({ sessionId: cookieSessionId, authenticated }) => {
            if (!cancelled && authenticated && cookieSessionId) {
              setStoredChatSessionId(chatId, clientSessionSource, cookieSessionId);
              setSessionId(cookieSessionId);
            }
          });
        }
      }
    };

    initialize();
    return () => {
      cancelled = true;
    };
  }, [beginExpiredBrowserSession, chatId, clientSessionSource, restoreAuthenticatedBrowserSession, t]);

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

  useEffect(() => {
    if (chatId !== "agent") return;
    const prompt = String(initialPrompt || "").trim();
    if (!prompt || appliedInitialPromptRef.current === prompt) return;
    appliedInitialPromptRef.current = prompt;
    setInput((current) => current.trim() ? current : prompt);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [chatId, initialPrompt]);

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
    if (chatId !== "agent" || typeof window === "undefined" || externalPriorityChat) return;
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
  }, [chatId, externalPriorityChat]);
  
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
    setMessages((prev) => mergeChatMessages(prev, serverMessages, { removeWelcomeId: "agent-welcome" }));
  }, []);

  const resetChatAfterLogout = useCallback(() => {
    if (typeof window === "undefined") return;
    clearClientSession();
    const newSessionId = generateSessionId();
    setStoredChatSessionId(chatId, clientSessionSource, newSessionId);
    setSessionId(newSessionId);
    setMessages(selectedMeta.starter.map((message) => ({ ...message, createdAt: new Date() })));
    window.location.reload();
  }, [chatId, clientSessionSource, selectedMeta.starter]);

  const fetchServerMessages = useCallback(async () => {
    if (chatId !== "agent" || !sessionId || pollInFlightRef.current) return;
    let activeSessionId = sessionId;
    if (isClientSessionExpired()) {
      const restoredSessionId = await restoreAuthenticatedBrowserSession();
      if (!restoredSessionId) {
        beginExpiredBrowserSession(true);
        return;
      }
      activeSessionId = restoredSessionId;
    }
    if (browserSessionExpiredRef.current) return;

    const resolvedSessionId = getStoredChatSessionId(chatId, clientSessionSource) || activeSessionId;
    if (!resolvedSessionId) return;
    const browserId = externalPriorityChat ? "" : getOrCreateBrowserId();
    const params = new URLSearchParams({
      session_id: resolvedSessionId,
      limit: "50",
    });
    params.set("source", clientSessionSource || "web");
    if (browserId) {
      params.set("browser_id", browserId);
    }

    pollInFlightRef.current = true;
    try {
      const response = await fetch(`/api/chat?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json();
      if (data?.loginRequired || data?.onboardingRequired || data?.reason === "session_expired") {
        browserSessionExpiredRef.current = true;
        setBrowserSessionExpired(true);
        appendExpiredSessionNotice();
        return;
      }
      if (data.session_id && data.session_id !== resolvedSessionId && typeof window !== "undefined") {
        setStoredChatSessionId(chatId, clientSessionSource, data.session_id);
        setSessionId(data.session_id);
        touchClientSessionActivity();
      }
      mergeServerMessages(data.messages || []);
    } catch (error) {
      console.error("Error syncing messages:", error);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [beginExpiredBrowserSession, chatId, clientSessionSource, externalPriorityChat, mergeServerMessages, restoreAuthenticatedBrowserSession, sessionId]);

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
      if (!event.key || event.key === logoutRefreshStorageKey) {
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
  }, [chatId, fetchServerMessages, logoutRefreshStorageKey, sessionId]);

  useEffect(() => {
    if (chatId !== "agent" || typeof window === "undefined" || externalPriorityChat) return;

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
  }, [chatId, externalPriorityChat, fetchServerMessages]);

  useEffect(() => {
    if (chatId !== "agent" || typeof window === "undefined") return;

    const onStorage = (event: StorageEvent) => {
      if (event.key === logoutRefreshStorageKey && event.newValue) {
        resetChatAfterLogout();
      }
    };

    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, [chatId, logoutRefreshStorageKey, resetChatAfterLogout]);

  const resetClientSession = () => {
    if (typeof window === "undefined") return;
    clearClientSession();
    if (!externalPriorityChat) localStorage.removeItem("talk-to-stellar.browserId");
    const newSessionId = generateSessionId();
    setStoredChatSessionId(chatId, clientSessionSource, newSessionId);
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

  const coerceAssistantResponse = useCallback((data: any) => {
    const candidates = [
      data?.content,
      data?.message,
      data?.response_message,
      data?.result?.message,
      data?.result?.content,
      data?.result?.response_message,
    ];

    for (const candidate of candidates) {
      const text = String(candidate || "").trim();
      if (text) return text;
    }

    const creationUrl = String(data?.creationUrl || data?.creation_url || "").trim();
    if (creationUrl) {
      return L(
        `Abra este link para continuar:\n${creationUrl}`,
        `Open this link to continue:\n${creationUrl}`,
      );
    }

    return L(
      "Não recebi uma resposta completa. Tente novamente em alguns segundos.",
      "I did not receive a complete response. Try again in a few seconds.",
    );
  }, [language]);

  const hasAssistantAfterMessage = (messagesToCheck: Message[], messageId: string) => {
    const userIndex = messagesToCheck.findIndex((message) => message.id === messageId);
    if (userIndex < 0) return true;
    return messagesToCheck
      .slice(userIndex + 1)
      .some((message) => message.role === "assistant" && String(message.content || "").trim());
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const submittedText = input.trim();

    let activeSessionId = sessionId;
    let requestBrowserSessionExpired = browserSessionExpiredRef.current;
    if (chatId === "agent") {
      if (browserSessionExpiredRef.current) {
        const restoredSessionId = await restoreAuthenticatedBrowserSession();
        if (restoredSessionId) {
          activeSessionId = restoredSessionId;
          requestBrowserSessionExpired = false;
        }
      }

      if (isClientSessionExpired()) {
        const restoredSessionId = await restoreAuthenticatedBrowserSession();
        if (restoredSessionId) {
          activeSessionId = restoredSessionId;
          requestBrowserSessionExpired = false;
        } else {
          activeSessionId = beginExpiredBrowserSession(false) || activeSessionId;
          requestBrowserSessionExpired = true;
        }
      }
    }
    
    if (!activeSessionId) {
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t("chat_wait_session"),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const userMessage: Message = {
      id: generateLocalMessageId("user"),
      role: 'user',
      content: submittedText,
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setRetryText('');
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

      const storedSessionId = getStoredChatSessionId(chatId, clientSessionSource);
      const resolvedSessionId = storedSessionId || activeSessionId;
      const browserId = externalPriorityChat ? "" : getOrCreateBrowserId();

      // Use the Next.js route handler which handles UUID generation and forwards to backend
      const response = await idempotentFetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': buildIdempotencyKey('chat.message', {
            session_id: resolvedSessionId,
            message_id: userMessage.id,
            source: clientSessionSource || "web",
          }),
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          session_id: resolvedSessionId,
          source: clientSessionSource || "web",
          language,
          metadata: {
            ...(browserId ? { browser_id: browserId } : {}),
            language,
            source: clientSessionSource || "web",
            ...(externalPriorityChat ? { external_source: clientSessionSource, external_provider: clientSessionSource } : {}),
            browser_session_expired: requestBrowserSessionExpired || undefined,
          },
        }),
      }, CHAT_POST_TIMEOUT_MS);

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || t("chat_api_error"));
      }

      const data = await response.json();
      const loginRequired = Boolean(data.onboardingRequired || data.loginRequired || data.creationUrl);
      if (data.session_id && typeof window !== "undefined") {
        setStoredChatSessionId(chatId, clientSessionSource, data.session_id);
        setSessionId(data.session_id);
        if (!loginRequired) {
          browserSessionExpiredRef.current = false;
          setBrowserSessionExpired(false);
          expiredNoticeShownRef.current = false;
          touchClientSessionActivity();
        }
      }
      
      // Handle error responses that still return 200
      if (data.error) {
        throw new Error(data.error);
      }
      
      const botResponse = coerceAssistantResponse(data);
      
      const botMessage: Message = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: botResponse,
        createdAt: new Date(),
      };

      setMessages((prev) => {
        if (shouldAppendImmediateAssistantMessage(prev, botMessage, userMessage.createdAt)) {
          return [...prev, botMessage];
        }
        return hasAssistantAfterMessage(prev, userMessage.id) ? prev : [...prev, botMessage];
      });
      if (!loginRequired) {
        browserSessionExpiredRef.current = false;
        setBrowserSessionExpired(false);
        expiredNoticeShownRef.current = false;
        touchClientSessionActivity();
      }

      if (isLogoutResponse(botResponse, data.action)) {
        try {
          await idempotentFetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: resolvedSessionId,
              source: clientSessionSource || "web",
              provider: externalPriorityChat ? clientSessionSource : "web",
            }),
          });
        } catch {
          // ignore, client reset below is still required
        }
        resetClientSession();
      }

    } catch (error) {
      console.error("Error in handleSubmit:", error);
      const publicError = publicErrorPayload(error, { language });
      setRetryText(userMessage.content);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `${publicError.message}\n\n${L("Código de suporte", "Support code")}: ${publicError.support_code}`,
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setMessages((prev) => {
        if (hasAssistantAfterMessage(prev, userMessage.id)) return prev;
        return [
          ...prev,
          {
            id: `silent-fallback-${Date.now()}`,
            role: "assistant",
            content: L(
              "Não consegui responder essa mensagem agora. Tente enviar de novo em alguns segundos.",
              "I could not answer this message right now. Try sending it again in a few seconds.",
            ),
            createdAt: new Date(),
          },
        ];
      });
      setIsLoading(false);
      inputRef.current?.focus(); 
    }
  };

  const formatTime = (timestamp?: Date) => {
    if (!timestamp) return "";
    return timestamp.toLocaleTimeString(language === "en" ? "en-US" : "pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const renderMessageContent = (content: string, role: Message["role"] = "assistant") => {
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
                className={
                  role === "user"
                    ? "my-2 flex max-w-full items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-3 py-2 !text-white no-underline shadow-sm transition hover:bg-white/15"
                    : "my-2 flex max-w-full items-center gap-3 rounded-xl border border-tts-border bg-tts-bg px-3 py-2 text-tts-deep no-underline shadow-sm transition hover:bg-tts-surface"
                }
                title={part}
              >
                <span className={role === "user" ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white" : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tts-gold-bg text-tts-gold"}>
                  <ExternalLink className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block truncate text-sm font-medium">{getFriendlyLinkLabel(part, t)}</span>
                  <span className={role === "user" ? "block truncate text-xs !text-white/65" : "block truncate text-xs text-tts-muted"}>{getFriendlyLinkMeta(part)}</span>
                </span>
              </a>
            );
          }
          return <Fragment key={idx}>{part}</Fragment>;
        })}
      </div>
    );
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-tts-bg/80">
       <div className="flex-shrink-0 flex items-center justify-between gap-3 border-b border-tts-border bg-tts-surface/95 px-3 py-3 shadow-sm backdrop-blur sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-tts-muted hover:bg-tts-bg md:hidden"
            aria-label="Back to contacts list"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Avatar className="h-10 w-10">
            <AvatarImage src={selectedMeta.avatar} />
            <AvatarFallback className="bg-tts-gold-bg text-tts-gold">●</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 overflow-hidden">
            <h2 className="truncate text-sm font-bold tracking-normal text-tts-deep">{selectedMeta.title}</h2>
            <p className="truncate font-mono text-[10px] text-tts-muted">
              {isLoading
                ? <TypingDots className="text-tts-muted" />
                : browserSessionExpired
                  ? L("Sessão expirada; envie mensagem para novo link", "Session expired; send a message for a new link")
                  : t("chat_online")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-tts-muted sm:gap-3">
          {[
            { Icon: Video, label: L("Chamada de vídeo indisponível", "Video call unavailable") },
            { Icon: Phone, label: L("Chamada indisponível", "Call unavailable") },
            { Icon: Search, label: L("Busca indisponível", "Search unavailable") },
            { Icon: MoreVertical, label: L("Mais opções indisponíveis", "More options unavailable") },
          ].map(({ Icon, label }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              disabled
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-tts-muted opacity-60"
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollAreaViewportRef}
        className="flex-1 min-h-0 overflow-y-auto bg-tts-bg/70"
      >
        <div className="flex flex-col gap-3 px-4 py-4">
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
                <div
                  className={
                    m.role === "user"
                      ? "tts-chat-user-bubble min-w-0 max-w-[75%] overflow-hidden rounded-2xl rounded-br-sm bg-tts-deep px-4 py-2.5 text-sm text-white shadow-sm dark:border dark:border-white/10 dark:bg-white/10 dark:!text-white"
                      : "min-w-0 max-w-[80%] overflow-hidden rounded-2xl rounded-bl-sm border border-tts-border bg-tts-surface px-4 py-2.5 text-sm text-tts-deep shadow-sm"
                  }
                >
                  {renderMessageContent(m.content, m.role)}
                  <div
                    className={
                      m.role === "user"
                        ? "mt-1 text-right font-mono text-[10px] !text-white/60"
                        : "mt-1 text-right font-mono text-[10px] text-tts-muted"
                    }
                  >
                    {formatTime(m.createdAt)}
                  </div>
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
                <div className="rounded-2xl rounded-bl-sm border border-tts-border bg-tts-surface px-4 py-3 text-tts-muted shadow-sm">
                  <TypingDots />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex-shrink-0 border-t border-tts-border bg-tts-surface/95 px-4 py-3 shadow-sm backdrop-blur">
        {retryText && !isLoading && chatId === "agent" && (
          <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border-l-4 border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-semibold text-tts-deep">
            <span>{L("A última mensagem não concluiu.", "The last message did not complete.")}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setInput(retryText);
                setRetryText("");
                window.setTimeout(() => inputRef.current?.focus(), 0);
              }}
              className="shrink-0"
            >
              {L("Tentar novamente", "Try again")}
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex min-w-0 items-center gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={browserSessionExpired ? L("Digite login para receber um novo link", "Type login to receive a new link") : t("chat_input_placeholder")}
            className="h-10 min-w-0 flex-1"
          />
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 shrink-0 bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
            disabled={isLoading || !input.trim()}
            aria-label={L("Enviar mensagem", "Send message")}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
