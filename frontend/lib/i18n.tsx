"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export type AppLanguage = "pt-BR" | "en";

const STORAGE_KEY = "talk-to-stellar.language";
const COOKIE_KEY = "tts_lang";

/** Coerce an arbitrary value (locale string, query param, etc.) into a supported AppLanguage. */
export function normalizeLanguage(value: unknown): AppLanguage {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pt" || normalized === "pt-br" || normalized.startsWith("pt-") || normalized.includes("portugu")) {
    return "pt-BR";
  }
  return "en";
}

type Dictionary = Record<string, string>;

const englishDictionary: Dictionary = {
    language_label: "Language",
    language_current: "English",
    chat_agent_welcome:
      "Hi, this is TalkToStellar.\n\nI can help with balance, PIX, contacts, payments and conversions.\n\nExamples:\n1. balance\n2. add 10 reais with PIX\n3. send 5 dollars to Ana\n4. withdraw 5 reais to my PIX\n5. history\n\nIf you are not signed in yet, send “login” and I will create a secure access link.",
    chat_search_placeholder: "Search account contacts...",
    chat_sidebar_preview: "Hi. How can I help with your account, balance, and contacts today?",
    chat_input_placeholder: "Type: balance, add money with PIX, withdraw to PIX, or send to someone",
    chat_wait_session: "Give me a moment while I start the session...",
    chat_api_error: "I could not connect to the service right now. Try again in a few seconds.",
    chat_no_response: "No response received",
    chat_online: "online",
    chat_link_payment: "Open payment confirmation",
    chat_link_conversion: "Open conversion confirmation",
    chat_link_account: "Create or sign in",
    chat_link_pin: "Reset PIN",
    chat_link_pay_anyone: "Open payment link",
    chat_link_claim: "Claim payment",
    chat_link_pix: "Open PIX",
    chat_link_whatsapp: "Share on WhatsApp",
    chat_link_generic: "Open link",
    welcome_select:
      'Select TalkToStellar in the sidebar. Start with: 1) "balance", 2) "deposit 150 reais with PIX", 3) "send 100 reais to my PIX", 4) "send 200 dollars to Maria with the most optimized route".',
    welcome_protected: "Your conversations stay protected while you use your account.",
    login_title: "Sign in to your account",
    login_subtitle:
      "Sign in to continue where you left off. Next after login: balance, contacts, PIX money in/out, and payments.",
    login_channel_detected: "Channel detected",
    login_identifier: "Identifier",
    login_expired: "Your session expired. Sign in again to continue.",
    login_pin_card_title: "PIN",
    login_pin_card_body: "The fastest way to sign in and continue.",
    login_next_card_title: "After login",
    login_next_card_body: "Go back to the chat and ask for balance, contacts, PIX, payments, or history.",
    login_via: "Signing in with",
    login_telegram_id: "Telegram ID",
    login_telegram_help: "Enter your PIN to sign in to the account linked to this Telegram.",
    login_email: "Email",
    login_pin: "PIN",
    login_pin_placeholder: "Enter your PIN",
    login_submit: "1) Sign in with PIN",
    login_submitting: "Signing in...",
    login_passkey_submit: "Sign in with Passkey (optional)",
    login_passkey_loading: "Opening biometrics...",
    login_passkey_qr_title: "Sign in with Passkey on your phone",
    login_passkey_qr_body: "Scan to open this login on your phone and confirm with your device.",
    login_passkey_qr_alt: "QR Code for Passkey sign-in on phone",
    login_email_code: "Code sent by email",
    login_email_code_help: "Check your email and enter the code to continue.",
    login_confirm_submit: "Confirm sign-in",
    login_connected_channel: "{{provider}} connected",
    login_connected_account: "Account connected",
    login_linked_title: "Your account is linked.",
    login_continue_operation: "Continuing to the operation...",
    login_back_to_channel: "Go back to {{provider}} and send your next message.",
    login_done: "Sign-in complete.",
    login_opening_operation: "Opening the operation shortly.",
    hero_title_1: "Send to World.",
    hero_title_2: "In One Message.",
    hero_subtitle:
      "A conversational account for sending, converting, and receiving money through the channels people already use every day.",
    hero_card_1_title: "Start from chat",
    hero_card_1_body: "Ask for balance, PIX, payment, conversion, or history without downloading a new app.",
    hero_card_2_title: "Confirm with clarity",
    hero_card_2_body:
      "The platform compares routes in real time to use the most optimized path, reduce effective cost in BRL and USDC, and show fees before confirmation.",
    nav_solution: "Solution",
    nav_simulator: "Conversion Simulator",
    nav_how: "How It Works",
    pix_add_title: "Add money with PIX",
    pix_send_title: "Send money to your PIX",
    pix_add_subtitle: "Use integrated PIX, confirm with your PIN, and receive the balance in your account.",
    pix_transfer_subtitle: "Use integrated PIX, confirm with your PIN, and automatically send to {{recipient}}.",
    pix_off_subtitle: "Confirm with your PIN to send balance to your PIX in BRL.",
    pix_value: "Amount",
    pix_destination: "Destination",
    pix_my_account: "My account",
    pix_your_pix: "Your PIX",
    pix_need_email: "Enter the account email to find your account and continue.",
    pix_done_sent_chat: "This operation has already been completed. The receipt was sent in chat.",
};

const portugueseDictionary: Dictionary = {
    language_label: "Idioma",
    language_current: "Português",
    chat_agent_welcome:
      "Olá, aqui é o TalkToStellar.\n\nPosso ajudar com saldo, PIX, contatos, pagamentos e conversões.\n\nExemplos:\n1. saldo\n2. colocar 10 reais via PIX\n3. enviar 5 dólares para Ana\n4. retirar 5 reais para meu PIX\n5. histórico\n\nSe ainda não entrou, mande “login” e eu gero um link seguro de acesso.",
    chat_search_placeholder: "Buscar contatos da conta...",
    chat_sidebar_preview: "Oi. Como posso ajudar com sua conta, saldo e contatos hoje?",
    chat_input_placeholder: "Digite: saldo, colocar dinheiro com PIX, retirar para PIX ou enviar para alguém",
    chat_wait_session: "Só um momento enquanto inicio a sessão...",
    chat_api_error: "Não consegui conectar ao serviço agora. Tente novamente em alguns segundos.",
    chat_no_response: "Nenhuma resposta recebida",
    chat_online: "online",
    chat_link_payment: "Abrir confirmação de pagamento",
    chat_link_conversion: "Abrir confirmação de conversão",
    chat_link_account: "Criar conta ou entrar",
    chat_link_pin: "Redefinir PIN",
    chat_link_pay_anyone: "Abrir link de pagamento",
    chat_link_claim: "Receber pagamento",
    chat_link_pix: "Abrir PIX",
    chat_link_whatsapp: "Compartilhar no WhatsApp",
    chat_link_generic: "Abrir link",
    welcome_select:
      'Selecione TalkToStellar na lateral. Comece com: 1) "saldo", 2) "colocar 150 reais com PIX", 3) "enviar 100 reais para meu PIX", 4) "enviar 200 dólares para Maria da forma mais otimizada".',
    welcome_protected: "Suas conversas ficam protegidas enquanto você usa sua conta.",
    login_title: "Entre na sua conta",
    login_subtitle:
      "Entre para continuar de onde parou. Depois do login: saldo, contatos, PIX entrando/saindo e pagamentos.",
    login_channel_detected: "Canal detectado",
    login_identifier: "Identificador",
    login_expired: "Sua sessão expirou. Entre novamente para continuar.",
    login_pin_card_title: "PIN",
    login_pin_card_body: "O jeito mais rápido de entrar e continuar.",
    login_next_card_title: "Depois do login",
    login_next_card_body: "Volte ao chat e peça saldo, contatos, PIX, pagamentos ou histórico.",
    login_via: "Entrando via",
    login_telegram_id: "ID do Telegram",
    login_telegram_help: "Digite seu PIN para entrar na conta vinculada a este Telegram.",
    login_email: "E-mail",
    login_pin: "PIN",
    login_pin_placeholder: "Digite seu PIN",
    login_submit: "1) Entrar com PIN",
    login_submitting: "Entrando...",
    login_passkey_submit: "Entrar com Passkey (opcional)",
    login_passkey_loading: "Abrindo biometria...",
    login_passkey_qr_title: "Entrar com Passkey no celular",
    login_passkey_qr_body: "Escaneie para abrir este login no celular e confirmar pelo aparelho.",
    login_passkey_qr_alt: "QR Code para login com Passkey no celular",
    login_email_code: "Código enviado por e-mail",
    login_email_code_help: "Confira seu e-mail e digite o código para continuar.",
    login_confirm_submit: "Confirmar entrada",
    login_connected_channel: "{{provider}} conectado",
    login_connected_account: "Conta conectada",
    login_linked_title: "Sua conta foi vinculada.",
    login_continue_operation: "Continuando a operação...",
    login_back_to_channel: "Volte ao {{provider}} e envie sua próxima mensagem.",
    login_done: "Entrada concluída.",
    login_opening_operation: "Abrindo a operação em instantes.",
    hero_title_1: "Envie para o mundo.",
    hero_title_2: "Em uma mensagem.",
    hero_subtitle:
      "Uma conta conversacional para enviar, converter e receber dinheiro pelos canais que a pessoa já usa todos os dias.",
    hero_card_1_title: "Comece pelo chat",
    hero_card_1_body: "Peça saldo, PIX, pagamento, conversão ou histórico sem baixar um novo app.",
    hero_card_2_title: "Confirme com clareza",
    hero_card_2_body:
      "A plataforma compara rotas em tempo real para usar a forma mais otimizada, reduzir o custo efetivo em BRL e USDC e mostrar a taxa antes da confirmação.",
    nav_solution: "Solução",
    nav_simulator: "Simulador de Conversão",
    nav_how: "Como Funciona",
    pix_add_title: "Colocar dinheiro com PIX",
    pix_send_title: "Enviar dinheiro para seu PIX",
    pix_add_subtitle: "Use PIX integrado, confirme com seu PIN e receba saldo na conta.",
    pix_transfer_subtitle: "Use PIX integrado, confirme com seu PIN e envie automaticamente para {{recipient}}.",
    pix_off_subtitle: "Confirme com seu PIN para enviar saldo em BRL para seu PIX.",
    pix_value: "Valor",
    pix_destination: "Destino",
    pix_my_account: "Minha conta",
    pix_your_pix: "Seu PIX",
    pix_need_email: "Informe o e-mail da conta para localizar sua conta e continuar.",
    pix_done_sent_chat: "Esta operação já foi concluída. O comprovante foi enviado no chat.",
};

const dictionaries: Record<AppLanguage, Dictionary> = {
  "pt-BR": portugueseDictionary,
  en: englishDictionary,
};

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
  t: (key: string, replacements?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") return "pt-BR";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  if (cookieMatch?.[1]) return normalizeLanguage(decodeURIComponent(cookieMatch[1]));
  return normalizeLanguage(window.navigator?.language || "pt-BR");
}

function persistLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, language);
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(language)}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = language === "pt-BR" ? "pt-BR" : "en";
}

/** Context provider that exposes the active language + a t() lookup with {{placeholder}} interpolation. */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [language, setLanguageState] = useState<AppLanguage>("pt-BR");
  const appliedQueryLanguageRef = useRef("");
  const queryLanguage = useMemo(
    () => searchParams.get("lang") || searchParams.get("language") || "",
    [searchParams]
  );

  useEffect(() => {
    const next = readStoredLanguage();
    setLanguageState(next);
    persistLanguage(next);
  }, []);

  useEffect(() => {
    const querySignature = String(queryLanguage || "").trim().toLowerCase();
    if (!querySignature) {
      appliedQueryLanguageRef.current = "";
      return;
    }
    if (appliedQueryLanguageRef.current === querySignature) return;

    appliedQueryLanguageRef.current = querySignature;
    const next = normalizeLanguage(queryLanguage);
    setLanguageState(next);
    persistLanguage(next);
  }, [queryLanguage]);

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    persistLanguage(next);
  };

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    setLanguage,
    toggleLanguage: () => setLanguage(language === "en" ? "pt-BR" : "en"),
    t: (key, replacements = {}) => {
      const template = dictionaries[language][key] || dictionaries.en[key] || key;
      return Object.entries(replacements).reduce(
        (text, [name, value]) => text.replaceAll(`{{${name}}}`, value),
        template
      );
    },
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Hook returning { language, setLanguage, toggleLanguage, t } — must be used inside LanguageProvider. */
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
