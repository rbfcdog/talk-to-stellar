"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowUpRight, Copy, History, Loader2, UserCircle2 } from "lucide-react"

function displayName(profile: any, username: string) {
  return String(profile?.display_name || profile?.username || username || "TalkToStellar").trim()
}

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>()
  const username = String(params?.username || "").trim()
  const [profile, setProfile] = useState<any>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    async function loadProfile() {
      try {
        const response = await fetch(`/api/financial/u/${encodeURIComponent(username)}`, { cache: "no-store" })
        const payload = await response.json().catch(() => ({}))
        if (!active) return
        if (!response.ok || !payload?.success) {
          setStatus("error")
          return
        }
        setProfile(payload.profile)
        setStatus("ready")
      } catch {
        if (active) setStatus("error")
      }
    }
    loadProfile()
    return () => {
      active = false
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    }
  }, [username])

  const name = displayName(profile, username)
  const publicLink = String(profile?.public_link || "").trim()
  const accountId = String(profile?.destination_identifier || profile?.identifier || username || "").trim()
  const publicKey = String(profile?.destination_public_key || "").trim()
  const displayInitial = useMemo(() => (name || "T").slice(0, 1).toUpperCase(), [name])

  async function copyLink() {
    if (!publicLink) return
    await navigator.clipboard.writeText(publicLink)
    setCopied(true)
    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current)
    copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500)
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tts-bg px-4 text-tts-deep">
        <p className="text-sm text-tts-deep">Carregando perfil...</p>
      </main>
    )
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tts-bg px-4 text-tts-deep">
        <section className="w-full max-w-md rounded-lg border border-tts-border bg-tts-surface p-6">
          <h1 className="text-2xl font-semibold text-tts-surface">Perfil não encontrado</h1>
          <p className="mt-3 text-sm text-tts-deep">Confira o endereço ou peça um novo link público.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-tts-bg px-4 py-8 text-tts-deep sm:py-10">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 md:grid-cols-[1.12fr_0.88fr]">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-tts-gold bg-tts-gold-bg px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-tts-gold">
            <UserCircle2 className="h-4 w-4" />
            Perfil global
          </div>

          <div className="rounded-[1.5rem] border border-tts-border bg-tts-surface p-6 shadow-2xl md:p-8">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-tts-border bg-tts-bg text-lg font-bold text-tts-surface">
                {displayInitial}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-semibold leading-tight text-tts-surface md:text-5xl">{name}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-deep md:text-base">
                  Conta pública para receber, acompanhar saldos e acessar ações rápidas sem abrir a tela de pagamento.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-tts-muted">Link público</p>
                <p className="mt-2 text-sm font-semibold text-tts-surface">{publicLink ? "Ativo" : "Indisponível"}</p>
              </div>
              <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-tts-muted">Identificador</p>
                <p className="mt-2 break-all text-sm font-semibold text-tts-surface">{accountId || "indisponível"}</p>
              </div>
              <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-tts-muted">Recebimento</p>
                <p className="mt-2 text-sm font-semibold text-tts-surface">{publicKey ? "Pronto" : "Indisponível"}</p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {publicLink && (
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-tts-border bg-tts-bg px-4 py-2 text-sm font-semibold text-tts-deep transition hover:bg-tts-surface"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Link copiado" : "Copiar link"}
                </button>
              )}
              <Link
                href="/transactions"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-tts-deep px-4 py-2 text-sm font-semibold text-tts-surface transition hover:bg-tts-deep/90"
              >
                <History className="h-4 w-4" />
                Ver histórico
              </Link>
              <Link
                href={`/pay-anyone?mode=receive&recipient=${encodeURIComponent(name)}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-tts-confirm bg-tts-confirm/10 px-4 py-2 text-sm font-semibold text-tts-confirm transition hover:bg-tts-confirm/20"
              >
                <ArrowUpRight className="h-4 w-4" />
                Criar link de recebimento
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-tts-border bg-tts-surface p-5 shadow-2xl md:p-6">
          <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-tts-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Visão rápida
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-tts-muted">Resumo</p>
              <p className="mt-2 text-sm leading-6 text-tts-deep">
                Perfil público com atalhos para receber, copiar o link e abrir o histórico sem cair em pagamento.
              </p>
            </div>
            <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-tts-muted">Chave pública</p>
              <p className="mt-2 break-all text-sm font-semibold text-tts-surface">
                {publicKey || "indisponível"}
              </p>
            </div>
            <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-tts-muted">Ação principal</p>
              <p className="mt-2 text-sm text-tts-deep">
                O link acima pode ser compartilhado. Quem abrir entra na conta certa de recebimento.
              </p>
            </div>
            <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-tts-muted">Acesso rápido</p>
              <p className="mt-2 text-sm text-tts-deep">
                Use o histórico para conferir entradas e o link público para receber sem pedir dados de novo.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
