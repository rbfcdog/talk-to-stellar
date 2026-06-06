"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { safeLocalStorage } from "@/lib/browser-storage";
import { currentClientSessionScope } from "@/lib/session";

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
    language_switch_to_portuguese: "Switch to Portuguese",
    theme_label: "Theme",
    theme_switch_to_dark: "Switch to dark mode",
    theme_switch_to_light: "Switch to light mode",
    theme_dark_short: "Dark",
    theme_light_short: "Light",
    chat_agent_welcome:
      "Hi, this is TalkToStellar.\n\nI can help with contacts, balance, PIX, sending, payment links, conversions, applications, best route, history and PIN.\n\nExamples:\n1. contacts\n2. balance\n3. add 10 reais with PIX\n4. convert 500 reais to dollars\n5. apply 200 dollars\n\nIf you are not signed in yet, send “login” and I will create a secure access link.",
    chat_search_placeholder: "Search account contacts...",
    chat_sidebar_preview: "Hi. I can help with contacts, balance, PIX, conversion, sending, applications, and history.",
    chat_input_placeholder: "Type: convert 500 reais to dollars, apply dollars, or withdraw to PIX",
    chat_wait_session: "Give me a moment while I start the session...",
    chat_api_error: "I could not connect to the service right now. Try again in a few seconds.",
    chat_no_response: "No response received",
    chat_online: "online",
    chat_link_payment: "Open payment confirmation",
    chat_link_conversion: "Open conversion confirmation",
    chat_link_convert: "Open conversion screen",
    chat_link_yield: "Open earnings",
    chat_link_money_cycle: "Open PIX flow",
    chat_link_account: "Create or sign in",
    chat_link_pin: "Reset PIN",
    chat_link_pay_anyone: "Open payment link",
    chat_link_claim: "Claim payment",
    chat_link_pix: "Open PIX",
    chat_link_profile: "Open profile",
    chat_link_balance: "Open balance",
    chat_link_history: "Open history",
    chat_link_external_send: "Open external transfer",
    chat_link_whatsapp: "Share on WhatsApp",
    chat_link_generic: "Open link",
    welcome_select:
      'Select TalkToStellar in the sidebar. Start with: 1) "contacts", 2) "balance", 3) "deposit 150 reais with PIX", 4) "convert 500 reais to dollars", 5) "apply 200 dollars".',
    welcome_protected: "Your conversations stay protected while you use your account.",
    login_title: "Sign in to your account",
    login_subtitle:
      "Sign in to continue where you left off. Next after login: balance, PIX money in/out, conversions, applications, and payments.",
    login_channel_detected: "Channel detected",
    login_identifier: "Identifier",
    login_expired: "Your session expired. Sign in again to continue.",
    login_pin_card_title: "PIN",
    login_pin_card_body: "The fastest way to sign in and continue.",
    login_next_card_title: "After login",
    login_next_card_body: "Go back to the chat and ask for contacts, balance, PIX, conversion, application, or money out.",
    login_via: "Signing in with",
    login_telegram_id: "Telegram ID",
    login_telegram_help: "Enter your PIN to sign in to the account linked to this Telegram.",
    login_linked_account: "Linked account",
    login_pin_only_title: "Only PIN is needed",
    login_pin_only_help: "This {{provider}} is already linked. Enter your PIN to continue.",
    login_email: "Email",
    login_pin: "PIN",
    login_pin_placeholder: "Enter your PIN",
    login_forgot_pin: "Forgot PIN?",
    login_forgot_pin_sending: "Sending...",
    login_forgot_pin_sent: "If the account exists, we sent the PIN setup link by email.",
    login_forgot_pin_need_email: "Enter your email first so we can send the PIN setup link.",
    login_forgot_pin_error: "Could not send the PIN setup email right now.",
    login_submit: "1) Sign in with PIN",
    login_submitting: "Signing in...",
    login_passkey_submit: "Sign in with Passkey (optional)",
    login_passkey_loading: "Opening biometrics...",
    login_passkey_qr_title: "Sign in with Passkey on your phone",
    login_passkey_qr_body: "Scan to use Passkey on your phone. The phone shows a code to enter on this computer.",
    login_passkey_qr_alt: "QR Code to generate a Passkey login code on phone",
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
    hero_title_1: "TalkToStellar.",
    hero_title_2: "Money In. Apply. Out.",
    hero_subtitle:
      "A conversational account for adding, converting, applying, and withdrawing through the channels people already use every day.",
    hero_card_1_title: "Start from chat",
    hero_card_1_body: "Ask for contacts, balance, PIX, payment, conversion, application, or withdrawal without downloading a new app.",
    hero_card_2_title: "Confirm with clarity",
    hero_card_2_body:
      "The platform compares routes in real time to use the most optimized path, reduce effective cost across R$ and US$, and show fees before confirmation.",
    nav_solution: "Solution",
    nav_simulator: "Conversion Simulator",
    nav_how: "How It Works",
    pix_add_title: "Add money with PIX",
    pix_send_title: "Send money to your PIX",
    pix_add_subtitle: "Use integrated PIX, confirm with your PIN, and receive the balance in your account.",
    pix_transfer_subtitle: "Use integrated PIX, confirm with your PIN, and automatically send to {{recipient}}.",
    pix_off_subtitle: "Confirm with your PIN to send balance to your PIX in reais.",
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
    language_switch_to_english: "Mudar para inglês",
    theme_label: "Tema",
    theme_switch_to_dark: "Mudar para tema escuro",
    theme_switch_to_light: "Mudar para tema claro",
    theme_dark_short: "Escuro",
    theme_light_short: "Claro",
    chat_agent_welcome:
      "Olá, aqui é o TalkToStellar.\n\nPosso ajudar com contatos, saldo, PIX, envio, link de pagamento, conversões, aplicações, melhor rota, histórico e PIN.\n\nExemplos:\n1. contatos\n2. saldo\n3. colocar 10 reais via PIX\n4. converter 500 reais para dólares\n5. aplicar 200 dólares\n\nSe ainda não entrou, mande “login” e eu gero um link seguro de acesso.",
    chat_search_placeholder: "Buscar contatos da conta...",
    chat_sidebar_preview: "Oi. Posso ajudar com contatos, saldo, PIX, conversão, envio, aplicação e histórico.",
    chat_input_placeholder: "Digite: converter 500 reais para dólares, aplicar dólares ou retirar para PIX",
    chat_wait_session: "Só um momento enquanto inicio a sessão...",
    chat_api_error: "Não consegui conectar ao serviço agora. Tente novamente em alguns segundos.",
    chat_no_response: "Nenhuma resposta recebida",
    chat_online: "online",
    chat_link_payment: "Abrir confirmação de pagamento",
    chat_link_conversion: "Abrir confirmação de conversão",
    chat_link_convert: "Abrir tela de conversão",
    chat_link_yield: "Abrir rendimentos",
    chat_link_money_cycle: "Abrir fluxo PIX",
    chat_link_account: "Criar conta ou entrar",
    chat_link_pin: "Redefinir PIN",
    chat_link_pay_anyone: "Abrir link de pagamento",
    chat_link_claim: "Receber pagamento",
    chat_link_pix: "Abrir PIX",
    chat_link_profile: "Abrir perfil",
    chat_link_balance: "Abrir saldo",
    chat_link_history: "Abrir histórico",
    chat_link_external_send: "Abrir envio externo",
    chat_link_whatsapp: "Compartilhar no WhatsApp",
    chat_link_generic: "Abrir link",
    welcome_select:
      'Selecione TalkToStellar na lateral. Comece com: 1) "contatos", 2) "saldo", 3) "colocar 150 reais com PIX", 4) "converter 500 reais para dólares", 5) "aplicar 200 dólares".',
    welcome_protected: "Suas conversas ficam protegidas enquanto você usa sua conta.",
    login_title: "Entre na sua conta",
    login_subtitle:
      "Entre para continuar de onde parou. Depois do login: saldo, PIX entrando/saindo, conversões, aplicações e pagamentos.",
    login_channel_detected: "Canal detectado",
    login_identifier: "Identificador",
    login_expired: "Sua sessão expirou. Entre novamente para continuar.",
    login_pin_card_title: "PIN",
    login_pin_card_body: "O jeito mais rápido de entrar e continuar.",
    login_next_card_title: "Depois do login",
    login_next_card_body: "Volte ao chat e peça contatos, saldo, PIX, conversão, aplicação ou saída.",
    login_via: "Entrando via",
    login_telegram_id: "ID do Telegram",
    login_telegram_help: "Digite seu PIN para entrar na conta vinculada a este Telegram.",
    login_linked_account: "Conta vinculada",
    login_pin_only_title: "Só precisa do PIN",
    login_pin_only_help: "Este {{provider}} já está vinculado. Digite seu PIN para continuar.",
    login_email: "E-mail",
    login_pin: "PIN",
    login_pin_placeholder: "Digite seu PIN",
    login_forgot_pin: "Esqueci o PIN",
    login_forgot_pin_sending: "Enviando...",
    login_forgot_pin_sent: "Se a conta existir, enviamos o link de configuração do PIN por e-mail.",
    login_forgot_pin_need_email: "Informe seu e-mail primeiro para enviarmos o link de configuração do PIN.",
    login_forgot_pin_error: "Não consegui enviar o e-mail de configuração do PIN agora.",
    login_submit: "1) Entrar com PIN",
    login_submitting: "Entrando...",
    login_passkey_submit: "Entrar com Passkey (opcional)",
    login_passkey_loading: "Abrindo biometria...",
    login_passkey_qr_title: "Entrar com Passkey no celular",
    login_passkey_qr_body: "Escaneie para usar a Passkey no celular. O celular mostra um código para digitar neste computador.",
    login_passkey_qr_alt: "QR Code para gerar código de login com Passkey no celular",
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
    hero_title_1: "TalkToStellar.",
    hero_title_2: "PIX. Aplicação. Saída.",
    hero_subtitle:
      "Uma conta conversacional para colocar, converter, aplicar e retirar dinheiro pelos canais que a pessoa já usa todos os dias.",
    hero_card_1_title: "Comece pelo chat",
    hero_card_1_body: "Peça contatos, saldo, PIX, pagamento, conversão, aplicação ou retirada sem baixar um novo app.",
    hero_card_2_title: "Confirme com clareza",
    hero_card_2_body:
      "A plataforma compara rotas em tempo real para usar a forma mais otimizada, reduzir o custo efetivo em R$ e US$ e mostrar a taxa antes da confirmação.",
    nav_solution: "Solução",
    nav_simulator: "Simulador de Conversão",
    nav_how: "Como Funciona",
    pix_add_title: "Colocar dinheiro com PIX",
    pix_send_title: "Enviar dinheiro para seu PIX",
    pix_add_subtitle: "Use PIX integrado, confirme com seu PIN e receba saldo na conta.",
    pix_transfer_subtitle: "Use PIX integrado, confirme com seu PIN e envie automaticamente para {{recipient}}.",
    pix_off_subtitle: "Confirme com seu PIN para enviar saldo em reais para seu PIX.",
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
  const stored = safeLocalStorage.get(STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]*)`));
  if (cookieMatch?.[1]) return normalizeLanguage(decodeURIComponent(cookieMatch[1]));
  return normalizeLanguage(window.navigator?.language || "pt-BR");
}

function persistLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;
  safeLocalStorage.set(STORAGE_KEY, language);
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(language)}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = language === "pt-BR" ? "pt-BR" : "en";
}

function syncLanguagePreference(language: AppLanguage) {
  if (typeof window === "undefined") return;
  const source = currentClientSessionScope();
  fetch("/api/chat/language", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      language,
      source,
      metadata: { source, language },
    }),
    cache: "no-store",
  }).catch(() => {});
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
    syncLanguagePreference(next);
  }, [queryLanguage]);

  const setLanguage = (next: AppLanguage) => {
    setLanguageState(next);
    persistLanguage(next);
    syncLanguagePreference(next);
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
