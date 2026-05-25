"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"
import { saveClientSession } from "@/lib/session"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { Fingerprint, LogIn, MessageCircle, Send } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

function generateBrowserId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function getPasskeyErrorMessage(error: any): string {
  const name = String(error?.name || "")
  const message = String(error?.message || error || "")
  const normalized = message.toLowerCase()

  if (name === "NotAllowedError") {
    return "Biometric authentication was canceled or expired. Tap \"Sign in with Passkey\" and confirm on your phone."
  }
  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "Passkey must open on the correct domain with HTTPS."
  }
  if (normalized.includes("registrationrequired")) {
    return "No Passkey is registered for this account yet. Sign in with PIN and enable biometrics during setup."
  }

  return message || "Could not sign in with Passkey."
}

function isPasskeyChallengeExpiredMessage(message?: string) {
  const normalized = String(message || "").toLowerCase()
  return (
    normalized.includes("passkey challenge expired") ||
    normalized.includes("challenge expired") ||
    normalized.includes("desafio expirado")
  )
}

function decodeJwtPayload(token: string): any {
  try {
    const payload = token.split(".")[1]
    if (!payload) return {}
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=")
    return JSON.parse(atob(padded))
  } catch {
    return {}
  }
}

function formatExternalIdentifier(provider: string, value: string): string {
  const normalizedProvider = String(provider || "").trim().toLowerCase()
  const raw = String(value || "").trim()
  if (!raw) return "unavailable"
  if (normalizedProvider === "whatsapp" || normalizedProvider === "phone") {
    const digits = raw.replace(/\D+/g, "")
    if (!digits) return raw
    if (digits.length <= 4) return digits
    return `+${digits.slice(0, Math.max(2, digits.length - 4))}****${digits.slice(-2)}`
  }
  return raw
}

const EMAIL_CONFIRMATION_ENABLED = process.env.NEXT_PUBLIC_ENABLE_EMAIL_CONFIRMATION === "true"
const PASSKEY_LOGIN_ENABLED = false

export default function LoginClient({ expired }: { expired?: boolean }) {
  const { language, t } = useLanguage()
  const searchParams = useSearchParams()
  const requestedAuthMethod = PASSKEY_LOGIN_ENABLED ? String(searchParams.get("auth") || "").trim().toLowerCase() : ""
  const emailFromQuery = String(searchParams.get("email") || "").trim()
  const rawNextPath = String(searchParams.get("next") || "").trim()
  const nextPath = rawNextPath && rawNextPath.startsWith("/") && !rawNextPath.startsWith("//")
    ? rawNextPath
    : ""
  const externalToken = searchParams.get("token") || ""
  const externalPayload = useMemo(() => decodeJwtPayload(externalToken), [externalToken])
  const externalProvider = String(externalPayload?.provider || searchParams.get("provider") || "").trim().toLowerCase()
  const externalProviderUserId = String(
    externalPayload?.provider_user_id || searchParams.get("provider_user_id") || ""
  ).trim()
  const hasExternalContext = Boolean(externalProvider && externalProviderUserId)
  const isTelegramContext = externalProvider === "telegram"
  const useTelegramIdPinLogin = false
  const externalProviderLabel = isTelegramContext ? "Telegram" : externalProvider === "whatsapp" || externalProvider === "phone" ? "WhatsApp" : "Account"
  const externalIdentifierLabel = useMemo(
    () => formatExternalIdentifier(externalProvider, externalProviderUserId),
    [externalProvider, externalProviderUserId]
  )
  const [email, setEmail] = useState("")
  const [pin, setPin] = useState("")
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false)
  const [emailConfirmationCode, setEmailConfirmationCode] = useState("")
  const [status, setStatus] = useState<"idle" | "pin" | "passkey" | "error">("idle")
  const [error, setError] = useState("")
  const [qrTargetUrl, setQrTargetUrl] = useState("")
  const [loginDone, setLoginDone] = useState(false)
  const [externalLinkUsed, setExternalLinkUsed] = useState(false)
  const actionLockRef = useRef(false)
  const passkeyAutoTriggerRef = useRef(false)

  function redirectToUsed(customMessage?: string) {
    const params = new URLSearchParams()
    if (customMessage) params.set("message", customMessage)
    const query = params.toString()
    window.location.replace(`/link-used${query ? `?${query}` : ""}`)
  }

  function getBrowserId() {
    let browserId = localStorage.getItem("talk-to-stellar.browserId")
    if (!browserId) {
      browserId = generateBrowserId()
      localStorage.setItem("talk-to-stellar.browserId", browserId)
    }
    return browserId
  }

  function finishLogin(accountLabel?: string) {
    const label = String(accountLabel || email.trim() || (useTelegramIdPinLogin ? externalIdentifierLabel : "") || "user").trim()
    enqueueWebChatFeedback(language === "pt-BR"
      ? `Login concluído.\nConta conectada: ${label}`
      : `Sign-in completed.\nConnected account: ${label}`)
    setLoginDone(true)
    if (nextPath) {
      window.setTimeout(() => {
        window.location.replace(nextPath)
      }, 450)
      return
    }
    closeIntermediatePage()
  }

  function getExternalLoginLockKey() {
    if (!hasExternalContext) return ""
    return `talk-to-stellar.external-login-lock:${externalProvider}:${externalProviderUserId}`
  }

  function isExternalLoginAlreadyCompleted() {
    if (typeof window === "undefined") return false
    const lockKey = getExternalLoginLockKey()
    if (!lockKey) return false
    return window.sessionStorage.getItem(lockKey) === "done"
  }

  function markExternalLoginCompleted() {
    if (typeof window === "undefined") return
    const lockKey = getExternalLoginLockKey()
    if (!lockKey) return
    window.sessionStorage.setItem(lockKey, "done")
    setExternalLinkUsed(true)
    actionLockRef.current = true
  }

  useEffect(() => {
    if (emailFromQuery) {
      setEmail(emailFromQuery)
    }
  }, [emailFromQuery])

  useEffect(() => {
    if (!hasExternalContext) return
    if (!isExternalLoginAlreadyCompleted()) return
    setExternalLinkUsed(true)
    actionLockRef.current = true
    setStatus("error")
    setError("Link already used.")
  }, [hasExternalContext, externalProvider, externalProviderUserId])

  useEffect(() => {
    if (!externalToken) return
    if (hasExternalContext) return
    redirectToUsed("This login link is invalid.")
  }, [externalToken, hasExternalContext])

  const mobileRedirectUrl = useMemo(() => {
    if (!PASSKEY_LOGIN_ENABLED) return ""
    if (typeof window === "undefined") return ""
    const normalizedEmail = email.trim()
    if (!normalizedEmail) return ""
    const url = new URL(`${window.location.origin}/login`)
    url.searchParams.set("auth", "passkey")
    url.searchParams.set("email", normalizedEmail)
    if (nextPath) url.searchParams.set("next", nextPath)
    if (externalToken) url.searchParams.set("token", externalToken)
    return url.toString()
  }, [email, nextPath, externalToken])

  const qrImageUrl = useMemo(() => {
    if (!qrTargetUrl) return ""
    return `https://quickchart.io/qr?size=320&margin=2&ecLevel=Q&format=png&text=${encodeURIComponent(qrTargetUrl)}`
  }, [qrTargetUrl])

  useEffect(() => {
    if (!PASSKEY_LOGIN_ENABLED) {
      setQrTargetUrl("")
      return
    }
    let cancelled = false
    async function prepareQrTarget() {
      if (!mobileRedirectUrl) {
        setQrTargetUrl("")
        return
      }
      try {
        const response = await fetch("/api/external/short-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: mobileRedirectUrl,
            purpose: "login_passkey_qr",
            expires_in_hours: 6,
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok && payload?.url) {
          setQrTargetUrl(String(payload.url))
          return
        }
        setQrTargetUrl(mobileRedirectUrl)
      } catch {
        if (!cancelled) setQrTargetUrl(mobileRedirectUrl)
      }
    }

    void prepareQrTarget()
    return () => {
      cancelled = true
    }
  }, [mobileRedirectUrl])

  useEffect(() => {
    if (!hasExternalContext) return
    let active = true
    async function validateToken() {
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(externalToken)}`, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (!active) return
        const message = String(payload?.message || "")
        const isUsed = Boolean(payload?.used || payload?.alreadyCompleted)
        const isExpired = Boolean(payload?.expired)
        if (!response.ok || payload?.valid === false || isUsed || isExpired || message.toLowerCase().includes("já foi utilizado")) {
          redirectToUsed(message || "This link has already been used.")
        }
      } catch {
        redirectToUsed("Could not validate this link.")
      }
    }
    void validateToken()
    return () => {
      active = false
    }
  }, [hasExternalContext, externalToken])

  useEffect(() => {
    if (!hasExternalContext || loginDone || externalLinkUsed) return
    let cancelled = false

    const poll = async () => {
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(externalToken)}`, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        const message = String(payload?.message || "")
        const isUsed = Boolean(payload?.used || payload?.alreadyCompleted)
        const isExpired = Boolean(payload?.expired)
        if (!response.ok && (isUsed || isExpired || message.toLowerCase().includes("já foi utilizado"))) {
          redirectToUsed(message || "This link has already been used.")
        }
      } catch {
        // ignore intermittent polling errors
      }
    }

    const timer = window.setInterval(poll, 2500)
    void poll()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [hasExternalContext, externalToken, loginDone, externalLinkUsed])

  async function linkExternalSession(sessionId?: string) {
    if (!hasExternalContext) return
    if (!sessionId) {
      throw new Error("Could not link Telegram to this session.")
    }

    const response = await idempotentFetch(`/api/external/link-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: externalToken,
        session_id: sessionId,
        language,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload?.success) {
      const message = String(payload?.message || "")
      if (payload?.used || payload?.alreadyCompleted || message.toLowerCase().includes("já foi utilizado")) {
        redirectToUsed(message || "This link has already been used.")
        return
      }
      throw new Error(payload?.message || "Could not link Telegram to this session.")
    }
  }

  async function handlePinLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (actionLockRef.current) return
    if (isExternalLoginAlreadyCompleted()) {
      setExternalLinkUsed(true)
      actionLockRef.current = true
      setStatus("error")
      setError("Link already used.")
      return
    }
    actionLockRef.current = true
    setStatus("pin")
    setError("")

    try {
      if (externalToken && !hasExternalContext) {
        throw new Error("Invalid external link. Return to Telegram and request a new access link.")
      }

      const response = await idempotentFetch(`/api/external/link-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: hasExternalContext ? externalProvider : "web",
          provider_user_id: hasExternalContext ? externalProviderUserId : getBrowserId(),
          token: hasExternalContext ? externalToken : undefined,
          email,
          pin,
          email_confirmation_code: emailConfirmationCode || undefined,
          language,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (payload?.emailConfirmationRequired) {
        if (!EMAIL_CONFIRMATION_ENABLED) {
          setEmailConfirmationRequired(false)
          actionLockRef.current = false
          setStatus("error")
          setError(language === "pt-BR"
            ? "Confirmação por e-mail está desativada neste ambiente. Peça um novo link no chat e entre com PIN."
            : "Email confirmation is disabled in this environment. Request a new link in chat and sign in with PIN.")
          return
        }
        setEmailConfirmationRequired(true)
        actionLockRef.current = false
        setStatus("idle")
        setError(String(payload?.message || "Enter the code sent by email to continue."))
        return
      }
      if (!response.ok || !payload?.success) {
        const message = String(payload?.message || "")
        if (payload?.used || payload?.alreadyCompleted || message.toLowerCase().includes("já foi utilizado")) {
          redirectToUsed(message || "This link has already been used.")
          return
        }
        throw new Error(payload?.message || "Could not sign in with email and PIN.")
      }

      saveClientSession()
      markExternalLoginCompleted()
      setEmailConfirmationRequired(false)
      setEmailConfirmationCode("")
      const resolvedLogin = String(payload?.email || payload?.userId || email.trim() || externalIdentifierLabel).trim()
      if (resolvedLogin) {
        localStorage.setItem("talk-to-stellar.userName", resolvedLogin)
      }
      finishLogin(resolvedLogin)
    } catch (err) {
      actionLockRef.current = false
      setStatus("error")
      setError(err instanceof Error ? err.message : "Failed to sign in with email and PIN.")
    }
  }

  async function handlePasskeyLogin(attempt = 0) {
    if (actionLockRef.current) return
    if (isExternalLoginAlreadyCompleted()) {
      setExternalLinkUsed(true)
      actionLockRef.current = true
      setStatus("error")
      setError("Link already used.")
      return
    }
    if (!email.trim()) {
      setStatus("error")
      setError("Enter your email to sign in with Passkey.")
      return
    }

    if (!window.PublicKeyCredential) {
      setStatus("error")
      setError("This browser does not support Passkey/WebAuthn.")
      return
    }

    actionLockRef.current = true
    setStatus("passkey")
    setError("")

    try {
      if (externalToken && !hasExternalContext) {
        throw new Error("Invalid external link. Return to Telegram and request a new access link.")
      }

      const initRes = await fetch(`/api/passkeys/auth-init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const initPayload = await initRes.json().catch(() => ({}))
      if (!initRes.ok || !initPayload.success) {
        throw new Error(initPayload.message || "Failed to start Passkey.")
      }
      if (initPayload.registrationRequired) {
        throw new Error("registrationRequired")
      }

      const credential = await startAuthentication({ optionsJSON: initPayload.options })
      const completeRes = await fetch(`/api/passkeys/auth-complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: initPayload.userId,
          challenge_id: initPayload.challengeId,
          credential,
        }),
      })
      const completePayload = await completeRes.json().catch(() => ({}))
      if (!completeRes.ok || !completePayload.success) {
        const serverMessage = String(completePayload?.message || "")
        if (attempt < 1 && isPasskeyChallengeExpiredMessage(serverMessage)) {
          actionLockRef.current = false
          setStatus("passkey")
          setError("Challenge expired. Generating a new challenge...")
          await handlePasskeyLogin(attempt + 1)
          return
        }
        throw new Error(completePayload.message || "Failed to complete Passkey.")
      }

      saveClientSession()
      markExternalLoginCompleted()
      localStorage.setItem("talk-to-stellar.userName", email.trim())
      getBrowserId()
      await linkExternalSession(
        completePayload?.sessionId ? String(completePayload.sessionId) : undefined
      )
      finishLogin()
    } catch (err: any) {
      const message = getPasskeyErrorMessage(err)
      if (attempt < 1 && isPasskeyChallengeExpiredMessage(message)) {
        actionLockRef.current = false
        setStatus("passkey")
        setError("Challenge expired. Generating a new challenge...")
        await handlePasskeyLogin(attempt + 1)
        return
      }
      actionLockRef.current = false
      setStatus("error")
      setError(message)
    }
  }

  useEffect(() => {
    if (!PASSKEY_LOGIN_ENABLED) return
    if (requestedAuthMethod !== "passkey") return
    if (passkeyAutoTriggerRef.current) return
    if (!email.trim()) {
      setStatus("error")
      setError("Informe seu e-mail para entrar com Passkey.")
      return
    }
    if (externalLinkUsed || actionLockRef.current || status === "pin" || status === "passkey") return
    passkeyAutoTriggerRef.current = true
    void handlePasskeyLogin()
  }, [requestedAuthMethod, email, externalLinkUsed, status])

  if (loginDone) {
    return (
      <AuthShell
        title={t("login_linked_title")}
        description={
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tts-confirm">
              {hasExternalContext
                ? t("login_connected_channel", { provider: externalProviderLabel })
                : t("login_connected_account")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-tts-muted">
              {nextPath
                ? t("login_continue_operation")
                : hasExternalContext
                  ? t("login_back_to_channel", { provider: externalProviderLabel })
                  : t("login_done")}
            </p>
            <p className="mt-2 text-xs text-tts-muted">
              {nextPath ? t("login_opening_operation") : INTERMEDIATE_PAGE_CLOSE_COPY}
            </p>
          </>
        }
      >
        <div />
      </AuthShell>
    )
  }

  const pinSubmitDisabled =
    externalLinkUsed ||
    actionLockRef.current ||
    status === "pin" ||
    status === "passkey" ||
    (!useTelegramIdPinLogin && !email.trim()) ||
    !pin.trim() ||
    (EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired && emailConfirmationCode.length !== 6)

  return (
    <AuthShell
      title={t("login_title")}
      description={t("login_subtitle")}
      footer={
        <a
          href="/create-account"
          className="text-[12px] text-tts-muted underline-offset-4 hover:text-tts-deep hover:underline"
        >
          {language === "pt-BR" ? "Criar conta" : "Create account"}
        </a>
      }
    >
      {hasExternalContext && (
        <div className="inline-flex items-center gap-2 self-center rounded-full border border-tts-border bg-tts-bg px-3 py-1 text-[11px] font-medium text-tts-deep">
          {isTelegramContext ? <Send className="h-3.5 w-3.5 text-tts-gold" /> : <MessageCircle className="h-3.5 w-3.5 text-tts-gold" />}
          {t("login_via")} {externalProviderLabel}
        </div>
      )}

      {hasExternalContext && (
        <div className="rounded-lg border border-tts-border bg-tts-bg px-3 py-2 text-xs text-tts-deep">
          <p className="font-medium">{t("login_channel_detected")}: {externalProviderLabel}</p>
          <p className="mt-1 font-mono-financial text-tts-muted">{t("login_identifier")}: {externalIdentifierLabel}</p>
        </div>
      )}

      {expired && (
        <div className="rounded-lg border-l-4 border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs text-tts-deep">
          {t("login_expired")}
        </div>
      )}

      <form className="flex flex-col gap-4" onSubmit={handlePinLogin}>
        {useTelegramIdPinLogin ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-tts-deep">{t("login_telegram_id")}</span>
            <Input
              value={externalIdentifierLabel}
              type="text"
              readOnly
              disabled={externalLinkUsed}
            />
            <span className="text-[11px] text-tts-muted">{t("login_telegram_help")}</span>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-tts-deep">{t("login_email")}</span>
            <Input
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                setEmailConfirmationRequired(false)
                setEmailConfirmationCode("")
              }}
              type="email"
              disabled={externalLinkUsed}
              placeholder="you@example.com"
            />
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">{t("login_pin")}</span>
          <Input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            type="password"
            inputMode="numeric"
            maxLength={8}
            disabled={externalLinkUsed}
            placeholder={t("login_pin_placeholder")}
          />
        </label>

        {EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired && (
          <label className="flex flex-col gap-1.5 rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5">
            <span className="text-xs font-medium text-tts-deep">{t("login_email_code")}</span>
            <Input
              value={emailConfirmationCode}
              onChange={(event) => setEmailConfirmationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              type="text"
              inputMode="numeric"
              maxLength={6}
              disabled={externalLinkUsed}
              placeholder="000000"
            />
            <span className="text-[11px] text-tts-muted">{t("login_email_code_help")}</span>
          </label>
        )}

        {error && (
          <p className="rounded-lg border-l-4 border-tts-error bg-tts-error/10 px-3 py-2 text-xs text-tts-error">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={pinSubmitDisabled}
          className="w-full bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
        >
          <LogIn className="mr-2 h-4 w-4" />
          {status === "pin"
            ? t("login_submitting")
            : EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired
              ? t("login_confirm_submit")
              : t("login_submit")}
        </Button>
      </form>

      {PASSKEY_LOGIN_ENABLED && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            void handlePasskeyLogin();
          }}
          disabled={externalLinkUsed || actionLockRef.current || status === "pin" || status === "passkey" || !email.trim()}
          className="w-full"
        >
          <Fingerprint className="mr-2 h-4 w-4" />
          {status === "passkey" ? t("login_passkey_loading") : t("login_passkey_submit")}
        </Button>
      )}

      {PASSKEY_LOGIN_ENABLED && qrImageUrl && !externalLinkUsed && (
        <div className="rounded-xl border border-tts-border bg-tts-bg p-4 text-xs text-tts-deep">
          <p className="font-bold">{t("login_passkey_qr_title")}</p>
          <p className="mt-1 text-tts-muted">{t("login_passkey_qr_body")}</p>
          <div className="mt-3 flex justify-center">
            <img
              src={qrImageUrl}
              alt={t("login_passkey_qr_alt")}
              className="h-56 w-56 rounded-xl border border-tts-border bg-white p-3"
            />
          </div>
          {qrTargetUrl && (
            <p className="mt-3 break-all font-mono-financial text-[10px] text-tts-muted">
              {qrTargetUrl}
            </p>
          )}
        </div>
      )}
    </AuthShell>
  )
}
