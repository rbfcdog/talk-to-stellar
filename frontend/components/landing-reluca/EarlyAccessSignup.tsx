"use client"

import { FormEvent, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, Mail, Send } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"

type SubmitState = "idle" | "loading" | "success" | "error"

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export default function EarlyAccessSignup() {
  const { language } = useLanguage()
  const [email, setEmail] = useState("")
  const [state, setState] = useState<SubmitState>("idle")
  const [message, setMessage] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    if (!isValidEmail(normalizedEmail)) {
      setState("error")
      setMessage(t("earlyAccess", language, "invalid"))
      return
    }

    setState("loading")
    setMessage("")

    try {
      const response = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          locale: language,
          source: "landing-reluca",
          page_url: typeof window !== "undefined" ? window.location.href : undefined,
          referrer: typeof document !== "undefined" ? document.referrer : undefined,
          metadata: { component: "cta-email-list" },
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(payload?.message || t("earlyAccess", language, "error"))
      }

      setState("success")
      setMessage(t("earlyAccess", language, "success"))
    } catch (error) {
      setState("error")
      setMessage(error instanceof Error ? error.message : t("earlyAccess", language, "error"))
    }
  }

  const isLoading = state === "loading"
  const isSuccess = state === "success"
  const statusIcon = isSuccess
    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#E59E25]" />
    : state === "error"
      ? <AlertCircle className="h-4 w-4 shrink-0 text-[#F87171]" />
      : null

  return (
    <div className="w-full max-w-3xl rounded-lg border border-white/10 bg-[#101010]/80 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)] backdrop-blur md:p-5">
      <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#E59E25]">
        <Mail className="h-3.5 w-3.5" />
        <span>{t("earlyAccess", language, "eyebrow")}</span>
      </div>
      <div className="mb-5 grid gap-2">
        <h3 className="text-xl font-bold leading-tight text-white md:text-2xl">
          {t("earlyAccess", language, "title")}
        </h3>
        <p className="max-w-2xl text-sm leading-relaxed text-[#9BA4B5] md:text-base">
          {t("earlyAccess", language, "subtitle")}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-3 sm:flex-row" noValidate>
        <label htmlFor="early-access-email" className="sr-only">
          {t("earlyAccess", language, "label")}
        </label>
        <div className="relative min-h-[52px] flex-1">
          <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6F7685]" />
          <input
            id="early-access-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              if (state !== "loading") {
                setState("idle")
                setMessage("")
              }
            }}
            placeholder={t("earlyAccess", language, "placeholder")}
            className="h-[52px] w-full rounded-lg border border-white/10 bg-black/30 pl-11 pr-4 text-sm font-medium text-white outline-none transition placeholder:text-[#6F7685] hover:border-white/20 focus:border-[#E59E25] focus:ring-2 focus:ring-[#E59E25]/20"
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex h-[52px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#E59E25] px-6 text-sm font-bold text-black transition hover:bg-[#D48C1C] disabled:cursor-not-allowed disabled:opacity-70 sm:min-w-[168px]"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span>{isLoading ? t("earlyAccess", language, "submitting") : t("earlyAccess", language, "submit")}</span>
        </button>
      </form>
      <div className="mt-3 flex min-h-[22px] items-start gap-2 text-xs font-medium leading-relaxed text-[#9BA4B5]" aria-live="polite">
        {statusIcon}
        <span>{message || t("earlyAccess", language, "privacy")}</span>
      </div>
    </div>
  )
}
