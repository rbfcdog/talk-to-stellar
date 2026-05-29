"use client";

import { AlertTriangle, CheckCircle2, Loader2, LogIn, WalletCards } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type AccountStatusState = "loading" | "connected" | "expired" | "signed-out" | "unknown";

type AccountStatusCardProps = {
  state: AccountStatusState;
  accountId?: string;
  title?: string;
  detail?: string;
  ctaHref?: string;
  ctaLabel?: string;
  compact?: boolean;
  className?: string;
};

function shortAccount(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 16) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-5)}`;
}

export function AccountStatusCard({
  state,
  accountId,
  title,
  detail,
  ctaHref,
  ctaLabel,
  compact = false,
  className,
}: AccountStatusCardProps) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => (language === "pt-BR" ? pt : en);
  const copy = {
    loading: {
      title: L("Carregando conta", "Loading account"),
      detail: L("Conferindo sua sessão antes de mostrar saldos.", "Checking your session before showing balances."),
      icon: <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />,
      tone: "border-tts-gold bg-tts-gold-bg text-tts-gold",
    },
    connected: {
      title: L("Conta conectada", "Account connected"),
      detail: L("Pronto para conferir saldos e confirmar operações.", "Ready to check balances and confirm operations."),
      icon: <CheckCircle2 className="h-5 w-5" aria-hidden="true" />,
      tone: "border-tts-confirm bg-tts-confirm/10 text-tts-confirm",
    },
    expired: {
      title: L("Sessão expirada", "Session expired"),
      detail: L("Entre novamente para continuar com segurança.", "Sign in again to continue securely."),
      icon: <AlertTriangle className="h-5 w-5" aria-hidden="true" />,
      tone: "border-tts-error bg-tts-error/10 text-tts-error",
    },
    "signed-out": {
      title: L("Precisa entrar", "Sign in needed"),
      detail: L("Entre para carregar saldos e confirmar operações.", "Sign in to load balances and confirm operations."),
      icon: <LogIn className="h-5 w-5" aria-hidden="true" />,
      tone: "border-tts-gold bg-tts-gold-bg text-tts-gold",
    },
    unknown: {
      title: L("Conta", "Account"),
      detail: L("Atualize para conferir o estado da sessão.", "Refresh to check session status."),
      icon: <WalletCards className="h-5 w-5" aria-hidden="true" />,
      tone: "border-tts-border bg-tts-bg text-tts-muted",
    },
  }[state];

  return (
    <div className={cn("border border-tts-border bg-tts-surface p-4", compact && "p-3", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center border", copy.tone)}>
          {copy.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-tts-muted">
            {L("Sua conta", "Your account")}
          </p>
          <p className="mt-1 text-base font-black text-tts-deep">{title || copy.title}</p>
          <p className="mt-1 text-xs leading-5 text-tts-muted">{detail || copy.detail}</p>
          {accountId ? (
            <p className="mt-2 truncate font-mono-financial text-xs font-bold text-tts-gold">
              {L("ID da conta", "Account ID")}: {shortAccount(accountId)}
            </p>
          ) : null}
          {ctaHref && state !== "connected" ? (
            <a
              href={ctaHref}
              className="mt-3 inline-flex min-h-9 items-center justify-center bg-tts-deep px-3 py-2 text-xs font-black text-tts-surface transition hover:bg-tts-deep2"
            >
              {ctaLabel || L("Entrar", "Sign in")}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
