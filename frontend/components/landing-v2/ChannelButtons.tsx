import React from "react";
import { MessageCircle, Send, Monitor } from "lucide-react";

type ChannelButtonsProps = {
  compact?: boolean;
  className?: string;
};

export default function ChannelButtons({ compact = false, className = "" }: ChannelButtonsProps) {
  const baseSize = compact ? "px-3 py-2 text-xs" : "px-6 py-4 text-base";
  const iconSize = compact ? "h-4 w-4" : "h-5 w-5";
  const webLabel = compact ? "Try in browser" : "Try now in browser";

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

      <button
        type="button"
        disabled
        className={`inline-flex flex-1 cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 ${baseSize} font-semibold text-white/70 opacity-70`}
      >
        <MessageCircle className={iconSize} />
        <span>WhatsApp (soon)</span>
      </button>

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
