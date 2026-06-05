"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Copy,
  ExternalLink,
  History,
  KeyRound,
  Loader2,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  TrendingUp,
  UserCircle2,
  Wallet,
} from "lucide-react"
import { SecurePinGate } from "@/components/shared/secure-pin-gate"
import { calculateAssetDistribution } from "@/lib/asset-distribution"
import { getClientSession } from "@/lib/session"

type BalanceItem = {
  asset_code?: string
  asset_type?: string
  asset_issuer?: string
  balance?: string
}

function normalizeAssetCode(value?: string, type?: string) {
  if (String(type || "").toLowerCase() === "native") return "XLM"
  const code = String(value || "").toUpperCase().replace(/^USD$/, "USDC")
  if (code === "TESOURO" || code === "BRL") return "TESOURO"
  if (code === "EUR" || code === "EURC") return "CETES"
  return code
}

function formatNumber(value: number, min = 2, max = 7) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(value)
}

function formatBalance(raw: number, code: string) {
  if (code === "USDC") return `US$ ${formatNumber(raw)}`
  if (code === "TESOURO") return `R$ ${formatNumber(raw)}`
  if (code === "CETES") return `${formatNumber(raw)} CETES`
  if (code === "XLM") return `${formatNumber(raw)} XLM`
  return `${formatNumber(raw)} ${code}`
}

function displayAssetCode(code: string) {
  if (code === "TESOURO") return "R$"
  if (code === "USDC") return "US$"
  if (code === "CETES") return "CETES"
  if (code === "XLM") return "XLM"
  return code
}

function compactKey(value?: string) {
  const raw = String(value || "").trim()
  if (raw.length <= 18) return raw || "indisponível"
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`
}

function formatWhen(value?: string) {
  const timestamp = value ? Date.parse(value) : NaN
  if (!Number.isFinite(timestamp)) return { date: "Sem registros", time: "" }
  const date = new Date(timestamp)
  return {
    date: date.toLocaleDateString("pt-BR"),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  }
}

function assetTone(code: string) {
  if (code === "USDC") return "bg-tts-confirm"
  if (code === "TESOURO") return "bg-tts-gold"
  if (code === "CETES") return "bg-tts-deep"
  if (code === "XLM") return "bg-tts-muted"
  return "bg-tts-border2"
}

export default function WalletProfileClient({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<"checking" | "locked" | "loading" | "ready" | "error">("checking")
  const [session, setSession] = useState({ authenticated: false, sessionId: "", sessionSource: "" })
  const [pinVerified, setPinVerified] = useState(false)
  const [message, setMessage] = useState("")
  const [payload, setPayload] = useState<any>(null)
  const [copied, setCopied] = useState<"profile" | "key" | "">("")

  async function loadProfile(currentSessionId = session.sessionId, unlocked = pinVerified) {
    setStatus("loading")
    setMessage("")
    try {
      if (!currentSessionId || !session.authenticated || !unlocked) throw new Error("Digite seu PIN para ver este perfil.")
      const query = `?session_id=${encodeURIComponent(currentSessionId)}`
      const response = await fetch(`/api/financial/wallet-profile/${encodeURIComponent(publicKey)}${query}`, {
        cache: "no-store",
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body?.success) {
        throw new Error(body?.message || "Não foi possível carregar este perfil.")
      }
      setPayload(body)
      setStatus("ready")
    } catch (error) {
      setStatus("error")
      setMessage(error instanceof Error ? error.message : "Falha ao carregar perfil.")
    }
  }

  useEffect(() => {
    let cancelled = false
    getClientSession()
      .then((payload) => {
        if (cancelled) return
        setSession(payload)
        setStatus(payload.authenticated && payload.sessionId ? "locked" : "error")
        if (!payload.authenticated || !payload.sessionId) setMessage("Entre para ver este perfil.")
      })
      .catch(() => {
        if (cancelled) return
        setSession({ authenticated: false, sessionId: "", sessionSource: "" })
        setStatus("error")
        setMessage("Entre para ver este perfil.")
      })
    return () => {
      cancelled = true
    }
  }, [publicKey])

  const profile = payload?.profile || {}
  const balances: BalanceItem[] = Array.isArray(payload?.balances) ? payload.balances : []
  const visibleBalances = useMemo(() => {
    const grouped = new Map<string, { code: string; raw: number }>()
    for (const item of balances) {
      const code = normalizeAssetCode(item.asset_code, item.asset_type)
      const raw = Number(String(item.balance || "").replace(",", "."))
      if (!code || !Number.isFinite(raw) || raw <= 0) continue
      const current = grouped.get(code) || { code, raw: 0 }
      current.raw += raw
      grouped.set(code, current)
    }
    return Array.from(grouped.values()).sort((a, b) => b.raw - a.raw)
  }, [balances])
  const distributionRows = useMemo(() => (
    calculateAssetDistribution(visibleBalances.map((balance) => ({ asset: balance.code, value: balance.raw })))
  ), [visibleBalances])
  const distributionByAsset = useMemo(() => new Map(distributionRows.map((row) => [row.asset, row])), [distributionRows])
  const largestBalance = visibleBalances[0] || null
  const stats = payload?.stats || {}
  const lastActivity = formatWhen(stats?.last_received_at)
  const publicProfileUrl = String(profile?.short_profile_url || profile?.profile_url || "").trim()
  const displayName = String(profile?.name || "Conta").trim()
  const identifier = String(profile?.identifier || "Sem identificador").trim()
  const initials = displayName.slice(0, 1).toUpperCase() || "T"

  async function copyValue(value: string, target: "profile" | "key") {
    if (!value || !navigator?.clipboard) return
    await navigator.clipboard.writeText(value)
    setCopied(target)
    window.setTimeout(() => setCopied(""), 1400)
  }

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="border-b border-tts-border pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 border border-tts-gold bg-tts-gold-bg px-3 py-1 text-[11px] font-black uppercase tracking-normal text-tts-gold">
                <UserCircle2 className="h-4 w-4" aria-hidden="true" />
                Perfil global
              </p>
              <h1 className="mt-3 text-2xl font-black tracking-normal text-tts-deep md:text-4xl">
                {displayName}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
                Conta pública para conferir saldos, distribuição da carteira, histórico e ações rápidas.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadProfile()}
                disabled={!pinVerified}
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Atualizar
              </button>
              <Link
                href="/transactions"
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-deep bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:opacity-90"
              >
                <History className="h-4 w-4" aria-hidden="true" />
                Histórico
              </Link>
            </div>
          </div>
        </header>

        {session.authenticated && !pinVerified ? (
          <SecurePinGate
            sessionSource={session.sessionSource}
            title="Abrir perfil"
            detail="Digite seu PIN para ver saldo, distribuição e histórico do perfil."
            disabled={!session.sessionId}
            onVerified={() => {
              setPinVerified(true)
              void loadProfile(session.sessionId, true)
            }}
          />
        ) : null}

        {status === "loading" ? (
          <StateBlock icon={<Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />} title="Carregando perfil" detail="Buscando saldos e dados públicos da conta." />
        ) : null}

        {status === "error" ? (
          <StateBlock
            icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
            title="Não foi possível carregar"
            detail={message || "Tente novamente em alguns segundos."}
            action={
              <button
                type="button"
                onClick={() => void loadProfile()}
                className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Tentar de novo
              </button>
            }
          />
        ) : null}

        {status === "ready" ? (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="border border-tts-border bg-tts-surface p-5 md:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <div className="grid h-16 w-16 shrink-0 place-items-center border border-tts-border bg-tts-bg text-2xl font-black text-tts-deep">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">Identificador</p>
                    <p className="mt-1 break-all text-base font-black text-tts-deep">{identifier}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <InfoLine label="Chave pública" value={compactKey(publicKey)} icon={<KeyRound className="h-4 w-4" aria-hidden="true" />} />
                      <InfoLine label="Recebimento" value={publicKey ? "Pronto" : "Indisponível"} icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void copyValue(publicKey, "key")}
                        className="inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-xs font-black text-tts-deep transition hover:border-tts-border2"
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        {copied === "key" ? "Chave copiada" : "Copiar chave"}
                      </button>
                      {publicProfileUrl ? (
                        <button
                          type="button"
                          onClick={() => void copyValue(publicProfileUrl, "profile")}
                          className="inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-xs font-black text-tts-deep transition hover:border-tts-border2"
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                          {copied === "profile" ? "Link copiado" : "Copiar perfil"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <StatBox label="Moedas com saldo" value={visibleBalances.length} sub="assets ativos" />
                <StatBox label="Maior saldo" value={largestBalance ? formatBalance(largestBalance.raw, largestBalance.code) : "Nenhum"} sub={largestBalance ? displayAssetCode(largestBalance.code) : "sem saldo"} />
                <StatBox label="Última atividade" value={lastActivity.date} sub={lastActivity.time || "sem registros"} />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
              <div className="border border-tts-border bg-tts-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">Distribuição da carteira</p>
                    <h2 className="mt-1 text-xl font-black text-tts-deep">Saldos por asset</h2>
                  </div>
                  <Wallet className="h-5 w-5 text-tts-gold" aria-hidden="true" />
                </div>

                {visibleBalances.length === 0 ? (
                  <p className="mt-5 border border-tts-border bg-tts-bg px-4 py-5 text-sm text-tts-muted">Nenhum saldo disponível para esta carteira.</p>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="flex h-4 overflow-hidden border border-tts-border bg-tts-bg">
                      {visibleBalances.map((balance) => {
                        const distribution = distributionByAsset.get(balance.code)
                        const width = distribution?.percent || 0
                        return (
                          <div
                            key={balance.code}
                            className={assetTone(balance.code)}
                            style={{ width: `${width}%` }}
                            title={`${displayAssetCode(balance.code)}: ${formatBalance(balance.raw, balance.code)}`}
                          />
                        )
                      })}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {visibleBalances.map((balance) => {
                        const percent = distributionByAsset.get(balance.code)?.percent || 0
                        return (
                          <div key={balance.code} className="border border-tts-border bg-tts-bg p-4">
                            <div className="flex items-center gap-2">
                              <span className={`h-3 w-3 shrink-0 ${assetTone(balance.code)}`} />
                              <p className="text-sm font-black text-tts-deep">{displayAssetCode(balance.code)}</p>
                              <p className="ml-auto text-xs font-black text-tts-muted">{percent}%</p>
                            </div>
                            <p className="mt-3 text-lg font-black text-tts-deep">{formatBalance(balance.raw, balance.code)}</p>
                            <div className="mt-3 h-2 bg-tts-surface">
                              <div className={`h-2 ${assetTone(balance.code)}`} style={{ width: `${Math.max(6, percent)}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                <p className="mt-4 text-xs leading-5 text-tts-muted">
                  A comparação usa a quantidade informada em cada moeda. Não mistura moedas diferentes como se fossem o mesmo valor.
                </p>
              </div>

              <div className="border border-tts-border bg-tts-surface p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">Ações rápidas</p>
                    <h2 className="mt-1 text-xl font-black text-tts-deep">Operar a conta</h2>
                  </div>
                  <BarChart3 className="h-5 w-5 text-tts-gold" aria-hidden="true" />
                </div>
                <div className="mt-5 grid gap-2">
                  <ActionLink href="/transactions" icon={<History className="h-4 w-4" aria-hidden="true" />} title="Histórico" detail="Ver PIX, envios, conversões e comprovantes." />
                  <ActionLink href="/pay-anyone?mode=receive" icon={<ArrowDownLeft className="h-4 w-4" aria-hidden="true" />} title="Receber" detail="Criar ou copiar seu link de recebimento." />
                  <ActionLink href="/convert" icon={<Repeat2 className="h-4 w-4" aria-hidden="true" />} title="Converter" detail="Trocar moedas com revisão antes do PIN." />
                  <ActionLink href="/rendimentos?view=returns" icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />} title="Investimentos" detail="Ver posições atuais e opções configuradas." />
                  <ActionLink href="/send-external" icon={<ArrowUpRight className="h-4 w-4" aria-hidden="true" />} title="Enviar" detail="Mandar para carteira externa com confirmação." />
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <InfoPanel title="Recebimentos" value={Number(stats?.total_received_operations || 0)} detail="operações recebidas registradas" />
              <InfoPanel title="Perfil público" value={publicProfileUrl ? "Ativo" : "Indisponível"} detail={publicProfileUrl ? compactKey(publicProfileUrl) : "sem link público"} href={publicProfileUrl || undefined} />
              <InfoPanel title="Segurança" value="PIN na confirmação" detail="Envios, PIX e conversões pedem PIN antes de concluir." />
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-4">
      <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">{label}</p>
      <p className="mt-2 text-xl font-black text-tts-deep">{value}</p>
      {sub && <p className="mt-1 text-xs text-tts-muted">{sub}</p>}
    </div>
  )
}

function InfoLine({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border border-tts-border bg-tts-bg p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center border border-tts-border bg-tts-surface text-tts-muted">{icon}</span>
      <div>
        <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">{label}</p>
        <p className="mt-1 text-sm font-black text-tts-deep">{value}</p>
      </div>
    </div>
  )
}

function ActionLink({ href, icon, title, detail }: { href: string; icon: ReactNode; title: string; detail: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 border border-tts-border bg-tts-bg p-3 transition hover:border-tts-border2 hover:bg-tts-surface">
      <span className="grid h-10 w-10 shrink-0 place-items-center border border-tts-border bg-tts-surface text-tts-deep">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-tts-deep">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-tts-muted">{detail}</span>
      </span>
      <ExternalLink className="h-4 w-4 text-tts-muted transition group-hover:text-tts-deep" aria-hidden="true" />
    </Link>
  )
}

function InfoPanel({ title, value, detail, href }: { title: string; value: string | number; detail: string; href?: string }) {
  const content = (
    <div className="border border-tts-border bg-tts-surface p-4">
      <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">{title}</p>
      <p className="mt-2 text-lg font-black text-tts-deep">{value}</p>
      <p className="mt-1 break-all text-xs leading-5 text-tts-muted">{detail}</p>
    </div>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function StateBlock({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <section className="flex min-h-80 flex-col items-center justify-center border border-tts-border bg-tts-surface px-4 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center border border-tts-border bg-tts-bg text-tts-muted">{icon}</span>
      <p className="mt-3 text-base font-black text-tts-deep">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-tts-muted">{detail}</p>
      {action}
    </section>
  )
}
