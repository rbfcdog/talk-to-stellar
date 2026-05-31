"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, UserCircle2, BarChart3, Wallet } from "lucide-react"
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
  if (code === "EUR" || code === "EURC" || code === "EURO" || code === "EUROS") return "CETES"
  return code
}

function formatBalance(raw: number, code: string) {
  if (code === "USDC") return `US$ ${raw.toFixed(2)}`
  if (code === "TESOURO") return `R$ ${raw.toFixed(2)}`
  if (code === "CETES") return `${raw.toFixed(2)} CETES`
  if (code === "XLM") return `${raw.toFixed(2)} XLM`
  return `${raw.toFixed(2)} ${code}`
}

function displayAssetCode(code: string) {
  if (code === "TESOURO") return "R$"
  if (code === "USDC") return "US$"
  if (code === "CETES") return "CETES"
  if (code === "XLM") return "XLM"
  return code
}

export default function WalletProfileClient({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState("")
  const [payload, setPayload] = useState<any>(null)

  useEffect(() => {
    async function loadProfile() {
      setStatus("loading")
      try {
        const { sessionId, authenticated } = await getClientSession()
        if (!sessionId || !authenticated) throw new Error("Sign in to view this account profile.")
        const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""
        const response = await fetch(`/api/financial/wallet-profile/${encodeURIComponent(publicKey)}${query}`, {
          cache: "no-store",
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body?.success) {
          throw new Error(body?.message || "Could not load account profile.")
        }
        setPayload(body)
        setStatus("ready")
      } catch (error) {
        setStatus("error")
        setMessage(error instanceof Error ? error.message : "Failed to load profile.")
      }
    }
    void loadProfile()
  }, [publicKey])

  const profile = payload?.profile || {}
  const balances: BalanceItem[] = Array.isArray(payload?.balances) ? payload.balances : []
  const visibleBalances = balances
    .map((item) => {
      const code = normalizeAssetCode(item.asset_code, item.asset_type)
      const raw = Number(String(item.balance || "").replace(",", "."))
      return { code, raw: Number.isFinite(raw) ? raw : 0 }
    })
    .filter((b) => b.code && b.raw > 0)
  const totalAssets = visibleBalances.reduce((s, b) => s + b.raw, 0)
  const stats = payload?.stats || {}

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <section className="overflow-hidden rounded-[2rem] border border-tts-border bg-tts-surface shadow-2xl">
          <div className="h-2 bg-gradient-to-r from-tts-confirm via-tts-gold to-tts-deep" />

          <div className="p-6 md:p-10">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-tts-gold bg-tts-gold-bg px-4 py-1 text-xs font-bold uppercase tracking-[0.22em] text-tts-gold">
                <UserCircle2 className="h-4 w-4" />
                Perfil
              </span>
              <Link href="/transactions" className="text-xs font-bold text-tts-muted hover:text-tts-deep">
                ← Histórico
              </Link>
            </div>

            {status === "loading" && (
              <div className="mt-8 inline-flex items-center gap-2 text-tts-deep">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            )}

            {status === "error" && (
              <p className="mt-8 text-tts-error">{message || "Could not load profile."}</p>
            )}

            {status === "ready" && (
              <>
                <h1 className="mt-5 text-2xl font-black text-tts-deep md:text-4xl">
                  {profile?.name || "Conta"}
                </h1>
                <p className="mt-2 text-sm text-tts-muted">{profile?.identifier || "Sem identificador"}</p>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <StatBox label="Recebidos" value={Number(stats?.total_received_operations || 0)} />
                  <StatBox label="Saldo ativo" value={totalAssets.toFixed(2)} sub="total de ativos" />
                  <StatBox
                    label="Última atividade"
                    value={stats?.last_received_at
                      ? new Date(stats.last_received_at).toLocaleDateString("pt-BR")
                      : "—"}
                    sub={stats?.last_received_at
                      ? new Date(stats.last_received_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                      : "sem registros"}
                  />
                </div>

                {visibleBalances.length > 0 && (
                  <div className="mt-6 overflow-hidden rounded-2xl border border-tts-border">
                    <div className="border-b border-tts-border bg-tts-bg px-5 py-3 text-sm font-black text-tts-deep flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-tts-gold" />
                      Distribuição de ativos
                    </div>

                    <div className="px-5 py-4">
                      <div className="flex h-5 overflow-hidden rounded-full border border-tts-border bg-tts-bg">
                        {visibleBalances.map((b, i) => {
                          const w = Math.max(4, (b.raw / totalAssets) * 100)
                          const colors = ["bg-tts-confirm", "bg-tts-gold", "bg-tts-deep2", "bg-tts-muted"]
                          return <div key={i} className={colors[i % 4]} style={{ width: `${w}%` }} title={`${b.code}: ${b.raw}`} />
                        })}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {visibleBalances.map((b, i) => {
                          const colors = ["bg-tts-confirm", "bg-tts-gold", "bg-tts-deep2", "bg-tts-muted"]
                          return (
                            <div key={i} className="flex items-center gap-2 text-sm">
                              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${colors[i % 4]}`} />
                              <span className="font-bold">{displayAssetCode(b.code)}</span>
                              <span className="text-tts-muted ml-auto">{formatBalance(b.raw, b.code)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 overflow-hidden rounded-2xl border border-tts-border">
                  <div className="border-b border-tts-border bg-tts-bg px-5 py-3 text-sm font-black text-tts-deep flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-tts-gold" />
                    Saldos
                  </div>
                  {visibleBalances.length === 0 ? (
                    <p className="px-5 py-5 text-sm text-tts-muted">Saldo indisponível.</p>
                  ) : (
                    <div className="divide-y divide-tts-border">
                      {visibleBalances.map((b, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                          <span className="text-sm font-bold text-tts-deep">{displayAssetCode(b.code)}</span>
                          <span className="text-sm font-bold text-tts-deep">{formatBalance(b.raw, b.code)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

function StatBox({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-tts-muted">{label}</p>
      <p className="mt-2 text-xl font-black text-tts-deep">{value}</p>
      {sub && <p className="mt-1 text-xs text-tts-muted">{sub}</p>}
    </div>
  )
}
