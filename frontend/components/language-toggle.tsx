"use client";

import { Globe2 } from "lucide-react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();
  const pathname = usePathname();
  const isChatPage = pathname === "/chat" || pathname?.startsWith("/chat/");

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`fixed right-2 z-[100] inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full border border-white/15 bg-slate-950/85 px-2 text-[11px] font-bold leading-none text-white shadow-2xl backdrop-blur transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-300 sm:right-3 ${
        isChatPage ? "top-[4.25rem]" : "top-2 sm:top-3"
      }`}
      aria-label={`${t("language_label")}: ${t("language_current")}`}
      title={`${t("language_label")}: ${t("language_current")}`}
    >
      <Globe2 className="h-3.5 w-3.5" />
      <span>EN</span>
    </button>
  );
}
