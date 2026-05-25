// src/components/welcome-screen.tsx

"use client";

import { Lock } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export function WelcomeScreen() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center border-b-4 border-tts-gold bg-tts-bg px-6 py-10 text-center sm:px-8">
      <div className="mb-8 w-full max-w-[320px] sm:max-w-none">
        <div className="relative mx-auto mb-8 h-40 w-40 overflow-hidden rounded-2xl border border-tts-border bg-tts-surface sm:h-56 sm:w-56">
          <img
            src="/talktostellar.png"
            alt="TalkToStellar"
            className="h-full w-full object-contain p-8"
          />
        </div>
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
