"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Coins,
  Droplets,
  ExternalLink,
  FileCheck2,
  HelpCircle,
  Loader2,
  LockKeyhole,
  Plus,
  Wallet,
  WalletCards,
} from "lucide-react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCustomerNumber } from "@/lib/customer-amount";
import { extractDefindexPositionAmount } from "@/lib/defindex-position";
import { useLanguage, type AppLanguage } from "@/lib/i18n";
import { analyzePortfolioPeriod } from "@/lib/portfolio-period-analysis";
import { currentPageSessionSource, getClientSession } from "@/lib/session";
import { BridgeAccessField, useBridgeAccess } from "@/components/shared/bridge-auth-gate";

type ApiState = { loading: boolean; message: string; error: string };
type YieldApiError = Error & { code?: string; requestId?: string; supportCode?: string };
type YieldStep = "plan" | "review";
type SessionState = { authenticated: boolean; sessionId?: string; sessionSource?: string; externalPriority?: boolean; loading?: boolean; checked?: boolean };
type BalanceLine = { asset_code: string; asset_type?: string; asset_issuer?: string; balance: string };
type YieldOption = {
  asset_code: string; asset_issuer?: string; display_asset_code?: string; vault_address: string;
  label: string; network: string; hardcoded_asset_override?: boolean; requires_wallet_asset_conversion?: boolean;
  execution_available?: boolean; execution_blocked_code?: string; execution_blocked_reason?: string;
  unavailable_reason?: string; wallet_source_asset?: { code?: string; issuer?: string };
  vault_deposit_asset?: { code?: string; issuer?: string; contract?: string }; conversion_note?: string;
  apy?: Record<string, unknown>; apy_percent?: string; apy_period?: string; apy_error?: string;
};
type YieldStatus = {
  success?: boolean; runtime?: { configured?: boolean; api_key_configured?: boolean; network?: string;
    execution_enabled?: boolean; compliance_approved?: boolean; compliance_mode?: string;
    unavailable_reason?: string; execution_blocked_reason?: string;
    disclosure?: { environment?: string; source?: string; rate_label?: string; testnet?: boolean;
      not_guaranteed?: boolean; not_investment_advice?: boolean; not_bank_deposit?: boolean; };
  }; vaults?: YieldOption[];
};
type PositionState = { loading: boolean; amount: string; error: string; raw?: unknown; source?: string; anomaly?: "testnet_conversion_loss"; };
type PositionHistoryPoint = {
  date: string;
  amount: string;
  delta?: string;
  action?: "deposit" | "withdraw";
  operation_id?: string;
};
type PositionHistoryState = { loading: boolean; points: PositionHistoryPoint[]; error: string; source?: string };
type InvestmentRow = {
  option: YieldOption;
  code: string;
  profile: { namePt: string; nameEn: string; short: string };
  amount: number;
  loading: boolean;
  error: string;
  source: string;
  rate: number;
  history: PositionHistoryState;
};
type YieldSuccessNotice = { action: "deposit" | "withdraw"; reviewedAmount: string; reviewedAsset: string; vaultAmount?: string; vaultAsset?: string; hash?: string; };
type AnalysisWindow = "daily" | "weekly";
type ChartWindow = "weekly" | "monthly";

const MONEY_PROFILES: Record<string, { namePt: string; nameEn: string; short: string }> = {
  USDC: { namePt: "Dólares", nameEn: "Dollars", short: "USD" },
  CETES: { namePt: "CETES", nameEn: "CETES", short: "CETES" },
  USD: { namePt: "Dólares", nameEn: "Dollars", short: "USD" },
  XLM: { namePt: "XLM", nameEn: "XLM", short: "XLM" },
  TESOURO: { namePt: "Reais", nameEn: "Reais", short: "BRL" },
  BRL: { namePt: "Reais", nameEn: "Reais", short: "BRL" },
};

function isPortuguese(language: AppLanguage) { return language === "pt-BR"; }
function localCopy(language: AppLanguage, pt: string, en: string) { return isPortuguese(language) ? pt : en; }
function profileName(profile: { namePt: string; nameEn: string }, language: AppLanguage) { return isPortuguese(language) ? profile.namePt : profile.nameEn; }
function moneyProfile(code?: string) {
  const n = String(code || "").trim().toUpperCase();
  return MONEY_PROFILES[n] || { namePt: n, nameEn: n, short: n };
}
function optionCode(option?: YieldOption | null) { return String(option?.display_asset_code || option?.asset_code || "").trim().toUpperCase(); }

// ── Bulletproof selectable styling (DARK) ────────────────────────────────────
// The yield panels run on a dark background, so interactive cards/pills use a
// dark stone palette with light text + an amber accent for the selected state.
const SELECT_CARD = "w-full text-left rounded-xl border-2 p-3 transition-all duration-150";
const SELECT_CARD_OFF = "border-stone-700 bg-stone-800 text-stone-100 hover:border-amber-400/60 hover:bg-stone-700/70";
const SELECT_CARD_ON = "border-amber-500 bg-amber-500/15 text-white ring-2 ring-amber-500/40 shadow-lg";
const selectCard = (on: boolean) => `${SELECT_CARD} ${on ? SELECT_CARD_ON : SELECT_CARD_OFF}`;
// Primary action button — amber on dark.
const BTN_PRIMARY = "flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500";
function formatAmount(value: unknown, language: AppLanguage = "pt-BR") {
  // Use the same robust parser as normalizeDecimal (handles thousands separators
  // and comma decimals) instead of a single naive comma→dot replace.
  const p = normalizeDecimal(value);
  if (!Number.isFinite(p)) return String(value || "0");
  return formatCustomerNumber(p, isPortuguese(language) ? "pt-BR" : "en-US");
}
// Full-precision formatter — keeps every cent/decimal (up to 7) instead of
// rounding to 2, so accrued yield like 3.0004691 is visible.
function formatPrecise(value: unknown, language: AppLanguage = "pt-BR") {
  const p = Number(String(value ?? "0").replace(",", "."));
  if (!Number.isFinite(p)) return "0";
  return p.toLocaleString(isPortuguese(language) ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 7 });
}
function formatPositionAmount(value: unknown, profile: { short: string }, language: AppLanguage = "pt-BR") {
  const amount = normalizeDecimal(value);
  if (amount <= 0) return `0 ${profile.short}`;
  return `${formatPrecise(amount, language)} ${profile.short}`;
}
function optionExecutionBlocked(option: YieldOption | null | undefined) { return Boolean(option && (option.execution_available === false || option.execution_blocked_code)); }
function normalizeDecimal(value: unknown) {
  const raw = String(value || "0").trim();
  const n = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const p = Number(n);
  return Number.isFinite(p) && p >= 0 ? p : 0;
}
function optionRatePercent(option?: YieldOption | null) {
  const raw = option?.apy_percent || option?.apy?.apyPercent || option?.apy?.apy_percent || option?.apy?.apy || option?.apy_period || "";
  const v = Array.isArray(raw) ? raw[0] : raw;
  const p = Number(String(v || "").replace("%", "").replace(",", "."));
  return Number.isFinite(p) && p > 0 ? p : 0;
}

const RETURN_PERIODS = [
  { key: "30d", years: 30 / 365, labelPt: "30 dias", labelEn: "30 days" },
  { key: "6m", years: 0.5, labelPt: "6 meses", labelEn: "6 months" },
  { key: "12m", years: 1, labelPt: "12 meses", labelEn: "12 months" },
];
const ANALYSIS_WINDOWS: Array<{ key: AnalysisWindow; days: number; labelPt: string; labelEn: string; detailPt: string; detailEn: string }> = [
  { key: "daily", days: 1, labelPt: "Diário", labelEn: "Daily", detailPt: "Últimas 24h", detailEn: "Last 24h" },
  { key: "weekly", days: 7, labelPt: "Semanal", labelEn: "Weekly", detailPt: "Últimos 7 dias", detailEn: "Last 7 days" },
];
const CHART_WINDOWS: Array<{ key: ChartWindow; days: number; labelPt: string; labelEn: string; detail: string }> = [
  { key: "weekly", days: 7, labelPt: "Semanal", labelEn: "Weekly", detail: "7d" },
  { key: "monthly", days: 30, labelPt: "Mensal", labelEn: "Monthly", detail: "30d" },
];
function periodReturnPercent(ratePercent: number, years: number) {
  const annualRate = Math.max(0, ratePercent) / 100;
  if (annualRate <= 0) return 0;
  return (Math.pow(1 + annualRate, years) - 1) * 100;
}
function formatReturnPercent(value: number, language: AppLanguage) {
  const formatted = new Intl.NumberFormat(isPortuguese(language) ? "pt-BR" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
  return `+${formatted}%`;
}
function formatSignedAmount(value: number, profile: { short: string }, language: AppLanguage) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatAmount(Math.abs(value), language)} ${profile.short}`;
}
function formatSignedPercent(value: number, language: AppLanguage) {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat(isPortuguese(language) ? "pt-BR" : "en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number.isFinite(value) ? value : 0));
  return `${sign}${formatted}%`;
}
function ReturnPeriodGrid({ language, rate }: { language: AppLanguage; rate: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {RETURN_PERIODS.map((period) => {
        const value = periodReturnPercent(rate, period.years);
        return (
          <div key={period.key} className="rounded-xl bg-tts-bg px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-tts-muted">
              {isPortuguese(language) ? period.labelPt : period.labelEn}
            </p>
            <p className="mt-1 text-sm font-black text-tts-deep">{formatReturnPercent(value, language)}</p>
          </div>
        );
      })}
    </div>
  );
}
function ReturnPeriodPanel({ language, rate, assetLabel }: { language: AppLanguage; rate: number; assetLabel: string }) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  return (
    <div className="rounded-2xl border border-tts-border bg-tts-bg p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">
            {L("Rentabilidade estimada", "Estimated return")}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-tts-muted">{assetLabel}</p>
        </div>
        <p className="text-sm font-black text-tts-confirm">{formatReturnPercent(periodReturnPercent(rate, 1), language)}</p>
      </div>
      <ReturnPeriodGrid language={language} rate={rate} />
    </div>
  );
}

type ChartPoint = { label: string; date?: string; value: number; action?: string };

function formatChartDate(value: unknown, language: AppLanguage) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return localCopy(language, "Hoje", "Today");
  return new Intl.DateTimeFormat(isPortuguese(language) ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "short",
  }).format(date);
}

function formatChartAmount(value: unknown, profile: { short: string }, language: AppLanguage) {
  return `${formatPrecise(value, language)} ${profile.short}`;
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

// Timestamp label including the hour, so the 4-hour cadence reads clearly in the
// tooltip (the X axis itself is hidden).
function formatChartStamp(value: unknown, language: AppLanguage) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return localCopy(language, "Agora", "Now");
  return new Intl.DateTimeFormat(isPortuguese(language) ? "pt-BR" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// Percentage change across the plotted balance line (last vs first non-zero value).
function seriesChangePercent(points: ChartPoint[]): number {
  const first = points.find((point) => point.value > 0)?.value ?? points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  if (!first) return 0;
  return ((last - first) / first) * 100;
}

// Plot the real balance on a 4-hour grid across the window. Snapshots are
// forward-filled (the balance holds until the next movement), so the line gets a
// point every 4h regardless of how sparse the underlying history is.
function buildPositionLinePoints(history: PositionHistoryState | undefined, currentAmount: number, language: AppLanguage, days: number): ChartPoint[] {
  const now = Date.now();
  const start = now - days * 24 * 60 * 60 * 1000;

  const sorted = [...(history?.points || [])]
    .filter((point) => Number.isFinite(Date.parse(String(point.date || ""))))
    .sort((a, b) => Date.parse(String(a.date || "")) - Date.parse(String(b.date || "")));

  // Seed the forward-fill with the latest balance known at or before the window.
  let lastKnown = currentAmount;
  const beforeStart = [...sorted].reverse().find((point) => Date.parse(String(point.date || "")) <= start);
  if (beforeStart) lastKnown = normalizeDecimal(beforeStart.amount);
  else if (sorted.length) lastKnown = normalizeDecimal(sorted[0].amount);

  let idx = 0;
  const points: ChartPoint[] = [];
  for (let t = start; t <= now; t += FOUR_HOURS_MS) {
    while (idx < sorted.length && Date.parse(String(sorted[idx].date || "")) <= t) {
      lastKnown = normalizeDecimal(sorted[idx].amount);
      idx += 1;
    }
    const iso = new Date(t).toISOString();
    points.push({ label: formatChartStamp(iso, language), date: iso, value: Math.max(0, lastKnown) });
  }

  // The final slot reflects the live balance "now".
  while (idx < sorted.length) {
    lastKnown = normalizeDecimal(sorted[idx].amount);
    idx += 1;
  }
  const liveValue = Math.max(0, currentAmount || lastKnown);
  const nowIso = new Date(now).toISOString();
  if (points.length) {
    points[points.length - 1] = { label: localCopy(language, "Agora", "Now"), date: nowIso, value: liveValue };
  } else {
    points.push({ label: localCopy(language, "Agora", "Now"), date: nowIso, value: liveValue });
  }
  return points;
}

function buildPortfolioLinePoints(rows: InvestmentRow[], language: AppLanguage, days: number): ChartPoint[] {
  const series = rows.map((row) => buildPositionLinePoints(row.history, row.amount, language, days));
  const length = Math.max(0, ...series.map((points) => points.length));
  if (!length) return [{ label: localCopy(language, "Agora", "Now"), value: 0 }];
  return Array.from({ length }, (_, index) => {
    const firstSeriesPoint = series.find((points) => points[index])?.[index];
    return {
      label: firstSeriesPoint?.label || localCopy(language, "Agora", "Now"),
      date: firstSeriesPoint?.date,
      value: series.reduce((sum, points) => sum + Number(points[index]?.value || 0), 0),
    };
  });
}

function InvestmentLineChart({ data, profile, language, tone = "primary" }: {
  data: ChartPoint[];
  profile: { short: string };
  language: AppLanguage;
  tone?: "primary" | "muted";
}) {
  const stroke = tone === "primary" ? "var(--tts-deep)" : "var(--tts-confirm)";
  const showDots = data.length <= 10;
  return (
    <div className="h-24 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 6, bottom: 2, left: 6 }}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "rgba(113, 113, 122, 0.18)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const value = Number(payload[0]?.value || 0);
              return (
                <div className="border border-tts-border bg-tts-surface px-3 py-2 text-xs shadow-sm">
                  <p className="font-bold text-tts-deep">{String(label || "")}</p>
                  <p className="mt-0.5 font-semibold text-tts-muted">{formatChartAmount(value, profile, language)}</p>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeOpacity={tone === "primary" ? 0.72 : 0.62}
            strokeWidth={1.45}
            dot={showDots ? { r: 1.75, strokeWidth: 0, fill: stroke, fillOpacity: 0.55 } : false}
            activeDot={{ r: 3, strokeWidth: 0, fill: stroke, fillOpacity: 0.85 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function InvestmentGraphs({ language, row }: { language: AppLanguage; row: InvestmentRow }) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const [chartWindow, setChartWindow] = useState<ChartWindow>("weekly");
  const activeWindow = CHART_WINDOWS.find((item) => item.key === chartWindow) || CHART_WINDOWS[0];
  const historyPoints = buildPositionLinePoints(row.history, row.amount, language, activeWindow.days);
  const changePct = seriesChangePercent(historyPoints);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wide text-tts-muted">
          {L("Visualização do gráfico", "Chart view")}
        </p>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-tts-border bg-tts-bg p-1">
          {CHART_WINDOWS.map((item) => {
            const active = item.key === chartWindow;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setChartWindow(item.key)}
                className={[
                  "min-w-20 rounded-md px-2.5 py-1.5 text-left transition",
                  active ? "bg-tts-deep text-tts-surface" : "text-tts-muted hover:bg-tts-surface",
                ].join(" ")}
                aria-pressed={active}
              >
                <span className="block text-[10px] font-black">{isPortuguese(language) ? item.labelPt : item.labelEn}</span>
                <span className={active ? "block text-[9px] font-semibold text-tts-surface/70" : "block text-[9px] font-semibold text-tts-muted"}>
                  {item.detail}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-tts-border bg-tts-bg p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">{L("Linha de saldo", "Balance line")}</p>
            <p className="mt-1 text-sm font-black text-tts-deep">{formatChartAmount(row.amount, row.profile, language)}</p>
          </div>
          <span className={["text-xs font-black", changePct >= 0 ? "text-tts-confirm" : "text-tts-error"].join(" ")}>
            {row.history.loading ? L("Carregando", "Loading") : formatSignedPercent(changePct, language)}
          </span>
        </div>
        <InvestmentLineChart data={historyPoints} profile={row.profile} language={language} />
      </div>
    </div>
  );
}
function normalizeUiAssetCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase().split(":")[0];
  if (!code) return "";
  if (["USD", "DOLLAR", "DOLLARS"].includes(code)) return "USDC";
  if (["EUR", "EURC"].includes(code)) return "CETES";
  if (["TESOURO", "REAL", "REAIS", "R$", "BRL"].includes(code)) return "TESOURO";
  return code;
}
function buildMoneyUrl(path: string, params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) search.set(key, text);
  }
  const q = search.toString();
  return q ? `${path}?${q}` : path;
}

function isSessionUiError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  return /session|login|unauthor|auth|token|jwt/i.test(raw);
}

function externalSessionSource(value: unknown) {
  const source = String(value || "").trim().toLowerCase();
  return source === "whatsapp" || source === "telegram" ? source : "";
}

function scopedRampSource(preferredSource?: unknown) {
  return externalSessionSource(preferredSource) || (typeof window === "undefined" ? "" : externalSessionSource(currentPageSessionSource()));
}

function scopedRampPath(path: string, preferredSource?: unknown) {
  const source = scopedRampSource(preferredSource);
  if (!source) return path;

  const [pathname, query = ""] = String(path || "").split("?");
  const params = new URLSearchParams(query);
  if (!params.get("source")) params.set("source", source);
  if (!params.get("session_scope")) params.set("session_scope", source);
  const nextQuery = params.toString();
  return nextQuery ? `${pathname}?${nextQuery}` : pathname;
}

function scopedLinkContext(initialQuery?: string): Record<string, string> {
  const params = new URLSearchParams(initialQuery || "");
  const candidates = [
    params.get("session_scope"),
    params.get("session_source"),
    params.get("sessionSource"),
    params.get("external_provider"),
    params.get("externalProvider"),
    params.get("provider"),
    params.get("source"),
    params.get("from"),
    params.get("origin"),
  ];
  const source = candidates.map(externalSessionSource).find(Boolean) || scopedRampSource();
  return source ? { source, session_scope: source } : {};
}

function scopedRampInit(init?: RequestInit, preferredSource?: unknown): RequestInit | undefined {
  const source = scopedRampSource(preferredSource);
  if (!source || !init?.body || typeof init.body !== "string") return init;

  try {
    const payload = JSON.parse(init.body || "{}");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return init;
    return {
      ...init,
      body: JSON.stringify({
        ...payload,
        source: payload.source || source,
        session_scope: payload.session_scope || source,
      }),
    };
  } catch {
    return init;
  }
}

async function yieldApi(path: string, init?: RequestInit, timeoutMs = 18000, preferredSource?: unknown) {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  const scopedInit = scopedRampInit(init, preferredSource);
  const response = await fetch(`/api/ramp/${scopedRampPath(path, preferredSource)}`, {
    cache: "no-store", credentials: "same-origin", ...scopedInit,
    signal: controller.signal,
    headers: { "content-type": "application/json", ...(scopedInit?.headers || {}) },
  }).finally(() => window.clearTimeout(id));
  const payload = await response.json().catch(() => ({}));
  const rid = response.headers.get("x-request-id") || String(payload?.request_id || payload?.requestId || "").trim();
  if (!response.ok || payload?.success === false) {
    const err = new Error(payload?.message || payload?.error || "Request failed.") as YieldApiError;
    if (payload?.code) err.code = String(payload.code);
    if (rid) err.requestId = rid;
    if (payload?.support_code || payload?.supportCode) err.supportCode = String(payload.support_code || payload.supportCode);
    throw err;
  }
  return payload;
}

function recoverableYieldCode(error: unknown) {
  const code = String((error as YieldApiError)?.code || "").trim();
  return [
    "yield_unavailable",
    "yield_execution_unavailable",
    "yield_asset_conversion_unavailable",
    "yield_execution_disabled",
    "provider_unavailable",
    "service_timeout",
    "temporary_unavailable",
    "execution_unavailable",
  ].includes(code) ? code : "";
}

function yieldFallbackMessage(error: unknown, language: AppLanguage) {
  const raw = String(error instanceof Error ? error.message : error || "").trim();
  const rawLooksGeneric = /não foi possível atualizar|nao foi possivel atualizar|não consegui concluir|nao consegui concluir|tente novamente em alguns segundos/i.test(raw);
  const rawLooksPortuguese = /[ãáàâéêíóôõúç]|aplicação|confirm[aã]ção|indisponível|não|nao/i.test(raw);
  if (raw && !rawLooksGeneric && !(language === "en" && rawLooksPortuguese)) return raw;
  return localCopy(
    language,
    "Aplicação preparada, mas a confirmação de investimento está indisponível agora. Tente novamente em alguns segundos.",
    "Application prepared, but investment confirmation is unavailable right now. Try again in a few seconds.",
  );
}

export default function RendimentosClient({
  initialLanguage, initialQuery, view: initialView = "returns",
}: {
  initialLanguage?: AppLanguage; initialQuery?: string; view?: "application" | "returns";
} = {}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);

  // Unified investment suite — everything on one page. `initialView` only decides
  // which section we auto-scroll to on load.
  useEffect(() => {
    if (initialView !== "application") return;
    // Deep links (?view=application&action=…&asset=…) only PRESELECT the asset/
    // action and scroll to the products overview. The invest form NEVER opens
    // from the URL — it opens only when the user taps Invest on a product card.
    const params = new URLSearchParams(initialQuery || "");
    const qAction = params.get("action");
    const qAsset = params.get("asset");
    if (qAction === "withdraw" || qAction === "deposit") setAction(qAction);
    if (qAsset) { const a = qAsset.trim().toUpperCase(); requestedAssetRef.current = a; setSelectedCode(a); }
    const el = typeof document !== "undefined" ? document.getElementById("portfolio") : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialView, initialQuery]);
  const [session, setSession] = useState<SessionState>({ authenticated: false, loading: true, checked: false });
  // Inline gate for the mainnet bridge wallet part (testnet/returns stay open).
  const { unlocked: bridgeUnlocked, unlock: unlockBridge, relock: relockBridge } = useBridgeAccess();
  // Nubank-grade default: keep the screen calm. Power features (per-asset
  // lending, liquidity) live behind one disclosure.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [returnsPin, setReturnsPin] = useState("");
  const [returnsPinVerified, setReturnsPinVerified] = useState(false);
  const [returnsPinState, setReturnsPinState] = useState<ApiState>({ loading: false, message: "", error: "" });
  const [yieldStatus, setYieldStatus] = useState<YieldStatus | null>(null);
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [selectedCode, setSelectedCode] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  // Invest section navigation: "list" = browse investments + their yields,
  // "form" = the chosen investment's invest/withdraw detail (ApplyTab).
  const [investView, setInvestView] = useState<"list" | "form">("list");
  const [activeStep, setActiveStep] = useState<YieldStep>("plan");
  const [variationBps, setVariationBps] = useState("100");
  const [pin, setPin] = useState("");
  const [positionBalances, setPositionBalances] = useState<Record<string, PositionState>>({});
  const [positionHistories, setPositionHistories] = useState<Record<string, PositionHistoryState>>({});
  const [yieldResult, setYieldResult] = useState<any | null>(null);
  const [successNotice, setSuccessNotice] = useState<YieldSuccessNotice | null>(null);
  const [apiState, setApiState] = useState<ApiState>({ loading: true, message: "", error: "" });
  const loadedDataRef = useRef(false);
  const requestedAssetRef = useRef("");

  // Network toggle: "auto" = use backend configured network, "mainnet" | "testnet" = override
  type NetworkView = "testnet" | "mainnet";
  // Default to mainnet on first open; the browser-cached choice (if any) is
  // applied in an effect below to avoid a hydration mismatch.
  const [networkView, setNetworkView] = useState<NetworkView>("mainnet");
  const [bridgeWalletBalances, setBridgeWalletBalances] = useState<{
    public_key: string | null;
    testnet: { usdc: string; xlm: string } | null;
    mainnet: { usdc: string; xlm: string } | null;
  } | null>(null);

  // Email-based Stellar wallet lookup (mainnet) — pick one when several exist.
  type EmailWallet = { public_key: string; label: string | null; usdc_balance: string | null; is_primary?: boolean; is_funded?: boolean; exists_on_mainnet?: boolean };
  const [walletEmail, setWalletEmail] = useState("");
  const [emailWallets, setEmailWallets] = useState<EmailWallet[]>([]);
  const [selectedWalletKey, setSelectedWalletKey] = useState("");
  const [emailWalletsLoading, setEmailWalletsLoading] = useState(false);
  const yieldBusyRef = useRef(false); // guards the custodial confirmYield deposit
  const [positions, setPositions] = useState<{ defindex_usdc: number; blend_usdc: number; total_invested_usdc: number } | null>(null);
  // Daily snapshot series of the mainnet wallet's invested USDC, for the balance chart.
  const [mainnetHistory, setMainnetHistory] = useState<PositionHistoryState | null>(null);
  // The user's login/session wallet (used for testnet yield — distinct from the
  // Bridge email wallet used on mainnet).
  const [sessionWallet, setSessionWallet] = useState<{ public_key: string; testnet_usdc: number; testnet_xlm: number } | null>(null);
  const loadPositionsToken = useRef(""); // stale-response guard for positions/history

  async function loadSessionWallet() {
    try {
      const params = new URLSearchParams();
      if (session.sessionId) params.set("session_id", session.sessionId);
      if (walletEmail.trim()) params.set("email", walletEmail.trim().toLowerCase());
      if (![...params].length) return;
      const res = await fetch(`/api/bridge/session/stellar-balances?${params.toString()}`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (j?.success && j.public_key) {
        setSessionWallet({
          public_key: String(j.public_key),
          testnet_usdc: Number(j.testnet?.usdc) || 0,
          testnet_xlm: Number(j.testnet?.xlm) || 0,
        });
      }
    } catch { /* non-critical */ }
  }

  // Associate a Bridge (dollar-account) email with the user's login wallet, so
  // every later call resolves the dollar account from the session.
  const [linkState, setLinkState] = useState<{ loading: boolean; linked: boolean; error: string }>({ loading: false, linked: false, error: "" });
  async function linkBridgeEmail(email: string) {
    const e = email.trim().toLowerCase();
    if (!session.sessionId) { setLinkState({ loading: false, linked: false, error: L("Faça login para vincular.", "Sign in to link.") }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { setLinkState({ loading: false, linked: false, error: L("E-mail inválido.", "Invalid email.") }); return; }
    setLinkState({ loading: true, linked: false, error: "" });
    try {
      const res = await fetch("/api/bridge/session/link-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.sessionId, email: e }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) throw new Error(j.message || `HTTP ${res.status}`);
      setLinkState({ loading: false, linked: true, error: "" });
      setWalletEmail(e);
      loadEmailWallets(e);
      loadSessionWallet();
    } catch (err: any) {
      setLinkState({ loading: false, linked: false, error: err?.message ?? String(err) });
    }
  }

  async function loadPositions(email: string, publicKey: string) {
    if (!email || !publicKey) return;
    const e = email.trim().toLowerCase();
    // Drop stale responses when the selected wallet changes mid-flight.
    const token = `${e}:${publicKey}`;
    loadPositionsToken.current = token;
    try {
      const res = await fetch(`/api/bridge/stellar-wallets/positions?email=${encodeURIComponent(e)}&public_key=${encodeURIComponent(publicKey)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (loadPositionsToken.current === token && json?.success) setPositions({ defindex_usdc: Number(json.defindex_usdc) || 0, blend_usdc: Number(json.blend_usdc) || 0, total_invested_usdc: Number(json.total_invested_usdc) || 0 });
    } catch {
      // non-critical
    }
    // Load the persisted daily history (best-effort; reading positions above
    // also writes today's snapshot, so the series grows one point per day).
    try {
      const hr = await fetch(`/api/bridge/stellar-wallets/position-history?email=${encodeURIComponent(e)}&public_key=${encodeURIComponent(publicKey)}`, { cache: "no-store" });
      const hj = await hr.json().catch(() => ({}));
      if (loadPositionsToken.current === token && hj?.success) {
        setMainnetHistory({ loading: false, points: Array.isArray(hj.points) ? hj.points : [], error: "", source: String(hj.source || "") });
      }
    } catch {
      // non-critical
    }
  }

  async function loadEmailWallets(email: string) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setEmailWalletsLoading(true);
    try {
      const res = await fetch(`/api/bridge/stellar-wallets?email=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      // A 401 means the access password is missing/expired — re-prompt instead of
      // mislabeling it "no wallets found" (the 401 body has no wallets array).
      if (res.status === 401 || json?.code === "bridge_auth_required") {
        relockBridge();
        setEmailWallets([]);
        return;
      }
      const wallets: EmailWallet[] = Array.isArray(json?.wallets) ? json.wallets : [];
      setEmailWallets(wallets);
      setSelectedWalletKey((cur) => {
        if (cur && wallets.some((w) => w.public_key === cur)) return cur;
        const primary = wallets.find((w) => w.is_primary) || wallets.find((w) => Number(w.usdc_balance) > 0) || wallets[0];
        return primary?.public_key || "";
      });
    } catch {
      setEmailWallets([]);
    } finally {
      setEmailWalletsLoading(false);
    }
  }

  // ── Browser-cached preferences (network + email + chosen wallet) ──────────
  const NETWORK_KEY = "tts:rendimentos:network";
  const EMAIL_KEY = "tts:rendimentos:wallet-email";
  const WALLET_KEY = "tts:rendimentos:wallet-key";
  const hydratedPrefs = useRef(false);

  // Hydrate from localStorage once on mount, then auto-load the cached email's wallets.
  useEffect(() => {
    if (hydratedPrefs.current) return;
    hydratedPrefs.current = true;
    try {
      const net = window.localStorage.getItem(NETWORK_KEY);
      if (net === "testnet" || net === "mainnet") setNetworkView(net);
      const savedKey = window.localStorage.getItem(WALLET_KEY);
      if (savedKey) setSelectedWalletKey(savedKey);
      const savedEmail = window.localStorage.getItem(EMAIL_KEY);
      if (savedEmail) {
        setWalletEmail(savedEmail);
        loadEmailWallets(savedEmail);
      }
    } catch {
      // localStorage may be unavailable; defaults stand.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist preferences when they change.
  useEffect(() => { try { window.localStorage.setItem(NETWORK_KEY, networkView); } catch {} }, [networkView]);
  useEffect(() => { try { if (walletEmail.trim()) window.localStorage.setItem(EMAIL_KEY, walletEmail.trim().toLowerCase()); } catch {} }, [walletEmail]);
  useEffect(() => { try { if (selectedWalletKey) window.localStorage.setItem(WALLET_KEY, selectedWalletKey); } catch {} }, [selectedWalletKey]);

  const options = useMemo(() => Array.isArray(yieldStatus?.vaults) ? yieldStatus.vaults : [], [yieldStatus]);
  const sortedOptions = useMemo(() => [...options], [options]);
  const bestOption = sortedOptions[0] || null;
  const selectedOption = useMemo(() => options.find((item) => optionCode(item) === selectedCode) || null, [options, selectedCode]);
  const actionableOption = selectedOption;
  const configured = Boolean(yieldStatus?.runtime?.configured);
  const confirmationEnabled = Boolean(yieldStatus?.runtime?.execution_enabled);
  const yieldNetwork = String(yieldStatus?.runtime?.network || "").toLowerCase();
  const isTestnetYield = yieldNetwork === "testnet" || Boolean(yieldStatus?.runtime?.disclosure?.testnet);
  // Prefer the wallet chosen from the email lookup; fall back to the session wallet.
  const selectedEmailWallet = emailWallets.find((w) => w.public_key === selectedWalletKey) || null;
  const mainnetUsdcBalance = selectedEmailWallet
    ? (selectedEmailWallet.usdc_balance ?? "0")
    : (bridgeWalletBalances?.mainnet?.usdc ?? null);

  const safeSelectedCode = normalizeUiAssetCode(selectedCode) || optionCode(actionableOption) || selectedCode;
  const sessionLinkContext = useMemo(() => scopedLinkContext(initialQuery), [initialQuery]);
  const selectedProfile = moneyProfile(safeSelectedCode);
  const bestOptionCode = optionCode(bestOption);
  const actionableOptionCode = optionCode(actionableOption);
  const selectedHasYield = Boolean(selectedOption);
  const selectedExecutionBlocked = optionExecutionBlocked(actionableOption);
  const sessionLoading = Boolean(session.loading && !session.checked);
  const requiresChannelPin = Boolean(session.authenticated);
  const channelPinUnlocked = !requiresChannelPin || returnsPinVerified;
  const canPrepare = Boolean(!sessionLoading && session.authenticated && channelPinUnlocked && configured && actionableOption && !selectedExecutionBlocked && Number(String(amount).replace(",", ".")) > 0);
  // On mainnet, the spendable balance is the mainnet wallet's USDC (from the
  // wallet lookup), not the testnet session-wallet balances.
  const balanceForSelected: BalanceLine | undefined =
    networkView === "mainnet" && safeSelectedCode === "USDC"
      ? (mainnetUsdcBalance !== null ? { asset_code: "USDC", balance: String(mainnetUsdcBalance) } : undefined)
      : balances.find((item) => normalizeUiAssetCode(item.asset_code) === safeSelectedCode);
  const requestedAmount = normalizeDecimal(amount);
  const selectedBalanceAmount = normalizeDecimal(balanceForSelected?.balance || "0");
  const selectedBalanceInsufficient = Boolean(session.authenticated && requestedAmount > 0 && (!balanceForSelected || selectedBalanceAmount + 0.0000001 < requestedAmount));
  const alternativeConversionBalance = useMemo(() => {
    return [...balances].filter((item: BalanceLine) => { const c = normalizeUiAssetCode(item.asset_code); return Boolean(c && c !== safeSelectedCode && normalizeDecimal(item.balance) > 0.0000001); }).sort((a, b) => normalizeDecimal(b.balance) - normalizeDecimal(a.balance))[0] || null;
  }, [balances, safeSelectedCode]);
  const alternativeConversionCode = normalizeUiAssetCode(alternativeConversionBalance?.asset_code);
  const smartConvertSourceCode = selectedBalanceInsufficient ? alternativeConversionCode || (safeSelectedCode === "TESOURO" ? "USDC" : "TESOURO") : safeSelectedCode;
  const smartConvertDestCode = selectedBalanceInsufficient ? actionableOptionCode || safeSelectedCode || bestOptionCode || "USDC" : bestOptionCode || actionableOptionCode || "USDC";
  const returnsUrl = useMemo(() => buildMoneyUrl("/rendimentos", { view: "returns", amount, asset: safeSelectedCode, ...sessionLinkContext, lang: language }), [amount, safeSelectedCode, sessionLinkContext, language]);
  const newApplicationUrl = useMemo(() => buildMoneyUrl("/rendimentos", { view: "application", action: "deposit", amount, asset: safeSelectedCode, ...sessionLinkContext, lang: language }), [amount, safeSelectedCode, sessionLinkContext, language]);
  const convertAssetsUrl = useMemo(() => buildMoneyUrl("/convert", {
    amount,
    dest_amount: amount,
    amount_mode: "receive",
    source_asset: smartConvertSourceCode,
    dest_asset: smartConvertDestCode,
    from: "rendimentos",
    return_source: "rendimentos",
    return_to: newApplicationUrl,
    next: newApplicationUrl,
    ...sessionLinkContext,
    lang: language,
  }), [amount, smartConvertDestCode, smartConvertSourceCode, sessionLinkContext, language, newApplicationUrl]);
  const pixTopUpTargetAsset = safeSelectedCode === "TESOURO" ? "BRL" : safeSelectedCode || "BRL";
  const pixTopUpUsesExactReceive = pixTopUpTargetAsset === "BRL" || pixTopUpTargetAsset === "USDC";
  const pixTopUpUrl = useMemo(() => buildMoneyUrl("/pix-on", {
    mode: "onramp",
    amount: pixTopUpUsesExactReceive ? "" : amount,
    receive_amount: pixTopUpUsesExactReceive ? amount : "",
    receive_asset: pixTopUpUsesExactReceive ? pixTopUpTargetAsset : "",
    asset: "BRL",
    target_asset: pixTopUpTargetAsset === "BRL" ? "" : pixTopUpTargetAsset,
    currency: "BRL",
    from: "rendimentos",
    return_source: "rendimentos",
    return_to: newApplicationUrl,
    return_label: L("Voltar aos investimentos", "Back to investments"),
    stay_open: "1",
    ...sessionLinkContext,
    lang: language,
  }), [amount, language, newApplicationUrl, pixTopUpTargetAsset, pixTopUpUsesExactReceive, sessionLinkContext, L]);
  const amountPresets = useMemo(() => {
    const s = selectedProfile.short;
    if (s === "BRL") return ["50", "100", "500", "1000"];
    if (["JPY", "ARS"].includes(s)) return ["1000", "5000", "10000", "25000"];
    return ["10", "50", "100", "250"];
  }, [selectedProfile.short]);

  async function refreshAccountBalances() {
    const accountPayload = await yieldApi("etherfuse/wallet-balances", undefined, 20000, session.sessionSource);
    setBalances(Array.isArray(accountPayload?.balances) ? accountPayload.balances : []);
  }

  async function fetchBridgeWalletBalances(sid?: string) {
    try {
      const params = new URLSearchParams();
      const id = sid || session.sessionId;
      if (id) params.set("session_id", id);
      const res = await fetch(`/api/bridge/session/stellar-balances?${params}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.success) setBridgeWalletBalances(json);
    } catch {
      // non-critical
    }
  }

  useEffect(() => {
    if (loadedDataRef.current) return;
    loadedDataRef.current = true;
    (async () => {
      setApiState({ loading: true, message: "", error: "" });
      setSession((c) => ({ ...c, loading: true }));
      try {
        const statusPromise = yieldApi(`defindex/yield/status?network=${networkView}`, undefined, 12000).catch(() => ({ success: false, runtime: { configured: false, api_key_configured: false, execution_enabled: false }, vaults: [] }));
        const sessionPayload = await getClientSession();
        const nextSession = { ...sessionPayload, loading: false, checked: true };
        setSession(nextSession);
        const statusPayload = await statusPromise;
        setYieldStatus(statusPayload);
        const vaults = Array.isArray(statusPayload?.vaults) ? statusPayload.vaults : [];
        const bestAvailable = vaults[0] || null;
        if (!requestedAssetRef.current && bestAvailable) setSelectedCode((c) => vaults.some((item: YieldOption) => optionCode(item) === c) ? c : optionCode(bestAvailable));
        if (!nextSession.authenticated) { setBalances([]); setApiState({ loading: false, message: L("Entre para ver seus saldos.", "Sign in to see balances."), error: "" }); return; }
        setBalances([]);
        setApiState({ loading: false, message: L("Confirme seu PIN para ver seus rendimentos.", "Confirm your PIN to see your returns."), error: "" });
      } catch (error) {
        if (isSessionUiError(error)) setSession({ authenticated: false, loading: false, checked: true });
        else setSession((c) => ({ ...c, loading: false, checked: true }));
        setApiState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) });
      }
    })();
  }, []);

  // Re-fetch yield status for the selected network when the toggle changes.
  useEffect(() => {
    if (!loadedDataRef.current) return;
    let cancelled = false;
    yieldApi(`defindex/yield/status?network=${networkView}`, undefined, 12000)
      .then((s) => { if (!cancelled) setYieldStatus(s); })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [networkView]);

  // Load the selected wallet's invested positions (DeFindex + Blend) on mainnet.
  useEffect(() => {
    if (networkView === "mainnet" && walletEmail && selectedWalletKey) loadPositions(walletEmail, selectedWalletKey);
    else { setPositions(null); setMainnetHistory(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkView, selectedWalletKey, walletEmail]);

  useEffect(() => {
    setReturnsPin("");
    setReturnsPinVerified(false);
    setReturnsPinState({ loading: false, message: "", error: "" });
  }, [session.sessionId, session.sessionSource]);

  // Resolve the login/session wallet (for testnet yield).
  useEffect(() => { if (session.authenticated) loadSessionWallet(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [session.authenticated, session.sessionId, walletEmail]);

  useEffect(() => { setYieldResult(null); setPin(""); }, [action, amount, actionableOption?.vault_address, safeSelectedCode]);
  useEffect(() => {
    if (!session.authenticated || !options.length || !channelPinUnlocked) return;
    let cancelled = false;
    const initial = Object.fromEntries(options.map((o) => [optionCode(o), { loading: true, amount: "0", error: "" }]));
    const initialHistories = Object.fromEntries(options.map((o) => [optionCode(o), { loading: true, points: [], error: "" }]));
    setPositionBalances(initial);
    setPositionHistories(initialHistories);
    Promise.all(options.map(async (o) => {
      const code = optionCode(o);
      try {
        const payload = await yieldApi(`defindex/yield/balance?asset_code=${encodeURIComponent(o.asset_code)}&vault_address=${encodeURIComponent(o.vault_address)}&network=${networkView}`, undefined, 22000, session.sessionSource);
        return [code, { loading: false, amount: extractDefindexPositionAmount(payload?.position || payload?.balance), error: "", raw: payload?.balance, source: String(payload?.balance_source || payload?.balance?.source || "") }] as const;
      } catch (error) {
        return [code, { loading: false, amount: "0", error: String(error instanceof Error ? error.message : error) }] as const;
      }
    })).then((entries) => { if (!cancelled) setPositionBalances(Object.fromEntries(entries)); });
    Promise.all(options.map(async (o) => {
      const code = optionCode(o);
      try {
        const payload = await yieldApi(`defindex/yield/history?asset_code=${encodeURIComponent(o.asset_code)}&vault_address=${encodeURIComponent(o.vault_address)}`, undefined, 22000, session.sessionSource);
        return [code, {
          loading: false,
          points: Array.isArray(payload?.points) ? payload.points : [],
          error: "",
          source: String(payload?.source || ""),
        }] as const;
      } catch (error) {
        return [code, { loading: false, points: [], error: String(error instanceof Error ? error.message : error) }] as const;
      }
    })).then((entries) => { if (!cancelled) setPositionHistories(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [session.authenticated, session.sessionSource, options, language, channelPinUnlocked]);

  async function unlockChannelReturns() {
    const nextPin = returnsPin.replace(/\D/g, "").slice(0, 8);
    if (nextPin.length < 4) return;
    setReturnsPinState({ loading: true, message: "", error: "" });
    try {
      await yieldApi("session/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin: nextPin, wallet_pin: nextPin }),
      }, 18000, session.sessionSource);
      setReturnsPin("");
      setReturnsPinVerified(true);
      setReturnsPinState({ loading: false, message: "", error: "" });
      setApiState({ loading: true, message: "", error: "" });
      // Fetch bridge wallet balances for both networks (non-blocking)
      fetchBridgeWalletBalances().catch(() => null);
      try {
        await refreshAccountBalances();
      } catch {
        // Non-blocking: PIN is valid and the page works regardless. The
        // mainnet wallet lookup and positions load independently, so don't
        // surface this as a "needs attention" error.
      }
      setApiState({ loading: false, message: "", error: "" });
    } catch (error) {
      setReturnsPinState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) });
    }
  }

  async function prepareYield() {
    if (!actionableOption) return;
    setApiState({ loading: true, message: "", error: "" });
    setYieldResult(null);
    try {
      const payload = await yieldApi("defindex/yield/prepare", { method: "POST", body: JSON.stringify({ action, amount, source_asset_code: safeSelectedCode, asset_code: actionableOption.asset_code, vault_address: actionableOption.vault_address, slippage_bps: variationBps, network: networkView }) }, 18000, session.sessionSource);
      setYieldResult(payload);
      setActiveStep("review");
      setApiState({ loading: false, message: payload?.execution_ready === false ? (String(payload?.execution_blocked_code || "") ? String(payload?.execution_blocked_reason || "") : "") : "", error: "" });
    } catch (error) {
      const recoverableCode = recoverableYieldCode(error);
      if (recoverableCode) {
        const reason = yieldFallbackMessage(error, language);
        setYieldResult({
          success: true,
          prepared: true,
          review_only: true,
          execution_ready: false,
          execution_blocked_code: recoverableCode,
          execution_blocked_reason: reason,
          action,
          amount,
          amount_units: 0,
          vault: {
            ...actionableOption,
            display_asset_code: optionCode(actionableOption),
          },
        });
        setActiveStep("review");
        setApiState({ loading: false, message: reason, error: "" });
        return;
      }
      setApiState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) });
    }
  }

  async function confirmYield() {
    if (!actionableOption || !yieldResult) return;
    if (yieldBusyRef.current) return; // re-entrancy guard — custodial deposit
    yieldBusyRef.current = true;
    setApiState({ loading: true, message: "", error: "" });
    try {
      const payload = await yieldApi("defindex/yield/execute", { method: "POST", body: JSON.stringify({ action, amount, source_asset_code: safeSelectedCode, asset_code: actionableOption.asset_code, vault_address: actionableOption.vault_address, slippage_bps: variationBps, pin, wallet_pin: pin, network: networkView }) }, 60000, session.sessionSource);
      setYieldResult(payload);
      setPin("");
      setSuccessNotice({ action, reviewedAmount: amount, reviewedAsset: selectedProfile.short, vaultAmount: String(payload?.amount || "").trim(), vaultAsset: String(payload?.vault?.display_asset_code || payload?.vault?.asset_code || "").trim(), hash: String(payload?.hash || "").trim() });
      setApiState({ loading: false, message: L("Operação confirmada.", "Operation confirmed."), error: "" });
    } catch (error) {
      const recoverableCode = recoverableYieldCode(error);
      if (recoverableCode) {
        const reason = yieldFallbackMessage(error, language);
        setYieldResult({
          ...yieldResult,
          review_only: true,
          execution_ready: false,
          execution_blocked_code: recoverableCode,
          execution_blocked_reason: reason,
        });
        setApiState({ loading: false, message: reason, error: "" });
        return;
      }
      setApiState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) });
    } finally {
      yieldBusyRef.current = false;
    }
  }

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      {successNotice && <SuccessDialog language={language} notice={successNotice} returnsHref={returnsUrl} onClose={() => setSuccessNotice(null)} onRefresh={() => { setSuccessNotice(null); if (networkView === "mainnet" && walletEmail && selectedWalletKey) loadPositions(walletEmail, selectedWalletKey); }} />}

      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-8">
        {/* Calm, single-page header with a light quick-jump (no tabs) */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-tts-deep">{L("Seu dinheiro", "Your money")}</h1>
          <p className="text-sm text-tts-muted">{L("Veja o total rendendo e abra cada produto para detalhes.", "See total earnings and open each product for details.")}</p>
        </div>

        {apiState.error && (
          <div className="flex items-start gap-3 border border-tts-error bg-tts-error/10 p-4 mb-6 text-sm" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-tts-error" />
            <div>
              <p className="font-bold text-tts-error mb-1">{L("Precisa de atenção", "Needs attention")}</p>
              <p className="text-tts-muted whitespace-pre-line">{apiState.error}</p>
            </div>
          </div>
        )}

        {/* Network toggle */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {networkView === "testnet" && isTestnetYield && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {L("Valores estimados", "Estimated values")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-tts-border bg-tts-bg p-0.5">
            <button
              type="button"
              onClick={() => setNetworkView("testnet")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${networkView === "testnet" ? "bg-tts-deep text-white" : "text-tts-muted hover:text-tts-deep"}`}
            >
              {L("Demonstração", "Demo")}
            </button>
            <button
              type="button"
              onClick={() => setNetworkView("mainnet")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${networkView === "mainnet" ? "bg-tts-deep text-white" : "text-tts-muted hover:text-tts-deep"}`}
            >
              {L("Dinheiro real", "Real money")}
            </button>
          </div>
        </div>

        {/* Link your dollar account — associate a Bridge email with this wallet.
            Shown until linked so the clean default stays uncluttered. */}
        {!linkState.linked && !walletEmail && session.authenticated && (
          <BridgeLinkCard
            language={language}
            defaultEmail={walletEmail}
            state={linkState}
            onLink={linkBridgeEmail}
          />
        )}

        {/* Bridge wallet — access gate (mainnet only). The real-money wallet is
            password-protected; testnet and the returns view stay open. */}
        {networkView === "mainnet" && returnsPinVerified && !bridgeUnlocked && (
          <BridgeAccessField
            className="mb-5"
            onUnlock={() => { unlockBridge(); if (walletEmail.trim()) loadEmailWallets(walletEmail); }}
            title={L("Carteira em dólar — restrita", "USD wallet — restricted")}
            description={L("Senha de acesso necessária para gerenciar esta carteira.", "Access password required to manage this wallet.")}
          />
        )}

        {requiresChannelPin && !returnsPinVerified ? (
          <ChannelPinGate
            language={language}
            pin={returnsPin}
            onPinChange={(value) => setReturnsPin(value.replace(/\D/g, "").slice(0, 8))}
            onSubmit={unlockChannelReturns}
            state={returnsPinState}
          />
        ) : (
          <div className="space-y-12">
            <section id="portfolio" className="scroll-mt-4">
              <SuiteSectionHeader
                eyebrow={L("Sua carteira", "Your portfolio")}
                title={L("Rendimentos", "Returns")}
              />
              <CurrentInvestmentsPage
                language={language} session={session} sessionLoading={sessionLoading} options={options}
                positionBalances={positionBalances} positionHistories={positionHistories} isTestnet={networkView === "testnet" && isTestnetYield}
                mainnetInvested={networkView === "mainnet" ? positions?.total_invested_usdc ?? null : null}
                mainnetHistory={networkView === "mainnet" ? mainnetHistory : null}
                sessionLinkContext={sessionLinkContext}
                onInvest={(code) => { setSelectedCode(code); setAction("deposit"); setActiveStep("plan"); setPin(""); setInvestView("form"); document.getElementById("invest")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                onWithdraw={(code) => { setSelectedCode(code); setAction("withdraw"); setActiveStep("plan"); setPin(""); setInvestView("form"); document.getElementById("invest")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              />
            </section>

            {investView === "form" && (
              <section id="invest" className="scroll-mt-4">
                <SuiteSectionHeader
                  eyebrow={action === "withdraw" ? L("Resgate seu dinheiro", "Cash out") : L("Produto selecionado", "Selected product")}
                  title={action === "withdraw" ? L("Retirar", "Withdraw") : L("Investir", "Invest")}
                />
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setInvestView("list")}
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-tts-muted transition hover:text-tts-deep"
                  >
                    <ChevronLeft className="h-4 w-4" /> {L("Voltar para visão geral", "Back to overview")}
                  </button>
                  <ApplyTab
                    language={language} session={session} sessionLoading={sessionLoading} apiState={apiState}
                    amount={amount} onAmountChange={setAmount} amountPresets={amountPresets}
                    action={action}
                    selectedCode={safeSelectedCode} selectedOption={actionableOption} selectedProfile={selectedProfile}
                    options={options} onSelectCode={setSelectedCode}
                    selectedHasYield={selectedHasYield} selectedExecutionBlocked={selectedExecutionBlocked}
                    selectedBalanceInsufficient={selectedBalanceInsufficient}
                    balanceForSelected={balanceForSelected}
                    alternativeConversionCode={alternativeConversionCode}
                    activeStep={activeStep} setActiveStep={setActiveStep}
                    yieldResult={yieldResult} canPrepare={canPrepare}
                    confirmationEnabled={confirmationEnabled} configured={configured}
                    pin={pin} onPinChange={setPin} variationBps={variationBps} onVariationBpsChange={setVariationBps}
                    onPrepare={prepareYield} onConfirm={confirmYield}
                    convertAssetsUrl={convertAssetsUrl} pixTopUpUrl={pixTopUpUrl}
                  />
                </div>
              </section>
            )}

            {/* Advanced — hidden by default to keep the home calm and Nubank-clean */}
            <section id="advanced" className="scroll-mt-4">
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-2xl border border-tts-border bg-tts-surface px-5 py-4 text-left transition-colors hover:border-tts-deep/40"
                aria-expanded={advancedOpen}
              >
                <div>
                  <p className="text-sm font-bold text-tts-deep">{L("Opções avançadas", "Advanced options")}</p>
                  <p className="text-xs text-tts-muted">{L("Empréstimo por ativo e liquidez", "Per-asset lending and liquidity")}</p>
                </div>
                <ChevronDown className={`h-5 w-5 text-tts-muted transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
              </button>

              {advancedOpen && (
                <div className="mt-6 space-y-12">
                  <BlendInlinePanel
                    language={language}
                    email={walletEmail}
                    wallets={emailWallets}
                    defaultWallet={selectedWalletKey}
                    walletsLoading={emailWalletsLoading}
                    onLoadWallets={loadEmailWallets}
                    onEmailChange={setWalletEmail}
                    onSelectWallet={setSelectedWalletKey}
                    sessionWalletKey={sessionWallet?.public_key || ""}
                  />
                  <div>
                    <SuiteSectionHeader
                      eyebrow={L("Ganhe com taxas", "Earn on fees")}
                      title={L("Liquidez", "Liquidity")}
                    />
                    <SwapInlinePanel language={language} email={walletEmail} walletKey={selectedWalletKey} />
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function ChannelPinGate({ language, pin, onPinChange, onSubmit, state }: {
  language: AppLanguage; pin: string; onPinChange: (value: string) => void; onSubmit: () => void; state: ApiState;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const canSubmit = pin.length >= 4 && !state.loading;
  return (
    <div className="mx-auto max-w-md border border-tts-border bg-tts-surface p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-tts-confirm/15 text-tts-confirm">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{L("Confirme seu PIN", "Confirm your PIN")}</h2>
          <p className="text-sm text-tts-muted">{L("Digite seu PIN para ver seus rendimentos.", "Enter your PIN to see your returns.")}</p>
        </div>
      </div>

      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-tts-muted">PIN</label>
      <input
        value={pin}
        onChange={(event) => onPinChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && canSubmit) onSubmit(); }}
        inputMode="numeric"
        type="password"
        autoComplete="current-password"
        className="w-full border border-tts-border bg-tts-bg px-4 py-3 text-base font-bold outline-none focus:border-tts-deep"
      />

      {state.error && <p className="mt-3 text-sm font-semibold text-tts-error">{state.error}</p>}

      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        className="mt-4 flex w-full items-center justify-center gap-2 bg-tts-deep px-4 py-3 text-sm font-bold text-tts-surface disabled:opacity-40"
      >
        {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        {L("Ver rendimentos", "View returns")}
      </button>
    </div>
  );
}

function CurrentInvestmentsPage({ language, session, sessionLoading, options, positionBalances, positionHistories, isTestnet, mainnetInvested, mainnetHistory, sessionLinkContext, onInvest, onWithdraw }: {
  language: AppLanguage; session: SessionState; sessionLoading: boolean;
  options: YieldOption[]; positionBalances: Record<string, PositionState>;
  positionHistories: Record<string, PositionHistoryState>;
  isTestnet: boolean; mainnetInvested: number | null; mainnetHistory: PositionHistoryState | null;
  sessionLinkContext: Record<string, string>;
  onInvest: (code: string) => void; onWithdraw: (code: string) => void;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const rows = options.filter((o) => String(o.vault_address || "").trim()).map((o) => {
    const code = optionCode(o);
    const pos = positionBalances[code];
    // On mainnet the real invested position lives in the Bridge email wallet
    // (positions endpoint), not the channel wallet — override the USDC row with it.
    const useMainnet = mainnetInvested !== null && code === "USDC";
    const amt = useMainnet ? mainnetInvested : normalizeDecimal(pos?.amount || "0");
    return {
      option: o,
      code,
      profile: moneyProfile(code),
      amount: amt,
      loading: useMainnet ? false : Boolean(!pos || pos.loading),
      error: useMainnet ? "" : String(pos?.error || ""),
      source: useMainnet ? "bridge_wallet_position" : String(pos?.source || ""),
      rate: optionRatePercent(o),
      // On mainnet use the persisted daily snapshots so the balance line reflects
      // the real value at each day instead of a flat line.
      history: useMainnet && mainnetHistory ? mainnetHistory : (positionHistories[code] || { loading: false, points: [], error: "" }),
    };
  });
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindow>("daily");
  const activeWindow = ANALYSIS_WINDOWS.find((item) => item.key === analysisWindow) || ANALYSIS_WINDOWS[0];
  const rowSignature = rows.map((row) => row.code).join("|");
  const selectedRow = selectedCode ? rows.find((row) => row.code === selectedCode) || null : null;

  useEffect(() => {
    if (selectedCode && !rows.some((row) => row.code === selectedCode)) {
      setSelectedCode(null);
    }
  }, [rowSignature, selectedCode]);

  return (
    <div className="space-y-6">
      {!session.authenticated && !sessionLoading ? (
        <div className="text-center py-12">
          <Coins className="mx-auto h-10 w-10 text-tts-muted mb-3" />
          <p className="text-lg font-bold mb-1">{L("Entre para ver seus rendimentos", "Sign in to see your returns")}</p>
          <p className="text-sm text-tts-muted mb-4">{L("Conecte sua conta para acompanhar as posições.", "Connect your account to track positions.")}</p>
          <a href="/login?next=/rendimentos" className="inline-flex items-center gap-2 bg-tts-deep text-tts-surface px-6 py-3 text-sm font-bold">{L("Entrar", "Sign in")}</a>
        </div>
      ) : (
        <>
          {selectedRow ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSelectedCode(null)}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-tts-muted transition hover:text-tts-deep"
              >
                <ChevronLeft className="h-4 w-4" /> {L("Voltar aos rendimentos", "Back to earnings")}
              </button>
              <SelectedYieldDetail
                language={language}
                row={selectedRow}
                isTestnet={isTestnet}
                activeWindow={activeWindow}
                sessionLinkContext={sessionLinkContext}
                onInvest={onInvest}
                onWithdraw={onWithdraw}
              />
            </div>
          ) : (
            <>
              <PortfolioOverview
                language={language}
                rows={rows}
                isTestnet={isTestnet}
                activeWindow={activeWindow}
                analysisWindow={analysisWindow}
                onAnalysisWindowChange={setAnalysisWindow}
              />

              {rows.length ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">
                      {L("Produtos de rendimento", "Yield products")}
                    </p>
                    <p className="text-[11px] font-bold text-tts-muted">{rows.length} {L("opções", "options")}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {rows.map((row) => (
                      <YieldProductCard
                        key={row.code}
                        language={language}
                        row={row}
                        selected={false}
                        onSelect={() => setSelectedCode(row.code)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}

          {!rows.length && !sessionLoading && (
            <div className="text-center py-12 border border-tts-border bg-tts-surface">
              <p className="text-sm text-tts-muted">{L("Nenhuma opção disponível.", "No options available.")}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function yieldProductTitle(row: InvestmentRow, language: AppLanguage) {
  const label = String(row.option.label || "").trim();
  if (label) return label;
  return `${profileName(row.profile, language)} ${localCopy(language, "rendimento", "earnings")}`;
}

function formatApy(rate: number) {
  return rate > 0 ? `${rate.toFixed(2)}%` : "—";
}

function PortfolioOverview({ language, rows, isTestnet, activeWindow, analysisWindow, onAnalysisWindowChange }: {
  language: AppLanguage;
  rows: InvestmentRow[];
  isTestnet: boolean;
  activeWindow: (typeof ANALYSIS_WINDOWS)[number];
  analysisWindow: AnalysisWindow;
  onAnalysisWindowChange: (value: AnalysisWindow) => void;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const totalInvested = rows.reduce((sum, row) => sum + row.amount, 0);
  const activeCount = rows.filter((row) => row.amount > 0.0000001).length;
  const weightedRate = totalInvested > 0
    ? rows.reduce((sum, row) => sum + row.rate * row.amount, 0) / totalInvested
    : rows.reduce((max, row) => Math.max(max, row.rate), 0);
  const periodAnalyses = rows.map((row) => analyzePortfolioPeriod({
    currentAmount: row.amount,
    historyPoints: row.history?.points || [],
    days: activeWindow.days,
  }));
  const periodChange = periodAnalyses.reduce((sum, item) => sum + item.change, 0);
  const periodBase = Math.max(0, totalInvested - periodChange);
  const periodChangePercent = periodBase > 0 ? (periodChange / periodBase) * 100 : 0;
  const positive = periodChange > 0.0000001;
  const negative = periodChange < -0.0000001;
  const tone = positive ? "text-tts-confirm" : negative ? "text-tts-error" : "text-tts-muted";
  const graphProfile = rows[0]?.profile || moneyProfile("USDC");
  const portfolioGraphPoints = buildPortfolioLinePoints(rows, language, activeWindow.days);
  return (
    <section className="tts-op-shell p-5">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-tts-gold">{L("Rendimentos totais", "Total earnings")}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-3xl font-bold tabular-nums text-tts-deep">
              {formatPrecise(totalInvested, language)}
            </p>
            <span className="text-sm font-bold text-tts-muted">{rows[0]?.profile.short || "USD"}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-tts-muted">
            {activeCount
              ? L(`${activeCount} produto${activeCount === 1 ? "" : "s"} rendendo agora`, `${activeCount} product${activeCount === 1 ? "" : "s"} earning now`)
              : L("Nenhum produto com saldo aplicado ainda.", "No product has an invested balance yet.")}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-96">
          <StatCard label="APY" value={formatApy(weightedRate)} sub={totalInvested > 0 ? L("média", "average") : L("melhor taxa", "best rate")} />
          <StatCard label={L("Produtos", "Products")} value={String(rows.length)} sub={L("disponíveis", "available")} />
          <StatCard label={L("Ambiente", "Environment")} value={isTestnet ? L("Teste", "Demo") : L("Ativo", "Live")} sub={isTestnet ? L("estimado", "estimated") : L("real", "real")} />
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)]">
        <div className="rounded-xl border border-tts-border bg-tts-bg p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-tts-confirm" />
                <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("Gráfico total", "Total graph")}</p>
              </div>
              <p className={`mt-3 text-2xl font-bold tabular-nums ${tone}`}>
                {formatSignedAmount(periodChange, graphProfile, language)}
              </p>
              <p className={`mt-1 text-sm font-bold ${tone}`}>
                {formatSignedPercent(periodChangePercent, language)}
              </p>
            </div>
            <p className="max-w-52 text-xs font-semibold text-tts-muted sm:text-right">
              {L("Resultado recente sem contar aplicações e resgates.", "Recent result excluding deposits and withdrawals.")}
            </p>
          </div>
          <div className="mt-3 rounded-lg border border-tts-border bg-tts-surface p-3">
            <InvestmentLineChart data={portfolioGraphPoints} profile={graphProfile} language={language} tone="muted" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 rounded-xl border border-tts-border bg-tts-bg p-1">
          {ANALYSIS_WINDOWS.map((item) => {
            const active = item.key === analysisWindow;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onAnalysisWindowChange(item.key)}
                className={[
                  "min-h-16 px-3 py-2 text-left transition",
                  active ? "bg-tts-deep text-tts-surface" : "text-tts-muted hover:bg-tts-surface",
                ].join(" ")}
                aria-pressed={active}
              >
                <span className="block text-xs font-black">{isPortuguese(language) ? item.labelPt : item.labelEn}</span>
                <span className={active ? "block text-[10px] font-semibold text-tts-surface/75" : "block text-[10px] font-semibold text-tts-muted"}>
                  {isPortuguese(language) ? item.detailPt : item.detailEn}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function YieldProductCard({ language, row, selected, onSelect }: {
  language: AppLanguage;
  row: InvestmentRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const analysis = analyzePortfolioPeriod({
    currentAmount: row.amount,
    historyPoints: row.history?.points || [],
    days: 1,
  });
  const returnTone = analysis.change > 0.0000001 ? "text-tts-confirm" : analysis.change < -0.0000001 ? "text-tts-error" : "text-tts-muted";
  const balanceText = row.loading ? L("Consultando", "Checking") : row.error ? L("Indisponível", "Unavailable") : formatPositionAmount(row.amount, row.profile, language);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "tts-op-tile tts-interactive-tile w-full border p-4 text-left",
        selected ? "border-tts-gold-br bg-tts-gold-bg" : "border-tts-border bg-tts-surface",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-tts-deep">{yieldProductTitle(row, language)}</p>
          <p className="mt-1 text-xs font-semibold text-tts-muted">{row.profile.short} · {profileName(row.profile, language)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-tts-border bg-tts-bg px-2.5 py-1 text-xs font-bold text-tts-gold">
          {formatApy(row.rate)} APY
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-tts-muted">{L("Aplicado", "Invested")}</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-tts-deep">{balanceText}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wide text-tts-muted">{L("Hoje", "Today")}</p>
          <p className={`mt-1 text-sm font-bold tabular-nums ${returnTone}`}>{formatSignedPercent(analysis.changePercent, language)}</p>
        </div>
      </div>
    </button>
  );
}

function SelectedYieldDetail({ language, row, isTestnet, activeWindow, sessionLinkContext, onInvest, onWithdraw }: {
  language: AppLanguage;
  row: InvestmentRow;
  isTestnet: boolean;
  activeWindow: (typeof ANALYSIS_WINDOWS)[number];
  sessionLinkContext: Record<string, string>;
  onInvest: (code: string) => void;
  onWithdraw: (code: string) => void;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const analysis = analyzePortfolioPeriod({
    currentAmount: row.amount,
    historyPoints: row.history?.points || [],
    days: activeWindow.days,
  });
  const positive = analysis.change > 0.0000001;
  const negative = analysis.change < -0.0000001;
  const tone = positive ? "text-tts-confirm" : negative ? "text-tts-error" : "text-tts-muted";
  const hasIgnoredCashflow = Math.abs(analysis.cashflowChange) > 0.0000001;
  const sourceText = row.source === "operation_history_fallback"
    ? L("Atualizado pelo histórico da conta", "Updated from account history")
    : L("Atualizado da conta.", "Updated from account.");
  const canWithdraw = row.amount > 0.0000001 && !row.loading && !row.error;

  return (
    <div className="tts-op-shell p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">
            {L("Performance atual", "Current performance")}
          </p>
          <h3 className="mt-1 truncate text-xl font-bold text-tts-deep">{yieldProductTitle(row, language)}</h3>
          <p className="mt-1 text-xs font-semibold text-tts-muted">
            {isTestnet ? L("Ambiente de teste", "Demo environment") : L("Rede ativa", "Live")} · {formatApy(row.rate)} APY
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-tts-border bg-tts-bg px-3 py-1 text-xs font-bold text-tts-gold">
          {row.profile.short}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label={L("Valor aplicado", "Invested amount")}
          value={row.loading ? L("Consultando", "Checking") : row.error ? L("Indisponível", "Unavailable") : formatPositionAmount(row.amount, row.profile, language)}
          sub={!row.loading && !row.error ? sourceText : row.error}
        />
        <StatCard
          label={isPortuguese(language) ? activeWindow.detailPt : activeWindow.detailEn}
          value={formatSignedAmount(analysis.change, row.profile, language)}
          sub={formatSignedPercent(analysis.changePercent, language)}
        />
        <StatCard
          label={L("Último movimento", "Last movement")}
          value={analysis.lastPoint ? formatChartDate(analysis.lastPoint.date, language) : L("Sem histórico", "No history")}
          sub={analysis.lastPoint?.action ? L(analysis.lastPoint.action === "deposit" ? "Aplicação" : "Resgate", analysis.lastPoint.action === "deposit" ? "Deposit" : "Withdraw") : L("Saldo atual", "Current balance")}
        />
      </div>

      <div className="mt-5 rounded-xl border border-tts-border bg-tts-bg p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">{L("Linha de saldo", "Balance line")}</p>
          <span className={`text-sm font-bold ${tone}`}>{formatSignedPercent(analysis.changePercent, language)}</span>
        </div>
        <InvestmentGraphs language={language} row={row} />
        {hasIgnoredCashflow ? (
          <p className="mt-3 text-xs font-semibold text-tts-muted">
            {L("Aplicações e resgates ignorados na performance:", "Deposits and withdrawals ignored in performance:")} {formatSignedAmount(analysis.cashflowChange, row.profile, language)}
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <a
          href={buildMoneyUrl("/rendimentos", { view: "application", action: "deposit", asset: row.code, amount: "100", ...sessionLinkContext, lang: language })}
          onClick={(event) => { event.preventDefault(); onInvest(row.code); }}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-tts-deep px-4 py-3 text-sm font-bold text-tts-surface"
        >
          <Plus className="h-4 w-4" /> {L("Investir mais", "Invest more")}
        </a>
        <button
          type="button"
          onClick={() => onWithdraw(row.code)}
          disabled={!canWithdraw}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-tts-border px-4 py-3 text-sm font-bold text-tts-deep disabled:opacity-40"
        >
          <ArrowUpFromLine className="h-4 w-4" /> {L("Retirar", "Withdraw")}
        </button>
      </div>
      {!canWithdraw ? (
        <p className="mt-2 text-xs font-semibold text-tts-muted">
          {row.loading ? L("A posição ainda está carregando.", "The position is still loading.") : L("Sem valor aplicado para retirar.", "No invested amount to withdraw.")}
        </p>
      ) : null}
    </div>
  );
}

function ApplyTab({ language, session, sessionLoading, apiState, amount, onAmountChange, amountPresets, action, selectedCode, selectedOption, selectedProfile, options, onSelectCode, selectedHasYield, selectedExecutionBlocked, selectedBalanceInsufficient, balanceForSelected, alternativeConversionCode, activeStep, setActiveStep, yieldResult, canPrepare, confirmationEnabled, configured, pin, onPinChange, variationBps, onVariationBpsChange, onPrepare, onConfirm, convertAssetsUrl, pixTopUpUrl }: {
  language: AppLanguage; session: SessionState; sessionLoading: boolean; apiState: ApiState;
  amount: string; onAmountChange: (v: string) => void; amountPresets: string[];
  action: "deposit" | "withdraw";
  selectedCode: string; selectedOption: YieldOption | null; selectedProfile: { namePt: string; nameEn: string; short: string };
  options: YieldOption[]; onSelectCode: (v: string) => void;
  selectedHasYield: boolean; selectedExecutionBlocked: boolean;
  selectedBalanceInsufficient: boolean; balanceForSelected?: BalanceLine;
  alternativeConversionCode: string;
  activeStep: YieldStep; setActiveStep: (v: YieldStep) => void;
  yieldResult: any; canPrepare: boolean; confirmationEnabled: boolean; configured: boolean;
  pin: string; onPinChange: (v: string) => void;
  variationBps: string; onVariationBpsChange: (v: string) => void;
  onPrepare: () => void; onConfirm: () => void;
  convertAssetsUrl: string; pixTopUpUrl: string;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const selectedAvailableDisplay = formatPositionAmount(balanceForSelected?.balance || "0", selectedProfile, language);
  const selectedRate = optionRatePercent(selectedOption);
  const selectedAssetLabel = profileName(selectedProfile, language);
  const [investmentHelpOpen, setInvestmentHelpOpen] = useState(false);
  const hasPrepared = Boolean(yieldResult);
  const submitted = Boolean(yieldResult?.submitted || yieldResult?.hash);
  const preparedBlocked = Boolean(hasPrepared && yieldResult?.execution_ready === false);
  const confirmAvailable = hasPrepared && !preparedBlocked && !selectedExecutionBlocked;
  const canConfirm = confirmAvailable && !submitted && pin.length >= 4 && !apiState.loading;
  const blockedCode = String(yieldResult?.execution_blocked_code || "").trim();
  const blockedReason = String(
    yieldResult?.execution_blocked_reason ||
    apiState.message ||
    ""
  ).trim();
  const blockedTitle = blockedCode === "yield_account_setup_required"
    ? L("Ative a moeda antes de confirmar.", "Activate the currency before confirming.")
    : blockedCode === "insufficient_balance"
      ? L("Saldo aplicável insuficiente.", "Insufficient usable balance.")
      : L("Confirmação de investimento indisponível agora.", "Investment confirmation is unavailable right now.");
  const profileShort = selectedProfile.short;

  if (!session.authenticated && !sessionLoading) return (
    <div className="text-center py-12">
      <WalletCards className="mx-auto h-10 w-10 text-tts-muted mb-3" />
      <p className="text-lg font-bold mb-1">{L("Entre para aplicar", "Sign in to apply")}</p>
      <p className="text-sm text-tts-muted mb-4">{L("Conecte sua conta para investir.", "Connect your account to invest.")}</p>
      <a href="/login?next=/rendimentos" className="inline-flex items-center gap-2 bg-tts-deep text-tts-surface px-6 py-3 text-sm font-bold">{L("Entrar", "Sign in")}</a>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map((o) => {
          const c = optionCode(o);
          const sel = c === selectedCode;
          return (
            <button key={c} onClick={() => { onSelectCode(c); setActiveStep("plan"); }}
              className={`shrink-0 px-4 py-2 border text-xs font-bold transition ${sel ? "border-tts-deep bg-tts-deep text-tts-surface" : "border-tts-border bg-tts-surface text-tts-deep hover:border-tts-deep"}`}>
              {c}
            </button>
          );
        })}
      </div>

      {selectedBalanceInsufficient && (
        <div className="rounded-2xl border border-tts-error/40 bg-tts-error/10 p-4 text-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tts-error" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-black text-tts-error">{L("Saldo insuficiente", "Insufficient balance")}</p>
              <p className="mt-1 text-xs font-bold text-tts-muted">
                {L(`Disponível: ${selectedAvailableDisplay}`, `Available: ${selectedAvailableDisplay}`)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <a href={convertAssetsUrl} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-tts-deep px-3 py-2 text-xs font-black text-tts-surface"><ArrowRightLeft className="h-3.5 w-3.5" /> {L("Converter", "Convert")}</a>
            <a href={pixTopUpUrl} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-tts-border px-3 py-2 text-xs font-black text-tts-deep"><ArrowDownToLine className="h-3.5 w-3.5" /> PIX</a>
          </div>
        </div>
      )}

      <div className="tts-stage-strip grid-cols-2">
        <button
          type="button"
          className="tts-stage-button"
          data-active={activeStep === "plan"}
          data-done={hasPrepared}
          onClick={() => {
            setActiveStep("plan");
            onPinChange("");
          }}
        >
          {L("Valor", "Amount")}
        </button>
        <button
          type="button"
          className="tts-stage-button"
          data-active={activeStep === "review"}
          disabled={!hasPrepared}
          onClick={() => setActiveStep("review")}
        >
          {L("Confirmar", "Confirm")}
        </button>
      </div>

      {activeStep === "plan" && (
        <div className="tts-mobile-flow-card tts-stage-panel p-4 space-y-5 sm:p-5">
          {/* The Invest/Withdraw choice is made on the investments list, so we only
              show which one is in progress here — no second toggle. */}
          <div className="flex items-center gap-2 rounded-xl border border-tts-border bg-tts-bg px-4 py-2.5">
            {action === "deposit"
              ? <ArrowDownToLine className="h-4 w-4 text-tts-deep" />
              : <ArrowUpFromLine className="h-4 w-4 text-tts-deep" />}
            <span className="text-sm font-bold text-tts-deep">{action === "deposit" ? L("Investir", "Invest") : L("Retirar", "Withdraw")}</span>
          </div>

          <div className="rounded-2xl border border-tts-border bg-tts-bg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">
                  {L("Saldo disponível", "Available balance")}
                </p>
                <p className="mt-1 text-2xl font-black text-tts-deep">{selectedAvailableDisplay}</p>
              </div>
              <span className="rounded-full border border-tts-border bg-tts-surface px-3 py-1 text-xs font-black text-tts-muted">
                {selectedProfile.short}
              </span>
            </div>
          </div>

          <ReturnPeriodPanel language={language} rate={selectedRate} assetLabel={selectedAssetLabel} />

          <div>
            <label className="text-xs font-bold text-tts-muted uppercase tracking-wide mb-2 block">{L("Valor", "Amount")}</label>
            <div className="flex items-center border border-tts-border bg-tts-bg focus-within:border-tts-deep">
              <span className="px-4 text-sm font-bold text-tts-muted border-r border-tts-border">{profileShort}</span>
              <input value={amount} onChange={(e) => onAmountChange(e.target.value.replace(/[^\d,.]/g, ""))}
                inputMode="decimal" className="flex-1 bg-transparent px-4 py-3 text-lg font-bold outline-none" />
            </div>
            <div className="flex gap-2 mt-2">
              {amountPresets.map((p) => (
                <button key={p} onClick={() => onAmountChange(p)}
                  className="flex-1 py-2 border border-tts-border text-xs font-bold hover:bg-tts-bg transition">{formatAmount(p, language)}</button>
              ))}
            </div>
          </div>

          <div className="tts-mobile-action">
            <button onClick={onPrepare} disabled={!canPrepare}
              className="flex w-full items-center justify-center gap-2 bg-tts-deep py-3.5 text-sm font-bold text-tts-surface transition disabled:opacity-40">
              {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              {L("Continuar", "Continue")}
            </button>
          </div>
        </div>
      )}

      {activeStep === "review" && (
        <div className="tts-mobile-flow-card tts-stage-panel p-4 space-y-5 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold">{L("Confirmação", "Confirmation")}</h3>
              <button
                type="button"
                onClick={() => setInvestmentHelpOpen((open) => !open)}
                aria-expanded={investmentHelpOpen}
                aria-label={L("Explicar investimento", "Explain investment")}
                title={L("Explicar investimento", "Explain investment")}
                className="grid h-8 w-8 place-items-center rounded-full border border-tts-border bg-tts-bg text-tts-muted transition hover:border-tts-deep hover:text-tts-deep"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
            <BadgeCheck className="h-5 w-5 text-tts-confirm" />
          </div>

          {investmentHelpOpen && (
            <div className="border border-tts-border bg-tts-bg p-4 text-sm leading-6 text-tts-deep">
              <p className="font-bold">{L("Como funciona este investimento?", "How does this investment work?")}</p>
              <p className="mt-2 text-tts-muted">
                {L(
                  "Uma vault funciona como um cofre de rendimento: ela recebe depósitos, registra sua participação e acompanha quanto da posição pertence a você.",
                  "A vault works like an earnings vault: it receives deposits, records your share, and tracks how much of the position belongs to you.",
                )}
              </p>
              <p className="mt-2 text-tts-muted">
                {L(
                  "Depois do PIN, o valor sai do saldo disponível e entra nessa vault. A retirada faz o caminho inverso: reduz sua participação e devolve o saldo disponível quando a operação termina.",
                  "After the PIN, the amount leaves your available balance and enters that vault. A withdrawal does the reverse: it reduces your share and returns the available balance when the operation finishes.",
                )}
              </p>
              <p className="mt-2 text-tts-muted">
                {L(
                  "Antes de confirmar, a tela mostra operação, valor e PIN. Em testnet, isso serve para testar o fluxo e não representa dinheiro real.",
                  "Before confirming, the screen shows operation, amount, and PIN. On testnet, this is for testing the flow and does not represent real money.",
                )}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <StatCard label={L("Operação", "Operation")} value={action === "deposit" ? L("Investir", "Invest") : L("Retirar", "Withdraw")} />
            <StatCard label={L("Valor", "Amount")} value={`${formatAmount(amount, language)} ${profileShort}`} />
          </div>

          <ReturnPeriodPanel language={language} rate={selectedRate} assetLabel={selectedAssetLabel} />

          {hasPrepared && !submitted && (
            <div className="border border-tts-border bg-tts-bg p-4">
              <label className="text-xs font-bold text-tts-muted uppercase tracking-wide mb-2 block">PIN</label>
              <input value={pin} onChange={(e) => onPinChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric" type="password" placeholder={L("Digite seu PIN", "Enter your PIN")}
                className="w-full border border-tts-border bg-tts-surface px-4 py-3 text-sm font-bold outline-none focus:border-tts-deep" />
            </div>
          )}

          <div className="tts-mobile-action grid grid-cols-[0.8fr_1.2fr] gap-2">
            <button onClick={() => { setActiveStep("plan"); onPinChange(""); }}
              className="flex-1 py-3 border border-tts-border text-sm font-bold hover:bg-tts-bg transition">
              {L("Voltar", "Back")}
            </button>
            {confirmAvailable ? (
              <button onClick={onConfirm} disabled={!canConfirm}
                className="flex-1 py-3 bg-tts-deep text-tts-surface font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition">
                {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />} {apiState.loading ? L("Confirmando...", "Confirming...") : L("Confirmar investimento", "Confirm investment")}
              </button>
            ) : (
              <div className="flex-1 border border-tts-gold bg-tts-gold-bg px-4 py-3 text-sm font-bold text-tts-gold">
                <p>{blockedTitle}</p>
                {blockedReason && <p className="mt-1 text-xs leading-5 text-tts-gold">{blockedReason}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SuccessDialog({ language, notice, returnsHref, onClose, onRefresh }: {
  language: AppLanguage; notice: YieldSuccessNotice; returnsHref: string; onClose: () => void; onRefresh: () => void;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4" role="dialog">
      <div className="w-full max-w-sm border border-tts-border bg-tts-surface p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-tts-confirm/15 text-tts-confirm mb-4">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold mb-2">{L("Confirmado", "Confirmed")}</h2>
        <p className="text-sm text-tts-muted mb-6">{L("Operação enviada para a rede.", "Operation sent to the network.")}</p>
        <div className="flex gap-2">
          <a href={returnsHref} className="flex-1 py-3 bg-tts-deep text-tts-surface text-sm font-bold">{L("Ver posições", "View positions")}</a>
          <button onClick={onClose} className="flex-1 py-3 border border-tts-border text-sm font-bold">{L("Fechar", "Close")}</button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-tts-muted mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Link your dollar account (associate a Bridge email with this wallet) ──────
function BridgeLinkCard({ language, defaultEmail, state, onLink }: {
  language: AppLanguage;
  defaultEmail: string;
  state: { loading: boolean; linked: boolean; error: string };
  onLink: (email: string) => void;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const [email, setEmail] = useState(defaultEmail);
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onLink(email); }}
      className="mb-5 rounded-2xl border border-tts-border bg-tts-surface p-5"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
          <Wallet className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-tts-deep">{L("Vincular sua conta em dólar", "Link your dollar account")}</p>
          <p className="text-xs text-tts-muted">{L("Conecte o e-mail da sua conta em dólar a esta carteira.", "Connect your dollar-account email to this wallet.")}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-sm font-bold text-tts-deep outline-none focus:border-tts-deep placeholder:text-tts-muted/40"
        />
        <button
          type="submit"
          disabled={!email.trim() || state.loading}
          className="flex items-center justify-center gap-2 rounded-lg bg-tts-deep px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {L("Vincular", "Link")}
        </button>
      </div>
      {state.error && <p className="mt-2 text-xs font-semibold text-tts-error">{state.error}</p>}
    </form>
  );
}

// ── Unified-suite section header ─────────────────────────────────────────────
function SuiteSectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="h-8 w-1 rounded-full bg-amber-500" />
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-500">{eyebrow}</p>
        <h2 className="text-lg font-bold text-tts-deep">{title}</h2>
      </div>
    </div>
  );
}

// ── Inline Soroswap liquidity-yield panel ────────────────────────────────────
// Swaps/conversions are handled internally via path payments — this panel is
// focused on liquidity provision yield (the part the user actually opts into).

type LpPool = {
  pair?: string;
  fee_bp?: number;
  fee_pct?: number;
  total_shares?: string;
  total_trustlines?: number;
  reserves?: Array<{ asset: string; amount: string }>;
  tvl_usd?: number | null;
  xlm_usd_price?: number | null;
  pool_id?: string;
  network?: string;
};

function SwapInlinePanel({ language, email = "", walletKey = "" }: { language: AppLanguage; email?: string; walletKey?: string }) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);

  const [pool, setPool] = useState<LpPool | null>(null);

  // Which pool is selected (drives the provide-liquidity form).
  const [selectedPair, setSelectedPair] = useState("XLM / USDC");

  // Provide-liquidity (custodial) form.
  const [lpAmount, setLpAmount] = useState("");
  const [lpBusy, setLpBusy] = useState(false);
  const [lpErr, setLpErr] = useState("");
  const [lpOk, setLpOk] = useState<{ hash?: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/swap/pool-info?network=mainnet", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d && !d.error) setPool(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const feePct = pool?.fee_pct ?? (pool?.fee_bp != null ? pool.fee_bp / 100 : 0.3);
  const tvl = pool?.tvl_usd ?? null;

  const fmtUsd = (n: number | null | undefined, d = 0) =>
    n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

  // Pools to surface. XLM/USDC is live from Horizon; the BRL pairs are the
  // Stellar BRL liquidity layer (shown as available, deep-linked to Soroswap).
  const pairs = [
    {
      pair: "XLM / USDC",
      note: L("Par principal · dados ao vivo", "Core pair · live data"),
      tvl: tvl,
      fee: feePct,
      live: true,
    },
    { pair: "USDC / BRZ", note: L("Camada de liquidez BRL", "BRL liquidity layer"), tvl: null, fee: 0.3, live: false },
    { pair: "USDC / BRLT", note: L("Camada de liquidez BRL", "BRL liquidity layer"), tvl: null, fee: 0.3, live: false },
  ];
  const selectedPool = pairs.find((p) => p.pair === selectedPair) || pairs[0];
  const canProvide = Boolean(selectedPool.live && walletKey);

  async function provideLiquidity() {
    const amt = Number(lpAmount);
    if (!canProvide || !(amt > 0) || lpBusy) return;
    setLpBusy(true); setLpErr(""); setLpOk(null);
    try {
      const res = await fetch("/api/bridge/stellar-wallets/add-liquidity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, public_key: walletKey, amount: String(amt) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.message || `HTTP ${res.status}`);
      setLpOk({ hash: json.hash ?? json.swap_hash ?? null });
      setLpAmount("");
    } catch (e: any) {
      setLpErr(e?.message ?? String(e));
    } finally {
      setLpBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Available pools */}
      <div className="rounded-2xl border-2 border-stone-700 bg-stone-900 p-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-3">{L("Pools disponíveis", "Available pools")}</p>
        <p className="mb-2 text-[10px] text-stone-500">{L("Toque em uma pool para investir.", "Tap a pool to invest.")}</p>
        <div className="space-y-2">
          {pairs.map((p) => {
            const sel = p.pair === selectedPair;
            return (
              <button
                key={p.pair}
                type="button"
                onClick={() => { setSelectedPair(p.pair); setLpErr(""); setLpOk(null); }}
                className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition ${sel ? "border-emerald-500 bg-emerald-500/10" : "border-stone-700 bg-stone-950/60 hover:border-stone-500"}`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    <Droplets className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white">{p.pair}</p>
                    <p className="text-[10px] text-stone-500">{p.note}</p>
                  </div>
                </div>
                <div className="text-right">
                  {p.live ? (
                    <>
                      <p className="text-xs font-bold text-white tabular-nums">{fmtUsd(p.tvl)}</p>
                      <p className="text-[10px] font-bold text-emerald-400">{p.fee.toFixed(2)}% {L("taxa", "fee")}</p>
                    </>
                  ) : (
                    <span className="rounded-full border border-stone-700 bg-stone-800/60 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-400">{L("Soroswap", "Soroswap")}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Provide liquidity into the selected pool */}
        <div className="mt-4 rounded-xl border border-stone-700 bg-stone-950/60 p-3.5">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-400">
            {L("Investir em", "Invest in")} {selectedPool.pair}
          </p>
          {selectedPool.live ? (
            <>
              {!walletKey && (
                <p className="mb-2 text-[11px] text-stone-400">{L("Selecione sua carteira em dólar acima para investir.", "Select your dollar wallet above to invest.")}</p>
              )}
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center rounded-lg border border-stone-700 bg-stone-900">
                  <span className="border-r border-stone-700 px-3 text-xs font-bold text-stone-400">USDC</span>
                  <input
                    type="number" min="0" step="0.01" inputMode="decimal"
                    value={lpAmount}
                    onChange={(e) => setLpAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={!canProvide}
                    className="flex-1 bg-transparent px-3 py-2.5 text-sm font-bold text-white outline-none disabled:opacity-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={provideLiquidity}
                  disabled={!canProvide || !(Number(lpAmount) > 0) || lpBusy}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-stone-950 transition-colors hover:bg-emerald-400 disabled:opacity-40"
                >
                  {lpBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {lpBusy ? L("Investindo...", "Investing...") : L("Investir", "Invest")}
                </button>
              </div>
              <p className="mt-2 text-[10px] text-stone-500">
                {L(
                  "Metade do valor é convertida em XLM e ambas as pernas entram na pool. O gás é coberto automaticamente.",
                  "Half is converted to XLM and both legs enter the pool. Gas is covered automatically.",
                )}
              </p>
              {lpErr && <p className="mt-2 text-[11px] font-semibold text-tts-error">{lpErr}</p>}
              {lpOk && (
                <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {L("Liquidez adicionada!", "Liquidity added!")}
                  {lpOk.hash && (
                    <a href={`https://stellar.expert/explorer/public/tx/${lpOk.hash}`} target="_blank" rel="noreferrer" className="underline">tx {lpOk.hash.slice(0, 8)}…</a>
                  )}
                </p>
              )}
            </>
          ) : (
            <div>
              <p className="text-[11px] text-stone-400">
                {L("Esta pool BRL é roteada pela Soroswap.", "This BRL pool is routed via Soroswap.")}
              </p>
              <a href="https://app.soroswap.finance" target="_blank" rel="noopener noreferrer" className={BTN_PRIMARY + " mt-3 w-full"}>
                <Plus className="h-4 w-4" /> {L("Abrir na Soroswap →", "Open on Soroswap →")}
              </a>
            </div>
          )}
        </div>
        <p className="mt-2 text-center text-[11px] text-stone-500">
          {L("Rotas agregadas: Soroswap · Aqua · Phoenix · SDEX", "Aggregated routes: Soroswap · Aqua · Phoenix · SDEX")}
        </p>
      </div>
    </div>
  );
}

// ── Blend v2 Lending Panel ─────────────────────────────────────────────────
function BlendInlinePanel({ language, email, wallets, defaultWallet, walletsLoading, onLoadWallets, onEmailChange, onSelectWallet, sessionWalletKey }: {
  language: AppLanguage;
  email: string;
  wallets: Array<{ public_key: string; usdc_balance: string | null; is_primary?: boolean }>;
  defaultWallet: string;
  walletsLoading: boolean;
  onLoadWallets: (email: string) => void;
  onEmailChange: (value: string) => void;
  onSelectWallet: (publicKey: string) => void;
  sessionWalletKey: string;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);

  // Network: custodial supply runs on mainnet (Path B) or testnet (friendbot-funded).
  const [network, setNetwork] = useState<"mainnet" | "testnet">("mainnet");

  // Blend pool — markets the custodial Bridge wallet can supply to.
  const [poolInfo, setPoolInfo] = useState<any>(null);
  const [loadingPool, setLoadingPool] = useState(false);
  const [errPool, setErrPool] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");

  // Custodial supply
  const [amount, setAmount] = useState("10");
  const [submitting, setSubmitting] = useState(false);
  const [errSubmit, setErrSubmit] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // User position in the pool (per reserve)
  const [position, setPosition] = useState<any>(null);
  const [loadingPos, setLoadingPos] = useState(false);

  // Idle balance for the selected wallet on the selected network.
  const [netBalance, setNetBalance] = useState<{ usdc: number; exists: boolean } | null>(null);
  // Stale-response guards: only the latest wallet/network request applies its result.
  const loadPosToken = useRef("");
  const loadBalToken = useRef("");

  const [emailInput, setEmailInput] = useState(email || "");
  useEffect(() => { if (email) setEmailInput(email); }, [email]);

  // Mainnet uses the Bridge email wallet; testnet uses the login/session wallet.
  const walletAddress = network === "testnet" ? sessionWalletKey : defaultWallet;
  const idleUsdc = netBalance ? netBalance.usdc : null;

  function reserveLabel(r: any): string {
    if (r?.symbol) return String(r.symbol);
    const id = String(r?.assetId || "");
    return id ? `${id.slice(0, 4)}…${id.slice(-4)}` : "—";
  }
  function fmtToken(raw: unknown): string {
    const n = Number(raw) / 1e7;
    if (!Number.isFinite(n)) return "0";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  async function loadPool() {
    setLoadingPool(true); setErrPool(null); setPoolInfo(null); setSelectedAssetId("");
    try {
      const res = await fetch(`/api/blend/pool/info?network=${network}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setPoolInfo(data);
      setSelectedAssetId((prev) => prev || data?.usdc?.assetId || data?.reserves?.[0]?.assetId || "");
    } catch (e: any) { setErrPool(e.message); }
    finally { setLoadingPool(false); }
  }
  useEffect(() => { loadPool(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [network]);

  async function loadPosition() {
    if (!walletAddress) { setPosition(null); return; }
    // Drop the response if the wallet/network changed while it was in flight.
    const token = `${walletAddress}:${network}`;
    loadPosToken.current = token;
    setLoadingPos(true);
    try {
      const res = await fetch(`/api/blend/pool/position?address=${walletAddress}&network=${network}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (loadPosToken.current !== token) return;
      if (res.ok && !data.error) setPosition(data);
    } catch { /* silent */ }
    finally { if (loadPosToken.current === token) setLoadingPos(false); }
  }

  // Idle USDC for the selected wallet on the selected network.
  async function loadBalance() {
    if (!walletAddress) { setNetBalance(null); return; }
    const token = `${walletAddress}:${network}`;
    loadBalToken.current = token;
    try {
      const res = await fetch(`/api/bridge/stellar-wallets/balance?public_key=${walletAddress}&network=${network}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (loadBalToken.current !== token) return; // stale — a newer request superseded this
      if (data?.success) setNetBalance({ usdc: Number(data.usdc) || 0, exists: Boolean(data.exists) });
    } catch { /* non-critical */ }
  }
  useEffect(() => { loadBalance(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [walletAddress, network]);
  useEffect(() => { loadPosition(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [walletAddress, network]);

  async function supply() {
    if (submitting) return; // re-entrancy guard (double-click)
    if (!walletAddress) return;
    const assetId = selectedAssetId || poolInfo?.usdc?.assetId;
    setSubmitting(true); setErrSubmit(null); setResult(null);
    try {
      const res = await fetch("/api/bridge/stellar-wallets/invest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: (email || "").trim().toLowerCase(), public_key: walletAddress, amount: String(amount), protocol: "blend", asset_id: assetId, network }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      setResult(data);
      loadPosition(); loadBalance();
    } catch (e: any) { setErrSubmit(e.message); }
    finally { setSubmitting(false); }
  }

  const usdcApy = poolInfo?.usdc?.supplyApy ?? null;
  const reserves: any[] = Array.isArray(poolInfo?.reserves) ? poolInfo.reserves : [];
  const selectedReserve = reserves.find((r) => r.assetId === selectedAssetId) || poolInfo?.usdc || null;
  const supplyFor = (assetId: string) => position?.positions?.find((p: any) => p.assetId === assetId)?.supply ?? null;
  const amtNum = Number(amount);
  const overBalance = idleUsdc !== null && Number.isFinite(amtNum) && amtNum > idleUsdc;
  const canSupply = Boolean(walletAddress && Number.isFinite(amtNum) && amtNum > 0 && !overBalance && !submitting);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border-2 border-stone-700 bg-stone-900 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">{L("Empréstimos & Rendimentos", "Lending & Yield")}</p>
            <h3 className="text-lg font-bold mt-0.5 text-white">{L("Aplicar no Blend", "Supply to Blend")}</h3>
            <p className="mt-0.5 text-[11px] text-stone-400">{L("Direto da sua carteira — sem extensões.", "Straight from your wallet — no extensions.")}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {usdcApy !== null ? (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-300">USDC {usdcApy.toFixed(2)}% APY</span>
            ) : loadingPool ? <Loader2 className="h-4 w-4 animate-spin text-stone-400" /> : (
              <button onClick={loadPool} className="text-xs font-bold text-amber-300 hover:underline">{L("Ver APY", "View APY")}</button>
            )}
          </div>
        </div>

        {/* Network toggle */}
        <div className="mb-4 inline-flex rounded-lg border-2 border-stone-700 bg-stone-800/60 p-0.5">
          {(["mainnet", "testnet"] as const).map((n) => (
            <button key={n} type="button" onClick={() => { setNetwork(n); setResult(null); setErrSubmit(null); }}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${network === n ? "bg-amber-500 text-stone-950 shadow-sm" : "text-stone-400 hover:text-white"}`}>
              {n === "mainnet" ? L("Rede principal", "Mainnet") : "Testnet"}
            </button>
          ))}
        </div>

        {loadingPool && !poolInfo && (
          <div className="flex items-center gap-2 rounded-lg bg-stone-800/60 p-3 text-xs text-stone-400 mb-3"><Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> {L("Carregando mercados…", "Loading markets…")}</div>
        )}
        {errPool && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300 mb-3"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {errPool}</div>
        )}

        {/* Markets */}
        {reserves.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">{L(`Mercados (${reserves.length})`, `Markets (${reserves.length})`)}</p>
              <p className="text-[10px] text-stone-400">{L("Toque para escolher", "Tap to choose")}</p>
            </div>
            <div className="space-y-2">
              {reserves.map((r: any) => {
                const sel = r.assetId === selectedAssetId;
                const mySupply = supplyFor(r.assetId);
                return (
                  <button key={r.assetId} type="button" onClick={() => { setSelectedAssetId(r.assetId); setResult(null); setErrSubmit(null); }} className={selectCard(sel)}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{reserveLabel(r)}</span>
                        {sel && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-stone-950">{L("selecionado", "selected")}</span>}
                      </div>
                      <span className="text-base font-black text-emerald-400">{r.supplyApy.toFixed(2)}%<span className="ml-1 text-[9px] font-bold text-stone-400">{L("ganho", "earn")}</span></span>
                    </div>
                    <p className="mt-0.5 font-mono text-[9px] text-stone-400 break-all">{r.assetId}</p>
                    <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
                      <div className="rounded-lg bg-stone-950/60 py-1.5"><p className="text-[8px] font-bold uppercase tracking-wide text-stone-400">{L("Empréstimo", "Borrow")}</p><p className="text-[11px] font-bold text-white">{r.borrowApy.toFixed(2)}%</p></div>
                      <div className="rounded-lg bg-stone-950/60 py-1.5"><p className="text-[8px] font-bold uppercase tracking-wide text-stone-400">{L("Uso", "Util.")}</p><p className="text-[11px] font-bold text-white">{r.utilization.toFixed(1)}%</p></div>
                      <div className="rounded-lg bg-stone-950/60 py-1.5"><p className="text-[8px] font-bold uppercase tracking-wide text-stone-400">{L("Ofertado", "Supplied")}</p><p className="text-[11px] font-bold text-white">{fmtToken(r.supplied)}</p></div>
                      <div className="rounded-lg bg-stone-950/60 py-1.5"><p className="text-[8px] font-bold uppercase tracking-wide text-stone-400">{L("Tomado", "Borrowed")}</p><p className="text-[11px] font-bold text-white">{fmtToken(r.liabilities)}</p></div>
                    </div>
                    {mySupply !== null && mySupply > 0 && (
                      <p className="mt-2 rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-300">{L("Sua posição: ", "Your position: ")}{mySupply.toFixed(4)} {reserveLabel(r)}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Account — testnet uses the login/session wallet; mainnet the Bridge wallet */}
        <div className="rounded-xl border-2 border-stone-700 bg-stone-800/60 p-3 mb-3">
          <p className="text-xs font-bold text-stone-400 uppercase tracking-wide mb-2">
            {network === "testnet" ? L("Carteira da conta (login)", "Account wallet (login)") : L("Carteira (Bridge)", "Bridge wallet")}
          </p>
          {network === "testnet" ? (
            walletAddress ? (
              <div className="space-y-2">
                <p className="font-mono text-xs text-stone-300 break-all">{walletAddress}</p>
                {idleUsdc !== null && (
                  <p className="text-xs font-bold text-stone-200">
                    {L("Disponível: ", "Available: ")}<span className="text-emerald-400">{idleUsdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 7 })} USDC</span>
                    <span className="ml-1 text-[10px] font-bold uppercase text-stone-400">testnet</span>
                  </p>
                )}
                {netBalance && !netBalance.exists && (
                  <p className="text-[11px] text-stone-400">{L("Conta ainda não existe na testnet — será criada (friendbot) ao aplicar.", "Account not on testnet yet — it'll be created (friendbot) on first supply.")}</p>
                )}
                {netBalance?.exists && idleUsdc === 0 && (
                  <p className="text-[11px] text-amber-300">{L("Sem USDC de testnet nesta carteira.", "No testnet USDC in this wallet.")}</p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-stone-400">{L("Entre na sua conta para usar a carteira de testnet.", "Sign in to use your testnet account wallet.")}</p>
            )
          ) : wallets.length === 0 ? (
            <form onSubmit={(e) => { e.preventDefault(); onEmailChange(emailInput); onLoadWallets(emailInput); }} className="flex gap-2">
              <input type="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder={L("seu@email.com", "you@email.com")}
                className="flex-1 rounded-lg border-2 border-stone-700 bg-stone-900 px-3 py-2 text-sm font-bold text-white outline-none focus:border-amber-400" />
              <button type="submit" disabled={!emailInput.trim() || walletsLoading} className={BTN_PRIMARY + " !w-auto px-4"}>
                {walletsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : L("Buscar", "Find")}
              </button>
            </form>
          ) : (
            <div className="space-y-2">
              <select value={walletAddress} onChange={(e) => onSelectWallet(e.target.value)}
                className="w-full rounded-lg border-2 border-stone-700 bg-stone-900 px-3 py-2.5 text-sm font-mono text-white outline-none focus:border-amber-400">
                {wallets.map((w) => (
                  <option key={w.public_key} value={w.public_key}>
                    {`${w.public_key.slice(0, 6)}…${w.public_key.slice(-6)}`}
                    {w.is_primary ? ` · ${L("principal", "primary")}` : ""}
                    {w.usdc_balance !== null ? ` · ${Number(w.usdc_balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC` : ""}
                  </option>
                ))}
              </select>
              {idleUsdc !== null && (
                <p className="text-xs font-bold text-stone-200">
                  {L("Disponível: ", "Available: ")}<span className="text-emerald-400">{idleUsdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 7 })} USDC</span>
                  <span className="ml-1 text-[10px] font-bold uppercase text-stone-400">mainnet</span>
                </p>
              )}
              {loadingPos && <Loader2 className="h-3 w-3 animate-spin text-stone-400" />}
            </div>
          )}
        </div>

        {/* Amount */}
        <div className="mb-3">
          <label className="block mb-1 text-xs font-bold text-stone-400 uppercase tracking-wide">
            {L("Aplicar em", "Supply to")} {reserveLabel(selectedReserve)}
            {selectedReserve?.supplyApy != null && <span className="ml-1 text-emerald-400">· {selectedReserve.supplyApy.toFixed(2)}% APY</span>}
          </label>
          <div className="relative">
            <input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setResult(null); setErrSubmit(null); }}
              className="w-full rounded-lg border-2 border-stone-700 bg-stone-900 px-3 py-2.5 pr-16 text-sm font-bold text-white outline-none focus:border-amber-400" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">{reserveLabel(selectedReserve)}</span>
          </div>
          {idleUsdc !== null && (
            <div className="mt-1 flex gap-1.5">
              {[25, 50, 100].map((pct) => (
                <button key={pct} type="button" onClick={() => { setAmount(String((idleUsdc * pct / 100).toFixed(2))); setResult(null); }}
                  className="rounded-md border border-stone-700 bg-stone-900 px-2 py-0.5 text-[10px] font-bold text-stone-300 hover:border-amber-400">{pct === 100 ? L("Tudo", "Max") : `${pct}%`}</button>
              ))}
            </div>
          )}
          {overBalance && <p className="mt-1 text-[11px] font-semibold text-amber-300">{L("Valor acima do saldo disponível.", "Amount exceeds available balance.")}</p>}
        </div>

        {/* Supply (custodial — one tap, no Freighter) */}
        <button onClick={supply} disabled={!canSupply} className={BTN_PRIMARY}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
          {submitting ? L("Aplicando…", "Supplying…") : L(`Aplicar ${amount || ""} no Blend`, `Supply ${amount || ""} to Blend`)}
        </button>
        {!email && !wallets.length && <p className="mt-2 text-[11px] text-stone-400">{L("Informe seu e-mail acima para carregar sua carteira.", "Enter your email above to load your wallet.")}</p>}
        {errSubmit && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {errSubmit}</div>
        )}
        {result?.success && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-stone-400">Status</span><span className="font-bold text-emerald-300">{L("✓ Aplicado", "✓ Supplied")}</span></div>
            <div className="flex justify-between text-xs"><span className="text-stone-400">{L("Valor", "Amount")}</span><span className="font-bold text-white">{result.amount} USDC</span></div>
            {result.hash && (
              <>
                <div className="flex justify-between text-xs"><span className="text-stone-400">Hash</span><span className="font-mono font-bold text-white">{String(result.hash).slice(0, 16)}…</span></div>
                <a href={`https://stellar.expert/explorer/${network === "testnet" ? "testnet" : "public"}/tx/${result.hash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-amber-300 hover:underline mt-1"><ExternalLink className="h-3 w-3" /> {L("Ver no StellarExpert", "View on StellarExpert")}</a>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-stone-400">
        {L("Blend — protocolo de empréstimos na Stellar. Execução custodial pela sua carteira; APY variável conforme a demanda.", "Blend — lending protocol on Stellar. Custodial execution from your wallet; variable APY based on demand.")}
      </p>
    </div>
  );
}
