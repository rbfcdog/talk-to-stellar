"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, UserCircle2 } from "lucide-react"
import { getClientSession } from "@/lib/session"

type BalanceItem = {
  asset_code?: string
  asset_type?: string
  asset_issuer?: string
  balance?: string
}

function normalizeAssetCode(value?: string, type?: string) {
  if (String(type || "").toLowerCase() === "native") return ""
  const code = String(value || "").toUpperCase().replace(/^USD$/, "USDC")
  if (code === "TESOURO") return "BRL"
  if (code === "EURC" || code === "EURO" || code === "EUROS") return "EUR"
  return code
}

function formatAssetBalance(item: BalanceItem) {
  const code = normalizeAssetCode(item.asset_code, item.asset_type)
  const raw = Number(String(item.balance || "").replace(",", "."))
  if (!Number.isFinite(raw)) return `${item.balance || "0"} ${code}`
  if (code === "USDC") return `US$ ${raw.toFixed(2)}`
  if (code === "BRL") return `R$ ${raw.toFixed(2)}`
  if (code === "EUR") return `€ ${raw.toFixed(2)}`
  return code ? `${raw.toFixed(2)} ${code}` : ""
}

function displayAssetCode(code: string) {
  if (code === "BRL") return "R$"
  if (code === "USDC") return "US$"
  if (code === "EUR") return "€"
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
  const balances = Array.isArray(payload?.balances) ? payload.balances : []
  const visibleBalances = balances.filter((item: BalanceItem) => Boolean(normalizeAssetCode(item.asset_code, item.asset_type)))
  const stats = payload?.stats || {}

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-12 sm:px-6">
        <section className="min-w-0 w-full overflow-hidden rounded-[2rem] border border-tts-border bg-tts-surface p-6 shadow-2xl backdrop-blur md:p-10">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-tts-gold bg-tts-gold-bg px-4 py-1 text-xs font-medium uppercase tracking-[0.22em] text-tts-gold">
              <UserCircle2 className="h-4 w-4" />
              Account profile
            </div>
            <Link
              href="/transactions"
              className="rounded-lg border border-tts-border bg-tts-surface px-3 py-2 text-sm text-tts-deep hover:bg-tts-surface"
            >
              Back to history
            </Link>
          </div>

          {status === "loading" && (
            <div className="mt-8 inline-flex items-center gap-2 text-tts-deep">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading profile...
            </div>
          )}

          {status === "error" && (
            <p className="mt-8 text-tts-error">{message || "Could not load profile."}</p>
          )}

          {status === "ready" && (
            <>
              <h1 className="mt-5 text-3xl font-semibold text-tts-surface md:text-5xl">
                {profile?.name || "Contact"}
              </h1>
              <p className="mt-2 text-sm text-tts-deep">Identifier: {profile?.identifier || "unavailable"}</p>
              <p className="mt-1 text-xs text-tts-muted">Account: {profile?.identifier || "TalkToStellar"}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-tts-border bg-tts-deep/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-tts-muted">Received operations</p>
                  <p className="mt-2 text-xl font-semibold text-tts-surface">{Number(stats?.total_received_operations || 0)}</p>
                </div>
                <div className="rounded-xl border border-tts-border bg-tts-deep/20 p-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-tts-muted">Last received</p>
                  <p className="mt-2 text-sm text-tts-deep">
                    {stats?.last_received_at ? new Date(stats.last_received_at).toLocaleString("en-US") : "No completed operations"}
                  </p>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-tts-border bg-tts-deep/20">
                <div className="border-b border-tts-border bg-tts-surface px-4 py-3 text-sm font-medium text-tts-deep">Account balances</div>
                {visibleBalances.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-tts-deep">Balance unavailable right now.</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {visibleBalances.map((item: BalanceItem, index: number) => (
                      <li key={`${item.asset_code || item.asset_type || "asset"}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm text-tts-deep">{displayAssetCode(normalizeAssetCode(item.asset_code, item.asset_type))}</span>
                        <span className="text-sm font-semibold text-tts-surface">{formatAssetBalance(item)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
