"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileDown,
  FileText,
  Filter,
  Loader2,
  RefreshCw,
  Repeat2,
  Search,
  Wallet2,
} from "lucide-react"
import { AccountStatusCard } from "@/components/shared/account-status"
import { getClientSession } from "@/lib/session"

type TransactionItem = {
  id: string | number
  payment_hash?: string | null
  receipt_url?: string | null
  status?: string | null
  operation_type?: string | null
  source_amount?: string | null
  source_asset_code?: string | null
  destination_amount?: string | null
  destination_asset_code?: string | null
  context_message?: string | null
  error_message?: string | null
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

type PeriodMode = "all" | "month"
type KindFilter = "all" | "in" | "out" | "conversion" | "pending"

function normalizeAssetCode(value?: string | null) {
  const code = String(value || "").trim().toUpperCase().replace(/^USD$/, "USDC")
  if (code === "TESOURO" || code === "BRL") return "BRL"
  if (code === "USDC") return "USD"
  if (code === "EUR" || code === "EURC" || code === "EURO" || code === "EUROS") return "CETES"
  return code
}

function numberFrom(value?: string | null) {
  const parsed = Number(String(value || "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : NaN
}

function formatNumber(value: number, min = 2, max = 7) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(value)
}

function formatAmount(amount?: string | null, assetCode?: string | null) {
  const code = normalizeAssetCode(assetCode || "")
  const value = numberFrom(amount)
  if (!Number.isFinite(value)) {
    const raw = String(amount || "").trim()
    return raw ? `${raw}${code ? ` ${code}` : ""}` : "Valor não informado"
  }
  if (code === "BRL") return `R$ ${formatNumber(value, 2, 7)}`
  if (code === "USD") return `US$ ${formatNumber(value, 2, 7)}`
  if (code === "CETES") return `${formatNumber(value, 2, 7)} CETES`
  if (code === "XLM") return `${formatNumber(value, 2, 7)} XLM`
  return `${formatNumber(value, 2, 7)}${code ? ` ${code}` : ""}`
}

function formatWhen(value?: string | null) {
  const ts = value ? Date.parse(value) : NaN
  if (!Number.isFinite(ts)) return "Data indisponível"
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts))
}

function compactHash(value?: string | null) {
  const raw = String(value || "").trim()
  if (!raw) return ""
  if (raw.length <= 18) return raw
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`
}

function statusLabel(value?: string | null) {
  const status = String(value || "").trim().toLowerCase()
  if (status === "success" || status === "completed" || status === "done") return "Concluída"
  if (status === "failed" || status === "error") return "Falhou"
  if (status === "pending" || status === "processing") return "Pendente"
  return status ? status.toUpperCase() : "Pendente"
}

function classifyTransaction(item: TransactionItem): {
  kind: Exclude<KindFilter, "all">
  label: string
  tone: string
} {
  const op = String(item.operation_type || "").toLowerCase()
  const status = String(item.status || "").toLowerCase()
  if (status && !["success", "completed", "done"].includes(status)) {
    return { kind: "pending", label: "Em andamento", tone: "border-tts-gold bg-tts-gold-bg text-tts-gold" }
  }
  if (op.includes("defindex") || op.includes("yield") || op.includes("application")) {
    const isWithdrawal = op.includes("withdraw") || op.includes("redeem")
    return {
      kind: "conversion",
      label: isWithdrawal ? "Retirada de aplicação" : "Aplicação",
      tone: "border-tts-gold bg-tts-gold-bg text-tts-gold",
    }
  }
  if (op.includes("receive") || op.includes("received") || op.includes("claim")) {
    return { kind: "in", label: "Recebimento", tone: "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" }
  }
  if (op.includes("onramp") || op.includes("deposit") || op.includes("pix_in")) {
    return { kind: "in", label: "Entrada", tone: "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" }
  }
  if (op.includes("conversion") || op.includes("swap") || op.includes("path_payment") || (item.source_asset_code && item.destination_asset_code && normalizeAssetCode(item.source_asset_code) !== normalizeAssetCode(item.destination_asset_code))) {
    return { kind: "conversion", label: "Conversão", tone: "border-tts-gold bg-tts-gold-bg text-tts-gold" }
  }
  if (op.includes("offramp") || op.includes("withdraw") || op.includes("pix_out") || op.includes("payment")) {
    return { kind: "out", label: "Envio", tone: "border-tts-border bg-tts-bg text-tts-muted" }
  }
  return { kind: "conversion", label: "Ajuste interno", tone: "border-tts-border bg-tts-bg text-tts-muted" }
}

function operationTypeLabel(value?: string | null) {
  const op = String(value || "").trim().toLowerCase()
  if (!op) return ""
  if (op.includes("defindex") || op.includes("yield") || op.includes("application")) {
    return op.includes("withdraw") || op.includes("redeem") ? "retirada de aplicação" : "aplicação"
  }
  if (op.includes("pix_in") || op.includes("onramp")) return "PIX entrada"
  if (op.includes("pix_out") || op.includes("offramp")) return "PIX saída"
  if (op.includes("conversion") || op.includes("swap") || op.includes("path_payment")) return "conversão"
  if (op.includes("payment") || op.includes("send")) return "pagamento"
  if (op.includes("receive") || op.includes("claim")) return "recebimento"
  if (op.includes("deposit")) return "entrada"
  if (op.includes("withdraw")) return "retirada"
  return op.replace(/_/g, " ")
}

function TransactionIcon({ kind }: { kind: Exclude<KindFilter, "all"> }) {
  if (kind === "in") return <ArrowDownLeft className="h-5 w-5" aria-hidden="true" />
  if (kind === "out") return <ArrowUpRight className="h-5 w-5" aria-hidden="true" />
  if (kind === "pending") return <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
  return <Repeat2 className="h-5 w-5" aria-hidden="true" />
}

function primaryAmount(item: TransactionItem) {
  const source = item.source_amount ? formatAmount(item.source_amount, item.source_asset_code) : ""
  const destination = item.destination_amount ? formatAmount(item.destination_amount, item.destination_asset_code) : ""
  const sourceCode = normalizeAssetCode(item.source_asset_code || "")
  const destinationCode = normalizeAssetCode(item.destination_asset_code || "")
  const isCrossAsset = source && destination && sourceCode && destinationCode && sourceCode !== destinationCode
  if (isCrossAsset) return `${source} → ${destination}`
  return destination || source || "Valor não informado"
}

function counterpartyName(item: TransactionItem) {
  const name = String(item.counterparty?.name || "").trim()
  const identifier = String(item.counterparty?.identifier || "").trim()
  if (name && name !== "Destinatário") return name
  if (identifier && identifier !== "indisponível" && identifier !== "unavailable") return identifier
  return "Contato não identificado"
}

function searchableText(item: TransactionItem) {
  return [
    item.operation_type,
    item.status,
    item.source_amount,
    item.source_asset_code,
    item.destination_amount,
    item.destination_asset_code,
    item.context_message,
    item.error_message,
    item.payment_hash,
    item.counterparty?.name,
    item.counterparty?.identifier,
  ].join(" ").toLowerCase()
}

function publicKeyProfileUrl(publicKey?: string | null) {
  const key = String(publicKey || "").trim()
  return /^G[A-Z2-7]{55}$/i.test(key) ? `/profile/${encodeURIComponent(key)}` : ""
}

function transactionProfileUrl(item: TransactionItem) {
  const fallbackUrl = String(item.counterparty?.short_profile_url || item.counterparty?.profile_url || "").trim()
  if (fallbackUrl && !/\/receipt\/|\/receipts\/|\/api\/external\/receipts\//i.test(fallbackUrl)) return fallbackUrl

  const directUrl = publicKeyProfileUrl(item.counterparty?.public_key)
  if (directUrl) return directUrl
  return ""
}

export default function TransactionsClient() {
  const today = useMemo(() => new Date(), [])
  const [sessionId, setSessionId] = useState("")
  const [sessionSource, setSessionSource] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [period, setPeriod] = useState<PeriodMode>("all")
  const [month, setMonth] = useState(String(today.getMonth() + 1))
  const [year, setYear] = useState(String(today.getFullYear()))
  const [kindFilter, setKindFilter] = useState<KindFilter>("all")
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [message, setMessage] = useState("")
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)

  const pageTitle = useMemo(() => {
    if (period === "all") return "Todo histórico"
    const monthNum = Math.max(1, Math.min(12, Number(month || "1")))
    const date = new Date(Number(year || today.getFullYear()), monthNum - 1, 1)
    return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
  }, [month, period, today, year])

  useEffect(() => {
    getClientSession().then(({ sessionId: sid, authenticated: isAuthenticated, sessionSource: source }) => {
      setSessionId(sid)
      setSessionSource(source)
      setAuthenticated(Boolean(isAuthenticated))
      if (!sid || !isAuthenticated) {
        setStatus("error")
        setMessage("Entre na conta para ver seu histórico.")
      }
    })
  }, [])

  useEffect(() => {
    if (!sessionId || !authenticated) return
    void loadTransactions(sessionId, period, month, year, sessionSource)
  }, [authenticated, month, period, sessionId, sessionSource, year])

  useEffect(() => { setPage(1) }, [kindFilter, pageSize, search, period])

  async function loadTransactions(
    currentSessionId = sessionId,
    currentPeriod = period,
    currentMonth = month,
    currentYear = year,
    currentSessionSource = sessionSource,
  ) {
    if (!currentSessionId) return
    setStatus("loading")
    setMessage("")
    try {
      const params = new URLSearchParams({ limit: "500" })
      const source = currentSessionSource.trim()
      if (source) {
        params.set("session_source", source)
        params.set("session_scope", source)
      }
      if (currentPeriod === "month") {
        params.set("month", currentMonth)
        params.set("year", currentYear)
      }
      const response = await fetch(
        `/api/financial/transactions/${encodeURIComponent(currentSessionId)}?${params.toString()}`,
        { cache: "no-store" }
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Não foi possível carregar o histórico.")
      }
      setTransactions(Array.isArray(payload?.transactions) ? payload.transactions : [])
      setStatus("ready")
    } catch (error) {
      setStatus("error")
      setTransactions([])
      setMessage(error instanceof Error ? error.message : "Falha ao carregar histórico.")
    }
  }

  const summary = useMemo(() => {
    const base = { total: transactions.length, in: 0, out: 0, conversion: 0, pending: 0 }
    for (const item of transactions) {
      const kind = classifyTransaction(item).kind
      base[kind] += 1
    }
    return base
  }, [transactions])

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return transactions.filter((item) => {
      const kind = classifyTransaction(item).kind
      if (kindFilter !== "all" && kind !== kindFilter) return false
      if (query && !searchableText(item).includes(query)) return false
      return true
    })
  }, [kindFilter, search, transactions])

  const totalPages = Math.max(1, Math.ceil(visibleTransactions.length / pageSize))
  const pagedTransactions = useMemo(() =>
    visibleTransactions.slice((page - 1) * pageSize, page * pageSize),
    [page, pageSize, visibleTransactions]
  )

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const setPageSafe = (p: number) => setPage(Math.max(1, Math.min(p, totalPages)))
  const pageStart = visibleTransactions.length === 0 ? 0 : (page - 1) * pageSize + 1
  const pageEnd = Math.min(page * pageSize, visibleTransactions.length)

  function exportPdf() {
    window.print()
  }

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-tts-border pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 border border-tts-gold bg-tts-gold-bg px-3 py-1 text-[11px] font-black uppercase tracking-normal text-tts-gold">
              <Wallet2 className="h-4 w-4" aria-hidden="true" />
              Histórico
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-normal text-tts-deep md:text-4xl">
              Todas as transações
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
              Veja entradas, envios, conversões, PIX e ajustes da sua conta em uma linha do tempo.
            </p>
          </div>

          <div className="no-print flex flex-wrap gap-2 lg:justify-end">
            <button
              type="button"
              onClick={exportPdf}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Exportar PDF
            </button>
          </div>
        </header>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="border border-tts-border bg-tts-surface p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">Período</p>
                <p className="mt-1 text-lg font-black capitalize text-tts-deep">{pageTitle}</p>
              </div>
              <div className="no-print flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPeriod("all")}
                  className={`min-h-10 border px-3 py-2 text-sm font-black transition ${period === "all" ? "border-tts-deep bg-tts-deep text-tts-surface" : "border-tts-border bg-tts-surface text-tts-deep hover:border-tts-border2"}`}
                >
                  Tudo
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod("month")}
                  className={`inline-flex min-h-10 items-center gap-2 border px-3 py-2 text-sm font-black transition ${period === "month" ? "border-tts-deep bg-tts-deep text-tts-surface" : "border-tts-border bg-tts-surface text-tts-deep hover:border-tts-border2"}`}
                >
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  Mês
                </button>
              </div>
            </div>

            {period === "month" ? (
              <div className="no-print mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                <select
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  className="min-h-11 border border-tts-border bg-tts-bg px-3 py-2 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                >
                  {Array.from({ length: 12 }).map((_, index) => (
                    <option key={index + 1} value={String(index + 1)}>
                      {new Date(2000, index, 1).toLocaleDateString("pt-BR", { month: "long" })}
                    </option>
                  ))}
                </select>
                <input
                  value={year}
                  onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="min-h-11 border border-tts-border bg-tts-bg px-3 py-2 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                  inputMode="numeric"
                  placeholder="Ano"
                />
                <button
                  type="button"
                  onClick={() => void loadTransactions()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Atualizar
                </button>
              </div>
            ) : null}
          </div>

          <AccountStatusCard
            state={status === "loading" ? "loading" : authenticated ? "connected" : "signed-out"}
            detail={authenticated ? "Histórico pronto para consulta." : "Entre para carregar as movimentações da conta."}
            ctaHref="/login?next=/transactions"
            ctaLabel="Entrar"
          />
        </section>

        <section className="tts-mobile-scroll flex gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Movimentações" value={summary.total} detail={status === "ready" ? `${visibleTransactions.length} visíveis` : "carregando"} />
          <SummaryCard label="Entradas" value={summary.in} detail="recebimentos e depósitos" tone="confirm" />
          <SummaryCard label="Saídas" value={summary.out} detail="envios e retiradas" />
          <SummaryCard label="Conversões" value={summary.conversion} detail="trocas e ajustes" tone="gold" />
        </section>

        <section className="no-print grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tts-muted" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-12 w-full border border-tts-border bg-tts-surface px-10 py-2 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
              placeholder="Buscar por contato, valor, moeda, PIX ou hash"
            />
          </label>
          <label className="relative block">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tts-muted" aria-hidden="true" />
            <select
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as KindFilter)}
              className="min-h-12 w-full appearance-none border border-tts-border bg-tts-surface px-10 py-2 text-sm font-black text-tts-deep outline-none focus:border-tts-gold"
            >
              <option value="all">Todas</option>
              <option value="in">Entradas</option>
              <option value="out">Saídas</option>
              <option value="conversion">Conversões</option>
              <option value="pending">Pendentes</option>
            </select>
          </label>
        </section>

        <section className="border border-tts-border bg-tts-surface">
          {status === "loading" ? (
            <StatePanel icon={<Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />} title="Carregando histórico" detail="Buscando as operações da sua conta." />
          ) : null}

          {status === "error" ? (
            <StatePanel
              icon={<AlertTriangle className="h-5 w-5" aria-hidden="true" />}
              title="Não foi possível carregar"
              detail={message || "Tente novamente em alguns segundos."}
              action={
                <button
                  type="button"
                  onClick={() => void loadTransactions()}
                  className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Tentar de novo
                </button>
              }
            />
          ) : null}

          {status === "ready" && visibleTransactions.length === 0 ? (
            <StatePanel icon={<FileText className="h-5 w-5" aria-hidden="true" />} title="Nenhuma transação encontrada" detail="Ajuste o filtro ou tente outro período." />
          ) : null}

          {status === "ready" && pagedTransactions.length > 0 ? (
            <div className="divide-y divide-tts-border">
              <PaginationControls
                page={page}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                totalItems={visibleTransactions.length}
                pageSize={pageSize}
                onPageChange={setPageSafe}
                onPageSizeChange={(value) => setPageSize(value)}
              />
              {pagedTransactions.map((item, index) => (
                <TransactionRow key={`${String(item.id)}:${index}`} item={item} />
              ))}
              <PaginationControls
                page={page}
                totalPages={totalPages}
                pageStart={pageStart}
                pageEnd={pageEnd}
                totalItems={visibleTransactions.length}
                pageSize={pageSize}
                onPageChange={setPageSafe}
                onPageSizeChange={(value) => setPageSize(value)}
                compact
              />
            </div>
          ) : null}
        </section>
      </section>
    </main>
  )
}

function SummaryCard({ label, value, detail, tone = "default" }: { label: string; value: number; detail: string; tone?: "default" | "confirm" | "gold" }) {
  const valueClass = tone === "confirm" ? "text-tts-confirm" : tone === "gold" ? "text-tts-gold" : "text-tts-deep"
  return (
    <div className="min-w-[68vw] border border-tts-border bg-tts-surface p-4 sm:min-w-0">
      <p className="text-[11px] font-black uppercase tracking-normal text-tts-muted">{label}</p>
      <p className={`mt-2 text-2xl font-black ${valueClass}`}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-tts-muted">{detail}</p>
    </div>
  )
}

function StatePanel({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-4 py-10 text-center">
      <span className="grid h-11 w-11 place-items-center border border-tts-border bg-tts-bg text-tts-muted">{icon}</span>
      <p className="mt-3 text-base font-black text-tts-deep">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-tts-muted">{detail}</p>
      {action}
    </div>
  )
}

function PaginationControls({
  page,
  totalPages,
  pageStart,
  pageEnd,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  compact = false,
}: {
  page: number
  totalPages: number
  pageStart: number
  pageEnd: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (value: number) => void
  compact?: boolean
}) {
  return (
    <div className={`no-print flex flex-col gap-3 bg-tts-bg/50 p-4 sm:flex-row sm:items-center sm:justify-between ${compact ? "border-t border-tts-border" : ""}`}>
      <div>
        <p className="text-sm font-black text-tts-deep">
          Página {page} de {totalPages}
        </p>
        <p className="mt-1 text-xs text-tts-muted">
          Mostrando {pageStart}-{pageEnd} de {totalItems} movimentações
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        {!compact ? (
          <label className="flex min-h-10 items-center gap-2 border border-tts-border bg-tts-surface px-3 py-1 text-xs font-black text-tts-muted">
            Itens por página
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="min-h-8 border-0 bg-transparent p-0 text-xs font-black text-tts-deep outline-none"
            >
              <option value={8}>8</option>
              <option value={15}>15</option>
              <option value={30}>30</option>
            </select>
          </label>
        ) : null}

        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-xs font-black text-tts-deep transition hover:border-tts-border2 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Anterior
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-xs font-black text-tts-deep transition hover:border-tts-border2 disabled:cursor-not-allowed disabled:opacity-35"
        >
          Próxima
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function TransactionRow({ item }: { item: TransactionItem }) {
  const classification = classifyTransaction(item)
  const operationLabel = operationTypeLabel(item.operation_type)
  const profileUrl = transactionProfileUrl(item)
  const receiptUrl = String(item.receipt_url || "").trim()
  const hash = compactHash(item.payment_hash)
  const date = formatWhen(item.completed_at || item.created_at)
  const context = String(item.context_message || item.error_message || "").trim()

  return (
    <article className="grid gap-4 p-4 transition hover:bg-tts-bg/60 md:grid-cols-[52px_minmax(0,1fr)_minmax(180px,auto)] md:p-5">
      <div className="flex items-start gap-3 md:block">
        <span className={`grid h-11 w-11 shrink-0 place-items-center border ${classification.tone}`}>
          <TransactionIcon kind={classification.kind} />
        </span>
        <div className="md:hidden">
          <p className="text-base font-black text-tts-deep">{classification.label}</p>
          <p className="text-xs text-tts-muted">{date}</p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="hidden md:block">
          <p className="text-base font-black text-tts-deep">{classification.label}</p>
          <p className="text-xs text-tts-muted">{date}</p>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="border border-tts-border bg-tts-bg px-2 py-1 text-xs font-black text-tts-deep">
            {statusLabel(item.status)}{operationLabel ? ` · ${operationLabel}` : ""}
          </span>
        </div>

        <p className="mt-3 text-sm font-black text-tts-deep">{counterpartyName(item)}</p>
        <p className="mt-1 text-xs leading-5 text-tts-muted">
          {item.counterparty?.identifier && item.counterparty.identifier !== "indisponível" ? item.counterparty.identifier : "Contato ou origem não identificado"}
        </p>
        {context ? <p className="mt-2 text-sm leading-6 text-tts-muted">{context}</p> : null}
        {hash ? <p className="mt-2 font-mono-financial text-xs text-tts-muted">Rede: {hash}</p> : null}
      </div>

      <div className="flex flex-col justify-between gap-3 md:items-end md:text-right">
        <div>
          <p className="text-lg font-black text-tts-deep">{primaryAmount(item)}</p>
          {item.source_amount && item.destination_amount ? (
            <p className="mt-1 text-xs text-tts-muted">
              Origem: {formatAmount(item.source_amount, item.source_asset_code)}
            </p>
          ) : null}
        </div>
        <div className="no-print grid gap-2 sm:flex sm:flex-wrap md:justify-end">
          {receiptUrl ? (
            <a
              href={receiptUrl}
              className="inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-1 text-xs font-black text-tts-deep transition hover:border-tts-border2"
            >
              Comprovante
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
          {profileUrl ? (
            <a
              href={profileUrl}
              className="inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-1 text-xs font-black text-tts-deep transition hover:border-tts-border2"
            >
              Perfil
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  )
}
