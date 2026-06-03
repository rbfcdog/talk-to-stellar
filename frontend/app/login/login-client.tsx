"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { useSearchParams } from "next/navigation"
import { startAuthentication } from "@simplewebauthn/browser"
import { saveClientSession } from "@/lib/session"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { Chrome, Fingerprint, LogIn, MessageCircle, Send } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { trackUserResearchEvent } from "@/lib/user-research"

declare global {
  interface Window {
    google?: any
  }
}

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

function normalizeLoginEmail(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : ""
}

function maskLoginEmail(value: string): string {
  const email = normalizeLoginEmail(value)
  if (!email) return value
  const [name, domain] = email.split("@")
  if (!name || !domain) return email
  const visibleName = name.length <= 2 ? name[0] || "" : name.slice(0, 2)
  return `${visibleName}${"*".repeat(Math.max(2, Math.min(6, name.length - visibleName.length)))}@${domain}`
}

function extractResolvedLogin(value: any): string {
  const payload = value?.payload && typeof value.payload === "object" ? value.payload : value
  return (
    normalizeLoginEmail(value?.resolvedLogin) ||
    normalizeLoginEmail(value?.email) ||
    normalizeLoginEmail(value?.userId) ||
    normalizeLoginEmail(value?.user_id) ||
    normalizeLoginEmail(payload?.resolvedLogin) ||
    normalizeLoginEmail(payload?.email) ||
    normalizeLoginEmail(payload?.userId) ||
    normalizeLoginEmail(payload?.user_id) ||
    normalizeLoginEmail(payload?.ownerId) ||
    normalizeLoginEmail(payload?.owner_id)
  )
}

const EMAIL_CONFIRMATION_ENABLED = process.env.NEXT_PUBLIC_ENABLE_EMAIL_CONFIRMATION !== "false"
const PASSKEY_LOGIN_ENABLED = process.env.NEXT_PUBLIC_PASSKEY_ENABLED !== "false"
const GOOGLE_LOGIN_ENABLED = Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID)

export default function LoginClient({ expired }: { expired?: boolean }) {
  const { language, t } = useLanguage()
  const searchParams = useSearchParams()
  const requestedAuthMethod = PASSKEY_LOGIN_ENABLED ? String(searchParams.get("auth") || "").trim().toLowerCase() : ""
  const passkeyPairIdFromQuery = String(searchParams.get("pair") || "").trim()
  const isPasskeyPhoneCodeMode = PASSKEY_LOGIN_ENABLED && Boolean(passkeyPairIdFromQuery) && (
    requestedAuthMethod === "passkey-code" ||
    searchParams.get("phone_code") === "1"
  )
  const emailFromQuery = String(searchParams.get("email") || "").trim()
  const rawNextPath = String(searchParams.get("next") || "").trim()
  const nextPath = rawNextPath && rawNextPath.startsWith("/") && !rawNextPath.startsWith("//")
    ? rawNextPath
    : ""
  const loginSource = String(searchParams.get("source") || searchParams.get("from") || searchParams.get("origin") || "").trim().toLowerCase()
  const returnToChat = loginSource === "chat"
  const externalToken = searchParams.get("token") || ""
  const externalPayload = useMemo(() => decodeJwtPayload(externalToken), [externalToken])
  const externalProvider = String(externalPayload?.provider || searchParams.get("provider") || "").trim().toLowerCase()
  const externalProviderUserId = String(
    externalPayload?.provider_user_id || searchParams.get("provider_user_id") || ""
  ).trim()
  const hasExternalContext = Boolean(externalProvider && externalProviderUserId)
  const isTelegramContext = externalProvider === "telegram"
  const isExternalLoginOnlyContext = ["whatsapp", "phone", "telegram"].includes(externalProvider)
  const externalProviderLabel = isTelegramContext ? "Telegram" : externalProvider === "whatsapp" || externalProvider === "phone" ? "WhatsApp" : "Account"
  const externalIdentifierLabel = useMemo(
    () => formatExternalIdentifier(externalProvider, externalProviderUserId),
    [externalProvider, externalProviderUserId]
  )
  const [email, setEmail] = useState("")
  const [externalResolvedLogin, setExternalResolvedLogin] = useState("")
  const [pin, setPin] = useState("")
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false)
  const [emailConfirmationCode, setEmailConfirmationCode] = useState("")
  const [status, setStatus] = useState<"idle" | "pin" | "passkey" | "error">("idle")
  const [error, setError] = useState("")
  const [qrTargetUrl, setQrTargetUrl] = useState("")
  const [loginDone, setLoginDone] = useState(false)
  const [externalLinkUsed, setExternalLinkUsed] = useState(false)
  const [googleLoginError, setGoogleLoginError] = useState("")
  const [googleScriptReady, setGoogleScriptReady] = useState(false)
  const [passkeyPairId, setPasskeyPairId] = useState("")
  const [passkeyPairCode, setPasskeyPairCode] = useState("")
  const [passkeyPairCodeInput, setPasskeyPairCodeInput] = useState("")
  const [passkeyPairCodeExpiresAt, setPasskeyPairCodeExpiresAt] = useState("")
  const [passkeyPairStatus, setPasskeyPairStatus] = useState<"idle" | "authenticating" | "ready" | "redeeming" | "error">("idle")
  const [passkeyPairError, setPasskeyPairError] = useState("")
  const actionLockRef = useRef(false)
  const passkeyAutoTriggerRef = useRef(false)
  const googleButtonRef = useRef<HTMLDivElement | null>(null)

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
    const label = String(accountLabel || externalResolvedLogin || email.trim() || "user").trim()
    trackUserResearchEvent({
      eventName: "login_completed",
      eventGroup: "Acesso",
      taskLabel: "Entrou na conta",
      status: "success",
      metadata: {
        login_source: loginSource || "web",
        external_provider: externalProvider || null,
        account_label_masked: maskLoginEmail(label),
        passkey_code_flow: Boolean(isPasskeyPhoneCodeMode || passkeyPairCodeInput),
      },
      dedupeKey: `login_completed:${loginSource || externalProvider || "web"}:${Date.now()}`,
    })
    enqueueWebChatFeedback(language === "pt-BR"
      ? `Login concluído.\nConta conectada: ${label}`
      : `Sign-in completed.\nConnected account: ${label}`)
    setLoginDone(true)
    const targetPath = returnToChat ? "/chat" : nextPath
    if (targetPath) {
      window.setTimeout(() => {
        window.location.replace(targetPath)
      }, 450)
      return
    }
    closeIntermediatePage()
  }

  function getExternalLoginLockKey() {
    if (!hasExternalContext) return ""
    const tokenScope = externalToken.trim()
      ? externalToken.trim().slice(-64)
      : `${externalProvider}:${externalProviderUserId}`
    return `talk-to-stellar.external-login-lock:${tokenScope}`
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
    if (isPasskeyPhoneCodeMode) return
    setPasskeyPairId(generateBrowserId().replace(/-/g, ""))
  }, [isPasskeyPhoneCodeMode])

  useEffect(() => {
    const resolvedLogin = extractResolvedLogin(externalPayload)
    if (!resolvedLogin) return
    setExternalResolvedLogin(resolvedLogin)
    setEmail(resolvedLogin)
  }, [externalPayload])

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
    if (isPasskeyPhoneCodeMode) return ""
    const normalizedEmail = email.trim()
    if (!normalizedEmail) return ""
    if (!passkeyPairId) return ""
    const url = new URL(`${window.location.origin}/login`)
    url.searchParams.set("auth", "passkey-code")
    url.searchParams.set("phone_code", "1")
    url.searchParams.set("pair", passkeyPairId)
    url.searchParams.set("email", normalizedEmail)
    if (nextPath) url.searchParams.set("next", nextPath)
    if (language) url.searchParams.set("lang", language)
    return url.toString()
  }, [email, nextPath, passkeyPairId, isPasskeyPhoneCodeMode, language])

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
        const resolvedLogin = extractResolvedLogin(payload)
        if (resolvedLogin) {
          setExternalResolvedLogin(resolvedLogin)
          setEmail(resolvedLogin)
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
        const resolvedLogin = extractResolvedLogin(payload)
        if (resolvedLogin) {
          setExternalResolvedLogin(resolvedLogin)
          setEmail(resolvedLogin)
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
      const loginEmail = externalResolvedLogin || email.trim()
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
          email: loginEmail || undefined,
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
      const resolvedLogin = String(payload?.email || payload?.userId || loginEmail || externalIdentifierLabel).trim()
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

  async function handlePhonePasskeyCode(attempt = 0) {
    if (actionLockRef.current) return
    if (!passkeyPairIdFromQuery) {
      setPasskeyPairStatus("error")
      setPasskeyPairError(language === "pt-BR" ? "QR inválido. Gere um novo QR no computador." : "Invalid QR. Generate a new QR on the computer.")
      return
    }
    if (!email.trim()) {
      setPasskeyPairStatus("error")
      setPasskeyPairError(language === "pt-BR" ? "Informe seu e-mail para validar a passkey." : "Enter your email to validate the passkey.")
      return
    }
    if (!window.PublicKeyCredential) {
      setPasskeyPairStatus("error")
      setPasskeyPairError(language === "pt-BR" ? "Este navegador não suporta Passkey/WebAuthn." : "This browser does not support Passkey/WebAuthn.")
      return
    }

    actionLockRef.current = true
    setPasskeyPairStatus("authenticating")
    setPasskeyPairError("")
    setPasskeyPairCode("")

    try {
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
          await handlePhonePasskeyCode(attempt + 1)
          return
        }
        throw new Error(completePayload.message || "Failed to complete Passkey.")
      }

      saveClientSession()
      localStorage.setItem("talk-to-stellar.userName", email.trim())

      const codeRes = await fetch("/api/passkeys/login-code/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair_id: passkeyPairIdFromQuery,
          user_id: initPayload.userId,
          email,
        }),
      })
      const codePayload = await codeRes.json().catch(() => ({}))
      if (!codeRes.ok || !codePayload.success || !codePayload.code) {
        throw new Error(codePayload.message || "Could not generate the computer login code.")
      }

      setPasskeyPairCode(String(codePayload.code))
      setPasskeyPairCodeExpiresAt(String(codePayload.expiresAt || ""))
      setPasskeyPairStatus("ready")
    } catch (err: any) {
      const message = getPasskeyErrorMessage(err)
      if (attempt < 1 && isPasskeyChallengeExpiredMessage(message)) {
        actionLockRef.current = false
        await handlePhonePasskeyCode(attempt + 1)
        return
      }
      setPasskeyPairStatus("error")
      setPasskeyPairError(message)
    } finally {
      actionLockRef.current = false
    }
  }

  async function handleRedeemPhonePasskeyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (actionLockRef.current) return
    if (!passkeyPairId) {
      setPasskeyPairError(language === "pt-BR" ? "Gere um novo QR de login." : "Generate a new login QR.")
      return
    }
    const code = passkeyPairCodeInput.replace(/\D+/g, "").slice(0, 6)
    if (code.length !== 6) {
      setPasskeyPairError(language === "pt-BR" ? "Digite o código de 6 dígitos gerado no celular." : "Enter the 6-digit code generated on your phone.")
      return
    }

    actionLockRef.current = true
    setPasskeyPairStatus("redeeming")
    setPasskeyPairError("")

    try {
      const response = await fetch("/api/passkeys/login-code/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pair_id: passkeyPairId,
          code,
          session_source: "web",
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Could not sign in with the phone code.")
      }

      saveClientSession()
      const resolvedLogin = String(payload?.email || payload?.userId || email.trim() || "user").trim()
      if (resolvedLogin) {
        localStorage.setItem("talk-to-stellar.userName", resolvedLogin)
      }
      finishLogin(resolvedLogin)
    } catch (err) {
      actionLockRef.current = false
      setPasskeyPairStatus("error")
      setPasskeyPairError(err instanceof Error ? err.message : "Could not sign in with the phone code.")
    }
  }

  useEffect(() => {
    if (!PASSKEY_LOGIN_ENABLED) return
    if (isPasskeyPhoneCodeMode) return
    if (isExternalLoginOnlyContext) return
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
  }, [requestedAuthMethod, email, externalLinkUsed, status, isExternalLoginOnlyContext, isPasskeyPhoneCodeMode])

  useEffect(() => {
    if (!GOOGLE_LOGIN_ENABLED) return
    if (isExternalLoginOnlyContext) return
    if (typeof window === "undefined") return
    if (window.google?.accounts?.id) {
      setGoogleScriptReady(true)
      return
    }

    const scriptId = "google-identity-client"
    if (document.getElementById(scriptId)) return

    const script = document.createElement("script")
    script.id = scriptId
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = () => setGoogleScriptReady(true)
    script.onerror = () => setGoogleLoginError(language === "pt-BR" ? "Não foi possível carregar o login do Google." : "Could not load Google sign-in.")
    document.head.appendChild(script)

    return () => {
      // Keep the script cached for the next login page visit.
    }
  }, [language, isExternalLoginOnlyContext])

  useEffect(() => {
    if (!GOOGLE_LOGIN_ENABLED || !googleScriptReady) return
    if (isExternalLoginOnlyContext) return
    if (!googleButtonRef.current) return
    if (!window.google?.accounts?.id) return

    const clientId = String(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim()
    if (!clientId) return

    googleButtonRef.current.innerHTML = ""
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential?: string }) => {
        if (actionLockRef.current) return
        const credential = String(response?.credential || "").trim()
        if (!credential) {
          setGoogleLoginError(language === "pt-BR" ? "Não foi possível validar sua conta Google." : "Could not validate your Google account.")
          return
        }

        actionLockRef.current = true
        setStatus("idle")
        setGoogleLoginError("")

        try {
          const authResponse = await idempotentFetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential, language }),
          })
          const payload = await authResponse.json().catch(() => ({}))
          if (!authResponse.ok || !payload?.success) {
            throw new Error(payload?.message || "Google sign-in failed.")
          }

          if (payload?.requires_pin_setup || payload?.needs_pin_setup || payload?.needsPinSetup) {
            const params = new URLSearchParams()
            const googleEmail = String(payload?.email || payload?.user_id || "").trim()
            const googleName = String(payload?.display_name || payload?.name || "").trim()
            if (googleEmail) params.set("email", googleEmail)
            if (googleName) params.set("name", googleName)
            params.set("force_new", "1")
            params.set("context", "google-login")
            if (nextPath) params.set("next", nextPath)
            window.location.replace(`/create-account?${params.toString()}`)
            return
          }

          saveClientSession()
          const resolvedLogin = String(payload?.email || payload?.user_id || payload?.display_name || "user").trim()
          if (resolvedLogin) {
            localStorage.setItem("talk-to-stellar.userName", resolvedLogin)
          }
          finishLogin(resolvedLogin)
        } catch (error) {
          actionLockRef.current = false
          setGoogleLoginError(error instanceof Error ? error.message : "Google sign-in failed.")
        }
      },
    })
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      text: language === "pt-BR" ? "signin_with" : "signin_with",
      width: googleButtonRef.current.clientWidth,
      shape: "rectangular",
    })
  }, [googleScriptReady, language, isExternalLoginOnlyContext])

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
              {returnToChat
                ? language === "pt-BR"
                  ? "Retornando para o chat."
                  : "Returning to chat."
                : nextPath
                  ? t("login_continue_operation")
                  : hasExternalContext
                    ? t("login_back_to_channel", { provider: externalProviderLabel })
                    : t("login_done")}
            </p>
            <p className="mt-2 text-xs text-tts-muted">
              {returnToChat
                ? language === "pt-BR"
                  ? "O chat será reaberto automaticamente."
                  : "The chat will reopen automatically."
                : nextPath
                  ? t("login_opening_operation")
                  : INTERMEDIATE_PAGE_CLOSE_COPY}
            </p>
          </>
        }
      >
        <div />
      </AuthShell>
    )
  }

  if (isPasskeyPhoneCodeMode) {
    const expiresLabel = passkeyPairCodeExpiresAt
      ? new Date(passkeyPairCodeExpiresAt).toLocaleTimeString(language === "pt-BR" ? "pt-BR" : "en-US", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : ""

    return (
      <AuthShell
        title={language === "pt-BR" ? "Gerar código para o computador" : "Generate code for computer"}
        description={
          language === "pt-BR"
            ? "Confirme sua passkey neste celular. Depois digite o código no computador para concluir o login."
            : "Confirm your Passkey on this phone. Then enter the code on your computer to finish sign-in."
        }
      >
        <div className="rounded-xl border border-tts-border bg-tts-bg p-4 text-sm text-tts-deep">
          <p className="font-bold">{language === "pt-BR" ? "Conta" : "Account"}</p>
          {email.trim() ? (
            <p className="mt-1 font-mono-financial text-tts-muted">{email.trim()}</p>
          ) : (
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-xs font-medium text-tts-deep">{t("login_email")}</span>
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                placeholder="you@example.com"
              />
            </label>
          )}
        </div>

        {passkeyPairCode ? (
          <div className="rounded-2xl border border-tts-border bg-tts-surface p-5 text-center shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-tts-muted">
              {language === "pt-BR" ? "Código para o computador" : "Computer code"}
            </p>
            <p className="mt-3 font-mono-financial text-5xl font-black tracking-[0.2em] text-tts-deep">
              {passkeyPairCode}
            </p>
            <p className="mt-3 text-sm leading-6 text-tts-muted">
              {language === "pt-BR"
                ? `Digite este código na tela de login do computador${expiresLabel ? ` até ${expiresLabel}` : ""}.`
                : `Enter this code on the computer login screen${expiresLabel ? ` by ${expiresLabel}` : ""}.`}
            </p>
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={() => {
              void handlePhonePasskeyCode()
            }}
            disabled={actionLockRef.current || passkeyPairStatus === "authenticating" || !email.trim()}
            className="w-full bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
          >
            <Fingerprint className="mr-2 h-4 w-4" />
            {passkeyPairStatus === "authenticating"
              ? language === "pt-BR" ? "Confirmando passkey..." : "Confirming Passkey..."
              : language === "pt-BR" ? "Usar passkey neste celular" : "Use Passkey on this phone"}
          </Button>
        )}

        {passkeyPairError && (
          <p className="rounded-lg border-l-4 border-tts-error bg-tts-error/10 px-3 py-2 text-xs text-tts-error" role="alert">
            {passkeyPairError}
          </p>
        )}
      </AuthShell>
    )
  }

  const loginEmail = externalResolvedLogin || email.trim()
  const pinSubmitDisabled =
    externalLinkUsed ||
    actionLockRef.current ||
    status === "pin" ||
    status === "passkey" ||
    (!isExternalLoginOnlyContext && !loginEmail) ||
    !pin.trim() ||
    (EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired && emailConfirmationCode.length !== 6)

  const useExternalPinOnlyLogin = hasExternalContext && isExternalLoginOnlyContext
  const displayedResolvedLogin = externalResolvedLogin ? maskLoginEmail(externalResolvedLogin) : ""

  return (
    <AuthShell
      title={t("login_title")}
      description={t("login_subtitle")}
      footer={!isExternalLoginOnlyContext ? (
        <a
          href="/create-account"
          className="text-[12px] text-tts-muted underline-offset-4 hover:text-tts-deep hover:underline"
        >
          {language === "pt-BR" ? "Criar conta" : "Create account"}
        </a>
      ) : undefined}
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
          {displayedResolvedLogin && (
            <p className="mt-1 font-mono-financial text-tts-muted">{t("login_linked_account")}: {displayedResolvedLogin}</p>
          )}
        </div>
      )}

      {expired && (
        <div className="rounded-lg border-l-4 border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs text-tts-deep">
          {t("login_expired")}
        </div>
      )}

      <form className="flex flex-col gap-4" onSubmit={handlePinLogin}>
        {useExternalPinOnlyLogin ? (
          <div className="rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-xs text-tts-deep">
            <p className="font-medium">{t("login_pin_only_title")}</p>
            <p className="mt-1 text-tts-muted">{t("login_pin_only_help", { provider: externalProviderLabel })}</p>
          </div>
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
          <p
            className={
              EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired
                ? "rounded-lg border-l-4 border-tts-gold bg-tts-gold-bg px-4 py-3 text-sm font-medium leading-6 text-tts-deep"
                : "rounded-lg border-l-4 border-tts-error bg-tts-error/10 px-3 py-2 text-xs text-tts-error"
            }
            role={EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired ? "status" : "alert"}
          >
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

      {PASSKEY_LOGIN_ENABLED && !isExternalLoginOnlyContext && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={() => {
            void handlePasskeyLogin();
          }}
          disabled={externalLinkUsed || actionLockRef.current || status === "pin" || status === "passkey" || !(externalResolvedLogin || email.trim())}
          className="w-full"
        >
          <Fingerprint className="mr-2 h-4 w-4" />
          {status === "passkey" ? t("login_passkey_loading") : t("login_passkey_submit")}
        </Button>
      )}

      {GOOGLE_LOGIN_ENABLED && !isExternalLoginOnlyContext && (
        <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-tts-muted">
            <Chrome className="h-4 w-4" />
            {language === "pt-BR" ? "Entrar com Google" : "Sign in with Google"}
          </div>
          <div ref={googleButtonRef} className="min-h-12 w-full" />
          {googleLoginError && (
            <p className="mt-3 text-xs text-tts-error">{googleLoginError}</p>
          )}
        </div>
      )}

      {PASSKEY_LOGIN_ENABLED && qrImageUrl && !externalLinkUsed && !isExternalLoginOnlyContext && (
        <div className="rounded-xl border border-tts-border bg-tts-bg p-4 text-xs text-tts-deep">
          <p className="font-bold">{t("login_passkey_qr_title")}</p>
          <p className="mt-1 text-tts-muted">
            {language === "pt-BR"
              ? "Escaneie, use a passkey no celular e digite aqui o código gerado."
              : "Scan it, use Passkey on your phone, and enter the generated code here."}
          </p>
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
          <form className="mt-4 grid gap-2" onSubmit={handleRedeemPhonePasskeyCode}>
            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-tts-deep">
                {language === "pt-BR" ? "Código do celular" : "Phone code"}
              </span>
              <Input
                value={passkeyPairCodeInput}
                onChange={(event) => setPasskeyPairCodeInput(event.target.value.replace(/\D+/g, "").slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="text-center font-mono-financial text-lg tracking-[0.18em]"
                disabled={actionLockRef.current || passkeyPairStatus === "redeeming"}
              />
            </label>
            <Button
              type="submit"
              disabled={actionLockRef.current || passkeyPairStatus === "redeeming" || passkeyPairCodeInput.length !== 6}
              className="w-full bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
            >
              <LogIn className="mr-2 h-4 w-4" />
              {passkeyPairStatus === "redeeming"
                ? language === "pt-BR" ? "Entrando..." : "Signing in..."
                : language === "pt-BR" ? "Entrar com código do celular" : "Sign in with phone code"}
            </Button>
          </form>
          {passkeyPairError && (
            <p className="mt-3 rounded-lg border-l-4 border-tts-error bg-tts-error/10 px-3 py-2 text-xs text-tts-error" role="alert">
              {passkeyPairError}
            </p>
          )}
        </div>
      )}
    </AuthShell>
  )
}
