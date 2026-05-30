"use client";

import { Globe2, LogOut, Moon, Sun } from "lucide-react";
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
  const isChatPage = pathname === "/chat" || pathname?.startsWith("/chat/");
  const isLandingPage = pathname === "/";

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === "dark" : false;
  const nextTheme = isDark ? "light" : "dark";
  const languageLabel = language === "en" ? "PT" : "EN";
  const languageTitle =
    language === "en" ? t("language_switch_to_portuguese") : t("language_switch_to_english");
  const themeTitle = isDark ? t("theme_switch_to_light") : t("theme_switch_to_dark");
  const themeLabel = isDark ? t("theme_light_short") : t("theme_dark_short");

  return (
    <div
      className={`fixed right-2 z-[100] inline-flex items-center gap-1 rounded-full border border-tts-border bg-tts-surface/95 p-1 text-tts-deep shadow-lg shadow-black/10 backdrop-blur transition sm:right-3 ${
        isChatPage || isLandingPage ? "top-[4.25rem]" : "top-2 sm:top-3"
      }`}
    >
      <button
        type="button"
        onClick={toggleLanguage}
        className="inline-flex h-8 min-w-12 items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-bold leading-none text-tts-deep transition hover:bg-tts-bg focus:outline-none focus:ring-2 focus:ring-tts-gold"
        aria-label={languageTitle}
        title={languageTitle}
      >
        <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{languageLabel}</span>
      </button>
      <span className="h-4 w-px bg-tts-border" aria-hidden="true" />
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        className="inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-bold leading-none text-tts-deep transition hover:bg-tts-bg focus:outline-none focus:ring-2 focus:ring-tts-gold"
        aria-label={themeTitle}
        aria-pressed={isDark}
        title={themeTitle}
      >
        {isDark ? <Sun className="h-3.5 w-3.5" aria-hidden="true" /> : <Moon className="h-3.5 w-3.5" aria-hidden="true" />}
        <span>{themeLabel}</span>
      </button>
      <span className="h-4 w-px bg-tts-border" aria-hidden="true" />
      <Link
        href="/logout"
        className="inline-flex h-8 min-w-10 items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-bold leading-none text-tts-deep transition hover:bg-tts-error/10 hover:text-tts-error focus:outline-none focus:ring-2 focus:ring-tts-gold"
        aria-label={t("language_switch_to_portuguese") || "Sair"}
        title={language === "pt-BR" ? "Sair" : "Logout"}
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{language === "pt-BR" ? "Sair" : "Logout"}</span>
      </Link>
    </div>
  );
}
