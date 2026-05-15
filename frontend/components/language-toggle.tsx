"use client";

import { Globe2 } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="fixed right-3 top-3 z-[100] inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/80 px-3 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-300"
      aria-label={`${t("language_label")}: ${t("language_current")}`}
      title={`${t("language_label")}: ${t("language_current")}`}
    >
      <Globe2 className="h-4 w-4" />
      <span>{language === "en" ? "EN" : "PT"}</span>
      <span className="hidden sm:inline">{t("language_button")}</span>
    </button>
  );
}
