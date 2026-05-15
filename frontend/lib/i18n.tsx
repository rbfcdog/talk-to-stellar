"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export type AppLanguage = "pt-BR" | "en";

const STORAGE_KEY = "talk-to-stellar.language";
const COOKIE_KEY = "tts_lang";

export function normalizeLanguage(value: unknown): AppLanguage {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "pt" || normalized === "pt-br" || normalized.startsWith("pt-") || normalized.includes("portugu")) {
    return "pt-BR";
  }
  return "en";
}

type Dictionary = Record<string, string>;

const englishDictionary: Dictionary = {
    language_button: "English",
    language_label: "Language",
    language_current: "English",
    chat_agent_welcome:
      "Sign in to get started. After that I can help you check your balance, add money with PIX, send money to your PIX, pay contacts, or convert funds. If you have not signed in yet, type here in the chat to sign in/create account.",
    chat_search_placeholder: "Search wallet contacts...",
    chat_sidebar_preview: "Hi. How can I help with your wallet, balance, and contacts today?",
    chat_input_placeholder: "Type: balance, add money with PIX, withdraw to PIX, or send to someone",
    chat_wait_session: "Give me a moment while I start the session...",
    chat_api_error: "API response failed",
    chat_no_response: "No response received",
    chat_error_prefix: "Sorry, something went wrong",
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
      'Select WhatsDap in the sidebar. Start with: 1) "balance", 2) "deposit 150 reais with PIX", 3) "send 100 reais to my PIX", 4) "send 200 dollars to Maria".',
    welcome_protected: "Your conversations stay protected while you use your wallet.",
    login_title: "Sign in to your account",
    login_subtitle:
      "Sign in to continue where you left off. Next after login: balance, contacts, PIX money in/out, and payments.",
    login_channel_detected: "Channel detected",
    login_identifier: "Identifier",
    login_expired: "Your session expired. Sign in again to continue.",
    login_pin_card_title: "PIN",
    login_pin_card_body: "The fastest way to sign in and continue.",
    login_via: "Signing in with",
    login_telegram_id: "Telegram ID",
    login_telegram_help: "Enter your PIN to sign in to the account linked to this Telegram.",
    login_email: "Email",
    login_pin: "PIN",
    login_pin_placeholder: "Enter your PIN",
    login_submit: "1) Sign in with PIN",
    login_submitting: "Signing in...",
    login_email_code: "Code sent by email",
    login_email_code_help: "Check your email and enter the code to continue.",
    login_confirm_submit: "Confirm sign-in",
    login_footer_help:
      'After signing in, use: "balance" to check your account, "deposit 150 reais with PIX" to add money, "send 100 reais to my PIX" to withdraw, and "send 10 dollars to [name]" to pay.',
    login_connected_channel: "{{provider}} connected",
    login_connected_account: "Account connected",
    login_linked_title: "Your account is linked.",
    login_continue_operation: "Continuing to the operation...",
    login_back_to_channel: "Go back to {{provider}} and send your next message.",
    login_done: "Sign-in complete.",
    login_opening_operation: "Opening the operation shortly.",
    hero_title_1: "Move money worldwide.",
    hero_title_2: "In one message.",
    hero_subtitle:
      "Send money, manage contacts, and use blockchain rails through natural language. From Telegram or WhatsApp, without bureaucracy.",
    hero_card_1_title: "Natural language",
    hero_card_1_body: "Use simple messages to simulate, transfer, and organize transactions.",
    hero_card_2_title: "Lower-fee conversion",
    hero_card_2_body:
      "The platform compares routes in real time to reduce effective cost in BRL and USDC, with fee transparency before confirmation.",
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
    language_button: "Português",
    language_label: "Idioma",
    language_current: "Português",
    chat_agent_welcome:
      "Entre para começar. Depois disso posso te ajudar a consultar saldo, colocar dinheiro com PIX, enviar dinheiro para seu PIX, pagar contatos ou converter saldo. Se ainda não entrou, digite aqui no chat para entrar/criar conta.",
    chat_search_placeholder: "Buscar contatos da carteira...",
    chat_sidebar_preview: "Oi. Como posso ajudar com sua carteira, saldo e contatos hoje?",
    chat_input_placeholder: "Digite: saldo, colocar dinheiro com PIX, retirar para PIX ou enviar para alguém",
    chat_wait_session: "Só um momento enquanto inicio a sessão...",
    chat_api_error: "A resposta da API falhou",
    chat_no_response: "Nenhuma resposta recebida",
    chat_error_prefix: "Desculpe, algo deu errado",
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
      'Selecione WhatsDap na lateral. Comece com: 1) "saldo", 2) "colocar 150 reais com PIX", 3) "enviar 100 reais para meu PIX", 4) "enviar 200 dólares para Maria".',
    welcome_protected: "Suas conversas ficam protegidas enquanto você usa sua carteira.",
    login_title: "Entre na sua conta",
    login_subtitle:
      "Entre para continuar de onde parou. Depois do login: saldo, contatos, PIX entrando/saindo e pagamentos.",
    login_channel_detected: "Canal detectado",
    login_identifier: "Identificador",
    login_expired: "Sua sessão expirou. Entre novamente para continuar.",
    login_pin_card_title: "PIN",
    login_pin_card_body: "O jeito mais rápido de entrar e continuar.",
    login_via: "Entrando via",
    login_telegram_id: "ID do Telegram",
    login_telegram_help: "Digite seu PIN para entrar na conta vinculada a este Telegram.",
    login_email: "E-mail",
    login_pin: "PIN",
    login_pin_placeholder: "Digite seu PIN",
    login_submit: "1) Entrar com PIN",
    login_submitting: "Entrando...",
    login_email_code: "Código enviado por e-mail",
    login_email_code_help: "Confira seu e-mail e digite o código para continuar.",
    login_confirm_submit: "Confirmar entrada",
    login_footer_help:
      'Depois de entrar, use: "saldo" para consultar sua conta, "colocar 150 reais com PIX" para adicionar dinheiro, "enviar 100 reais para meu PIX" para retirar e "enviar 10 dólares para [nome]" para pagar.',
    login_connected_channel: "{{provider}} conectado",
    login_connected_account: "Conta conectada",
    login_linked_title: "Sua conta foi vinculada.",
    login_continue_operation: "Continuando a operação...",
    login_back_to_channel: "Volte ao {{provider}} e envie sua próxima mensagem.",
    login_done: "Entrada concluída.",
    login_opening_operation: "Abrindo a operação em instantes.",
    hero_title_1: "Mova dinheiro pelo mundo.",
    hero_title_2: "Em uma mensagem.",
    hero_subtitle:
      "Envie dinheiro, gerencie contatos e use trilhos blockchain por linguagem natural. Pelo Telegram ou WhatsApp, sem burocracia.",
    hero_card_1_title: "Linguagem natural",
    hero_card_1_body: "Use mensagens simples para simular, transferir e organizar transações.",
    hero_card_2_title: "Conversão com taxas menores",
    hero_card_2_body:
      "A plataforma compara rotas em tempo real para reduzir o custo efetivo em BRL e USDC, com transparência de taxa antes da confirmação.",
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
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  if (cookieMatch?.[1]) return normalizeLanguage(decodeURIComponent(cookieMatch[1]));
  return "en";
}

function persistLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, language);
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(language)}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = language === "pt-BR" ? "pt-BR" : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    const next = readStoredLanguage();
    setLanguageState(next);
    persistLanguage(next);
  }, []);

  useEffect(() => {
    const queryLanguage = searchParams.get("lang") || searchParams.get("language");
    if (!queryLanguage) return;
    const next = normalizeLanguage(queryLanguage);
    setLanguageState(next);
    persistLanguage(next);
  }, [searchParams]);

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

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
