"use client"

import { OperationalCard, OperationalPage, StatusPill } from "@/components/layout/OperationalShell"
import type { AppLanguage } from "@/lib/i18n"

type SecureLinkStateProps = {
  language: AppLanguage
  state?: "checking" | "expired"
  message?: string
}

function copy(language: AppLanguage, pt: string, en: string) {
  return language === "pt-BR" ? pt : en
}

export function SecureLinkState({
  language,
  state = "expired",
  message,
}: SecureLinkStateProps) {
  const checking = state === "checking"
  const title = checking
    ? copy(language, "Verificando link", "Checking link")
    : copy(language, "Link expirado ou já usado", "Link expired or already used")
  const body = message || (checking
    ? copy(language, "Estamos validando se este link ainda pode ser usado.", "We are checking whether this link can still be used.")
    : copy(
      language,
      "Por segurança, os detalhes desta operação não ficam disponíveis depois que o link expira ou é usado. Peça um novo link para continuar.",
      "For security, operation details are not available after a link expires or is used. Request a new link to continue.",
    ))

  return (
    <OperationalPage size="sm" centered>
      <OperationalCard className="w-full border-tts-error/25 p-8">
        <StatusPill tone={checking ? "default" : "error"}>
          {checking
            ? copy(language, "Validação segura", "Secure validation")
            : copy(language, "Link indisponível", "Link unavailable")}
        </StatusPill>
        <h1 className="mt-4 text-2xl font-semibold text-tts-deep sm:text-3xl">{title}</h1>
        <p className="mt-4 text-sm leading-6 text-tts-muted">{body}</p>
      </OperationalCard>
    </OperationalPage>
  )
}
