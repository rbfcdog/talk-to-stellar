"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { idempotentFetch } from "@/lib/idempotency"
import { normalizeLanguage, useLanguage, type AppLanguage } from "@/lib/i18n"
import { mapPublicError } from "@/lib/public-errors"

type InitialParams = {
  lang?: string
  destination?: string
  amount?: string
  asset?: string
}

type PreviewResponse = {
  success?: boolean
  source_public_key?: string
  available_balance?: string
  asset?: string
  estimated_fee_display?: string
  destination_exists?: boolean
  destination_warning?: string | null
  destination_accepts_asset?: boolean
  error?: string
  message?: string
}

type SendResponse = {
  success?: boolean
  tx_hash?: string
  amount?: string
  asset?: string
  destination?: string
  completed_at?: string
  receipt_url?: string
  error?: string
  message?: string
}

function T(language: AppLanguage, pt: string, en: string) {
  return language === "pt-BR" ? pt : en
}

function normalizeAsset(value?: string) {
  const asset = String(value || "USDC").trim().toUpperCase()
  if (asset === "USD") return "USDC"
  if (asset === "XLM") return "XLM"
  return "USDC"
}

function isValidPublicKey(value: string) {
  return /^G[A-Z2-7]{55}$/i.test(value.trim())
}

function compactKey(value?: string) {
  const key = String(value || "").trim()
  if (key.length < 16) return key || "-"
  return `${key.slice(0, 8)}...${key.slice(-8)}`
}

function parseAmount(value: string) {
  const amount = Number(String(value || "").replace(",", "."))
  return Number.isFinite(amount) ? amount : 0
}

function formatAmount(value: string | undefined, asset: string, language: AppLanguage) {
  const amount = parseAmount(String(value || ""))
  const locale = language === "pt-BR" ? "pt-BR" : "en-US"
  if (!Number.isFinite(amount)) return "-"
  if (asset === "USDC") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 7,
    }).format(amount)
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 7 }).format(amount)} XLM`
}

function publicMessage(error: unknown, language: AppLanguage) {
  return mapPublicError(error, language).message
}

export default function SendExternalClient({ initialParams }: { initialParams?: InitialParams }) {
  const i18n = useLanguage()
  const language = normalizeLanguage(initialParams?.lang || i18n.language)
  const [destination, setDestination] = useState(() => String(initialParams?.destination || "").trim())
  const [amount, setAmount] = useState(() => String(initialParams?.amount || "").replace(",", ".").trim())
  const [asset, setAsset] = useState(() => normalizeAsset(initialParams?.asset))
  const [pin, setPin] = useState("")
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [error, setError] = useState("")
  const [result, setResult] = useState<SendResponse | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validDestination = isValidPublicKey(destination)
  const amountNumber = parseAmount(amount)
  const availableNumber = parseAmount(preview?.available_balance || "0")
  const hasEnoughBalance = amountNumber > 0 && amountNumber <= availableNumber + 0.0000001
  const destinationReady = preview?.destination_exists === false ? asset === "XLM" && amountNumber >= 1 : preview?.destination_accepts_asset !== false
  const canSubmit = validDestination && amountNumber > 0 && Boolean(pin.trim()) && Boolean(preview?.success) && hasEnoughBalance && destinationReady && !submitting

  const statusLabel = useMemo(() => {
    if (result?.success) return T(language, "Enviado", "Sent")
    if (submitting) return T(language, "Enviando", "Sending")
    if (previewStatus === "ready") return T(language, "Pronto para PIN", "Ready for PIN")
    if (previewStatus === "loading") return T(language, "Consultando", "Checking")
    return T(language, "Aguardando dados", "Waiting for details")
  }, [language, previewStatus, result?.success, submitting])

  useEffect(() => {
    setResult(null)
    setError("")

    if (!validDestination) {
      setPreview(null)
      setPreviewStatus("idle")
      return
    }

    let cancelled = false
    setPreviewStatus("loading")

    fetch("/api/external/send-to-wallet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        destination,
        asset,
        preview: true,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || payload?.message || T(language, "Não foi possível consultar esta conta.", "Could not check this account."))
        }
        if (!cancelled) {
          setPreview(payload)
          setPreviewStatus("ready")
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPreview(null)
          setPreviewStatus("error")
          setError(publicMessage(err, language))
        }
      })

    return () => {
      cancelled = true
    }
  }, [asset, destination, language, validDestination])

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError("")
    setResult(null)

    try {
      const body = {
        destination: destination.trim(),
        amount: String(amountNumber),
        asset,
        pin: pin.trim(),
      }
      const response = await idempotentFetch("/api/external/send-to-wallet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }, "send-external-wallet")
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || payload?.message || T(language, "Não foi possível enviar agora.", "Could not send right now."))
      }
      setResult(payload)
      setPin("")
    } catch (err) {
      setError(publicMessage(err, language))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-tts-bg px-4 py-5 text-tts-deep sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <header className="rounded-lg border border-tts-border bg-tts-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-tts-muted">
                {T(language, "Envio externo", "External transfer")}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-tts-deep">
                {T(language, "Enviar para carteira externa", "Send to external wallet")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
                {T(
                  language,
                  "Revise a public key completa, o saldo disponível e confirme só depois com PIN.",
                  "Review the full public key, available balance, and confirm only after that with PIN."
                )}
              </p>
            </div>
            <div className="rounded-lg border border-tts-border bg-tts-bg px-3 py-2 text-sm font-semibold text-tts-deep">
              {statusLabel}
            </div>
          </div>
        </header>

        {error && (
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-bold">{T(language, "Precisa de atenção", "Needs attention")}</p>
            <p className="mt-1">{error}</p>
            {error.toLowerCase().includes("sess") || error.toLowerCase().includes("login") ? (
              <Link href="/login" className="mt-3 inline-flex h-10 items-center rounded-lg bg-tts-deep px-4 text-sm font-bold text-tts-surface">
                {T(language, "Entrar na conta", "Sign in")}
              </Link>
            ) : null}
          </section>
        )}

        {result?.success && (
          <section className="rounded-lg border border-tts-confirm bg-tts-confirm p-4 text-sm text-tts-confirm">
            <p className="font-bold">{T(language, "Envio concluído", "Transfer sent")}</p>
            <p className="mt-1">
              {formatAmount(result.amount || amount, result.asset || asset, language)} {" -> "} {compactKey(result.destination || destination)}
            </p>
            {result.tx_hash && <p className="mt-2 break-all font-mono text-xs">{result.tx_hash}</p>}
            {result.receipt_url && (
              <a href={result.receipt_url} className="mt-3 inline-flex h-10 items-center rounded-lg bg-tts-deep px-4 text-sm font-bold text-tts-surface">
                {T(language, "Abrir comprovante", "Open receipt")}
              </a>
            )}
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-lg border border-tts-border bg-tts-surface p-4 shadow-sm">
            <h2 className="text-base font-bold text-tts-deep">{T(language, "Dados do envio", "Transfer details")}</h2>
            <div className="mt-4 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-tts-deep">
                {T(language, "Public key de destino", "Destination public key")}
                <textarea
                  value={destination}
                  onChange={(event) => setDestination(event.target.value.trim())}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-tts-border bg-tts-bg px-3 py-3 font-mono text-sm text-tts-deep outline-none transition focus:border-tts-gold"
                  placeholder="G..."
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                <label className="grid gap-2 text-sm font-semibold text-tts-deep">
                  {T(language, "Valor", "Amount")}
                  <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value.replace(",", "."))}
                    inputMode="decimal"
                    className="h-12 rounded-lg border border-tts-border bg-tts-bg px-3 text-base font-bold text-tts-deep outline-none transition focus:border-tts-gold"
                    placeholder="10"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-tts-deep">
                  {T(language, "Moeda", "Asset")}
                  <select
                    value={asset}
                    onChange={(event) => setAsset(normalizeAsset(event.target.value))}
                    className="h-12 rounded-lg border border-tts-border bg-tts-bg px-3 text-sm font-bold text-tts-deep outline-none transition focus:border-tts-gold"
                  >
                    <option value="USDC">USDC</option>
                    <option value="XLM">XLM</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-2 text-sm font-semibold text-tts-deep">
                PIN
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="h-12 rounded-lg border border-tts-border bg-tts-bg px-3 text-base font-bold text-tts-deep outline-none transition focus:border-tts-gold"
                  placeholder={T(language, "Digite depois de revisar", "Enter after review")}
                />
              </label>

              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className="inline-flex h-12 items-center justify-center rounded-lg bg-tts-deep px-4 text-sm font-bold text-tts-surface transition hover:bg-tts-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? T(language, "Enviando...", "Sending...") : T(language, "Confirmar envio", "Confirm transfer")}
              </button>
            </div>
          </section>

          <aside className="rounded-lg border border-tts-border bg-tts-surface p-4 shadow-sm">
            <h2 className="text-base font-bold text-tts-deep">{T(language, "Revisão", "Review")}</h2>
            <dl className="mt-4 grid gap-3 text-sm">
              <div className="rounded-lg border border-tts-border bg-tts-bg p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-tts-muted">{T(language, "Origem", "Source")}</dt>
                <dd className="mt-1 break-all font-mono text-xs text-tts-deep">{compactKey(preview?.source_public_key)}</dd>
              </div>
              <div className="rounded-lg border border-tts-border bg-tts-bg p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-tts-muted">{T(language, "Destino", "Destination")}</dt>
                <dd className="mt-1 break-all font-mono text-xs text-tts-deep">{compactKey(destination)}</dd>
              </div>
              <div className="rounded-lg border border-tts-border bg-tts-bg p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-tts-muted">{T(language, "Saldo disponível", "Available balance")}</dt>
                <dd className="mt-1 text-lg font-bold text-tts-deep">{formatAmount(preview?.available_balance, asset, language)}</dd>
              </div>
              <div className="rounded-lg border border-tts-border bg-tts-bg p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-tts-muted">{T(language, "Taxa de rede", "Network fee")}</dt>
                <dd className="mt-1 text-sm font-bold text-tts-deep">{preview?.estimated_fee_display || "-"}</dd>
              </div>
            </dl>

            <div className="mt-4 rounded-lg border border-tts-border bg-tts-bg p-3 text-sm leading-6 text-tts-muted">
              {previewStatus === "loading" && <p>{T(language, "Consultando saldo e destino...", "Checking balance and destination...")}</p>}
              {previewStatus === "idle" && <p>{T(language, "Informe uma public key válida para consultar a conta.", "Enter a valid public key to check the account.")}</p>}
              {previewStatus === "ready" && (
                <div className="grid gap-2">
                  {!hasEnoughBalance && amountNumber > 0 && (
                    <p className="font-semibold text-amber-700 dark:text-amber-200">
                      {T(language, "Saldo insuficiente para esse valor.", "Insufficient balance for this amount.")}
                    </p>
                  )}
                  {!destinationReady && (
                    <p className="font-semibold text-amber-700 dark:text-amber-200">
                      {preview?.destination_warning || T(language, "O destino ainda não aceita esta moeda.", "The destination does not accept this asset yet.")}
                    </p>
                  )}
                  {hasEnoughBalance && destinationReady && (
                    <p className="font-semibold text-tts-confirm">
                      {T(language, "Pronto para confirmar com PIN.", "Ready to confirm with PIN.")}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-2">
              <Link href="/chat" className="inline-flex h-10 items-center justify-center rounded-lg border border-tts-border bg-tts-surface px-3 text-sm font-bold text-tts-deep">
                {T(language, "Voltar ao chat", "Back to chat")}
              </Link>
              <Link href={`/pix-off?asset=${encodeURIComponent(asset)}&lang=${encodeURIComponent(language)}`} className="inline-flex h-10 items-center justify-center rounded-lg border border-tts-border bg-tts-surface px-3 text-sm font-bold text-tts-deep">
                {T(language, "Enviar por PIX", "Send by PIX")}
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
