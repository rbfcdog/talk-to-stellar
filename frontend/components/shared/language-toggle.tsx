"use client";

import { Globe2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();
  const pathname = usePathname();
  const isChatPage = pathname === "/chat" || pathname?.startsWith("/chat/");
  const isLanding = pathname === "/";

  if (isLanding) return null;

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`fixed right-2 z-[100] inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full border border-tts-deep bg-tts-deep px-2 text-[11px] font-bold leading-none text-tts-surface shadow-lg shadow-tts-deep/15 backdrop-blur transition hover:bg-tts-deep/90 focus:outline-none focus:ring-2 focus:ring-tts-gold sm:right-3 ${
        isChatPage ? "top-[4.25rem]" : "top-2 sm:top-3"
      }`}
      aria-label={`${t("language_label")}: ${t("language_current")}`}
      title={`${t("language_label")}: ${t("language_current")}`}
    >
      <Globe2 className="h-3.5 w-3.5" />
      <span>{language === "en" ? "EN" : "PT"}</span>
    </button>
  );
}
