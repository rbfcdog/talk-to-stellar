"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Coins,
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
function formatAmount(value: unknown, language: AppLanguage = "pt-BR") {
  const p = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(p)) return String(value || "0");
  return formatCustomerNumber(p, isPortuguese(language) ? "pt-BR" : "en-US");
}
function formatPositionAmount(value: unknown, profile: { short: string }, language: AppLanguage = "pt-BR") {
  const amount = normalizeDecimal(value);
  if (amount <= 0) return `0 ${profile.short}`;
  return `${formatAmount(amount, language)} ${profile.short}`;
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
  return `${formatAmount(value, language)} ${profile.short}`;
}

function shiftDate(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString();
}

function buildGrowthPathPoints(amount: number, ratePercent: number, language: AppLanguage, days: number): ChartPoint[] {
  const base = Math.max(0, amount);
  const annualRate = Math.max(0, ratePercent) / 100;
  const offsets = days <= 7 ? [0, 1, 2, 4, 7] : [0, 7, 14, 21, 30];
  const labels = offsets.map((offset) => ({
    days: offset,
    label: offset === 0 ? localCopy(language, "Hoje", "Today") : `${offset}d`,
  }));
  return labels.map((item) => ({
    label: item.label,
    value: annualRate > 0 ? base * Math.pow(1 + annualRate, item.days / 365) : base,
  }));
}

function buildPositionLinePoints(history: PositionHistoryState | undefined, currentAmount: number, language: AppLanguage, days: number): ChartPoint[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const sorted = [...(history?.points || [])]
    .filter((point) => Number.isFinite(Date.parse(String(point.date || ""))))
    .sort((a, b) => Date.parse(String(a.date || "")) - Date.parse(String(b.date || "")));
  const previousPoint = [...sorted].reverse().find((point) => Date.parse(String(point.date || "")) < cutoff);
  const scoped = sorted.filter((point) => Date.parse(String(point.date || "")) >= cutoff);
  const displayPoints = scoped.length && previousPoint ? [previousPoint, ...scoped] : scoped;

  const points: ChartPoint[] = displayPoints.map((point) => ({
    label: formatChartDate(point.date, language),
    date: point.date,
    value: normalizeDecimal(point.amount),
    action: point.action,
  }));

  if (points.length) {
    const last = points[points.length - 1];
    if (Math.abs(last.value - currentAmount) > 0.0000001) {
      points.push({ label: localCopy(language, "Agora", "Now"), date: new Date().toISOString(), value: Math.max(0, currentAmount) });
    }
    return points;
  }

  const fallbackDays = days <= 7 ? [7, 4, 2, 0] : [30, 21, 14, 7, 0];
  return fallbackDays.map((daysAgo) => ({
    label: daysAgo === 0 ? localCopy(language, "Hoje", "Today") : formatChartDate(shiftDate(daysAgo), language),
    date: shiftDate(daysAgo),
    value: Math.max(0, currentAmount),
  }));
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
            type="linear"
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
  const growthPoints = buildGrowthPathPoints(row.amount, row.rate, language, activeWindow.days);
  const historyPoints = buildPositionLinePoints(row.history, row.amount, language, activeWindow.days);
  const growthValue = growthPoints[growthPoints.length - 1]?.value || row.amount;
  const hasMovements = Boolean(row.history.points.length);

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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-tts-border bg-tts-bg p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">{L("Caminho estimado", "Growth path")}</p>
              <p className="mt-1 text-sm font-black text-tts-deep">{formatChartAmount(growthValue, row.profile, language)}</p>
            </div>
            <span className="text-xs font-black text-tts-confirm">
              {formatReturnPercent(periodReturnPercent(row.rate, activeWindow.days / 365), language)}
            </span>
          </div>
          <InvestmentLineChart data={growthPoints} profile={row.profile} language={language} tone="muted" />
        </div>

        <div className="rounded-lg border border-tts-border bg-tts-bg p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">{L("Linha real", "Real balance line")}</p>
              <p className="mt-1 text-sm font-black text-tts-deep">{formatChartAmount(row.amount, row.profile, language)}</p>
            </div>
            <span className="text-[11px] font-bold text-tts-muted">
              {row.history.loading ? L("Carregando", "Loading") : hasMovements ? L("Movimentos", "Movements") : L("Atual", "Current")}
            </span>
          </div>
          <InvestmentLineChart data={historyPoints} profile={row.profile} language={language} />
        </div>
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
  const [tab, setTab] = useState<"returns" | "apply" | "swap">(initialView === "application" ? "apply" : "returns");

  useEffect(() => {
    const next = initialView === "application" ? "apply" : "returns";
    if (tab !== next) setTab(next);
  }, [initialView]);
  const [session, setSession] = useState<SessionState>({ authenticated: false, loading: true, checked: false });
  const [returnsPin, setReturnsPin] = useState("");
  const [returnsPinVerified, setReturnsPinVerified] = useState(false);
  const [returnsPinState, setReturnsPinState] = useState<ApiState>({ loading: false, message: "", error: "" });
  const [yieldStatus, setYieldStatus] = useState<YieldStatus | null>(null);
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [selectedCode, setSelectedCode] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
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
  const [bridgeWalletLoading, setBridgeWalletLoading] = useState(false);

  // Email-based Stellar wallet lookup (mainnet) — pick one when several exist.
  type EmailWallet = { public_key: string; label: string | null; usdc_balance: string | null; is_primary?: boolean; is_funded?: boolean; exists_on_mainnet?: boolean };
  const [walletEmail, setWalletEmail] = useState("");
  const [emailWallets, setEmailWallets] = useState<EmailWallet[]>([]);
  const [selectedWalletKey, setSelectedWalletKey] = useState("");
  const [emailWalletsLoading, setEmailWalletsLoading] = useState(false);
  const [emailWalletsError, setEmailWalletsError] = useState("");
  // Mainnet invest (deposits the selected Bridge wallet's USDC into a protocol)
  type MainnetProtocol = "defindex" | "blend";
  const [investAmount, setInvestAmount] = useState("");
  const [investStatus, setInvestStatus] = useState<"idle" | "investing" | "ok" | "error">("idle");
  const [investError, setInvestError] = useState("");
  const [investHash, setInvestHash] = useState("");
  const [mainnetProtocol, setMainnetProtocol] = useState<MainnetProtocol>("defindex");
  const [blendMainnetApy, setBlendMainnetApy] = useState<number | null>(null);
  const [positions, setPositions] = useState<{ defindex_usdc: number; blend_usdc: number; total_invested_usdc: number } | null>(null);

  async function loadPositions(email: string, publicKey: string) {
    if (!email || !publicKey) return;
    try {
      const res = await fetch(`/api/bridge/stellar-wallets/positions?email=${encodeURIComponent(email.trim().toLowerCase())}&public_key=${encodeURIComponent(publicKey)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.success) setPositions({ defindex_usdc: Number(json.defindex_usdc) || 0, blend_usdc: Number(json.blend_usdc) || 0, total_invested_usdc: Number(json.total_invested_usdc) || 0 });
    } catch {
      // non-critical
    }
  }

  // Mainnet APYs: DeFindex from yield status, Blend from the pool info endpoint.
  const defindexMainnetApy = useMemo(() => {
    const v = (yieldStatus?.vaults || []).find((x) => optionCode(x) === "USDC");
    const p = Number(String(v?.apy_percent || "").replace("%", "").replace(",", "."));
    return Number.isFinite(p) && p > 0 ? p : null;
  }, [yieldStatus]);

  async function loadBlendMainnetApy() {
    try {
      const res = await fetch(`/api/blend/pool/info?network=mainnet`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const apy = json?.usdc?.supplyApy ?? json?.data?.usdc?.supplyApy;
      if (Number.isFinite(Number(apy))) setBlendMainnetApy(Number(apy));
    } catch {
      // non-critical
    }
  }

  async function mainnetInvest(email: string, publicKey: string, amount: string, protocol: MainnetProtocol) {
    if (!email || !publicKey) return;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setInvestStatus("error"); setInvestError("Enter a valid amount."); return; }
    setInvestStatus("investing");
    setInvestError("");
    setInvestHash("");
    try {
      const res = await fetch(`/api/bridge/stellar-wallets/invest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), public_key: publicKey, amount: String(amt), protocol }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
      setInvestStatus("ok");
      setInvestHash(json.hash || "");
      setInvestAmount("");
      setTimeout(() => { loadEmailWallets(email); loadPositions(email, publicKey); }, 4000);
    } catch (e: any) {
      setInvestStatus("error");
      setInvestError(e?.message ?? String(e));
    }
  }

  async function loadEmailWallets(email: string) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setEmailWalletsLoading(true);
    setEmailWalletsError("");
    try {
      const res = await fetch(`/api/bridge/stellar-wallets?email=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      const wallets: EmailWallet[] = Array.isArray(json?.wallets) ? json.wallets : [];
      setEmailWallets(wallets);
      setSelectedWalletKey((cur) => {
        if (cur && wallets.some((w) => w.public_key === cur)) return cur;
        const primary = wallets.find((w) => w.is_primary) || wallets.find((w) => Number(w.usdc_balance) > 0) || wallets[0];
        return primary?.public_key || "";
      });
      if (!wallets.length) setEmailWalletsError(L("Nenhuma carteira encontrada para este e-mail.", "No wallets found for this email."));
    } catch (e: any) {
      setEmailWalletsError(e?.message ?? String(e));
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
    setBridgeWalletLoading(true);
    try {
      const params = new URLSearchParams();
      const id = sid || session.sessionId;
      if (id) params.set("session_id", id);
      const res = await fetch(`/api/bridge/session/stellar-balances?${params}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.success) setBridgeWalletBalances(json);
    } catch {
      // non-critical
    } finally {
      setBridgeWalletLoading(false);
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

  // Load the Blend mainnet APY when on the mainnet view.
  useEffect(() => {
    if (networkView === "mainnet") loadBlendMainnetApy();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkView]);

  // Load the selected wallet's invested positions (DeFindex + Blend) on mainnet.
  useEffect(() => {
    if (networkView === "mainnet" && walletEmail && selectedWalletKey) loadPositions(walletEmail, selectedWalletKey);
    else setPositions(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [networkView, selectedWalletKey, walletEmail]);

  useEffect(() => {
    setReturnsPin("");
    setReturnsPinVerified(false);
    setReturnsPinState({ loading: false, message: "", error: "" });
  }, [session.sessionId, session.sessionSource]);

  useEffect(() => { setYieldResult(null); setPin(""); }, [action, amount, actionableOption?.vault_address, safeSelectedCode]);
  useEffect(() => {
    if (tab !== "returns" || !session.authenticated || !options.length || !channelPinUnlocked) return;
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
  }, [tab, session.authenticated, session.sessionSource, options, language, channelPinUnlocked]);

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
    }
  }

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      {successNotice && <SuccessDialog language={language} notice={successNotice} returnsHref={returnsUrl} onClose={() => setSuccessNotice(null)} onRefresh={() => { setSuccessNotice(null); /* refresh */ }} />}

      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-8">
        <div className="tts-stage-strip mb-5 grid-cols-3">
          <button type="button" className="tts-stage-button" data-active={tab === "returns"} onClick={() => setTab("returns")}>{L("Rendimentos", "Returns")}</button>
          <button type="button" className="tts-stage-button" data-active={tab === "apply"} onClick={() => setTab("apply")}>{L("Aplicar", "Apply")}</button>
          <button type="button" className="tts-stage-button" data-active={tab === "swap"} onClick={() => setTab("swap")}>{L("Trocar", "Swap")}</button>
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
              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
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
              Testnet
            </button>
            <button
              type="button"
              onClick={() => setNetworkView("mainnet")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors ${networkView === "mainnet" ? "bg-tts-deep text-white" : "text-tts-muted hover:text-tts-deep"}`}
            >
              Mainnet
            </button>
          </div>
        </div>

        {/* Bridge wallet balance banner (mainnet) */}
        {networkView === "mainnet" && returnsPinVerified && (
          <div className="mb-5 rounded-2xl border border-tts-border bg-tts-surface overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-tts-border/60 bg-tts-bg/50">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">{L("Carteira Stellar · Mainnet", "Stellar Wallet · Mainnet")}</p>
                <p className="text-sm font-bold text-tts-deep mt-0.5">{L("Saldo real USDC", "Real USDC balance")}</p>
              </div>
              {(bridgeWalletLoading || emailWalletsLoading) && <Loader2 className="h-4 w-4 animate-spin text-tts-muted" />}
            </div>

            {/* Email lookup + wallet chooser */}
            <div className="px-5 py-4 border-b border-tts-border/40 space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted">
                {L("Buscar carteiras por e-mail", "Find wallets by email")}
              </p>
              <form onSubmit={(e) => { e.preventDefault(); loadEmailWallets(walletEmail); }} className="flex gap-2">
                <input
                  type="email"
                  value={walletEmail}
                  onChange={(e) => setWalletEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="flex-1 rounded-lg border border-tts-border bg-tts-bg px-3 py-2 text-sm outline-none focus:border-tts-deep placeholder:text-tts-muted/40"
                />
                <button
                  type="submit"
                  disabled={!walletEmail.trim() || emailWalletsLoading}
                  className="rounded-lg bg-tts-deep px-4 py-2 text-sm font-bold text-white disabled:opacity-40 hover:opacity-90"
                >
                  {emailWalletsLoading ? L("Buscando...", "Loading...") : L("Buscar", "Find")}
                </button>
              </form>

              {emailWalletsError && <p className="text-[11px] text-tts-error">{emailWalletsError}</p>}

              {emailWallets.length > 0 && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-tts-muted mb-1">
                    {emailWallets.length === 1 ? L("Carteira", "Wallet") : L("Escolha a carteira", "Choose a wallet")}
                  </label>
                  <select
                    value={selectedWalletKey}
                    onChange={(e) => setSelectedWalletKey(e.target.value)}
                    className="w-full rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-sm font-mono text-tts-deep outline-none focus:border-tts-deep"
                  >
                    {emailWallets.map((w) => (
                      <option key={w.public_key} value={w.public_key}>
                        {`${w.public_key.slice(0, 6)}...${w.public_key.slice(-6)}`}
                        {w.is_primary ? ` · ${L("principal", "primary")}` : ""}
                        {w.usdc_balance !== null ? ` · ${Number(w.usdc_balance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC` : ""}
                      </option>
                    ))}
                  </select>
                  {selectedEmailWallet && (
                    <p className="mt-1 text-[10px] font-mono text-tts-muted/70 break-all">{selectedEmailWallet.public_key}</p>
                  )}
                </div>
              )}
            </div>
            {/* Balance: wallet (idle) + invested */}
            <div className="px-5 py-4 border-b border-tts-border/40 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">{L("Na carteira", "In wallet")}</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-bold tabular-nums text-tts-deep">
                    {mainnetUsdcBalance !== null ? Number(mainnetUsdcBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </span>
                  <span className="text-xs font-bold text-tts-muted">USDC</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-tts-confirm">{L("Investido", "Invested")}</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-bold tabular-nums text-tts-confirm">
                    {positions ? positions.total_invested_usdc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </span>
                  <span className="text-xs font-bold text-tts-muted">USDC</span>
                </div>
              </div>
            </div>

            {/* Earn — protocol choice (+ invest when funds are idle) */}
            {selectedWalletKey && (
              <div className="px-5 py-4 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-tts-muted">{L("Render seu USDC", "Earn on your USDC")}</p>

                {/* Protocol cards — APY + your position */}
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: "defindex" as MainnetProtocol, name: "DeFindex", desc: L("Cofre auto-otimizado", "Auto-optimized vault"), apy: defindexMainnetApy, pos: positions?.defindex_usdc ?? null },
                    { id: "blend" as MainnetProtocol, name: "Blend", desc: L("Pool de empréstimo", "Lending pool"), apy: blendMainnetApy, pos: positions?.blend_usdc ?? null },
                  ]).map((p) => {
                    const sel = mainnetProtocol === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setMainnetProtocol(p.id)}
                        className={`text-left rounded-xl border p-3 transition-colors ${sel ? "border-tts-gold bg-tts-gold-bg ring-1 ring-tts-gold" : "border-tts-border bg-tts-surface hover:border-tts-gold/50"}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-tts-deep">{p.name}</span>
                          <span className="text-sm font-black text-tts-confirm">{p.apy !== null ? `${p.apy.toFixed(2)}%` : "—"}</span>
                        </div>
                        <p className="text-[10px] text-tts-muted mt-0.5">{p.desc}</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-tts-muted/60">APY</span>
                          {p.pos !== null && p.pos > 0 && (
                            <span className="text-[10px] font-bold text-tts-deep">{p.pos.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {L("investido", "invested")}</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {mainnetUsdcBalance !== null && Number(mainnetUsdcBalance) <= 0 && (
                  <p className="text-[11px] text-tts-muted">
                    {L("Sem USDC livre na carteira para investir. Seus fundos investidos aparecem acima.", "No idle USDC in the wallet to invest. Your invested funds are shown above.")}
                  </p>
                )}

                {/* Amount + invest (only when there's idle USDC) */}
                {mainnetUsdcBalance !== null && Number(mainnetUsdcBalance) > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-1 items-center rounded-xl border border-tts-border bg-tts-bg focus-within:border-tts-deep">
                        <span className="px-3 text-xs font-bold text-tts-muted border-r border-tts-border">USDC</span>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={Number(mainnetUsdcBalance)}
                          value={investAmount}
                          onChange={(e) => setInvestAmount(e.target.value)}
                          placeholder={`${L("máx", "max")} ${Number(mainnetUsdcBalance).toFixed(2)}`}
                          className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none"
                        />
                        <button type="button" onClick={() => setInvestAmount(String(mainnetUsdcBalance))} className="px-3 text-[11px] font-bold text-tts-muted hover:text-tts-deep">{L("Tudo", "Max")}</button>
                      </div>
                      <button
                        type="button"
                        onClick={() => mainnetInvest(walletEmail, selectedWalletKey, investAmount, mainnetProtocol)}
                        disabled={investStatus === "investing" || !investAmount || Number(investAmount) <= 0}
                        className="flex items-center gap-1.5 rounded-xl bg-tts-confirm px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 transition-opacity"
                      >
                        {investStatus === "investing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        {investStatus === "investing" ? L("Investindo...", "Investing...") : L("Investir", "Invest")}
                      </button>
                    </div>
                    <p className="text-[10px] text-tts-muted/70">
                      {L(
                        `Investe da carteira selecionada em ${mainnetProtocol === "blend" ? "Blend" : "DeFindex"} na mainnet. O gás é coberto automaticamente.`,
                        `Invests from the selected wallet into ${mainnetProtocol === "blend" ? "Blend" : "DeFindex"} on mainnet. Gas is covered automatically.`,
                      )}
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Invest result / error */}
            {(investStatus === "ok" || investStatus === "error") && (
              <div className={`px-5 py-3 border-t border-tts-border/40 text-xs ${investStatus === "ok" ? "text-tts-confirm" : "text-tts-error"}`}>
                {investStatus === "ok" ? (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {L("Investido na mainnet!", "Invested on mainnet!")}
                    {investHash && (
                      <a href={`https://stellar.expert/explorer/public/tx/${investHash}`} target="_blank" rel="noreferrer" className="underline">
                        tx {investHash.slice(0, 8)}…
                      </a>
                    )}
                  </span>
                ) : investError}
              </div>
            )}
          </div>
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
          <>
            {tab === "returns" && (
              <CurrentInvestmentsPage
                language={language} session={session} sessionLoading={sessionLoading} options={options}
                positionBalances={positionBalances} positionHistories={positionHistories} isTestnet={networkView === "testnet" && isTestnetYield}
                mainnetInvested={networkView === "mainnet" ? positions?.total_invested_usdc ?? null : null}
                onRefresh={() => {}} sessionLinkContext={sessionLinkContext}
              />
            )}

            {tab === "apply" && (
              <>
                <ApplyTab
                  language={language} session={session} sessionLoading={sessionLoading} apiState={apiState}
                  amount={amount} onAmountChange={setAmount} amountPresets={amountPresets}
                  action={action} onActionChange={setAction}
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
                <div className="mt-8">
                  <BlendInlinePanel language={language} />
                </div>
              </>
            )}

            {tab === "swap" && (
              <SwapInlinePanel language={language} />
            )}
          </>
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

function CurrentInvestmentsPage({ language, session, sessionLoading, options, positionBalances, positionHistories, isTestnet, mainnetInvested, onRefresh, sessionLinkContext }: {
  language: AppLanguage; session: SessionState; sessionLoading: boolean;
  options: YieldOption[]; positionBalances: Record<string, PositionState>;
  positionHistories: Record<string, PositionHistoryState>;
  isTestnet: boolean; mainnetInvested: number | null; onRefresh: () => void; sessionLinkContext: Record<string, string>;
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
      history: positionHistories[code] || { loading: false, points: [], error: "" },
    };
  });
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
          <PortfolioOverview language={language} rows={rows} isTestnet={isTestnet} />

          {rows.map((row) => {
            const balanceText = row.loading ? L("Consultando", "Checking") : row.error ? L("Consulta indisponível", "Unavailable") : formatPositionAmount(row.amount, row.profile, language);
            const sourceText = row.source === "operation_history_fallback"
              ? L("Atualizado pelo histórico da conta", "Updated from account history")
              : L("Atualizado da conta.", "Updated from account.");
            return (
              <div key={row.code} className="border border-tts-border bg-tts-surface p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs font-bold text-tts-muted uppercase tracking-wide">{row.profile.short}</span>
                    <h3 className="text-lg font-bold mt-0.5">{profileName(row.profile, language)}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">{L("Posição atual", "Current position")}</p>
                    <p className="text-lg font-bold" role="status">{balanceText}</p>
                    {!row.loading && !row.error ? <p className="text-xs text-tts-muted">{sourceText}</p> : null}
                  </div>
                </div>
                <div className="mb-3">
                  <InvestmentGraphs language={language} row={row} />
                </div>
                <a href={buildMoneyUrl("/rendimentos", { view: "application", action: "deposit", asset: row.code, amount: "100", ...sessionLinkContext, lang: language })}
                  className="flex items-center justify-center gap-2 w-full py-3 border border-tts-border text-sm font-bold hover:bg-tts-bg transition mt-2">
                  <Plus className="h-4 w-4" /> {L("Aplicar", "Apply")}
                </a>
              </div>
            );
          })}

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

function PortfolioOverview({ language, rows, isTestnet }: {
  language: AppLanguage;
  rows: InvestmentRow[];
  isTestnet: boolean;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const [analysisWindow, setAnalysisWindow] = useState<AnalysisWindow>("daily");
  const activeWindow = ANALYSIS_WINDOWS.find((item) => item.key === analysisWindow) || ANALYSIS_WINDOWS[0];
  return (
    <section className="border border-tts-border bg-tts-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("Posições", "Positions")}</p>
          <h2 className="mt-1 text-2xl font-bold text-tts-deep">{L("Investimentos atuais", "Current investments")}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-72">
          <StatCard label={L("Opções", "Options")} value={String(rows.length)} sub={L("disponíveis", "available")} />
          <StatCard label={L("Ambiente", "Environment")} value={isTestnet ? L("Testnet", "Testnet") : L("Rede ativa", "Live")} sub={L("valores estimados", "estimated values")} />
        </div>
      </div>

      <div className="mt-5 border border-tts-border bg-tts-bg p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-tts-confirm" />
              <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("Análise por período", "Period analysis")}</p>
            </div>
            <p className="mt-1 text-sm font-semibold text-tts-muted">
              {L("Compare o retorno recente por ativo sem contar aplicações, resgates ou dinheiro adicionado.", "Compare recent vault return by asset without counting deposits, withdrawals, or added cash.")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-tts-border bg-tts-surface p-1">
            {ANALYSIS_WINDOWS.map((item) => {
              const active = item.key === analysisWindow;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setAnalysisWindow(item.key)}
                  className={[
                    "min-w-28 px-3 py-2 text-left transition",
                    active ? "bg-tts-deep text-tts-surface" : "text-tts-muted hover:bg-tts-bg",
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

        <div className="mt-4 overflow-hidden border border-tts-border bg-tts-surface">
          <div className="grid grid-cols-[1.15fr_1fr_1fr] gap-3 border-b border-tts-border px-3 py-2 text-[10px] font-black uppercase tracking-wide text-tts-muted md:grid-cols-[1.15fr_1fr_1fr_0.8fr_1fr]">
            <span>{L("Ativo", "Asset")}</span>
            <span>{L("Atual", "Current")}</span>
            <span>{L("Retorno", "Return")}</span>
            <span className="hidden md:block">{L("Pontos", "Points")}</span>
            <span className="hidden md:block">{L("Último movimento", "Last movement")}</span>
          </div>
          {rows.map((row) => {
            const analysis = analyzePortfolioPeriod({
              currentAmount: row.amount,
              historyPoints: row.history?.points || [],
              days: activeWindow.days,
            });
            const positive = analysis.change > 0.0000001;
            const negative = analysis.change < -0.0000001;
            const tone = positive ? "text-tts-confirm" : negative ? "text-tts-error" : "text-tts-muted";
            const hasIgnoredCashflow = Math.abs(analysis.cashflowChange) > 0.0000001;

            // Projected return: shown on testnet when no history points in window but APY is known.
            // Uses the last deposit date from all-time history to estimate elapsed accrual.
            const allPoints = (row.history?.points || []).slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            const firstDepositDate = allPoints.find((p) => p.action === "deposit")?.date;
            const daysElapsedSinceDeposit = firstDepositDate
              ? Math.max(0, (Date.now() - new Date(firstDepositDate).getTime()) / (1000 * 60 * 60 * 24))
              : 0;
            const projectedReturn = (isTestnet && analysis.change === 0 && row.rate > 0 && row.amount > 0 && daysElapsedSinceDeposit > 0)
              ? row.amount * (Math.pow(1 + row.rate / 100, daysElapsedSinceDeposit / 365) - 1)
              : 0;
            const showProjected = projectedReturn > 0.00001;

            return (
              <div key={row.code} className="grid grid-cols-[1.15fr_1fr_1fr] gap-3 border-b border-tts-border px-3 py-3 last:border-b-0 md:grid-cols-[1.15fr_1fr_1fr_0.8fr_1fr]">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-tts-deep">{row.profile.short}</p>
                  <p className="truncate text-xs font-semibold text-tts-muted">{profileName(row.profile, language)}</p>
                </div>
                <div>
                  <p className="text-sm font-black text-tts-deep">{formatChartAmount(row.amount, row.profile, language)}</p>
                  <p className="text-[10px] font-semibold text-tts-muted">{isTestnet ? L("Testnet", "Testnet") : L("Rede ativa", "Live")}</p>
                </div>
                <div>
                  {showProjected ? (
                    <>
                      <p className="text-sm font-black text-tts-confirm">~{formatSignedAmount(projectedReturn, row.profile, language)}</p>
                      <p className="text-[10px] font-bold text-tts-confirm">~{formatReturnPercent(periodReturnPercent(row.rate, daysElapsedSinceDeposit / 365), language)}</p>
                      <p className="mt-0.5 text-[9px] font-semibold text-tts-muted uppercase tracking-wide">{L("projetado", "projected")}</p>
                    </>
                  ) : (
                    <>
                      <p className={`text-sm font-black ${tone}`}>{formatSignedAmount(analysis.change, row.profile, language)}</p>
                      <p className={`text-[10px] font-bold ${tone}`}>{formatSignedPercent(analysis.changePercent, language)}</p>
                    </>
                  )}
                  {hasIgnoredCashflow ? (
                    <p className="mt-0.5 truncate text-[10px] font-semibold text-tts-muted">
                      {L("Fluxo ignorado", "Cash flow ignored")}: {formatSignedAmount(analysis.cashflowChange, row.profile, language)}
                    </p>
                  ) : null}
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-black text-tts-deep">{analysis.pointCount}</p>
                  <p className="text-[10px] font-semibold text-tts-muted">{isPortuguese(language) ? activeWindow.detailPt : activeWindow.detailEn}</p>
                </div>
                <div className="hidden min-w-0 md:block">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-tts-muted" />
                    <p className="truncate text-xs font-bold text-tts-deep">
                      {analysis.lastPoint ? formatChartDate(analysis.lastPoint.date, language) : L("Sem histórico", "No history")}
                    </p>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] font-semibold text-tts-muted">
                    {analysis.lastPoint?.action ? L(analysis.lastPoint.action === "deposit" ? "Aplicação" : "Resgate", analysis.lastPoint.action === "deposit" ? "Deposit" : "Withdraw") : L("Saldo atual", "Current balance")}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ApplyTab({ language, session, sessionLoading, apiState, amount, onAmountChange, amountPresets, action, onActionChange, selectedCode, selectedOption, selectedProfile, options, onSelectCode, selectedHasYield, selectedExecutionBlocked, selectedBalanceInsufficient, balanceForSelected, alternativeConversionCode, activeStep, setActiveStep, yieldResult, canPrepare, confirmationEnabled, configured, pin, onPinChange, variationBps, onVariationBpsChange, onPrepare, onConfirm, convertAssetsUrl, pixTopUpUrl }: {
  language: AppLanguage; session: SessionState; sessionLoading: boolean; apiState: ApiState;
  amount: string; onAmountChange: (v: string) => void; amountPresets: string[];
  action: "deposit" | "withdraw"; onActionChange: (v: "deposit" | "withdraw") => void;
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
          <div className="flex border border-tts-border p-0.5">
            <button onClick={() => onActionChange("deposit")}
              className={`flex-1 py-2.5 text-sm font-bold text-center transition ${action === "deposit" ? "bg-tts-deep text-tts-surface" : "text-tts-muted"}`}>
              <ArrowDownToLine className="inline h-4 w-4 mr-1.5" />{L("Investir", "Invest")}
            </button>
            <button onClick={() => onActionChange("withdraw")}
              className={`flex-1 py-2.5 text-sm font-bold text-center transition ${action === "withdraw" ? "bg-tts-deep text-tts-surface" : "text-tts-muted"}`}>
              <ArrowUpFromLine className="inline h-4 w-4 mr-1.5" />{L("Retirar", "Withdraw")}
            </button>
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

// ── Inline Soroswap swap widget ──────────────────────────────────────────────

function SwapInlinePanel({ language }: { language: AppLanguage }) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);

  const [assetIn, setAssetIn] = useState("XLM");
  const [assetOut, setAssetOut] = useState("USDC");
  const [amount, setAmount] = useState("10");
  const [tradeType, setTradeType] = useState<"EXACT_IN" | "EXACT_OUT">("EXACT_IN");

  const [quote, setQuote] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [errQuote, setErrQuote] = useState<string | null>(null);

  const [xdrResult, setXdrResult] = useState<any>(null);
  const [loadingXdr, setLoadingXdr] = useState(false);
  const [errXdr, setErrXdr] = useState<string | null>(null);

  const [walletAddress, setWalletAddress] = useState("");
  const [walletNetwork, setWalletNetwork] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [errWallet, setErrWallet] = useState<string | null>(null);

  const [signedXdr, setSignedXdr] = useState("");
  const [signing, setSigning] = useState(false);
  const [errSign, setErrSign] = useState<string | null>(null);

  const [submitResult, setSubmitResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errSubmit, setErrSubmit] = useState<string | null>(null);

  const [swapNetwork, setSwapNetwork] = useState<"TESTNET" | "PUBLIC">("TESTNET");

  const [lpPool, setLpPool] = useState<{ fee_bp?: number; reserves?: Array<{ asset: string; amount: string }>; pool_id?: string } | null>(null);

  useEffect(() => {
    fetch("/api/swap/pool-info?network=mainnet", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setLpPool(d); })
      .catch(() => {});
  }, []);

  const PAIRS = [
    { from: "XLM", to: "USDC" },
    { from: "USDC", to: "XLM" },
  ];

  function resetBuild() {
    setXdrResult(null);
    setSignedXdr("");
    setSubmitResult(null);
    setErrXdr(null);
    setErrSign(null);
    setErrSubmit(null);
  }

  function shortAddr(addr: string) {
    if (!addr) return "";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  function netPassphrase(net: string) {
    return net === "TESTNET"
      ? "Test SDF Network ; September 2015"
      : "Public Global Stellar Network ; September 2015";
  }

  async function getQuote() {
    setLoadingQuote(true);
    setErrQuote(null);
    setQuote(null);
    resetBuild();
    try {
      const qs = new URLSearchParams({ assetIn, assetOut, amount, tradeType });
      const res = await fetch(`/api/swap/quote?${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.network) setSwapNetwork(data.network === "testnet" ? "TESTNET" : "PUBLIC");
      setQuote(data);
    } catch (e: any) {
      setErrQuote(e.message);
    } finally {
      setLoadingQuote(false);
    }
  }

  async function buildXdr() {
    if (!quote || !walletAddress) return;
    setLoadingXdr(true);
    setErrXdr(null);
    resetBuild();
    try {
      const res = await fetch("/api/swap/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote, senderAddress: walletAddress }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.network) setSwapNetwork(data.network === "testnet" ? "TESTNET" : "PUBLIC");
      setXdrResult(data);
    } catch (e: any) {
      setErrXdr(e.message);
    } finally {
      setLoadingXdr(false);
    }
  }

  async function connectFreighter() {
    setConnecting(true);
    setErrWallet(null);
    try {
      const f = await import("@stellar/freighter-api");
      const connected = await f.isConnected();
      if (!connected.isConnected) throw new Error("Freighter extension not installed.");
      const access = await f.requestAccess();
      if (!access.address) throw new Error("Freighter did not return a public key.");
      const net = await f.getNetwork();
      setWalletAddress(access.address);
      setWalletNetwork(net.network || "");
    } catch (e: any) {
      setErrWallet(e.message);
    } finally {
      setConnecting(false);
    }
  }

  async function signWithFreighter() {
    if (!xdrResult?.xdr || !walletAddress) return;
    setSigning(true);
    setErrSign(null);
    setSignedXdr("");
    setSubmitResult(null);
    try {
      const f = await import("@stellar/freighter-api");
      const pass = xdrResult.networkPassphrase || netPassphrase(swapNetwork);
      const result = await f.signTransaction(xdrResult.xdr, { networkPassphrase: pass, address: walletAddress });
      if (!result.signedTxXdr) throw new Error("Freighter did not return signed XDR.");
      setSignedXdr(result.signedTxXdr);
    } catch (e: any) {
      setErrSign(e.message);
    } finally {
      setSigning(false);
    }
  }

  async function submitSwap() {
    if (!signedXdr) return;
    setSubmitting(true);
    setErrSubmit(null);
    setSubmitResult(null);
    try {
      const res = await fetch("/api/swap/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setSubmitResult(data);
    } catch (e: any) {
      setErrSubmit(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const walletNetOk = !walletNetwork || (walletNetwork.toUpperCase().includes("TEST") ? "TESTNET" : "PUBLIC") === swapNetwork;

  return (
    <div className="space-y-5">
      <div className="border border-tts-border bg-tts-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("Trocar tokens", "Swap tokens")}</p>
            <h3 className="text-lg font-bold mt-0.5">{L("Swap via DEX", "Swap via DEX")}</h3>
          </div>
          <span className="rounded border border-tts-border px-2 py-1 text-[10px] font-bold uppercase text-tts-muted">{swapNetwork}</span>
        </div>

        {/* Pair quick-select */}
        <div className="flex gap-2 mb-3">
          {PAIRS.map((p) => (
            <button
              key={`${p.from}-${p.to}`}
              onClick={() => { setAssetIn(p.from); setAssetOut(p.to); resetBuild(); setQuote(null); setErrQuote(null); }}
              className={`rounded border px-3 py-1.5 text-xs font-bold transition ${assetIn === p.from && assetOut === p.to ? "border-tts-deep bg-tts-deep text-tts-surface" : "border-tts-border text-tts-muted hover:border-tts-deep"}`}
            >
              {p.from} → {p.to}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block mb-1 text-xs font-bold text-tts-muted uppercase">{L("De", "From")}</label>
            <input value={assetIn} onChange={(e) => { setAssetIn(e.target.value.toUpperCase()); resetBuild(); setQuote(null); }} className="w-full border border-tts-border bg-tts-bg px-3 py-2 text-sm font-bold outline-none focus:border-tts-deep" />
          </div>
          <div>
            <label className="block mb-1 text-xs font-bold text-tts-muted uppercase">{L("Para", "To")}</label>
            <input value={assetOut} onChange={(e) => { setAssetOut(e.target.value.toUpperCase()); resetBuild(); setQuote(null); }} className="w-full border border-tts-border bg-tts-bg px-3 py-2 text-sm font-bold outline-none focus:border-tts-deep" />
          </div>
          <div>
            <label className="block mb-1 text-xs font-bold text-tts-muted uppercase">{L("Valor", "Amount")}</label>
            <input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); resetBuild(); setQuote(null); }} className="w-full border border-tts-border bg-tts-bg px-3 py-2 text-sm font-bold outline-none focus:border-tts-deep" />
          </div>
        </div>

        {/* Trade type */}
        <div className="flex gap-2 mb-4">
          {(["EXACT_IN", "EXACT_OUT"] as const).map((t) => (
            <button key={t} onClick={() => { setTradeType(t); resetBuild(); setQuote(null); }}
              className={`rounded border px-3 py-1 text-xs font-bold transition ${tradeType === t ? "border-tts-deep bg-tts-deep text-tts-surface" : "border-tts-border text-tts-muted"}`}>
              {t === "EXACT_IN" ? L("Exato entrada", "Exact in") : L("Exato saída", "Exact out")}
            </button>
          ))}
        </div>

        {/* Freighter Wallet — always visible so user can connect before getting a quote */}
        <div className="rounded border border-tts-border bg-tts-bg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-tts-muted uppercase">{L("Carteira Freighter", "Freighter Wallet")}</p>
            {walletAddress
              ? <span className="text-xs font-bold text-tts-confirm">{walletNetwork || "Connected"}</span>
              : <span className="text-xs font-bold text-tts-gold">{L("Não conectada", "Not connected")}</span>}
          </div>
          {walletAddress ? (
            <p className="font-mono text-xs text-tts-muted break-all">{walletAddress}</p>
          ) : (
            <button onClick={connectFreighter} disabled={connecting}
              className="flex w-full items-center justify-center gap-2 border border-tts-border py-2 text-xs font-bold disabled:opacity-40 hover:bg-tts-bg transition">
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
              {L("Conectar Freighter", "Connect Freighter")}
            </button>
          )}
          {errWallet && <p className="mt-2 text-xs text-red-400">{errWallet}</p>}
          {!walletNetOk && <p className="mt-2 text-xs text-tts-gold">{L(`Freighter está na rede ${walletNetwork}; mude para ${swapNetwork}.`, `Freighter is on ${walletNetwork}; switch to ${swapNetwork}.`)}</p>}
        </div>

        {/* Step 1: Quote */}
        <button onClick={getQuote} disabled={loadingQuote}
          className="flex w-full items-center justify-center gap-2 bg-tts-deep py-3 text-sm font-bold text-tts-surface disabled:opacity-40 mb-3">
          {loadingQuote ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
          {L("1 — Obter cotação", "1 — Get quote")}
        </button>

        {errQuote && (
          <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 mb-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {errQuote}
          </div>
        )}

        {quote && (
          <div className="rounded border border-tts-border bg-tts-bg p-3 mb-4 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-tts-muted">{L("Você envia", "You send")}</span><span className="font-bold">{quote.amountIn} {quote.assetIn || assetIn}</span></div>
            <div className="flex justify-between text-xs"><span className="text-tts-muted">{L("Você recebe", "You receive")}</span><span className="font-bold text-tts-confirm">{quote.amountOut} {quote.assetOut || assetOut}</span></div>
            {quote.priceImpact != null && <div className="flex justify-between text-xs"><span className="text-tts-muted">{L("Impacto", "Impact")}</span><span className="font-bold">{Number(quote.priceImpact).toFixed(4)}%</span></div>}
            {quote.protocols && <div className="flex justify-between text-xs"><span className="text-tts-muted">{L("Protocolos", "Protocols")}</span><span className="font-bold">{Array.isArray(quote.protocols) ? quote.protocols.join(", ") : quote.protocols}</span></div>}
            {quote.warning && <p className="text-xs text-tts-muted/70 pt-1">ℹ️ {quote.warning}</p>}
          </div>
        )}

        {/* Step 2: Build */}
        {quote && walletAddress && walletNetOk && (
          <div className="space-y-3 mb-3">
            <button onClick={buildXdr} disabled={loadingXdr}
              className="flex w-full items-center justify-center gap-2 border border-tts-deep py-3 text-sm font-bold disabled:opacity-40 hover:bg-tts-bg transition">
              {loadingXdr ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {L(`2 — Preparar transação (${shortAddr(walletAddress)})`, `2 — Build XDR (${shortAddr(walletAddress)})`)}
            </button>
            {errXdr && <p className="text-xs text-red-400">{errXdr}</p>}
          </div>
        )}
        {quote && !walletAddress && (
          <p className="text-xs text-tts-gold mb-3">{L("Conecte o Freighter acima para continuar.", "Connect Freighter above to continue.")}</p>
        )}

        {/* Step 3: Sign */}
        {xdrResult?.xdr && (
          <div className="space-y-3 mt-3">
            <div className="rounded border border-tts-border bg-tts-bg p-3">
              <p className="text-xs font-bold text-tts-muted mb-1">{L("XDR não assinado", "Unsigned XDR")}</p>
              <p className="max-h-14 overflow-y-auto break-all font-mono text-[10px] text-tts-muted/70">{xdrResult.xdr}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={signWithFreighter} disabled={signing || !walletAddress}
                className="flex items-center justify-center gap-2 bg-tts-deep py-3 text-sm font-bold text-tts-surface disabled:opacity-40">
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {L("3 — Assinar", "3 — Sign")}
              </button>
              <a href={`https://lab.stellar.org/transaction/sign?xdr=${encodeURIComponent(xdrResult.xdr)}&networkPassphrase=${encodeURIComponent(xdrResult.networkPassphrase || netPassphrase(swapNetwork))}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-tts-border py-3 text-sm font-bold hover:bg-tts-bg transition">
                <ExternalLink className="h-4 w-4" /> {L("Stellar Lab", "Stellar Lab")}
              </a>
            </div>
            {errSign && <p className="text-xs text-red-400">{errSign}</p>}
            {signedXdr && (
              <div className="flex items-center gap-2 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-tts-confirm shrink-0" />
                {L(`Assinado por ${shortAddr(walletAddress)}`, `Signed by ${shortAddr(walletAddress)}`)}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Submit */}
        {signedXdr && (
          <div className="space-y-3 mt-3">
            <button onClick={submitSwap} disabled={submitting}
              className="flex w-full items-center justify-center gap-2 bg-tts-deep py-3 text-sm font-bold text-tts-surface disabled:opacity-40">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {L("4 — Enviar para Stellar", "4 — Submit to Stellar")}
            </button>
            {errSubmit && <p className="text-xs text-red-400">{errSubmit}</p>}
            {submitResult && (
              <div className="rounded border border-tts-confirm/30 bg-tts-confirm/10 p-3 space-y-1">
                <div className="flex justify-between text-xs"><span className="text-tts-muted">{L("Status", "Status")}</span><span className="font-bold text-tts-confirm">{submitResult.successful ? "✓ Sucesso" : "Falha"}</span></div>
                {submitResult.hash && <div className="flex justify-between text-xs"><span className="text-tts-muted">Hash</span><span className="font-mono font-bold">{submitResult.hash.slice(0, 16)}…</span></div>}
                {submitResult.ledger && <div className="flex justify-between text-xs"><span className="text-tts-muted">Ledger</span><span className="font-bold">{submitResult.ledger}</span></div>}
                {submitResult.hash && (
                  <a href={`https://stellar.expert/explorer/testnet/tx/${submitResult.hash}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-tts-primary hover:underline mt-1">
                    <ExternalLink className="h-3 w-3" /> {L("Ver no StellarExpert", "View on StellarExpert")}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* LP Yield */}
      <div className="border border-tts-border bg-tts-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("Rendimento via liquidez", "Liquidity yield")}</p>
            <h3 className="text-lg font-bold mt-0.5">{L("Fornecer Liquidez", "Provide Liquidity")}</h3>
          </div>
          <span className="rounded border border-tts-border px-2 py-1 text-[10px] font-bold uppercase text-tts-gold">{L("Avançado", "Advanced")}</span>
        </div>

        <p className="text-xs text-tts-muted mb-3">
          {L(
            `Além de trocar, você pode fornecer liquidez no par ${assetIn}/${assetOut} e ganhar uma parte das taxas de cada swap realizado.`,
            `Beyond swapping, you can provide ${assetIn}/${assetOut} liquidity and earn a share of fees from every trade.`
          )}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="rounded border border-tts-border bg-tts-bg p-3 text-center">
            <p className="text-[10px] font-bold uppercase text-tts-muted mb-1">{L("Taxa por swap", "Fee per swap")}</p>
            <p className="text-xl font-bold text-tts-confirm">{((lpPool?.fee_bp ?? 30) / 100).toFixed(1)}%</p>
          </div>
          {lpPool?.reserves?.length ? (
            <div className="rounded border border-tts-border bg-tts-bg p-3 text-center">
              <p className="text-[10px] font-bold uppercase text-tts-muted mb-1">{L("Liquidez (mainnet)", "Liquidity (mainnet)")}</p>
              {lpPool.reserves.map((r) => (
                <p key={r.asset} className="text-xs font-bold">
                  {parseFloat(r.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} {r.asset === "native" ? "XLM" : r.asset.split(":")[0]}
                </p>
              ))}
            </div>
          ) : (
            <div className="rounded border border-tts-border bg-tts-bg p-3 text-center">
              <p className="text-[10px] font-bold uppercase text-tts-muted mb-1">{L("Rendimento", "Return")}</p>
              <p className="text-xs text-tts-muted">{L("Proporcional ao volume", "Proportional to volume")}</p>
            </div>
          )}
        </div>

        <a
          href="https://app.soroswap.finance/liquidity"
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 border border-tts-border py-2.5 text-xs font-bold hover:bg-tts-bg transition"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {L("Ver pools de liquidez →", "View liquidity pools →")}
        </a>
      </div>

      <p className="text-center text-xs text-tts-muted">
        {L("Troca via DEX. Após trocar, vá para Aplicar para depositar na vault.", "Swap via DEX. After swapping, go to Apply to deposit into the vault.")}
      </p>
    </div>
  );
}

// ── Blend v2 Lending Panel ─────────────────────────────────────────────────
function BlendInlinePanel({ language }: { language: AppLanguage }) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);

  // Pool / APY
  const [poolInfo, setPoolInfo] = useState<any>(null);
  const [loadingPool, setLoadingPool] = useState(false);
  const [errPool, setErrPool] = useState<string | null>(null);

  // Freighter wallet
  const [walletAddress, setWalletAddress] = useState("");
  const [walletNetwork, setWalletNetwork] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [errWallet, setErrWallet] = useState<string | null>(null);

  // User position
  const [position, setPosition] = useState<any>(null);
  const [loadingPos, setLoadingPos] = useState(false);

  // Supply / Withdraw
  const [mode, setMode] = useState<"supply" | "withdraw">("supply");
  const [supplyAmount, setSupplyAmount] = useState("10");
  const [xdrResult, setXdrResult] = useState<any>(null);
  const [loadingXdr, setLoadingXdr] = useState(false);
  const [errXdr, setErrXdr] = useState<string | null>(null);

  const [signedXdr, setSignedXdr] = useState("");
  const [signing, setSigning] = useState(false);
  const [errSign, setErrSign] = useState<string | null>(null);

  const [submitResult, setSubmitResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errSubmit, setErrSubmit] = useState<string | null>(null);

  // Auto-apply preference
  const [autoApply, setAutoApply] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("blend_auto_apply") === "1";
  });

  function toggleAutoApply() {
    const next = !autoApply;
    setAutoApply(next);
    if (typeof window !== "undefined") localStorage.setItem("blend_auto_apply", next ? "1" : "0");
  }

  function resetBuild() {
    setXdrResult(null); setSignedXdr(""); setSubmitResult(null);
    setErrXdr(null); setErrSign(null); setErrSubmit(null);
  }

  function shortAddr(addr: string) { return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ""; }

  // ── Load pool APY ──────────────────────────────────────────────────────
  async function loadPool() {
    setLoadingPool(true); setErrPool(null);
    try {
      const res = await fetch("/api/blend/pool/info");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setPoolInfo(data);
    } catch (e: any) {
      setErrPool(e.message);
    } finally { setLoadingPool(false); }
  }

  useEffect(() => { loadPool(); }, []);

  // ── Connect Freighter ──────────────────────────────────────────────────
  async function connectFreighter() {
    setConnecting(true); setErrWallet(null);
    try {
      const f = (window as any).freighterApi || (await import("@stellar/freighter-api").catch(() => null));
      if (!f) throw new Error("Freighter não instalado.");
      const conn = await f.requestAccess();
      if (conn.error) throw new Error(conn.error);
      const net = await f.getNetwork();
      const addr = conn.address || (await f.getPublicKey?.()) || "";
      setWalletAddress(addr);
      setWalletNetwork(String(net.network || net || "").toUpperCase());
    } catch (e: any) { setErrWallet(e.message); }
    finally { setConnecting(false); }
  }

  // ── Load user position ─────────────────────────────────────────────────
  async function loadPosition() {
    if (!walletAddress) return;
    setLoadingPos(true);
    try {
      const network = walletNetwork.includes("TEST") ? "testnet" : "mainnet";
      const res = await fetch(`/api/blend/pool/position?address=${walletAddress}&network=${network}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && !data.error) setPosition(data);
    } catch { /* silent */ }
    finally { setLoadingPos(false); }
  }

  useEffect(() => { if (walletAddress) loadPosition(); }, [walletAddress]);

  // ── Build XDR ─────────────────────────────────────────────────────────
  async function buildXdr() {
    if (!walletAddress || !poolInfo?.usdc?.assetId) return;
    resetBuild(); setLoadingXdr(true); setErrXdr(null);
    try {
      const amountStroops = Math.round(parseFloat(supplyAmount) * 1e7).toString();
      const network = walletNetwork.includes("TEST") ? "testnet" : "mainnet";
      const endpoint = mode === "supply" ? "/api/blend/pool/supply" : "/api/blend/pool/withdraw";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_address: walletAddress,
          asset_id: poolInfo.usdc.assetId,
          amount: amountStroops,
          network,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setXdrResult(data);
    } catch (e: any) { setErrXdr(e.message); }
    finally { setLoadingXdr(false); }
  }

  // ── Sign with Freighter ────────────────────────────────────────────────
  async function signWithFreighter() {
    if (!xdrResult?.xdr) return;
    setSigning(true); setErrSign(null);
    try {
      const f = (window as any).freighterApi || (await import("@stellar/freighter-api").catch(() => null));
      if (!f) throw new Error("Freighter não disponível.");
      const pass = xdrResult.networkPassphrase;
      const result = await f.signTransaction(xdrResult.xdr, { networkPassphrase: pass, address: walletAddress });
      if (!result.signedTxXdr) throw new Error("Freighter não retornou XDR assinado.");
      setSignedXdr(result.signedTxXdr);
    } catch (e: any) { setErrSign(e.message); }
    finally { setSigning(false); }
  }

  // ── Submit ─────────────────────────────────────────────────────────────
  async function submitTx() {
    if (!signedXdr) return;
    setSubmitting(true); setErrSubmit(null); setSubmitResult(null);
    try {
      const res = await fetch("/api/swap/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setSubmitResult(data);
      await loadPosition();
    } catch (e: any) { setErrSubmit(e.message); }
    finally { setSubmitting(false); }
  }

  const usdcApy = poolInfo?.usdc?.supplyApy ?? null;
  const userSupply = position?.positions?.find((p: any) => p.assetId === poolInfo?.usdc?.assetId)?.supply ?? null;
  const explorerNet = (walletNetwork || "PUBLIC").includes("TEST") ? "testnet" : "public";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border border-tts-border bg-tts-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("Empréstimos & Rendimentos", "Lending & Yield")}</p>
            <h3 className="text-lg font-bold mt-0.5">{L("Aplicar no Blend v2", "Supply to Blend v2")}</h3>
          </div>
          <div className="flex flex-col items-end gap-1">
            {usdcApy !== null ? (
              <span className="rounded border border-tts-confirm/40 bg-tts-confirm/10 px-2 py-1 text-xs font-bold text-tts-confirm">
                USDC {usdcApy.toFixed(2)}% APY
              </span>
            ) : loadingPool ? (
              <Loader2 className="h-4 w-4 animate-spin text-tts-muted" />
            ) : (
              <button onClick={loadPool} className="text-xs text-tts-primary hover:underline">{L("Ver APY", "View APY")}</button>
            )}
            {poolInfo?.network && (
              <span className="text-[10px] font-bold uppercase text-tts-muted">{poolInfo.network}</span>
            )}
          </div>
        </div>

        {errPool && (
          <div className="flex items-center gap-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400 mb-3">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {errPool}
          </div>
        )}

        {/* Reserves summary */}
        {poolInfo?.reserves && poolInfo.reserves.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {poolInfo.reserves.slice(0, 4).map((r: any) => (
              <div key={r.assetId} className="rounded border border-tts-border bg-tts-bg p-2">
                <p className="text-[10px] font-bold uppercase text-tts-muted mb-0.5">{r.assetId.slice(0, 8)}…</p>
                <p className="text-sm font-bold text-tts-confirm">{r.supplyApy.toFixed(2)}% <span className="text-tts-muted font-normal text-[10px]">APY</span></p>
                <p className="text-[10px] text-tts-muted">{L(`Util. ${r.utilization.toFixed(1)}%`, `Util. ${r.utilization.toFixed(1)}%`)}</p>
              </div>
            ))}
          </div>
        )}

        {/* Freighter */}
        <div className="rounded border border-tts-border bg-tts-bg p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-tts-muted uppercase">{L("Carteira Freighter", "Freighter Wallet")}</p>
            {walletAddress
              ? <span className="text-xs font-bold text-tts-confirm">{walletNetwork || "Conectada"}</span>
              : <span className="text-xs font-bold text-tts-gold">{L("Não conectada", "Not connected")}</span>}
          </div>
          {walletAddress ? (
            <div className="space-y-1">
              <p className="font-mono text-xs text-tts-muted break-all">{walletAddress}</p>
              {userSupply !== null && (
                <p className="text-xs font-bold">
                  {L("Aplicado: ", "Supplied: ")}
                  <span className="text-tts-confirm">{userSupply.toFixed(4)} USDC</span>
                </p>
              )}
              {loadingPos && <Loader2 className="h-3 w-3 animate-spin text-tts-muted" />}
            </div>
          ) : (
            <button onClick={connectFreighter} disabled={connecting}
              className="flex w-full items-center justify-center gap-2 border border-tts-border py-2 text-xs font-bold disabled:opacity-40 hover:bg-tts-surface transition">
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
              {L("Conectar Freighter", "Connect Freighter")}
            </button>
          )}
          {errWallet && <p className="mt-2 text-xs text-red-400">{errWallet}</p>}
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-3">
          {(["supply", "withdraw"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); resetBuild(); }}
              className={`rounded border px-3 py-1.5 text-xs font-bold transition ${mode === m ? "border-tts-deep bg-tts-deep text-tts-surface" : "border-tts-border text-tts-muted hover:border-tts-deep"}`}>
              {m === "supply" ? L("Aplicar", "Supply") : L("Retirar", "Withdraw")}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div className="mb-3">
          <label className="block mb-1 text-xs font-bold text-tts-muted uppercase">{L("Valor USDC", "USDC Amount")}</label>
          <input type="number" value={supplyAmount} onChange={(e) => { setSupplyAmount(e.target.value); resetBuild(); }}
            className="w-full border border-tts-border bg-tts-bg px-3 py-2 text-sm font-bold outline-none focus:border-tts-deep" />
        </div>

        {/* Auto-apply toggle */}
        <label className="flex items-center gap-3 cursor-pointer mb-4 select-none">
          <div className={`relative w-10 h-5 rounded-full transition ${autoApply ? "bg-tts-deep" : "bg-tts-border"}`}
            onClick={toggleAutoApply}>
            <div className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${autoApply ? "translate-x-5" : ""}`} />
          </div>
          <span className="text-xs font-bold text-tts-muted">
            {L("Aplicar automaticamente ao receber USDC", "Auto-apply on USDC deposit")}
          </span>
        </label>

        {/* Step 1: Build XDR */}
        {walletAddress && (
          <button onClick={buildXdr} disabled={loadingXdr || !supplyAmount}
            className="flex w-full items-center justify-center gap-2 bg-tts-deep py-3 text-sm font-bold text-tts-surface disabled:opacity-40 mb-3">
            {loadingXdr ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
            {L(`1 — Preparar ${mode === "supply" ? "aplicação" : "retirada"}`, `1 — Build ${mode === "supply" ? "supply" : "withdraw"}`)}
          </button>
        )}
        {errXdr && (
          <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400 mb-3">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {errXdr}
          </div>
        )}

        {/* XDR preview */}
        {xdrResult?.xdr && (
          <div className="space-y-3 mb-3">
            <div className="rounded border border-tts-border bg-tts-bg p-2">
              <p className="text-[10px] font-bold uppercase text-tts-muted mb-1">{L("Transação pronta", "Transaction ready")} · {xdrResult.network}</p>
              <p className="max-h-12 overflow-y-auto break-all font-mono text-[9px] text-tts-muted/60">{xdrResult.xdr.slice(0, 120)}…</p>
            </div>

            {/* Step 2: Sign */}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={signWithFreighter} disabled={signing}
                className="flex items-center justify-center gap-2 bg-tts-deep py-3 text-sm font-bold text-tts-surface disabled:opacity-40">
                {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {L("2 — Assinar", "2 — Sign")}
              </button>
              <a href={`https://lab.stellar.org/transaction/sign?xdr=${encodeURIComponent(xdrResult.xdr)}&networkPassphrase=${encodeURIComponent(xdrResult.networkPassphrase || "")}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 border border-tts-border py-3 text-sm font-bold hover:bg-tts-bg transition">
                <ExternalLink className="h-4 w-4" /> Stellar Lab
              </a>
            </div>
            {errSign && <p className="text-xs text-red-400">{errSign}</p>}

            {signedXdr && (
              <div className="flex items-center gap-2 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-2 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-tts-confirm shrink-0" />
                {L(`Assinado por ${shortAddr(walletAddress)}`, `Signed by ${shortAddr(walletAddress)}`)}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Submit */}
        {signedXdr && (
          <div className="space-y-2">
            <button onClick={submitTx} disabled={submitting}
              className="flex w-full items-center justify-center gap-2 bg-tts-deep py-3 text-sm font-bold text-tts-surface disabled:opacity-40">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              {L("3 — Enviar para Blend", "3 — Submit to Blend")}
            </button>
            {errSubmit && <p className="text-xs text-red-400">{errSubmit}</p>}
            {submitResult && (
              <div className="rounded border border-tts-confirm/30 bg-tts-confirm/10 p-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-tts-muted">Status</span>
                  <span className="font-bold text-tts-confirm">{submitResult.successful ? "✓ Confirmado" : "Falhou"}</span>
                </div>
                {submitResult.hash && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span className="text-tts-muted">Hash</span>
                      <span className="font-mono font-bold">{submitResult.hash.slice(0, 16)}…</span>
                    </div>
                    <a href={`https://stellar.expert/explorer/${explorerNet}/tx/${submitResult.hash}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-tts-primary hover:underline mt-1">
                      <ExternalLink className="h-3 w-3" /> {L("Ver no StellarExpert", "View on StellarExpert")}
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-tts-muted">
        {L("Blend v2 — protocolo de empréstimos na Stellar. APY variável baseado na demanda de empréstimos.", "Blend v2 — lending protocol on Stellar. Variable APY based on borrower demand.")}
      </p>
    </div>
  );
}
