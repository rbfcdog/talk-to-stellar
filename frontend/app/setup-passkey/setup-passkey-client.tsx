"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from "@simplewebauthn/browser"
import { Fingerprint, KeyRound } from "lucide-react"
import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/lib/i18n"

function isPasskeyChallengeExpiredMessage(message?: string) {
  const normalized = String(message || "").toLowerCase()
  return normalized.includes("challenge expired") || normalized.includes("passkey challenge expired")
}

function passkeyErrorMessage(error: unknown) {
  const name = String((error as any)?.name || "")
  const message = error instanceof Error ? error.message : String(error || "")
  const normalized = message.toLowerCase()

  if (name === "NotAllowedError") return "Biometric confirmation expired or was canceled. Tap the button and try again."
  if (name === "SecurityError" || normalized.includes("rp id")) return "Biometrics must open on the correct HTTPS domain."
  if (name === "AbortError" || name === "TimeoutError" || normalized.includes("timeout")) return "Biometric confirmation expired. Tap the button and try again."
  return message || "Could not enable biometrics."
}

export default function SetupPasskeyClient() {
  const { language } = useLanguage()
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"idle" | "preparing" | "registering" | "done" | "error">("idle")
  const [message, setMessage] = useState("")
  const [pin, setPin] = useState("")
  const userId = useMemo(() => String(searchParams.get("user_id") || searchParams.get("userId") || "").trim(), [searchParams])
  const email = useMemo(() => String(searchParams.get("email") || "").trim(), [searchParams])
  const source = useMemo(() => String(searchParams.get("source") || searchParams.get("session_scope") || searchParams.get("sessionSource") || "").trim(), [searchParams])
  const provider = useMemo(() => String(searchParams.get("provider") || source || "").trim(), [searchParams, source])
  const providerUserId = useMemo(() => String(searchParams.get("provider_user_id") || searchParams.get("providerUserId") || "").trim(), [searchParams])
  const mode = useMemo(() => String(searchParams.get("mode") || "").trim(), [searchParams])
  const nextPath = useMemo(() => {
    const raw = String(searchParams.get("next") || "/chat").trim()
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/chat"
  }, [searchParams])
  const disabled = status === "preparing" || status === "registering" || status === "done"
  const cleanedPin = pin.replace(/\D/g, "").slice(0, 8)
  const pinReady = /^\d{4,8}$/.test(cleanedPin)

  async function enablePasskey(attempt = 0) {
    if (!pinReady) {
      setStatus("error")
      setMessage(L("Digite seu PIN de 4 a 8 dígitos antes de ativar biometria.", "Enter your 4 to 8 digit PIN before enabling biometrics."))
      return
    }

    setStatus("preparing")
    setMessage("")

    try {
      if (!browserSupportsWebAuthn()) {
        throw new Error(L("Este navegador não suporta Passkey.", "This browser does not support Passkey."))
      }
      const available = await platformAuthenticatorIsAvailable().catch(() => false)
      if (!available) {
        throw new Error(L("Este aparelho não liberou biometria agora.", "This device did not make biometrics available right now."))
      }

      const initResponse = await fetch("/api/passkeys/register-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId || undefined,
          email: email || undefined,
          pin: cleanedPin,
          source: source || undefined,
          session_scope: source || undefined,
          provider: provider || undefined,
          provider_user_id: providerUserId || undefined,
        }),
      })
      const initPayload = await initResponse.json().catch(() => ({}))
      if (!initResponse.ok || !initPayload?.success || !initPayload?.options || !initPayload?.challengeId) {
        throw new Error(initPayload?.message || L("Abra um link de biometria novo para continuar.", "Open a fresh biometrics link to continue."))
      }

      setStatus("registering")
      const credential = await startRegistration({ optionsJSON: initPayload.options })
      const completeResponse = await fetch("/api/passkeys/register-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: initPayload.userId || userId || undefined,
          email: email || undefined,
          challenge_id: initPayload.challengeId,
          credential,
          source: source || undefined,
          session_scope: source || undefined,
          provider: provider || undefined,
          provider_user_id: providerUserId || undefined,
        }),
      })
      const completePayload = await completeResponse.json().catch(() => ({}))
      if (!completeResponse.ok || !completePayload?.success) {
        const serverMessage = String(completePayload?.message || "")
        if (attempt < 1 && isPasskeyChallengeExpiredMessage(serverMessage)) {
          await enablePasskey(attempt + 1)
          return
        }
        throw new Error(serverMessage || L("Não consegui concluir a biometria.", "Could not finish biometrics."))
      }

      setStatus("done")
      setMessage(L("Biometria ativada nesta conta.", "Biometrics enabled for this account."))
      window.setTimeout(() => router.replace(nextPath), 1000)
    } catch (error) {
      const text = passkeyErrorMessage(error)
      if (attempt < 1 && isPasskeyChallengeExpiredMessage(text)) {
        await enablePasskey(attempt + 1)
        return
      }
      setStatus("error")
      setMessage(text)
    }
  }

  return (
    <AuthShell
      title={L("Ativar biometria", "Enable Biometrics")}
      description={L(
        mode === "agent"
          ? "Digite seu PIN e confirme neste celular para ativar a biometria da sua conta."
          : "Digite seu PIN e confirme neste celular para concluir a Passkey da conta.",
        mode === "agent"
          ? "Enter your PIN and confirm on this phone to enable biometrics for your account."
          : "Enter your PIN and confirm on this phone to finish the account Passkey.",
      )}
    >
      <label className="space-y-2 text-sm font-medium text-tts-deep">
        <span className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-tts-gold" />
          {L("PIN da conta", "Account PIN")}
        </span>
        <input
          value={cleanedPin}
          onChange={(event) => {
            setPin(event.target.value.replace(/\D/g, "").slice(0, 8))
            if (status === "error") setMessage("")
          }}
          inputMode="numeric"
          autoComplete="current-password"
          type="password"
          maxLength={8}
          disabled={disabled}
          className="w-full rounded-lg border border-tts-border bg-tts-bg px-4 py-3 text-center text-lg font-semibold tracking-[0.35em] text-tts-deep outline-none transition focus:border-tts-gold focus:ring-2 focus:ring-tts-gold/20 disabled:opacity-60"
          placeholder="1234"
        />
      </label>

      <Button type="button" size="lg" className="w-full" disabled={disabled} onClick={() => { void enablePasskey() }}>
        <Fingerprint className="mr-2 h-4 w-4" />
        {status === "preparing"
          ? L("Preparando...", "Preparing...")
          : status === "registering"
            ? L("Abrindo biometria...", "Opening biometrics...")
            : status === "done"
              ? L("Biometria ativada", "Biometrics enabled")
              : L("Ativar neste celular", "Enable on this phone")}
      </Button>

      {message && (
        <p className={`text-center text-xs ${status === "error" ? "text-tts-error" : "text-tts-confirm"}`}>
          {message}
        </p>
      )}

      <Button type="button" variant="ghost" className="w-full" onClick={() => router.replace(nextPath)}>
        {L("Continuar sem biometria", "Continue without biometrics")}
      </Button>
    </AuthShell>
  )
}
