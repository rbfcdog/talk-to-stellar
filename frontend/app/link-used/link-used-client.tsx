"use client"

import { useSearchParams } from "next/navigation"
import { OperationalCard, OperationalPage, StatusPill } from "@/components/layout/OperationalShell"

export default function LinkUsedClient() {
  const searchParams = useSearchParams()
  const rawMessage = String(searchParams.get("message") || "").trim()
  const message = rawMessage || "Este link expirou ou ja foi usado. Por seguranca, os detalhes da operacao nao ficam mais disponiveis."

  return (
    <OperationalPage size="sm" frameClassName="flex min-h-screen items-center">
        <OperationalCard className="w-full border-tts-error/25 p-8">
          <StatusPill tone="error">Link indisponível</StatusPill>
          <h1 className="mt-3 text-3xl font-semibold text-tts-deep">Link expirado ou já usado</h1>
          <p className="mt-4 text-sm text-tts-deep">{message}</p>
        </OperationalCard>
    </OperationalPage>
  )
}
