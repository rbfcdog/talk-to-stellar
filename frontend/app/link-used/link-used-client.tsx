"use client"

import { useSearchParams } from "next/navigation"
import { OperationalCard, OperationalPage, StatusPill } from "@/components/layout/OperationalShell"

export default function LinkUsedClient() {
  const searchParams = useSearchParams()
  const rawMessage = String(searchParams.get("message") || "").trim()
  const message = rawMessage || "This link has already been used."

  return (
    <OperationalPage size="sm" frameClassName="flex min-h-screen items-center">
        <OperationalCard className="w-full border-tts-error/25 p-8">
          <StatusPill tone="error">Invalid link</StatusPill>
          <h1 className="mt-3 text-3xl font-semibold text-tts-deep">Link already used</h1>
          <p className="mt-4 text-sm text-tts-deep">{message}</p>
        </OperationalCard>
    </OperationalPage>
  )
}
