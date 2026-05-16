"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"
import { saveClientSession } from "@/lib/session"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { KeyRound, LogIn, MessageCircle, Send, ShieldCheck } from "lucide-react"
import { useLanguage } from "@/lib/i18n"

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

export default function LoginClient({ expired }: { expired?: boolean }) {
  const { language, t } = useLanguage()
  const searchParams = useSearchParams()
  const requestedAuthMethod = String(searchParams.get("auth") || "").trim().toLowerCase()
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

  async function linkExternalSession(sessionId?: string, sessionToken?: string) {
    if (!hasExternalContext) return
    if (!sessionId || !sessionToken) {
      throw new Error("Could not link Telegram to this session.")
    }

    const response = await idempotentFetch(`/api/external/link-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: externalToken,
        session_id: sessionId,
        session_token: sessionToken,
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

      saveClientSession(
        payload?.sessionId ? String(payload.sessionId) : undefined,
        payload?.sessionToken ? String(payload.sessionToken) : undefined
      )
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

      saveClientSession(
        completePayload?.sessionId ? String(completePayload.sessionId) : undefined,
        completePayload?.sessionToken ? String(completePayload.sessionToken) : undefined
      )
      markExternalLoginCompleted()
      localStorage.setItem("talk-to-stellar.userName", email.trim())
      getBrowserId()
      await linkExternalSession(
        completePayload?.sessionId ? String(completePayload.sessionId) : undefined,
        completePayload?.sessionToken ? String(completePayload.sessionToken) : undefined
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
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-6 text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-6 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-200">
            {hasExternalContext ? t("login_connected_channel", { provider: externalProviderLabel }) : t("login_connected_account")}
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-white">{t("login_linked_title")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {nextPath ? t("login_continue_operation") : hasExternalContext ? t("login_back_to_channel", { provider: externalProviderLabel }) : t("login_done")}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {nextPath ? t("login_opening_operation") : INTERMEDIATE_PAGE_CLOSE_COPY}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12 sm:px-6">
        <div className="grid min-w-0 w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur sm:p-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-200">
              <ShieldCheck className="h-4 w-4" />
              TalkToStellar
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                {t("login_title")}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                {t("login_subtitle")}
              </p>
              {hasExternalContext && (
                <div className="rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-sm text-cyan-100">
                  <p className="font-medium">{t("login_channel_detected")}: {externalProviderLabel}</p>
                  <p className="mt-1 text-cyan-100/90">{t("login_identifier")}: {externalIdentifierLabel}</p>
                </div>
              )}
              {expired && (
                <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
                  {t("login_expired")}
                </p>
              )}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-400">{t("login_pin_card_title")}</p>
                <p className="mt-2 text-sm text-slate-200">{t("login_pin_card_body")}</p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-400">{t("login_passkey_card_title")}</p>
                <p className="mt-2 text-sm text-slate-200">{t("login_passkey_card_body")}</p>
              </div>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            {hasExternalContext && (
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-100">
                {isTelegramContext ? <Send className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
                {t("login_via")} {externalProviderLabel}
              </div>
            )}
            <form className="space-y-4" onSubmit={handlePinLogin}>
              {useTelegramIdPinLogin ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">{t("login_telegram_id")}</span>
                  <input
                    value={externalIdentifierLabel}
                    type="text"
                    readOnly
                    disabled={externalLinkUsed}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                  />
                  <span className="block text-xs text-slate-400">{t("login_telegram_help")}</span>
                </label>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">{t("login_email")}</span>
                  <input
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setEmailConfirmationRequired(false)
                      setEmailConfirmationCode("")
                    }}
                    type="email"
                    disabled={externalLinkUsed}
                    placeholder="you@example.com"
                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                  />
                </label>
              )}

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">{t("login_pin")}</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  disabled={externalLinkUsed}
                  placeholder={t("login_pin_placeholder")}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              {emailConfirmationRequired && (
                <label className="block space-y-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3">
                  <span className="text-sm font-medium text-cyan-50">{t("login_email_code")}</span>
                  <input
                    value={emailConfirmationCode}
                    onChange={(event) => setEmailConfirmationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    disabled={externalLinkUsed}
                    placeholder="000000"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                  />
                  <span className="block text-xs text-cyan-100">{t("login_email_code_help")}</span>
                </label>
              )}

              {error && <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">{error}</p>}

              <button
                type="submit"
                disabled={externalLinkUsed || actionLockRef.current || status === "pin" || status === "passkey" || (!useTelegramIdPinLogin && !email.trim()) || !pin.trim() || (emailConfirmationRequired && emailConfirmationCode.length !== 6)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                {status === "pin" ? t("login_submitting") : emailConfirmationRequired ? t("login_confirm_submit") : t("login_submit")}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                void handlePasskeyLogin();
              }}
              disabled={externalLinkUsed || actionLockRef.current || status === "pin" || status === "passkey" || !email.trim()}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" />
              {status === "passkey" ? t("login_passkey_loading") : t("login_passkey_submit")}
            </button>
            {false && qrImageUrl && !externalLinkUsed && (
              <div className="mt-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
                <p className="font-medium text-white">{t("login_passkey_qr_title")}</p>
                <p className="mt-1 text-slate-300">{t("login_passkey_qr_body")}</p>
                <div className="mt-3 flex justify-center">
                  <img
                    src={qrImageUrl}
                    alt={t("login_passkey_qr_alt")}
                    className="h-72 w-72 rounded-xl border border-white/10 bg-white p-3"
                  />
                </div>
                {qrTargetUrl && <p className="mt-3 break-all text-xs text-slate-400">{qrTargetUrl}</p>}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
