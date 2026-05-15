"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { startRegistration } from '@simplewebauthn/browser'
import { useSearchParams } from "next/navigation"
import { saveClientSession } from "@/lib/session"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { Spinner, TypingDots } from "@/components/ui/feedback"
import { useLanguage } from "@/lib/i18n"

type FinalizeResponse = {
  success: boolean
  sessionId?: string
  sessionToken?: string
  userId?: string
  passkeySessionToken?: string
  message?: string
  error?: string
  processing?: boolean
  used?: boolean
  alreadyCompleted?: boolean
  emailConfirmationRequired?: boolean
  email?: string
  expiresAt?: string
  devCode?: string
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

function extractTokenFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return String(parsed.searchParams.get("token") || "")
  } catch {
    return ""
  }
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

type RecoveryResult =
  | { mode: "token"; token: string }
  | { mode: "existing"; sessionId?: string; sessionToken?: string }
  | { mode: "none" }

function getPasskeyErrorMessage(error: any): string {
  const name = String(error?.name || "")
  const message = String(error?.message || error || "")
  const normalized = message.toLowerCase()

  if (name === "NotAllowedError") {
    return "Biometric authentication was canceled or expired. Tap \"Enable biometrics\" and confirm with fingerprint or Face ID."
  }

  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "Biometrics must open on the correct domain with HTTPS. Check PASSKEY_RP_ID/PASSKEY_ORIGIN in the backend."
  }

  if (normalized.includes("not supported")) {
    return "This browser did not allow Passkey in this context. Open it in the main mobile browser, not private mode."
  }

  return message || "Failed to enable biometrics."
}

function isPasskeyChallengeExpiredMessage(message?: string) {
  const normalized = String(message || "").toLowerCase()
  return (
    normalized.includes("passkey challenge expired") ||
    normalized.includes("challenge expired") ||
    normalized.includes("desafio expirado")
  )
}

function looksLikeEmail(value?: string): boolean {
  const normalized = String(value || "").trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

export default function CreateAccountClient({
  initialToken = '',
  initialValidation = null,
}: {
  initialToken?: string
  initialValidation?: any
}) {
  const { language } = useLanguage()
  const L = (_pt: string, en: string) => en
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get("token") || initialToken || "", [searchParams, initialToken])
  const rawNextPath = searchParams.get("next") || "/chat"
  const nextPath = rawNextPath.startsWith("/") && !rawNextPath.startsWith("//") ? rawNextPath : "/chat"
  const forceNewAccount = searchParams.get("force_new") === "1" || searchParams.get("new_account") === "1"
  const isClaimPaymentContext = searchParams.get("context") === "claim-payment" || nextPath.startsWith("/claim-payment")

  const [token, setToken] = useState(tokenFromUrl)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [emailConfirmationRequired, setEmailConfirmationRequired] = useState(false)
  const [emailConfirmationCode, setEmailConfirmationCode] = useState("")
  const [phoneNumber, setPhoneNumber] = useState("")
  const [cpf, setCpf] = useState("")
  const [pin, setPin] = useState("")
  const [pinConfirm, setPinConfirm] = useState("")
  const [pinError, setPinError] = useState("")
  const [requestPasskey, setRequestPasskey] = useState(true)
  const [status, setStatus] = useState("ready")
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "registering" | "authenticating" | "done" | "error">("idle")
  const [passkeyError, setPasskeyError] = useState("")
  const [passkeyQrTargetUrl, setPasskeyQrTargetUrl] = useState("")
  const [result, setResult] = useState<FinalizeResponse | null>(null)
  const [existingEmail, setExistingEmail] = useState("")
  const [existingPin, setExistingPin] = useState("")
  const [, setExistingEmailConfirmationRequired] = useState(false)
  const [existingEmailConfirmationCode, setExistingEmailConfirmationCode] = useState("")
  const [existingStatus, setExistingStatus] = useState<"idle" | "submitting" | "done" | "error">("idle")
  const [existingError, setExistingError] = useState("")
  const [validation, setValidation] = useState<any>(initialValidation)
  const [existingAccountDetected, setExistingAccountDetected] = useState(false)
  const [telegramDone, setTelegramDone] = useState(false)
  const submitLockRef = useRef(false)
  const tokenPayload = useMemo(() => validation?.payload || decodeJwtPayload(token), [validation, token])
  const currentStep = status === "submitting" ? 2 : status === "done" ? 3 : 1
  const submitLocked = status === "submitting" || status === "done" || submitLockRef.current
  const isTelegramContext = String(tokenPayload?.provider || "").trim().toLowerCase() === "telegram"
  const passkeyLoginEmail = useMemo(() => {
    const candidates = [email, result?.userId]
    for (const candidate of candidates) {
      if (looksLikeEmail(candidate)) return String(candidate || "").trim().toLowerCase()
    }
    return ""
  }, [email, result?.userId])
  const passkeyLoginRedirectUrl = useMemo(() => {
    if (typeof window === "undefined" || !passkeyLoginEmail) return ""
    const url = new URL(`${window.location.origin}/login`)
    url.searchParams.set("auth", "passkey")
    url.searchParams.set("email", passkeyLoginEmail)
    url.searchParams.set("lang", language)
    return url.toString()
  }, [language, passkeyLoginEmail])
  const passkeyQrImageUrl = useMemo(() => {
    if (!passkeyQrTargetUrl) return ""
    return `https://quickchart.io/qr?size=320&margin=2&ecLevel=Q&format=png&text=${encodeURIComponent(passkeyQrTargetUrl)}`
  }, [passkeyQrTargetUrl])
  const loginHref = useMemo(() => {
    const params = new URLSearchParams()
    if (token) {
      params.set("token", token)
    }
    if (rawNextPath && rawNextPath !== "/chat") {
      params.set("next", rawNextPath)
    }
    params.set("lang", language)
    const query = params.toString()
    return query ? `/login?${query}` : "/login"
  }, [language, rawNextPath, token])

  useEffect(() => {
    let cancelled = false
    async function preparePasskeyQr() {
      if (!passkeyLoginRedirectUrl) {
        setPasskeyQrTargetUrl("")
        return
      }

      try {
        const response = await fetch("/api/external/short-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: passkeyLoginRedirectUrl,
            purpose: "create_account_passkey_qr",
            expires_in_hours: 6,
          }),
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok && payload?.url) {
          setPasskeyQrTargetUrl(String(payload.url))
          return
        }
        setPasskeyQrTargetUrl(passkeyLoginRedirectUrl)
      } catch {
        if (!cancelled) setPasskeyQrTargetUrl(passkeyLoginRedirectUrl)
      }
    }

    void preparePasskeyQr()
    return () => {
      cancelled = true
    }
  }, [passkeyLoginRedirectUrl])

  function redirectToUsed(customMessage?: string) {
    const params = new URLSearchParams()
    if (customMessage) params.set("message", customMessage)
    const query = params.toString()
    window.location.replace(`/link-used${query ? `?${query}` : ""}`)
  }

  function finishTelegramFlow(feedback?: string) {
    if (feedback) enqueueWebChatFeedback(feedback)
    setTelegramDone(true)
    closeIntermediatePage()
  }

  function finishAndClose(feedback?: string) {
    if (feedback) enqueueWebChatFeedback(feedback)
    setTelegramDone(true)
    closeIntermediatePage()
  }

  function finishWithCompletedResult(payload: any) {
    const sessionId = String(payload?.sessionId || payload?.session_id || "").trim()
    const sessionToken = String(payload?.sessionToken || payload?.session_token || "").trim()
    const resolvedUserId = String(payload?.userId || payload?.user_id || "").trim()

    if (sessionId && sessionToken) {
      saveClientSession(sessionId, sessionToken)
      try {
        localStorage.setItem("talk-to-stellar.sessionId", sessionId)
        localStorage.setItem("talk-to-stellar.sessionToken", sessionToken)
      } catch {
        // ignore storage failures
      }
    }

    if (resolvedUserId) {
      try {
        localStorage.setItem("talk-to-stellar.userName", resolvedUserId)
      } catch {
        // ignore storage failures
      }
    }

    setResult({
      success: true,
      sessionId: sessionId || undefined,
      sessionToken: sessionToken || undefined,
      userId: resolvedUserId || undefined,
      message: "Account created successfully.",
    })
    setStatus("done")
    if (isTelegramContext) {
      finishTelegramFlow(`Account created successfully.\nConnected account: ${resolvedUserId || "user"}`)
    } else {
      finishAndClose(`Account created successfully.\nConnected account: ${resolvedUserId || "user"}`)
    }
  }

  async function recoverOnboardingContextFromBackend(forceNewAccount = false, browserIdOverride?: string): Promise<RecoveryResult> {
    let browserId = browserIdOverride || localStorage.getItem("talk-to-stellar.browserId")
    if (!browserId) {
      browserId = generateBrowserId()
      localStorage.setItem("talk-to-stellar.browserId", browserId)
    }
    const response = await idempotentFetch(`/api/external/check-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "web",
        provider_user_id: browserId,
        force_new_account: forceNewAccount,
        language,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (payload?.exists === true) {
      return {
        mode: "existing",
        sessionId: payload?.sessionId ? String(payload.sessionId) : undefined,
        sessionToken: payload?.sessionToken ? String(payload.sessionToken) : undefined,
      }
    }
    const creationUrl = String(payload?.creationUrl || "")
    const recoveredToken = extractTokenFromUrl(creationUrl)
    if (recoveredToken) {
      return { mode: "token", token: recoveredToken }
    }
    return { mode: "none" }
  }

  async function recoverFreshOnboardingToken(): Promise<{ token?: string; browserId?: string }> {
    const freshBrowserId = generateBrowserId()
    const recovered = await recoverOnboardingContextFromBackend(true, freshBrowserId)
    if (recovered.mode === "token" && recovered.token) {
      localStorage.setItem("talk-to-stellar.browserId", freshBrowserId)
      return { token: recovered.token, browserId: freshBrowserId }
    }
    return {}
  }

  useEffect(() => {
    if (tokenFromUrl) {
      setToken(tokenFromUrl)
    }
  }, [tokenFromUrl])

  useEffect(() => {
    async function validateToken() {
      if (!token) return
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`)
        const payload = await response.json().catch(() => ({}))
        if (payload?.processing) {
          setValidation({
            success: true,
            valid: true,
            processing: true,
            message: String(payload?.message || "This link is processing. Wait a few seconds."),
            payload: payload?.payload || validation?.payload || decodeJwtPayload(token),
          })
          return
        }
        const isUsed = Boolean(payload?.used || payload?.alreadyCompleted)
        const isExpired = Boolean(payload?.expired)
        const responseMessage = String(payload?.message || "")
        if (isUsed && payload?.result) {
          finishWithCompletedResult(payload.result)
          return
        }
        if (isUsed || isExpired || String(payload?.message || "").toLowerCase().includes("já foi utilizado")) {
          redirectToUsed(String(payload?.message || "").trim() || "This link has already been used.")
          return
        }
        if (!response.ok) {
          if (responseMessage.toLowerCase().includes("fetch failed")) {
            setValidation({ success: true, valid: true, message: "Link received. Continue to finish your account." })
            return
          }
          redirectToUsed(responseMessage || "This link is invalid or has already been used.")
          return
        }
        if (payload?.valid === false) {
          redirectToUsed(responseMessage || "This link is invalid or has already been used.")
          return
        }
        const msg = String(payload?.message || "")
        if (msg.toLowerCase().includes("fetch failed")) {
          setValidation({ success: true, valid: true, message: "Link received. Continue to finish your account." })
          return
        }
        setValidation(payload)
      } catch (error) {
        setValidation({ success: true, valid: true, message: "Link received. Continue to finish your account." })
      }
    }

    validateToken()
  }, [token])

  useEffect(() => {
    if (!token.trim() || !validation?.processing) return
    let cancelled = false

    const poll = async () => {
      try {
        const response = await fetch(`/api/external/validate-token?token=${encodeURIComponent(token)}`, {
          cache: "no-store",
        })
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return

        if (payload?.used || payload?.alreadyCompleted) {
          if (payload?.result) {
            finishWithCompletedResult(payload.result)
            return
          }
          redirectToUsed(String(payload?.message || "").trim() || "This link has already been used.")
          return
        }

        if (payload?.processing) {
          setStatus("submitting")
          return
        }

        if (response.ok && payload?.valid) {
          setValidation(payload)
          if (status === "submitting") {
            setStatus("ready")
            submitLockRef.current = false
          }
        }
      } catch {
        // ignore transient polling errors
      }
    }

    const timer = window.setInterval(poll, 2500)
    void poll()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [token, validation?.processing, status])

  useEffect(() => {
    async function recoverTokenWhenMissing() {
      if (token.trim()) return
      try {
        const recovered = await recoverOnboardingContextFromBackend(forceNewAccount)

        if (recovered.mode === "existing" && !forceNewAccount) {
          setExistingAccountDetected(true)
          setValidation({
            success: true,
            valid: false,
            message: 'Account found in this browser. You can sign in with email and PIN or fill out the form to create a new account.',
          })
          return
        }

        if (recovered.mode === "token") {
          setExistingAccountDetected(false)
          setToken(recovered.token)
          setValidation({
            success: true,
            valid: true,
            message: isClaimPaymentContext
              ? "Creation link ready. After signup, you will automatically return to receive."
              : "Link recovered automatically.",
          })
        }
      } catch {
        // keep page usable for manual retry
      }
    }

    recoverTokenWhenMissing()
  }, [forceNewAccount, isClaimPaymentContext, token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPinError("")
    if (submitLockRef.current) return

    if (!/^\d{4,8}$/.test(pin)) {
      setPinError("PIN must contain 4 to 8 numeric digits.")
      return
    }
    if (pin !== pinConfirm) {
      setPinError("PIN and confirmation must match.")
      return
    }

    submitLockRef.current = true
    setStatus("submitting")
    setResult(null)

    try {
      let finalToken = token
      if (!finalToken.trim()) {
        const fresh = await recoverFreshOnboardingToken()
        if (fresh.token) {
          setExistingAccountDetected(false)
          finalToken = fresh.token
          setToken(finalToken)
        } else {
          const recovered = await recoverOnboardingContextFromBackend(true)
          if (recovered.mode === "existing") {
            setExistingAccountDetected(true)
            throw new Error("Could not generate a new creation link right now. Try again or use \"I already have an account\" to sign in.")
          }
          if (recovered.mode === "token") {
            setExistingAccountDetected(false)
            finalToken = recovered.token
            setToken(finalToken)
          }
        }
      }
      if (!finalToken.trim()) {
        throw new Error("Could not validate your link right now. Request a new access link in Telegram and try again.")
      }

      let browserId = localStorage.getItem("talk-to-stellar.browserId")
      if (!browserId) {
        browserId = generateBrowserId()
        localStorage.setItem("talk-to-stellar.browserId", browserId)
      }

      const response = await idempotentFetch(`/api/external/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: finalToken,
          name: name || undefined,
          email: email || undefined,
          phone_number: phoneNumber || undefined,
          cpf: cpf || undefined,
          pin,
          email_confirmation_code: emailConfirmationCode || undefined,
          browser_id: browserId,
          language,
        }),
      })

      const payload = (await response.json()) as FinalizeResponse
      if (!response.ok && payload?.processing) {
        setValidation({
          success: true,
          valid: true,
          processing: true,
          message: String(payload?.message || "This creation link is already processing. Wait for it to finish."),
          payload: validation?.payload || decodeJwtPayload(finalToken),
        })
        setStatus("submitting")
        setResult({
          success: false,
          processing: true,
          message: String(payload?.message || "This creation link is already processing. Wait for it to finish."),
        })
        return
      }
      if (payload?.emailConfirmationRequired) {
        setEmailConfirmationRequired(true)
        setResult(payload)
        setStatus("ready")
        submitLockRef.current = false
        return
      }
      setEmailConfirmationRequired(false)
      setEmailConfirmationCode("")
      setResult(payload)
      setStatus(response.ok ? "done" : "error")

      const finalizeMessage = String(payload?.message || payload?.error || "")
      if (!response.ok && (payload as any)?.notAssociated) {
        const params = new URLSearchParams()
        if (finalToken) params.set("token", finalToken)
        if (email.trim()) params.set("email", email.trim())
        if (rawNextPath && rawNextPath !== "/chat") params.set("next", rawNextPath)
        params.set("lang", language)
        window.location.replace(`/login?${params.toString()}`)
        return
      }
      if (!response.ok && (Boolean((payload as any)?.used || (payload as any)?.alreadyCompleted) || finalizeMessage.toLowerCase().includes("já foi utilizado"))) {
        redirectToUsed(finalizeMessage || "This link has already been used.")
        return
      }

      if (!response.ok || !payload?.success) {
        submitLockRef.current = false
      }

      if (response.ok && payload.sessionToken) {
        try {
          localStorage.setItem('talk-to-stellar.sessionToken', payload.sessionToken)
        } catch (storageError) {
          // ignore storage failures
        }
      }
      if (response.ok && payload.success) {
        saveClientSession(payload.sessionId, payload.sessionToken)
        localStorage.setItem("talk-to-stellar.userName", name || email || payload.userId || "User")
      }
      if (response.ok && payload.sessionId) {
        try {
          localStorage.setItem('talk-to-stellar.sessionId', payload.sessionId)
        } catch (storageError) {
          // ignore storage failures
        }
      }

      if (response.ok && payload.success && requestPasskey) {
        setPasskeyStatus("registering")
        setPasskeyError("")
        void registerAndSignInWithPasskey(payload)
        return
      }

      if (response.ok && payload.success) {
        if (isTelegramContext) {
          finishTelegramFlow(`Account created successfully.\nConnected account: ${email || name || payload.userId || "user"}`)
        } else {
          finishAndClose(`Account created successfully.\nConnected account: ${email || name || payload.userId || "user"}`)
        }
        return
      }
    } catch (error) {
      submitLockRef.current = false
      const message = error instanceof Error ? error.message : "Failed to finish account"
      setResult({ success: false, error: message })
      setStatus("error")
    }
  }

  async function registerAndSignInWithPasskey(baseResult?: FinalizeResponse, attempt = 0) {
    const currentResult = baseResult || result
    const userId = currentResult?.userId
    if (!userId) {
      setResult({ success: false, error: 'Could not start secure access right now' })
      return
    }

    if (!window.PublicKeyCredential) {
      setPasskeyStatus('error')
      setPasskeyError('This browser does not support Passkey/WebAuthn.')
      return
    }

    setPasskeyStatus('registering')
    setPasskeyError("")

    try {
      const initRes = await fetch(`/api/passkeys/register-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const initPayload = await initRes.json()
      if (!initRes.ok || !initPayload.success) throw new Error(initPayload.message || 'Failed to start secure access setup')

      const credential = await startRegistration({ optionsJSON: initPayload.options })

      setPasskeyStatus('registering')
      const completeRes = await fetch(`/api/passkeys/register-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          challenge_id: initPayload.challengeId,
          credential,
        }),
      })
      const completePayload = await completeRes.json()
      if (!completeRes.ok || !completePayload.success) {
        const serverMessage = String(completePayload?.message || "")
        if (attempt < 1 && isPasskeyChallengeExpiredMessage(serverMessage)) {
          submitLockRef.current = false
          setPasskeyStatus('registering')
          setPasskeyError('Challenge expired. Generating a new challenge...')
          await registerAndSignInWithPasskey(baseResult, attempt + 1)
          return
        }
        throw new Error(completePayload.message || 'Failed to complete secure access setup')
      }

      setPasskeyStatus('done')
      setResult({
        success: true,
        userId,
        sessionId: currentResult?.sessionId,
        sessionToken: currentResult?.sessionToken,
        passkeySessionToken: currentResult?.sessionToken,
        message: 'Biometrics enabled successfully',
      })
      if (isTelegramContext) {
        finishTelegramFlow(`Account created successfully.\nBiometrics enabled for ${name || email || userId}.`)
      } else {
        finishAndClose(`Account created successfully.\nBiometrics enabled for ${name || email || userId}.`)
      }
    } catch (err: any) {
      const message = getPasskeyErrorMessage(err)
      if (attempt < 1 && isPasskeyChallengeExpiredMessage(message)) {
        submitLockRef.current = false
        setPasskeyStatus('registering')
        setPasskeyError('Challenge expired. Generating a new challenge...')
        await registerAndSignInWithPasskey(baseResult, attempt + 1)
        return
      }
      submitLockRef.current = false
      setPasskeyStatus('error')
      setPasskeyError(message)
    }
  }

  async function handleLinkExisting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLockRef.current) return
    submitLockRef.current = true
    setExistingStatus("submitting")
    setExistingError("")

    try {
      let browserId = localStorage.getItem("talk-to-stellar.browserId")
      if (!browserId) {
        browserId = generateBrowserId()
        localStorage.setItem("talk-to-stellar.browserId", browserId)
      }
      const tokenPayload = validation?.payload || decodeJwtPayload(token)
      const externalProvider = String(tokenPayload?.provider || "").trim().toLowerCase()
      const externalProviderUserId = String(tokenPayload?.provider_user_id || "").trim()
      const linkProvider = externalProvider && externalProviderUserId ? externalProvider : "web"
      const linkProviderUserId = externalProvider && externalProviderUserId ? externalProviderUserId : browserId

      const response = await idempotentFetch(`/api/external/link-existing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: linkProvider,
          provider_user_id: linkProviderUserId,
          token: externalProvider && externalProviderUserId ? token : undefined,
          email: existingEmail,
          pin: existingPin,
          email_confirmation_code: existingEmailConfirmationCode || undefined,
          language,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (payload?.emailConfirmationRequired) {
        setExistingEmailConfirmationRequired(true)
        setExistingStatus("idle")
        setExistingError(String(payload?.message || "Enter the code sent by email to continue."))
        submitLockRef.current = false
        return
      }
      if (!response.ok || !payload?.success) {
        const linkMessage = String(payload?.message || "")
        if (payload?.used || payload?.alreadyCompleted || linkMessage.toLowerCase().includes("já foi utilizado")) {
          redirectToUsed(linkMessage || "This link has already been used.")
          return
        }
        throw new Error(payload?.message || "Could not sign in with email and PIN.")
      }

      if (payload?.sessionId) {
        localStorage.setItem("talk-to-stellar.sessionId", String(payload.sessionId))
      }
      if (payload?.sessionToken) {
        localStorage.setItem("talk-to-stellar.sessionToken", String(payload.sessionToken))
      }
      localStorage.setItem("talk-to-stellar.userName", existingEmail.trim())

      setExistingEmailConfirmationRequired(false)
      setExistingEmailConfirmationCode("")
      setExistingStatus("done")
      if (isTelegramContext) {
        finishTelegramFlow(`Sign-in completed.\nConnected account: ${existingEmail.trim()}`)
      } else {
        finishAndClose(`Sign-in completed.\nConnected account: ${existingEmail.trim()}`)
      }
    } catch (error) {
      submitLockRef.current = false
      setExistingStatus("error")
      setExistingError(error instanceof Error ? error.message : "Failed to sign in with email and PIN.")
    }
  }

  if (telegramDone) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-6 text-slate-100">
        <section className="w-full max-w-md rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-6 text-center shadow-2xl">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-200">{isTelegramContext ? L("Telegram conectado", "Telegram connected") : L("Conta conectada", "Account connected")}</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">{L("Sua conta foi vinculada.", "Your account is linked.")}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            {isTelegramContext ? L("Volte ao Telegram e envie sua próxima mensagem.", "Go back to Telegram and send your next message.") : L("Processo concluído.", "Process complete.")}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {INTERMEDIATE_PAGE_CLOSE_COPY}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12 sm:px-6">
        <div className="grid min-w-0 w-full gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur sm:p-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:p-10">
          <section className="min-w-0 space-y-6 overflow-hidden">
            <div className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-cyan-200">
              {L("Criar conta", "Create account")}
            </div>
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                {isClaimPaymentContext ? L("Crie sua conta para receber", "Create your account to receive") : L("Finalize sua conta TalkToStellar", "Finish your TalkToStellar account")}
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                {isClaimPaymentContext
                  ? L("Você está a poucos passos de receber. Cadastre sua conta global e volte automaticamente ao link de pagamento.", "You are a few steps away from receiving. Create your global account and return automatically to the payment link.")
                  : L("Preencha os dados abaixo e siga o passo a passo para concluir sua conta com segurança.", "Fill in the details below and follow the steps to finish your account securely.")}
              </p>
              {validation && (
                <div className="mt-3 rounded-md bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <strong>{L("Status do link: ", "Link status: ")}</strong>
                  {token && validation.valid ? (
                    <span className="text-emerald-300">{L("Link válido", "Valid link")}</span>
                  ) : validation.message ? (
                    <span className="text-cyan-200">{validation.message}</span>
                  ) : (
                    <span className="text-rose-300">{L("Link inválido ou ausente", "Invalid or missing link")}</span>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 text-xs">
              {[L("Identidade", "Identity"), L("Segurança", "Security"), L("Conta pronta", "Account ready")].map((step, index) => (
                <motion.div key={step} layout className={`rounded-xl px-3 py-2 text-center transition ${currentStep >= index + 1 ? "bg-cyan-400/20 text-cyan-100" : "text-slate-400"}`}>
                  {step}
                </motion.div>
              ))}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{L("1. Acesse", "1. Access")}</p>
                <p className="mt-2 text-sm text-slate-200">
                  {isClaimPaymentContext
                    ? L("Você chegou por um link de pagamento. A conta criada aqui será usada para receber.", "You arrived from a payment link. The account created here will be used to receive.")
                    : L("Abra o link recebido para iniciar o processo de criação da conta.", "Open the received link to start creating the account.")}
                </p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">{L("2. Conclua", "2. Finish")}</p>
                <p className="mt-2 text-sm text-slate-200">
                  {L("Informe seus dados, crie o PIN e finalize. Tempo médio: cerca de 2 minutos.", "Enter your details, create your PIN, and finish. Average time: about 2 minutes.")}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
              {L("Guia rápido:", "Quick guide:")}
              <span className="ml-2 break-all font-mono text-cyan-100">
                {L("1) Nome e contato, 2) PIN, 3) Finalizar conta, 4) voltar para receber.", "1) Name and contact, 2) PIN, 3) Finish account, 4) return to receive.")}
              </span>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-50">
                {L("Verificação do link:", "Link check:")}
                <span className="ml-2 break-all font-mono text-cyan-100">
                  {token ? L('pronto', 'ready') : existingAccountDetected ? L('novo link será gerado ao finalizar', 'a new link will be generated when finishing') : L('link ausente', 'missing link')}
                </span>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">{L("Nome", "Name")}</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  type="text"
                  placeholder={L("Seu nome", "Your name")}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">{L("E-mail", "Email")}</span>
                <input
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setEmailConfirmationRequired(false)
                    setEmailConfirmationCode("")
                  }}
                  type="email"
                  placeholder="you@example.com"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">{L("Telefone", "Phone")}</span>
                <input
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  type="tel"
                  placeholder="+55 11 99999-9999"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">CPF</span>
                <input
                  value={cpf}
                  onChange={(event) => setCpf(event.target.value)}
                  type="text"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">{L("PIN (4 a 8 dígitos)", "PIN (4 to 8 digits)")}</span>
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder={L("Crie seu PIN", "Create your PIN")}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">{L("Confirmar PIN", "Confirm PIN")}</span>
                <input
                  value={pinConfirm}
                  onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, ""))}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder={L("Confirme seu PIN", "Confirm your PIN")}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/10"
                />
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={requestPasskey}
                  onChange={(event) => setRequestPasskey(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-slate-900"
                />
                <span>{L("Ativar passkey agora (recomendado para login rápido e seguro).", "Enable passkey now (recommended for fast, secure login).")}</span>
              </label>

              {emailConfirmationRequired && (
                <label className="block space-y-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3">
                  <span className="text-sm font-medium text-cyan-50">{L("Código enviado por e-mail", "Code sent by email")}</span>
                  <input
                    value={emailConfirmationCode}
                    onChange={(event) => setEmailConfirmationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60"
                  />
                  <span className="block text-xs text-cyan-100">{result?.message || L("Confira seu e-mail e informe o código para continuar.", "Check your email and enter the code to continue.")}</span>
                  {result?.devCode && <span className="block text-xs text-cyan-100">Dev code: {result.devCode}</span>}
                </label>
              )}

              {pinError && <p className="text-rose-300">{pinError}</p>}

              <button
                type="submit"
                disabled={submitLocked || !pin.trim() || !pinConfirm.trim() || (emailConfirmationRequired && emailConfirmationCode.length !== 6)}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "submitting" ? <span className="inline-flex items-center gap-2"><Spinner />{L("Finalizando conta...", "Finishing account...")}</span> : emailConfirmationRequired ? L("Confirmar e finalizar", "Confirm and finish") : L("3) Finalizar conta", "3) Finish account")}
              </button>
            </form>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-slate-200">
              <p className="font-medium text-white">Status</p>
              {status === "ready" && <p className="mt-2 text-slate-400">{L("Aguardando validação do link.", "Waiting for link validation.")}</p>}
              {status === "submitting" && <div className="mt-3 inline-flex items-center gap-2 text-slate-300"><TypingDots />{L("Criando conta e preparando wallet...", "Creating account and preparing wallet...")}</div>}
              <AnimatePresence mode="wait">
              {status === "done" && result?.success && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2 space-y-1 text-emerald-300">
                  <p>{L("Conta criada com sucesso.", "Account created successfully.")}</p>
                </motion.div>
              )}
              {result?.success && (
                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => registerAndSignInWithPasskey()}
                    disabled={submitLocked || passkeyStatus === 'registering'}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {passkeyStatus === 'registering'
                      ? L('Abrindo biometria...', 'Opening biometrics...')
                      : L('Ativar biometria', 'Enable biometrics')}
                  </button>
                  <p className="text-xs text-slate-400">
                    {L("Toque no botão para abrir a confirmação por digital, Face ID ou desbloqueio do celular.", "Tap the button to confirm with fingerprint, Face ID, or your phone unlock.")}
                  </p>
                  {passkeyQrImageUrl && (
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
                      <p className="font-medium text-white">{L("Usar Passkey no celular", "Use Passkey on your phone")}</p>
                      <p className="mt-1">{L("Escaneie para abrir o login com Passkey no celular e autorizar com Touch ID.", "Scan to open Passkey login on your phone and authorize with Touch ID.")}</p>
                      <div className="mt-2 flex justify-center">
                        <img
                          src={passkeyQrImageUrl}
                          alt="QR code for Passkey login on mobile"
                          className="h-56 w-56 rounded-xl border border-white/10 bg-white p-2"
                        />
                      </div>
                    </div>
                  )}
                  {passkeyError && <p className="text-xs text-rose-300">{passkeyError}</p>}
                </div>
              )}
              {status === "error" && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-rose-300">{result?.error || result?.message || L("Algo deu errado.", "Something went wrong.")}</motion.p>}
              {passkeyStatus === 'done' && result?.passkeySessionToken && (
                <p className="mt-2 break-all text-emerald-300">{L("Biometria ativada com sucesso.", "Biometrics enabled successfully.")}</p>
              )}
              </AnimatePresence>
            </div>

            <a
              href={loginHref}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              {L("Já tenho conta", "I already have an account")}
            </a>
          </section>
        </div>
      </div>
    </main>
  )
}
