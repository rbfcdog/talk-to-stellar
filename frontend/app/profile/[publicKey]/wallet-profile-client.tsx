"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, UserCircle2 } from "lucide-react"

type BalanceItem = {
  asset_code?: string
  asset_type?: string
  asset_issuer?: string
  balance?: string
}

function normalizeAssetCode(value?: string, type?: string) {
  if (String(type || "").toLowerCase() === "native") return "XLM"
  return String(value || "").toUpperCase().replace(/^USD$/, "USDC")
}

function formatAssetBalance(item: BalanceItem) {
  const code = normalizeAssetCode(item.asset_code, item.asset_type)
  const raw = Number(String(item.balance || "").replace(",", "."))
  if (!Number.isFinite(raw)) return `${item.balance || "0"} ${code}`
  if (code === "USDC") return `US$ ${raw.toFixed(2)}`
  if (code === "BRL") return `R$ ${raw.toFixed(2)}`
  return `${raw.toFixed(7)} ${code}`
}

function shorten(value?: string, left = 6, right = 6) {
  const raw = String(value || "").trim()
  if (!raw) return "unavailable"
  if (raw.length <= left + right + 3) return raw
  return `${raw.slice(0, left)}...${raw.slice(-right)}`
}

export default function WalletProfileClient({ publicKey }: { publicKey: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState("")
  const [payload, setPayload] = useState<any>(null)

  useEffect(() => {
    async function loadProfile() {
      setStatus("loading")
      try {
        const sessionId = localStorage.getItem("talk-to-stellar.sessionId") || ""
        const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""
        const response = await fetch(`/api/financial/wallet-profile/${encodeURIComponent(publicKey)}${query}`, {
          cache: "no-store",
        })
        const body = await response.json().catch(() => ({}))
        if (!response.ok || !body?.success) {
          throw new Error(body?.message || "Could not load wallet profile.")
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
  const stats = payload?.stats || {}

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-4 py-12 sm:px-6">
        <section className="min-w-0 w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:p-10">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-300/35 bg-indigo-300/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.22em] text-indigo-100">
              <UserCircle2 className="h-4 w-4" />
              Wallet profile
            </div>
            <Link
              href="/transactions"
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              Back to history
            </Link>
          </div>

          {status === "loading" && (
            <div className="mt-8 inline-flex items-center gap-2 text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading profile...
            </div>
          )}

          {status === "error" && (
            <p className="mt-8 text-rose-300">{message || "Could not load profile."}</p>
          )}

          {status === "ready" && (
            <>
              <h1 className="mt-5 text-3xl font-semibold text-white md:text-5xl">
                {profile?.name || "Contact"}
              </h1>
              <p className="mt-2 text-sm text-slate-300">Identifier: {profile?.identifier || "unavailable"}</p>
              <p className="mt-1 text-xs text-slate-400">Wallet: {shorten(profile?.public_key || publicKey, 10, 10)}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Received operations</p>
                  <p className="mt-2 text-xl font-semibold text-white">{Number(stats?.total_received_operations || 0)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4 sm:col-span-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Last received</p>
                  <p className="mt-2 text-sm text-slate-200">
                    {stats?.last_received_at ? new Date(stats.last_received_at).toLocaleString("en-US") : "No completed operations"}
                  </p>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                <div className="border-b border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-slate-300">Account balances</div>
                {balances.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-300">Balance unavailable right now.</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {balances.map((item: BalanceItem, index: number) => (
                      <li key={`${item.asset_code || item.asset_type || "asset"}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm text-slate-300">{normalizeAssetCode(item.asset_code, item.asset_type)}</span>
                        <span className="text-sm font-semibold text-white">{formatAssetBalance(item)}</span>
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
