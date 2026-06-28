"use client"

import { useSearchParams } from "next/navigation"
import { OperationalCard, OperationalPage, StatusPill } from "@/components/layout/OperationalShell"

export default function LinkUsedClient() {
  const searchParams = useSearchParams()
  const state = searchParams.get("state")
  const completed = state === "completed" || searchParams.get("completed") === "1"
  const transient = state === "transient"
  const rawMessage = String(searchParams.get("message") || "").trim()

  const message = rawMessage || (completed
    ? "This operation was already completed. The receipt was sent in chat and saved in history."
    : transient
      ? "Não conseguimos abrir este link agora (instabilidade momentânea). O link continua válido — tente novamente em instantes."
      : "Este link expirou ou já foi usado. Por segurança, os detalhes da operação não ficam mais disponíveis.")

  const tone = completed ? "confirm" : transient ? "default" : "error"
  const pill = completed ? "Completed" : transient ? "Tente novamente" : "Link indisponível"
  const title = completed
    ? "Operation already completed"
    : transient
      ? "Falha momentânea ao abrir o link"
      : "Link expirado ou já usado"
  const border = completed ? "border-tts-confirm/25" : transient ? "border-tts-border" : "border-tts-error/25"

  return (
    <OperationalPage size="sm" frameClassName="flex min-h-screen items-center">
        <OperationalCard className={`w-full p-8 ${border}`}>
          <StatusPill tone={tone as "confirm" | "default" | "error"}>{pill}</StatusPill>
          <h1 className="mt-3 text-3xl font-semibold text-tts-deep">{title}</h1>
          <p className="mt-4 text-sm text-tts-deep">{message}</p>
          {transient && (
            <button
              type="button"
              onClick={() => {
                if (typeof window === "undefined") return
                const retry = searchParams.get("retry")
                window.location.href = retry && retry.startsWith("/r/") ? retry : window.location.href
              }}
              className="mt-6 inline-flex items-center justify-center rounded-lg bg-tts-deep px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              Tentar novamente
            </button>
          )}
        </OperationalCard>
    </OperationalPage>
  )
}
