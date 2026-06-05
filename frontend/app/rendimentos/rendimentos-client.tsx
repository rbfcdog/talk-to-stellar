"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BadgeCheck,
  CheckCircle2,
  Coins,
  FileCheck2,
  HelpCircle,
  Loader2,
  LockKeyhole,
  Plus,
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
import { extractDefindexPositionAmount } from "@/lib/defindex-position";
import { useLanguage, type AppLanguage } from "@/lib/i18n";
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
  return new Intl.NumberFormat(isPortuguese(language) ? "pt-BR" : "en-US", { minimumFractionDigits: p > 0 && p < 1 ? 4 : 2, maximumFractionDigits: 7 }).format(p);
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

function buildGrowthPathPoints(amount: number, ratePercent: number, language: AppLanguage): ChartPoint[] {
  const base = Math.max(0, amount);
  const annualRate = Math.max(0, ratePercent) / 100;
  const labels = [
    { days: 0, label: localCopy(language, "Hoje", "Today") },
    { days: 30, label: "30d" },
    { days: 90, label: "90d" },
    { days: 180, label: "6m" },
    { days: 365, label: "12m" },
  ];
  return labels.map((item) => ({
    label: item.label,
    value: annualRate > 0 ? base * Math.pow(1 + annualRate, item.days / 365) : base,
  }));
}

function buildPositionLinePoints(history: PositionHistoryState | undefined, currentAmount: number, language: AppLanguage): ChartPoint[] {
  const sorted = [...(history?.points || [])]
    .filter((point) => Number.isFinite(Date.parse(String(point.date || ""))))
    .sort((a, b) => Date.parse(String(a.date || "")) - Date.parse(String(b.date || "")));

  const points: ChartPoint[] = sorted.map((point) => ({
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

  return [30, 14, 7, 0].map((daysAgo) => ({
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
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 6, bottom: 0, left: 6 }}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "rgba(113, 113, 122, 0.25)", strokeWidth: 1 }}
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
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: stroke }}
            isAnimationActive
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function InvestmentGraphs({ language, row }: { language: AppLanguage; row: InvestmentRow }) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const growthPoints = buildGrowthPathPoints(row.amount, row.rate, language);
  const historyPoints = buildPositionLinePoints(row.history, row.amount, language);
  const growthValue = growthPoints[growthPoints.length - 1]?.value || row.amount;
  const hasMovements = Boolean(row.history.points.length);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-tts-border bg-tts-bg p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-tts-muted">{L("Caminho estimado", "Growth path")}</p>
            <p className="mt-1 text-sm font-black text-tts-deep">{formatChartAmount(growthValue, row.profile, language)}</p>
          </div>
          <span className="text-xs font-black text-tts-confirm">
            {formatReturnPercent(periodReturnPercent(row.rate, 1), language)}
          </span>
        </div>
        <InvestmentLineChart data={growthPoints} profile={row.profile} language={language} tone="muted" />
      </div>

      <div className="rounded-2xl border border-tts-border bg-tts-bg p-3">
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

export default function RendimentosClient({
  initialLanguage, initialQuery, view: initialView = "returns",
}: {
  initialLanguage?: AppLanguage; initialQuery?: string; view?: "application" | "returns";
} = {}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const [tab, setTab] = useState<"returns" | "apply">(initialView === "application" ? "apply" : "returns");

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

  const options = useMemo(() => Array.isArray(yieldStatus?.vaults) ? yieldStatus.vaults : [], [yieldStatus]);
  const sortedOptions = useMemo(() => [...options], [options]);
  const bestOption = sortedOptions[0] || null;
  const selectedOption = useMemo(() => options.find((item) => optionCode(item) === selectedCode) || null, [options, selectedCode]);
  const actionableOption = selectedOption;
  const configured = Boolean(yieldStatus?.runtime?.configured);
  const confirmationEnabled = Boolean(yieldStatus?.runtime?.execution_enabled);
  const yieldNetwork = String(yieldStatus?.runtime?.network || "").toLowerCase();
  const isTestnetYield = yieldNetwork === "testnet" || Boolean(yieldStatus?.runtime?.disclosure?.testnet);

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
  const balanceForSelected = balances.find((item) => normalizeUiAssetCode(item.asset_code) === safeSelectedCode);
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

  useEffect(() => {
    if (loadedDataRef.current) return;
    loadedDataRef.current = true;
    (async () => {
      setApiState({ loading: true, message: "", error: "" });
      setSession((c) => ({ ...c, loading: true }));
      try {
        const statusPromise = yieldApi("defindex/yield/status", undefined, 12000).catch(() => ({ success: false, runtime: { configured: false, api_key_configured: false, execution_enabled: false }, vaults: [] }));
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
        const payload = await yieldApi(`defindex/yield/balance?asset_code=${encodeURIComponent(o.asset_code)}&vault_address=${encodeURIComponent(o.vault_address)}`, undefined, 22000, session.sessionSource);
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
      try {
        await refreshAccountBalances();
        setApiState({ loading: false, message: "", error: "" });
      } catch {
        setApiState({
          loading: false,
          message: "",
          error: L("PIN validado. Não consegui atualizar os saldos agora; tente atualizar em alguns segundos.", "PIN validated. I could not refresh balances right now; try again in a few seconds."),
        });
      }
    } catch (error) {
      setReturnsPinState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) });
    }
  }

  async function prepareYield() {
    if (!actionableOption) return;
    setApiState({ loading: true, message: "", error: "" });
    setYieldResult(null);
    try {
      const payload = await yieldApi("defindex/yield/prepare", { method: "POST", body: JSON.stringify({ action, amount, source_asset_code: safeSelectedCode, asset_code: actionableOption.asset_code, vault_address: actionableOption.vault_address, slippage_bps: variationBps }) }, 18000, session.sessionSource);
      setYieldResult(payload);
      setActiveStep("review");
      setApiState({ loading: false, message: payload?.execution_ready === false ? (String(payload?.execution_blocked_code || "") ? String(payload?.execution_blocked_reason || "") : "") : "", error: "" });
    } catch (error) { setApiState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) }); }
  }

  async function confirmYield() {
    if (!actionableOption || !yieldResult) return;
    setApiState({ loading: true, message: "", error: "" });
    try {
      const payload = await yieldApi("defindex/yield/execute", { method: "POST", body: JSON.stringify({ action, amount, source_asset_code: safeSelectedCode, asset_code: actionableOption.asset_code, vault_address: actionableOption.vault_address, slippage_bps: variationBps, pin, wallet_pin: pin }) }, 60000, session.sessionSource);
      setYieldResult(payload);
      setPin("");
      setSuccessNotice({ action, reviewedAmount: amount, reviewedAsset: selectedProfile.short, vaultAmount: String(payload?.amount || "").trim(), vaultAsset: String(payload?.vault?.display_asset_code || payload?.vault?.asset_code || "").trim(), hash: String(payload?.hash || "").trim() });
      setApiState({ loading: false, message: L("Operação confirmada.", "Operation confirmed."), error: "" });
    } catch (error) { setApiState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) }); }
  }

  return (
    <main className="tts-op-page min-h-screen bg-tts-bg text-tts-deep">
      {successNotice && <SuccessDialog language={language} notice={successNotice} returnsHref={returnsUrl} onClose={() => setSuccessNotice(null)} onRefresh={() => { setSuccessNotice(null); /* refresh */ }} />}

      <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 sm:py-8">
        <div className="tts-stage-strip mb-5 grid-cols-2">
          <button type="button" className="tts-stage-button" data-active={tab === "returns"} onClick={() => setTab("returns")}>{L("Rendimentos", "Returns")}</button>
          <button type="button" className="tts-stage-button" data-active={tab === "apply"} onClick={() => setTab("apply")}>{L("Aplicar", "Apply")}</button>
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

        {isTestnetYield && (
          <div className="flex items-center gap-2 mb-6 text-xs font-bold text-tts-muted">
            <AlertTriangle className="h-3.5 w-3.5 text-tts-gold" />
            <span>{L("Testnet · valores estimados", "Testnet · estimated values")}</span>
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
                positionBalances={positionBalances} positionHistories={positionHistories} isTestnet={isTestnetYield}
                onRefresh={() => {}} sessionLinkContext={sessionLinkContext}
              />
            )}

            {tab === "apply" && (
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

function CurrentInvestmentsPage({ language, session, sessionLoading, options, positionBalances, positionHistories, isTestnet, onRefresh, sessionLinkContext }: {
  language: AppLanguage; session: SessionState; sessionLoading: boolean;
  options: YieldOption[]; positionBalances: Record<string, PositionState>;
  positionHistories: Record<string, PositionHistoryState>;
  isTestnet: boolean; onRefresh: () => void; sessionLinkContext: Record<string, string>;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const rows = options.filter((o) => String(o.vault_address || "").trim()).map((o) => {
    const code = optionCode(o);
    const pos = positionBalances[code];
    const amt = normalizeDecimal(pos?.amount || "0");
    return {
      option: o,
      code,
      profile: moneyProfile(code),
      amount: amt,
      loading: Boolean(!pos || pos.loading),
      error: String(pos?.error || ""),
      source: String(pos?.source || ""),
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">{L("Linhas da carteira", "Portfolio lines")}</p>
            <p className="mt-1 text-sm font-semibold text-tts-muted">
              {L("Posição real por ativo. Cada cartão mostra também o caminho estimado.", "Real position by asset. Each card also shows the growth path.")}
            </p>
          </div>
          <span className="rounded-full border border-tts-border px-3 py-1 text-[11px] font-bold text-tts-muted">
            {isTestnet ? L("Testnet", "Testnet") : L("Atual", "Live")}
          </span>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.code} className="rounded-2xl border border-tts-border bg-tts-surface p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-tts-deep">{row.profile.short}</p>
                  <p className="text-xs font-semibold text-tts-muted">{profileName(row.profile, language)}</p>
                </div>
                <p className="text-xs font-black text-tts-confirm">{formatReturnPercent(periodReturnPercent(row.rate, 1), language)}</p>
              </div>
              <div className="mt-2">
                <InvestmentLineChart
                  data={buildPositionLinePoints(row.history, row.amount, language)}
                  profile={row.profile}
                  language={language}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-tts-muted">{L("Atual", "Current")}</span>
                <span className="font-black text-tts-deep">{formatChartAmount(row.amount, row.profile, language)}</span>
              </div>
            </div>
          ))}
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
