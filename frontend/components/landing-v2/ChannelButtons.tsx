import React from "react";
import { MessageCircle, Send, Monitor } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

type ChannelButtonsProps = {
  compact?: boolean;
  className?: string;
};

const WHATSAPP_NUMBER = "5519981808102";
const WHATSAPP_MESSAGE = "Oi, quero usar o TalkToStellar.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

export default function ChannelButtons({ compact = false, className = "" }: ChannelButtonsProps) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const baseSize = compact ? "px-3 py-2 text-xs" : "px-6 py-4 text-base";
  const iconSize = compact ? "h-4 w-4" : "h-5 w-5";
  const webLabel = compact ? L("Chat web", "Web chat") : L("Abrir chat web", "Open web chat");

  return (
    <div className={`flex flex-col sm:flex-row min-w-0 gap-3 ${className}`.trim()}>
      <a
        href="https://t.me/TalkToStellarTelegramBot"
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#229ED9]/10 border border-[#229ED9]/30 ${baseSize} font-semibold text-white transition hover:bg-[#229ED9]/20`}
      >
        <Send className={`${iconSize} text-[#229ED9]`} />
        <span>Telegram</span>
      </a>

      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 ${baseSize} font-semibold text-white transition hover:bg-[#25D366]/20`}
      >
        <MessageCircle className={`${iconSize} text-[#25D366]`} />
        <span>WhatsApp</span>
      </a>

      <a
        href="/chat"
        className={`inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#00D2FF] ${baseSize} font-semibold text-slate-950 transition hover:bg-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.45)]`}
      >
        <Monitor className={iconSize} />
        <span>{webLabel}</span>
      </a>
    </div>
  );
}
