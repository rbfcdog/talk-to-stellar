"use client";

import { useState } from "react";
import { ArrowRight, Loader2, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type SecurePinGateProps = {
  title?: string;
  detail?: string;
  sessionSource?: string;
  disabled?: boolean;
  className?: string;
  onVerified: () => void;
};

function scopedRampPath(path: string, source?: string) {
  const cleanPath = path.replace(/^\/+/, "");
  const normalizedSource = String(source || "").trim().toLowerCase();
  const params = new URLSearchParams();
  if (normalizedSource) {
    params.set("source", normalizedSource);
    params.set("session_scope", normalizedSource);
  }
  const qs = params.toString();
  return `/api/ramp/${cleanPath}${qs ? `?${qs}` : ""}`;
}

export function SecurePinGate({
  title,
  detail,
  sessionSource,
  disabled,
  className,
  onVerified,
}: SecurePinGateProps) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => (language === "pt-BR" ? pt : en);
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<"idle" | "checking">("idle");
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resetMessage, setResetMessage] = useState("");
  const [error, setError] = useState("");

  async function verifyPin() {
    const cleanPin = pin.trim();
    if (!/^\d{4,8}$/.test(cleanPin) || disabled || status === "checking") {
      setError(L("Digite seu PIN para continuar.", "Enter your PIN to continue."));
      return;
    }

    setStatus("checking");
    setError("");
    try {
      const source = String(sessionSource || "").trim();
      const response = await fetch(scopedRampPath("session/verify-pin", source), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Wallet-Pin": cleanPin,
        },
        body: JSON.stringify({
          pin: cleanPin,
          wallet_pin: cleanPin,
          source,
          session_source: source,
          session_scope: source,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || L("PIN inválido. Tente novamente.", "Invalid PIN. Try again."));
      }
      setPin("");
      onVerified();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : L("Não consegui validar o PIN agora.", "I could not verify the PIN right now."));
    } finally {
      setStatus("idle");
    }
  }

  async function requestPinReset() {
    if (disabled || resetStatus === "sending") return;
    const source = String(sessionSource || "").trim();
    setResetStatus("sending");
    setResetMessage("");
    setError("");
    try {
      const response = await fetch("/api/security/reset-pin-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          forgot_pin: true,
          language,
          source,
          session_source: source,
          session_scope: source,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || L("Não consegui enviar o e-mail de PIN agora.", "I could not send the PIN email right now."));
      }
      setResetStatus("sent");
      setResetMessage(String(payload?.message || L("Enviamos o link de configuração do PIN por e-mail.", "We sent the PIN setup link by email.")));
    } catch (caught) {
      setResetStatus("error");
      setResetMessage(caught instanceof Error ? caught.message : L("Não consegui enviar o e-mail de PIN agora.", "I could not send the PIN email right now."));
    }
  }

  return (
    <section className={cn("rounded-3xl border border-white/10 bg-[#101010] p-5 text-white shadow-[0_24px_80px_rgba(0,0,0,0.35)]", className)}>
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-normal text-white/45">
            {L("Segurança", "Security")}
          </p>
          <h2 className="mt-1 text-xl font-black tracking-normal text-white">
            {title || L("Confirme seu PIN", "Confirm your PIN")}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-white/62">
            {detail || L("A informação só aparece depois da confirmação.", "The information only appears after confirmation.")}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="block">
          <span className="sr-only">{L("PIN", "PIN")}</span>
          <div className="flex min-h-14 items-center rounded-2xl border border-white/10 bg-black/35 px-4 focus-within:border-white/30">
            <LockKeyhole className="mr-3 h-4 w-4 shrink-0 text-white/45" aria-hidden="true" />
            <input
              value={pin}
              onChange={(event) => {
                setPin(event.target.value.replace(/\D/g, "").slice(0, 8));
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") void verifyPin();
              }}
              className="min-w-0 flex-1 bg-transparent text-lg font-black tracking-[0.28em] text-white outline-none placeholder:text-white/25"
              inputMode="numeric"
              type="password"
              autoComplete="current-password"
              placeholder="••••"
              disabled={disabled || status === "checking"}
            />
          </div>
        </label>

        <button
          type="button"
          onClick={() => void verifyPin()}
          disabled={disabled || status === "checking"}
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {status === "checking" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          {status === "checking" ? L("Validando", "Checking") : L("Continuar", "Continue")}
        </button>
      </div>

      <button
        type="button"
        onClick={() => void requestPinReset()}
        disabled={disabled || resetStatus === "sending"}
        className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-black text-white/62 transition hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        {resetStatus === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
        {resetStatus === "sending" ? L("Enviando e-mail", "Sending email") : L("Esqueci meu PIN", "Forgot PIN")}
      </button>

      {resetMessage ? (
        <p className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-bold ${resetStatus === "sent" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : "border-red-400/25 bg-red-400/10 text-red-100"}`}>
          {resetMessage}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-2xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100">
          {error}
        </p>
      ) : null}
    </section>
  );
}
