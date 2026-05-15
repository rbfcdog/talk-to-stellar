// src/components/welcome-screen.tsx

"use client";

import { Lock } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export function WelcomeScreen() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center border-b-8 border-[#00a884] bg-[#222e35] px-6 py-10 text-center sm:px-8">
      <div className="mb-8 w-full max-w-[320px] sm:max-w-none">
        <div className="relative mx-auto mb-8 h-56 w-56 sm:h-80 sm:w-80">
          <img
            src="/whatsapp-web-welcome-illustration.jpg"
            alt="WhatsDap"
            className="w-full h-full object-contain opacity-95"
          />
        </div>
      </div>

      <h1 className="mb-7 text-[28px] font-light tracking-wide text-[#e9edef] sm:text-[32px]">
        WhatsDap
      </h1>

      <p className="mb-8 max-w-md text-[14px] leading-[1.5] text-[#8696a0]">
        {t("welcome_select")}
      </p>

      <div className="mb-8 flex items-center gap-1 text-[14px] text-[#8696a0]">
        <Lock className="h-4 w-4" />
        <span>{t("welcome_protected")}</span>
      </div>
    </div>
  );
}
