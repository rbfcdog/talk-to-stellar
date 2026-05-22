"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { FileDown, Loader2, Wallet2 } from "lucide-react"
import { getClientSession } from "@/lib/session"
import { useLanguage } from "@/lib/i18n"
import { UserGuidance } from "@/components/user-guidance"

type TransactionItem = {
  id: string | number
  payment_hash?: string | null
  status?: string
  operation_type?: string | null
  source_amount?: string | null
  source_asset_code?: string | null
  destination_amount?: string | null
  destination_asset_code?: string | null
  context_message?: string | null
  created_at?: string | null
  completed_at?: string | null
  counterparty?: {
    name?: string | null
    identifier?: string | null
    public_key?: string | null
    short_profile_url?: string | null
    profile_url?: string | null
  } | null
}

function normalizeAssetCode(value?: string) {
  return String(value || "").toUpperCase().replace(/^USD$/, "USDC")
}

function formatAmount(amount?: string | null, assetCode?: string | null) {
  const n = Number(String(amount || "").replace(",", "."))
  const code = normalizeAssetCode(assetCode || "USDC")
  if (!Number.isFinite(n)) return `${amount || "0"} ${code}`.trim()
  if (code === "USDC") return `US$ ${n.toFixed(2)}`
  if (code === "BRL") return `R$ ${n.toFixed(2)}`
  if (code === "XLM") return "Account balance"
  return `${n.toFixed(2)} ${code}`
}

function formatWhen(value?: string | null) {
  const ts = value ? Date.parse(value) : NaN
  if (!Number.isFinite(ts)) return "—"
  return new Date(ts).toLocaleString("en-US")
}

export default function TransactionsClient() {
  const { language } = useLanguage()
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en
  const now = new Date()
  const [sessionId, setSessionId] = useState("")
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState("")
  const [transactions, setTransactions] = useState<TransactionItem[]>([])

  const pageTitle = useMemo(() => {
    const monthNum = Math.max(1, Math.min(12, Number(month || "1")))
    const date = new Date(Number(year || now.getFullYear()), monthNum - 1, 1)
    return date.toLocaleDateString(language === "pt-BR" ? "pt-BR" : "en-US", { month: "long", year: "numeric" })
  }, [month, year, now, language])

  useEffect(() => {
    getClientSession().then(({ sessionId: sid, authenticated }) => {
      setSessionId(sid)
      if (!sid || !authenticated) {
        setStatus("error")
        setMessage("Sign in to view your history.")
        return
      }
      void loadTransactions(sid, month, year)
    })
  }, [])

  async function loadTransactions(currentSessionId = sessionId, currentMonth = month, currentYear = year) {
    if (!currentSessionId) return
    setStatus("loading")
    setMessage("")
    try {
      const response = await fetch(
        `/api/financial/transactions/${encodeURIComponent(currentSessionId)}?month=${encodeURIComponent(currentMonth)}&year=${encodeURIComponent(currentYear)}&limit=200`,
        { cache: "no-store" }
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Could not load history.")
      }
      setTransactions(Array.isArray(payload?.transactions) ? payload.transactions : [])
      setStatus("ready")
    } catch (error) {
      setStatus("error")
      setTransactions([])
      setMessage(error instanceof Error ? error.message : "Failed to load history.")
    }
  }

  function exportPdf() {
    window.print()
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12 sm:px-6">
        <section className="min-w-0 w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:p-10">
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.22em] text-cyan-200">
              <Wallet2 className="h-4 w-4" />
              {L("Histórico", "History")}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/chat"
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
              >
                {L("Voltar ao chat", "Back to chat")}
              </Link>
              <Link
                href="/pix-on"
                className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/20"
              >
                PIX
              </Link>
              <button
                type="button"
                onClick={exportPdf}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                <FileDown className="h-4 w-4" />
                {L("Exportar PDF", "Export PDF")}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-3xl font-semibold text-white md:text-5xl">{L("Transações de", "Transactions for")} {pageTitle}</h1>
              <p className="mt-2 text-sm text-slate-300">{L("Veja status, pessoa, valor e caminho para comprovante.", "View status, person, amount, and receipt path.")}</p>
            </div>
            <div className="no-print flex items-center gap-2">
              <select
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
              >
                {Array.from({ length: 12 }).map((_, index) => (
                  <option key={index + 1} value={String(index + 1)}>
                    {new Date(2000, index, 1).toLocaleDateString(language === "pt-BR" ? "pt-BR" : "en-US", { month: "long" })}
                  </option>
                ))}
              </select>
              <input
                value={year}
                onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
                className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                inputMode="numeric"
                placeholder={L("Ano", "Year")}
              />
              <button
                type="button"
                onClick={() => void loadTransactions()}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-white/10"
              >
                {L("Atualizar", "Refresh")}
              </button>
            </div>
          </div>

          <UserGuidance
            className="no-print mt-6"
            eyebrow={L("Como usar", "How to use")}
            title={L("Use o histórico para fechar a operação", "Use history to close the operation")}
            body={L(
              "Depois de qualquer PIX, envio ou conversão, volte aqui para conferir status, data, contraparte e comprovante.",
              "After any PIX, send, or conversion, come back here to check status, date, counterparty, and receipt.",
            )}
            steps={[
              { title: L("Filtre o mês", "Filter month"), body: L("Escolha o mês e toque em Atualizar.", "Choose the month and tap Refresh.") },
              { title: L("Abra o comprovante", "Open receipt"), body: L("Use o perfil/receipt quando disponível.", "Use profile/receipt when available.") },
              { title: L("Volte ao chat", "Return to chat"), body: L("Peça saldo, contatos, PIX ou comprovante.", "Ask for balance, contacts, PIX, or receipt.") },
            ]}
            actions={[
              { label: L("Chat", "Chat"), href: "/chat" },
              { label: L("Colocar PIX", "Add PIX"), href: "/pix-on" },
              { label: L("Retirar PIX", "Withdraw PIX"), href: "/pix-off" },
            ]}
          />

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            {status === "loading" && (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                {L("Carregando transações...", "Loading transactions...")}
              </div>
            )}

            {status === "error" && (
              <div className="px-4 py-6 text-sm text-rose-300">{message || L("Não consegui carregar o histórico.", "Could not load history.")}</div>
            )}

            {status === "ready" && transactions.length === 0 && (
              <div className="space-y-3 px-4 py-6 text-sm text-slate-300">
                <p className="font-semibold text-white">{L("Ainda não há transações neste período.", "No transactions in this period yet.")}</p>
                <p>{L("Comece pelo chat: peça saldo, contatos, colocar 10 reais via PIX ou retirar 5 reais via PIX.", "Start from chat: ask for balance, contacts, add 10 reais with PIX, or withdraw 5 reais with PIX.")}</p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/chat" className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-950">
                    {L("Abrir chat", "Open chat")}
                  </Link>
                  <Link href="/pix-on" className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-emerald-100">
                    {L("Colocar PIX", "Add PIX")}
                  </Link>
                </div>
              </div>
            )}

            {status === "ready" && transactions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-white/10 bg-white/5 text-slate-300">
                    <tr>
                      <th className="px-4 py-3 font-medium">Person</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Message</th>
                      <th className="px-4 py-3 font-medium">When</th>
                      <th className="px-4 py-3 font-medium no-print">Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((item) => {
                      const profileUrl = String(item.counterparty?.short_profile_url || item.counterparty?.profile_url || "").trim()
                      return (
                        <tr key={String(item.id)} className="border-b border-white/5 text-slate-100">
                          <td className="px-4 py-3 align-top">
                            <p className="font-medium text-white">{item.counterparty?.name || "Recipient"}</p>
                            <p className="text-xs text-slate-400">{item.counterparty?.identifier || "unavailable"}</p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p>{formatAmount(item.destination_amount, item.destination_asset_code)}</p>
                            {item.source_amount && item.source_asset_code && (
                              <p className="text-xs text-slate-400">Source: {formatAmount(item.source_amount, item.source_asset_code)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${String(item.status || "").toLowerCase() === "success" ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-300/15 text-amber-200"}`}>
                              {String(item.status || "pending").toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-300">
                            {item.context_message ? item.context_message : "—"}
                          </td>
                          <td className="px-4 py-3 align-top text-slate-300">
                            {formatWhen(item.completed_at || item.created_at)}
                          </td>
                          <td className="no-print px-4 py-3 align-top">
                            {profileUrl ? (
                              <a
                                href={profileUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex rounded-md border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20"
                              >
                                Open profile
                              </a>
                            ) : (
                              <span className="text-xs text-slate-500">unavailable</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
