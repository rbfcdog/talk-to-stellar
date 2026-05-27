"use client";

import { MessageCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ReturnToChatProps = {
  prompt?: string;
  href?: string;
  label?: string;
  className?: string;
};

export function ReturnToChat({ prompt, href, label, className }: ReturnToChatProps) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => (language === "pt-BR" ? pt : en);
  const target = href || buildChatHref(prompt, language);

  return (
    <a
      href={target}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2",
        className
      )}
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      {label || L("Voltar ao chat", "Back to chat")}
    </a>
  );
}

function buildChatHref(prompt: string | undefined, language: string) {
  const params = new URLSearchParams();
  const text = String(prompt || "").trim();
  if (text) params.set("prompt", text);
  params.set("lang", language);
  const query = params.toString();
  return query ? `/chat?${query}` : "/chat";
}
