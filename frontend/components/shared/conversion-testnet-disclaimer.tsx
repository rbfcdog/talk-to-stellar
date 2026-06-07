import { Info } from "lucide-react";
import type { AppLanguage } from "@/lib/i18n";

function copy(language: AppLanguage, pt: string, en: string) {
  return language === "pt-BR" ? pt : en;
}

export function ConversionTestnetDisclaimer({
  language,
  className = "",
  compact = false,
}: {
  language: AppLanguage;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border border-tts-border bg-tts-bg/70 text-tts-muted ${
        compact ? "px-3 py-2 text-[11px] leading-5" : "px-3 py-2.5 text-xs leading-5"
      } ${className}`}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tts-muted" aria-hidden="true" />
      <p className="font-semibold">
        {copy(
          language,
          "Ambiente de teste: conversões e cotações podem variar porque os ativos estão na testnet.",
          "Testnet environment: conversions and quotes may vary because these assets are on testnet."
        )}
      </p>
    </div>
  );
}
