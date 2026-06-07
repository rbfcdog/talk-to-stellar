"use client";

import { Eye, EyeOff, Globe2, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const isChatPage = pathname === "/chat" || pathname?.startsWith("/chat/");
  const isLandingPage = pathname === "/";

  useEffect(() => {
    setMounted(true);
    try {
      setHideAmounts(window.localStorage.getItem("talk-to-stellar.hideAmounts") === "true");
    } catch {
      setHideAmounts(false);
    }
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : false;
  const nextTheme = isDark ? "light" : "dark";
  const languageLabel = language === "en" ? "PT" : "EN";
  const languageTitle =
    language === "en" ? t("language_switch_to_portuguese") : t("language_switch_to_english");
  const themeTitle = isDark ? t("theme_switch_to_light") : t("theme_switch_to_dark");
  const themeLabel = isDark ? t("theme_light_short") : t("theme_dark_short");
  const logoutTitle = language === "pt-BR" ? "Sair" : "Logout";
  const privacyTitle = hideAmounts
    ? (language === "pt-BR" ? "Mostrar valores" : "Show values")
    : (language === "pt-BR" ? "Ocultar valores" : "Hide values");
  const privacyLabel = hideAmounts
    ? (language === "pt-BR" ? "Mostrar" : "Show")
    : (language === "pt-BR" ? "Ocultar" : "Hide");

  function toggleAmountPrivacy() {
    const next = !hideAmounts;
    setHideAmounts(next);
    try {
      window.localStorage.setItem("talk-to-stellar.hideAmounts", String(next));
      document.cookie = `tts_hide_amounts=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Preference still syncs to the backend when storage is unavailable.
    }
    fetch("/api/chat/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hide_amounts: next,
        language,
        source: "web",
        metadata: { source: "web", language },
      }),
    }).catch(() => undefined);
  }

  if (isLandingPage) return null;

  return (
    <div
      className={`fixed right-2 z-[100] inline-flex items-center gap-1 rounded-lg border border-tts-border bg-tts-surface/95 p-1 text-tts-deep shadow-md shadow-black/10 backdrop-blur transition sm:right-3 ${
        isChatPage || isLandingPage ? "top-[4.25rem]" : "top-2 sm:top-3"
      }`}
    >
      <button
        type="button"
        onClick={toggleLanguage}
        className="tts-pressable inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-md px-0 text-[11px] font-bold leading-none text-tts-deep transition hover:bg-tts-bg focus:outline-none focus:ring-2 focus:ring-tts-gold sm:w-auto sm:min-w-12 sm:px-2"
        aria-label={languageTitle}
        title={languageTitle}
      >
        <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{languageLabel}</span>
      </button>
      <span className="h-4 w-px bg-tts-border" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        className="tts-pressable inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-md px-0 text-[11px] font-bold leading-none text-tts-deep transition hover:bg-tts-bg focus:outline-none focus:ring-2 focus:ring-tts-gold sm:w-auto sm:min-w-16 sm:px-2"
        aria-label={themeTitle}
        aria-pressed={isDark}
        title={themeTitle}
      >
        {isDark ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="hidden sm:inline">{themeLabel}</span>
      </button>
      <span className="h-4 w-px bg-tts-border" aria-hidden="true" />
      <button
        type="button"
        onClick={toggleAmountPrivacy}
        className="tts-pressable inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-md px-0 text-[11px] font-bold leading-none text-tts-deep transition hover:bg-tts-bg focus:outline-none focus:ring-2 focus:ring-tts-gold sm:w-auto sm:min-w-16 sm:px-2"
        aria-label={privacyTitle}
        aria-pressed={hideAmounts}
        title={privacyTitle}
      >
        {hideAmounts ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="hidden sm:inline">{privacyLabel}</span>
      </button>
      <span className="h-4 w-px bg-tts-border" aria-hidden="true" />
      <Link
        href="/logout"
        className="tts-pressable inline-flex h-8 w-8 items-center justify-center rounded-md text-tts-deep transition hover:bg-tts-error/10 hover:text-tts-error focus:outline-none focus:ring-2 focus:ring-tts-gold"
        aria-label={logoutTitle}
        title={logoutTitle}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
