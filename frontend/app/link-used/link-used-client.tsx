"use client"

import { useSearchParams } from "next/navigation"
import { OperationalCard, OperationalPage, StatusPill } from "@/components/layout/OperationalShell"

export default function LinkUsedClient() {
  const searchParams = useSearchParams()
  const completed = searchParams.get("state") === "completed" || searchParams.get("completed") === "1"
  const rawMessage = String(searchParams.get("message") || "").trim()
  const message = rawMessage || (completed
    ? "This operation was already completed. The receipt was sent in chat and saved in history."
    : "Este link expirou ou já foi usado. Por segurança, os detalhes da operação não ficam mais disponíveis.")

  return (
    <OperationalPage size="sm" frameClassName="flex min-h-screen items-center">
        <OperationalCard className={`w-full p-8 ${completed ? "border-tts-confirm/25" : "border-tts-error/25"}`}>
          <StatusPill tone={completed ? "confirm" : "error"}>{completed ? "Completed" : "Link indisponível"}</StatusPill>
          <h1 className="mt-3 text-3xl font-semibold text-tts-deep">
            {completed ? "Operation already completed" : "Link expirado ou já usado"}
          </h1>
          <p className="mt-4 text-sm text-tts-deep">{message}</p>
        </OperationalCard>
    </OperationalPage>
  )
}
