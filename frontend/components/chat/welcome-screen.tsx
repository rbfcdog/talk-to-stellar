// src/components/welcome-screen.tsx

"use client";

import { Lock } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { Logo } from "@/components/shared/logo";

export function WelcomeScreen() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-tts-bg px-6 py-10 text-center sm:px-8">
      <div className="mb-8 flex h-36 w-36 items-center justify-center rounded-2xl border border-tts-border bg-tts-surface text-tts-gold shadow-sm sm:h-44 sm:w-44">
        <Logo size={96} />
      </div>

      <h1 className="mb-4 text-2xl font-extrabold tracking-tight text-tts-deep sm:text-3xl">
        TalkToStellar
      </h1>

      <p className="mb-6 max-w-md text-sm leading-relaxed text-tts-muted">
        {t("welcome_select")}
      </p>

      <div className="flex items-center gap-1.5 font-mono-financial text-[11px] text-tts-muted">
        <Lock className="h-3.5 w-3.5" />
        <span>{t("welcome_protected")}</span>
      </div>
    </div>
  );
}
