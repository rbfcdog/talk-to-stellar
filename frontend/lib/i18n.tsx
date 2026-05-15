"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export type AppLanguage = "pt-BR" | "en";

const STORAGE_KEY = "talk-to-stellar.language";
const COOKIE_KEY = "tts_lang";

export function normalizeLanguage(value: unknown): AppLanguage {
  return "en";
}

type Dictionary = Record<string, string>;

const englishDictionary: Dictionary = {
    language_button: "English",
    language_label: "Language",
    language_current: "English",
    chat_agent_welcome:
      "Sign in to get started. After that I can help you check your balance, add money with PIX, send money to your PIX, pay contacts, or convert funds. If you have not signed in yet, tap Sign in/Create account.",
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

const dictionaries: Record<AppLanguage, Dictionary> = {
  "pt-BR": englishDictionary,
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
  return "en";
}

function persistLanguage(language: AppLanguage) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, language);
  document.cookie = `${COOKIE_KEY}=${language}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = "en";
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
    toggleLanguage: () => setLanguage("en"),
    t: (key, replacements = {}) => {
      const template = dictionaries[language][key] || dictionaries["pt-BR"][key] || key;
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
