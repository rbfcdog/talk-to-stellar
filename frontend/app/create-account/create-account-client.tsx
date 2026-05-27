"use client"

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from '@simplewebauthn/browser'
import { useSearchParams } from "next/navigation"
import { saveClientSession } from "@/lib/session"
import { idempotentFetch } from "@/lib/idempotency"
import { closeIntermediatePage, enqueueWebChatFeedback, INTERMEDIATE_PAGE_CLOSE_COPY } from "@/lib/web-feedback"
import { Spinner, TypingDots } from "@/components/shared/feedback"
import { useLanguage } from "@/lib/i18n"
import { mapPublicError } from "@/lib/public-errors"
import { AuthShell } from "@/components/auth/AuthShell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Fingerprint } from "lucide-react"

type FinalizeResponse = {
  success: boolean
  code?: string
  sessionId?: string
  userId?: string
  message?: string
  error?: string
  request_id?: string
  requestId?: string
  support_code?: string
  supportCode?: string
  processing?: boolean
  used?: boolean
  alreadyCompleted?: boolean
  emailConfirmationRequired?: boolean
  email?: string
  expiresAt?: string
  devCode?: string
}

const EMAIL_CONFIRMATION_ENABLED = process.env.NEXT_PUBLIC_ENABLE_EMAIL_CONFIRMATION === "true"
const PASSKEY_ENROLLMENT_ENABLED = process.env.NEXT_PUBLIC_PASSKEY_ENABLED !== "false"

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
  | { mode: "existing"; sessionId?: string }
  | { mode: "none" }

type PreparedPasskeyRegistration = {
  userId: string
  sessionId: string
  challengeId: string
  options: any
}

function getPasskeyErrorMessage(error: any): string {
  const name = String(error?.name || "")
  const message = String(error?.message || error || "")
  const normalized = message.toLowerCase()

  if (name === "NotAllowedError") {
    return "Biometric confirmation expired or was canceled. Tap the button again and confirm on your phone."
  }

  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "Biometrics must open on the correct domain with HTTPS. Check PASSKEY_RP_ID/PASSKEY_ORIGIN in the backend."
  }

  if (name === "AbortError" || name === "TimeoutError" || normalized.includes("timeout") || normalized.includes("timed out")) {
    return "Biometric confirmation expired. Tap the button again and confirm on your phone."
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

function readableErrorMessage(error: any) {
  return error instanceof Error ? error.message : String(error || "")
}

function publicCreateAccountErrorMessage(error: unknown, language: string) {
  const raw = error instanceof Error ? error.message : String(error || "").trim()
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

  const alreadyPublic =
    /^(nao foi possivel concluir|não foi possível concluir|pin |pin e|pin é|telefone |cpf |informe |este link|a conta informada|ja existe|já existe|conta ja|conta já|confirmacao|confirmação|sua sessao|sua sessão)/i.test(raw) &&
    !/duplicate key|unique constraint|violates unique|idx_[a-z0-9_]+|23505|schema cache|relation .* does not exist|jwt malformed|secret|stack|sql/i.test(raw)

  if (alreadyPublic) return raw
  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return language === "pt-BR"
      ? "A conexão caiu antes de concluir. Verifique a internet do celular e tente novamente."
      : "The connection dropped before finishing. Check your phone connection and try again."
  }
  return mapPublicError(error, language).message
}

function createAccountErrorTrace(payload?: FinalizeResponse | null) {
  const requestId = String(payload?.request_id || payload?.requestId || "").trim()
  const supportCode = String(payload?.support_code || payload?.supportCode || "").trim()
  return requestId || supportCode
}

function withCreateAccountTrace(message: string, payload: FinalizeResponse | null | undefined, language: string) {
  const trace = createAccountErrorTrace(payload)
  if (!trace) return message
  return `${message}\n${language === "pt-BR" ? "ID do erro" : "Error ID"}: ${trace}`
}

function isLikelyEmbeddedBrowser() {
  if (typeof navigator === "undefined") return false
  const userAgent = navigator.userAgent || ""
  return /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Twitter|; wv\)/i.test(userAgent)
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
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en
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
  const [requestPasskey, setRequestPasskey] = useState(false)
  const [status, setStatus] = useState("ready")
  const [passkeyStatus, setPasskeyStatus] = useState<"idle" | "preparing" | "registering" | "authenticating" | "done" | "error">("idle")
  const [passkeyError, setPasskeyError] = useState("")
  const [passkeyHint, setPasskeyHint] = useState("")
  const [passkeyUnavailableReason, setPasskeyUnavailableReason] = useState("")
  const [preparedPasskeyRegistration, setPreparedPasskeyRegistration] = useState<PreparedPasskeyRegistration | null>(null)
  const [passkeyQrTargetUrl, setPasskeyQrTargetUrl] = useState("")
  const [result, setResult] = useState<FinalizeResponse | null>(null)
  const [validation, setValidation] = useState<any>(initialValidation)
  const [telegramDone, setTelegramDone] = useState(false)
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0)
  const submitLockRef = useRef(false)
  const loadingPhrases = useMemo(() => [
    L("Preparando sua conta da forma mais otimizada.", "Preparing your account with the most optimized setup."),
    L("Organizando saldo, contatos e chaves de recebimento.", "Organizing balance, contacts, and receiving keys."),
    L("Criando contatos iniciais para você testar pagamentos.", "Creating starter contacts so you can test payments."),
    L("Ativando a rota mais otimizada para PIX e pagamentos.", "Enabling the most optimized route for PIX and payments."),
    L("Quase pronto: validando tudo antes de conectar.", "Almost ready: validating everything before connecting."),
  ], [language])
  useEffect(() => {
    if (status !== "submitting") {
      setLoadingPhraseIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setLoadingPhraseIndex((current) => (current + 1) % loadingPhrases.length)
    }, 2200)
    return () => window.clearInterval(timer)
  }, [loadingPhrases.length, status])
  const tokenPayload = useMemo(() => validation?.payload || decodeJwtPayload(token), [validation, token])
  const currentStep = status === "submitting" ? 2 : status === "done" ? 3 : 1
  const submitLocked = status === "submitting" || status === "done" || submitLockRef.current
  const passkeyButtonDisabled = Boolean(passkeyUnavailableReason) || passkeyStatus === "preparing" || passkeyStatus === "registering" || passkeyStatus === "done"
  const isTelegramContext = String(tokenPayload?.provider || "").trim().toLowerCase() === "telegram"
  const passkeyLoginEmail = useMemo(() => {
    const candidates = [email, result?.userId]
    for (const candidate of candidates) {
      if (looksLikeEmail(candidate)) return String(candidate || "").trim().toLowerCase()
    }
    return ""
  }, [email, result?.userId])
  const passkeyLoginRedirectUrl = useMemo(() => {
    if (!PASSKEY_ENROLLMENT_ENABLED) return ""
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
    const resolvedUserId = String(payload?.userId || payload?.user_id || "").trim()

    if (sessionId) {
      saveClientSession()
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
      userId: resolvedUserId || undefined,
      message: L("Conta criada com sucesso.", "Account created successfully."),
    })
    setStatus("done")
    if (isTelegramContext) {
      finishTelegramFlow(L(`Conta criada com sucesso.\nConta conectada: ${resolvedUserId || "usuário"}`, `Account created successfully.\nConnected account: ${resolvedUserId || "user"}`))
    } else {
      finishAndClose(L(`Conta criada com sucesso.\nConta conectada: ${resolvedUserId || "usuário"}`, `Account created successfully.\nConnected account: ${resolvedUserId || "user"}`))
    }
  }

  function finishWithoutPasskey() {
    const connectedLabel = email || name || result?.userId || L("usuário", "user")
    const feedback = L(
      `Conta criada com sucesso.\nConta conectada: ${connectedLabel}`,
      `Account created successfully.\nConnected account: ${connectedLabel}`,
    )
    if (isTelegramContext) {
      finishTelegramFlow(feedback)
    } else {
      finishAndClose(feedback)
    }
  }

  async function recoverOnboardingContextFromBackend(forceNewAccount = false, browserIdOverride?: string): Promise<RecoveryResult> {
    let browserId = browserIdOverride || localStorage.getItem("talk-to-stellar.browserId")
    if (!browserId) {
      browserId = generateBrowserId()
      localStorage.setItem("talk-to-stellar.browserId", browserId)
    }
    const response = await fetch(`/api/external/check-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        provider: "web",
        provider_user_id: browserId,
        force_new_account: forceNewAccount,
        language,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || payload?.error || "Could not create an account link right now.")
    }
    if (payload?.exists === true) {
      return {
        mode: "existing",
        sessionId: payload?.sessionId ? String(payload.sessionId) : undefined,
      }
    }
    const directToken = String(payload?.token || "")
    if (directToken) {
      return { mode: "token", token: directToken }
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

  async function getPasskeyUnavailableReason(): Promise<string> {
    if (typeof window === "undefined") return ""

    if (!browserSupportsWebAuthn()) {
      return L(
        "Este navegador nao suporta Passkey. A conta ja funciona com PIN.",
        "This browser does not support Passkey. The account already works with PIN.",
      )
    }

    const isLocalhost = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    if (!window.isSecureContext && !isLocalhost) {
      return L(
        "Passkey precisa abrir em HTTPS. A conta ja funciona com PIN.",
        "Passkey must open on HTTPS. The account already works with PIN.",
      )
    }

    if (isLikelyEmbeddedBrowser()) {
      return L(
        "Conta criada. Para ativar biometria, abra este link no Chrome ou Safari, fora do navegador do WhatsApp.",
        "Account created. To enable biometrics, open this link in Chrome or Safari, outside WhatsApp's in-app browser.",
      )
    }

    const platformAvailable = await platformAuthenticatorIsAvailable().catch(() => false)
    if (!platformAvailable) {
      return L(
        "Este aparelho/navegador nao liberou biometria agora. A conta ja funciona com PIN.",
        "This device/browser did not make biometrics available now. The account already works with PIN.",
      )
    }

    return ""
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
          setValidation({
            success: true,
            valid: false,
            message: 'Account found in this browser. Fill out the form to create a new account.',
          })
          return
        }

        if (recovered.mode === "token") {
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
      let tokenRecoveryError = ""
      if (!finalToken.trim()) {
        let fresh: { token?: string; browserId?: string } = {}
        try {
          fresh = await recoverFreshOnboardingToken()
        } catch (error) {
          tokenRecoveryError = readableErrorMessage(error)
        }
        if (fresh.token) {
          finalToken = fresh.token
          setToken(finalToken)
        } else {
          let recovered: RecoveryResult = { mode: "none" }
          try {
            recovered = await recoverOnboardingContextFromBackend(true)
          } catch (error) {
            tokenRecoveryError = readableErrorMessage(error) || tokenRecoveryError
          }
          if (recovered.mode === "existing") {
            throw new Error("Could not generate a new creation link right now. Try again with a fresh creation link.")
          }
          if (recovered.mode === "token") {
            finalToken = recovered.token
            setToken(finalToken)
          }
        }
      }
      if (!finalToken.trim()) {
        throw new Error(tokenRecoveryError || "Could not create a secure account link right now. Open a fresh signup link and try again.")
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

      const requestId = response.headers.get("x-request-id") || ""
      const payload = (await response.json().catch(() => ({
        success: false,
        message: response.statusText || L("Não consegui concluir agora. Tente novamente em alguns segundos.", "I could not finish that right now. Try again in a few seconds."),
      }))) as FinalizeResponse
      if (requestId && !payload.request_id && !payload.requestId) {
        payload.request_id = requestId
      }
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
        if (!EMAIL_CONFIRMATION_ENABLED) {
          throw new Error(L("Confirmação por e-mail está desativada neste ambiente. Peça um novo link no chat ou entre com PIN.", "Email confirmation is disabled in this environment. Request a new link in chat or sign in with PIN."))
        }
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

      if (response.ok && payload.success) {
        saveClientSession()
        localStorage.setItem("talk-to-stellar.userName", name || email || payload.userId || "User")
      }

      if (response.ok && payload.success && PASSKEY_ENROLLMENT_ENABLED && requestPasskey) {
        setPasskeyHint(L("Conta criada. Preparando biometria para este aparelho.", "Account created. Preparing biometrics for this device."))
        void preparePasskeyRegistration(payload.userId || "", payload)
        return
      }

      if (response.ok && payload.success) {
        const connectedLabel = email || name || payload.userId || L("usuário", "user")
        if (isTelegramContext) {
          finishTelegramFlow(L(`Conta criada com sucesso.\nConta conectada: ${connectedLabel}`, `Account created successfully.\nConnected account: ${connectedLabel}`))
        } else {
          finishAndClose(L(`Conta criada com sucesso.\nConta conectada: ${connectedLabel}`, `Account created successfully.\nConnected account: ${connectedLabel}`))
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

  async function preparePasskeyRegistration(userId: string, authResult?: FinalizeResponse | null) {
    if (!userId) {
      setPasskeyStatus('error')
      setPasskeyError('Could not prepare biometrics right now.')
      return false
    }
    const sessionId = String(authResult?.sessionId || result?.sessionId || "").trim()
    if (!sessionId) {
      setPasskeyStatus('error')
      setPasskeyError('Sign in again before enabling biometrics.')
      return false
    }

    setPasskeyStatus('preparing')
    setPasskeyError("")
    setPasskeyHint(L("Preparando biometria para este aparelho.", "Preparing biometrics for this device."))
    setPreparedPasskeyRegistration(null)
    setPasskeyUnavailableReason("")

    try {
      const unavailableReason = await getPasskeyUnavailableReason()
      if (unavailableReason) {
        setPasskeyStatus('idle')
        setPasskeyHint(unavailableReason)
        setPasskeyUnavailableReason(unavailableReason)
        return false
      }

      const initRes = await fetch(`/api/passkeys/register-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          session_id: sessionId,
        }),
      })
      const initPayload = await initRes.json().catch(() => ({}))
      if (!initRes.ok || !initPayload.success || !initPayload.options || !initPayload.challengeId) {
        throw new Error(initPayload.message || 'Failed to start secure access setup')
      }

      setPreparedPasskeyRegistration({
        userId,
        sessionId,
        challengeId: String(initPayload.challengeId),
        options: initPayload.options,
      })
      setPasskeyStatus('idle')
      setPasskeyUnavailableReason("")
      setPasskeyHint(L("Biometria pronta. Toque no botão para confirmar no celular.", "Biometrics ready. Tap the button to confirm on your phone."))
      return true
    } catch (err: any) {
      setPasskeyStatus('error')
      setPasskeyError(getPasskeyErrorMessage(err))
      return false
    }
  }

  async function registerAndSignInWithPasskey(baseResult?: FinalizeResponse) {
    const currentResult = baseResult || result
    const userId = currentResult?.userId
    if (!userId) {
      setResult({ success: false, error: 'Could not start secure access right now' })
      return
    }

    const unavailableReason = await getPasskeyUnavailableReason()
    if (unavailableReason) {
      setPasskeyStatus('idle')
      setPasskeyHint(unavailableReason)
      setPasskeyUnavailableReason(unavailableReason)
      return
    }
    setPasskeyUnavailableReason("")

    const prepared = preparedPasskeyRegistration?.userId === userId ? preparedPasskeyRegistration : null
    if (!prepared) {
      const preparedNow = await preparePasskeyRegistration(userId, currentResult)
      if (preparedNow) {
        setPasskeyHint(L("Biometria pronta. Toque no botão novamente para abrir a confirmação.", "Biometrics ready. Tap the button again to open confirmation."))
      }
      return
    }

    setPasskeyStatus('registering')
    setPasskeyError("")
    setPasskeyHint(L("Confirme com digital, Face ID ou desbloqueio do celular.", "Confirm with fingerprint, Face ID, or phone unlock."))

    try {
      const credential = await startRegistration({ optionsJSON: prepared.options })
      setPasskeyStatus('registering')
      const completeRes = await fetch(`/api/passkeys/register-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          session_id: prepared.sessionId,
          challenge_id: prepared.challengeId,
          credential,
        }),
      })
      const completePayload = await completeRes.json()
      if (!completeRes.ok || !completePayload.success) {
        const serverMessage = String(completePayload?.message || "")
        if (isPasskeyChallengeExpiredMessage(serverMessage)) {
          await preparePasskeyRegistration(userId, currentResult)
          setPasskeyHint(L("A confirmação expirou. Toque no botão novamente.", "Confirmation expired. Tap the button again."))
          return
        }
        throw new Error(completePayload.message || 'Failed to complete secure access setup')
      }

      setPasskeyStatus('done')
      setPreparedPasskeyRegistration(null)
      setPasskeyHint("")
      setResult({
        success: true,
        userId,
        sessionId: currentResult?.sessionId,
        message: 'Biometrics enabled successfully',
      })
      if (isTelegramContext) {
        finishTelegramFlow(L(`Conta criada com sucesso.\nBiometria ativada para ${name || email || userId}.`, `Account created successfully.\nBiometrics enabled for ${name || email || userId}.`))
      } else {
        finishAndClose(L(`Conta criada com sucesso.\nBiometria ativada para ${name || email || userId}.`, `Account created successfully.\nBiometrics enabled for ${name || email || userId}.`))
      }
    } catch (err: any) {
      const message = getPasskeyErrorMessage(err)
      if (isPasskeyChallengeExpiredMessage(message) || message.toLowerCase().includes("expired")) {
        await preparePasskeyRegistration(userId, currentResult)
        setPasskeyHint(L("A confirmação expirou. Toque no botão novamente.", "Confirmation expired. Tap the button again."))
        return
      }
      submitLockRef.current = false
      setPasskeyStatus('error')
      setPasskeyError(message)
    }
  }

  if (telegramDone) {
    return (
      <AuthShell
        title={L("Sua conta foi vinculada.", "Your account is linked.")}
        description={
          <>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tts-confirm">
              {isTelegramContext ? L("Telegram conectado", "Telegram connected") : L("Conta conectada", "Account connected")}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-tts-muted">
              {isTelegramContext
                ? L("Volte ao Telegram e envie sua próxima mensagem.", "Go back to Telegram and send your next message.")
                : L("Processo concluído.", "Process complete.")}
            </p>
            <p className="mt-2 text-xs text-tts-muted">{INTERMEDIATE_PAGE_CLOSE_COPY}</p>
          </>
        }
      >
        <div />
      </AuthShell>
    )
  }

  const STEPS = [L("Identidade", "Identity"), L("Segurança", "Security"), L("Conta pronta", "Account ready")]
  const submitDisabled =
    submitLocked ||
    !pin.trim() ||
    !pinConfirm.trim() ||
    (EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired && emailConfirmationCode.length !== 6)

  return (
    <AuthShell
      title={
        isClaimPaymentContext
          ? L("Crie sua conta para receber", "Create your account to receive")
          : L("Finalize sua conta TalkToStellar", "Finish your TalkToStellar account")
      }
      description={
        isClaimPaymentContext
          ? L(
              "Você está a poucos passos de receber. Cadastre sua conta e volte ao link de pagamento.",
              "You are a few steps away from receiving. Create your account and return to the payment link.",
            )
          : L(
              "Preencha os dados abaixo para concluir sua conta com segurança.",
              "Fill in the details below to finish your account securely.",
            )
      }
      footer={
        <a
          href={loginHref}
          className="text-[12px] text-tts-muted underline-offset-4 hover:text-tts-deep hover:underline"
        >
          {L("Já tenho conta", "I already have an account")}
        </a>
      }
      className="max-w-md"
    >
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-tts-border bg-tts-bg p-1.5 text-[11px]">
        {STEPS.map((step, index) => (
          <motion.div
            key={step}
            layout
            className={`rounded-md px-2 py-1.5 text-center transition-colors ${
              currentStep >= index + 1
                ? "bg-tts-gold-bg font-medium text-tts-deep"
                : "text-tts-muted"
            }`}
          >
            {step}
          </motion.div>
        ))}
      </div>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">{L("Nome", "Name")}</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            type="text"
            placeholder={L("Seu nome", "Your name")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">{L("E-mail", "Email")}</span>
          <Input
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              setEmailConfirmationRequired(false)
              setEmailConfirmationCode("")
            }}
            type="email"
            placeholder="you@example.com"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">{L("Telefone", "Phone")}</span>
          <Input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            type="tel"
            placeholder="+55 11 99999-9999"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">CPF</span>
          <Input
            value={cpf}
            onChange={(event) => setCpf(event.target.value)}
            type="text"
            inputMode="numeric"
            placeholder="000.000.000-00"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">
            {L("PIN (4 a 8 dígitos)", "PIN (4 to 8 digits)")}
          </span>
          <Input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder={L("Crie seu PIN", "Create your PIN")}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-tts-deep">
            {L("Confirmar PIN", "Confirm PIN")}
          </span>
          <Input
            value={pinConfirm}
            onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, ""))}
            type="password"
            inputMode="numeric"
            maxLength={8}
            placeholder={L("Confirme seu PIN", "Confirm your PIN")}
          />
        </label>

        {PASSKEY_ENROLLMENT_ENABLED && (
          <label className="flex items-start gap-3 rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-xs text-tts-deep">
            <input
              type="checkbox"
              checked={requestPasskey}
              onChange={(event) => setRequestPasskey(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-tts-border"
            />
            <span>
              {L(
                "Opcional: ativar passkey agora. Para demo, você pode usar apenas PIN e ativar biometria depois.",
                "Optional: enable passkey now. For demos, you can use PIN only and enable biometrics later.",
              )}
            </span>
          </label>
        )}

        {EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired && (
          <label className="flex flex-col gap-1.5 rounded-lg border-l-4 border-tts-gold bg-tts-gold-bg px-3 py-2.5">
            <span className="text-xs font-medium text-tts-deep">
              {L("Código enviado por e-mail", "Code sent by email")}
            </span>
            <Input
              value={emailConfirmationCode}
              onChange={(event) => setEmailConfirmationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
            />
            <span className="text-[11px] text-tts-muted">
              {result?.message || L("Confira seu e-mail e informe o código.", "Check your email and enter the code.")}
            </span>
            {result?.devCode && (
              <span className="font-mono-financial text-[11px] text-tts-muted">
                Dev code: {result.devCode}
              </span>
            )}
          </label>
        )}

        {pinError && (
          <p className="rounded-lg border-l-4 border-tts-error bg-tts-error/10 px-3 py-2 text-xs text-tts-error">
            {pinError}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          disabled={submitDisabled}
          className="w-full bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
        >
          {status === "submitting" ? (
            <span className="inline-flex items-center gap-2">
              <Spinner />
              {L("Finalizando conta...", "Finishing account...")}
            </span>
          ) : EMAIL_CONFIRMATION_ENABLED && emailConfirmationRequired ? (
            L("Confirmar e finalizar", "Confirm and finish")
          ) : (
            L("Finalizar conta", "Finish account")
          )}
        </Button>
      </form>

      <div className="rounded-xl border border-tts-border bg-tts-bg p-4 text-sm text-tts-deep">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-tts-muted">Status</p>
        {status === "ready" && (
          <p className="mt-2 text-xs text-tts-muted">
            {L("Aguardando validação do link.", "Waiting for link validation.")}
          </p>
        )}
        {status === "submitting" && (
          <div className="mt-3 flex flex-col gap-3 text-xs text-tts-deep">
            <div className="inline-flex items-center gap-2">
              <TypingDots />
              {L("Criando sua conta...", "Creating your account...")}
            </div>
            <motion.p
              key={loadingPhraseIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border-l-4 border-tts-gold bg-tts-gold-bg px-3 py-2 text-tts-deep"
            >
              {loadingPhrases[loadingPhraseIndex]}
            </motion.p>
          </div>
        )}
        <AnimatePresence mode="wait">
          {status === "done" && result?.success && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 text-xs text-tts-confirm"
            >
              {L("Conta criada com sucesso.", "Account created successfully.")}
            </motion.p>
          )}
          {result?.success && PASSKEY_ENROLLMENT_ENABLED && (
            <div className="mt-3 flex flex-col gap-2">
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => registerAndSignInWithPasskey()}
                disabled={passkeyButtonDisabled}
                className="w-full"
              >
                <Fingerprint className="mr-2 h-4 w-4" />
                {passkeyStatus === "preparing"
                  ? L("Preparando biometria...", "Preparing biometrics...")
                  : passkeyStatus === "registering"
                    ? L("Abrindo biometria...", "Opening biometrics...")
                    : L("Ativar biometria", "Enable biometrics")}
              </Button>
              {passkeyStatus !== "registering" && passkeyStatus !== "preparing" && passkeyStatus !== "done" && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={finishWithoutPasskey}
                  className="w-full"
                >
                  {L("Pular e continuar com PIN", "Skip and continue with PIN")}
                </Button>
              )}
              <p className="text-[11px] text-tts-muted">
                {L(
                  "Passkey é opcional. Se demorar ou cancelar, continue com PIN.",
                  "Passkey is optional. If it times out or cancels, continue with PIN.",
                )}
              </p>
              {passkeyHint && <p className="text-[11px] text-tts-gold">{passkeyHint}</p>}
              {passkeyQrImageUrl && (
                <div className="rounded-xl border border-tts-border bg-tts-bg p-3 text-[11px] text-tts-muted">
                  <p className="font-medium text-tts-deep">
                    {L("Usar Passkey no celular", "Use Passkey on your phone")}
                  </p>
                  <p className="mt-1">
                    {L(
                      "Escaneie para abrir o login com Passkey no celular.",
                      "Scan to open Passkey login on your phone.",
                    )}
                  </p>
                  <div className="mt-2 flex justify-center">
                    <img
                      src={passkeyQrImageUrl}
                      alt="QR code for Passkey login on mobile"
                      className="h-44 w-44 rounded-xl border border-tts-border bg-white p-2"
                    />
                  </div>
                </div>
              )}
              {passkeyError && <p className="text-[11px] text-tts-error">{passkeyError}</p>}
            </div>
          )}
          {result?.success && !PASSKEY_ENROLLMENT_ENABLED && (
            <div className="mt-3 flex flex-col gap-2">
              <p className="text-[11px] text-tts-muted">
                {L(
                  "Use seu PIN para entrar e confirmar operações.",
                  "Use your PIN to sign in and confirm operations.",
                )}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={finishWithoutPasskey}
                className="w-full"
              >
                {L("Continuar com PIN", "Continue with PIN")}
              </Button>
            </div>
          )}
          {status === "error" && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 whitespace-pre-line text-xs text-tts-error"
            >
              {withCreateAccountTrace(
                publicCreateAccountErrorMessage(
                  result?.error || result?.message || L("Algo deu errado.", "Something went wrong."),
                  language,
                ),
                result,
                language,
              )}
            </motion.p>
          )}
          {PASSKEY_ENROLLMENT_ENABLED && passkeyStatus === "done" && (
            <p className="mt-2 break-all text-xs text-tts-confirm">
              {L("Biometria ativada com sucesso.", "Biometrics enabled successfully.")}
            </p>
          )}
        </AnimatePresence>
      </div>
    </AuthShell>
  )
}
