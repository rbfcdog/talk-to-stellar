"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  Coins,
  FileCheck2,
  Loader2,
  LockKeyhole,
  PiggyBank,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useLanguage, type AppLanguage } from "@/lib/i18n";
import { getClientSession } from "@/lib/session";

type ApiState = {
  loading: boolean;
  message: string;
  error: string;
};

type YieldStep = "wallet" | "plan" | "review";

type SessionState = {
  authenticated: boolean;
  sessionId?: string;
  loading?: boolean;
  checked?: boolean;
};

type BalanceLine = {
  asset_code: string;
  asset_type?: string;
  asset_issuer?: string;
  balance: string;
};

type YieldOption = {
  asset_code: string;
  asset_issuer?: string;
  display_asset_code?: string;
  vault_address: string;
  label: string;
  network: string;
  apy?: Record<string, unknown>;
  apy_percent?: string;
  apy_period?: string;
  apy_error?: string;
};

type YieldStatus = {
  success?: boolean;
  runtime?: {
    configured?: boolean;
    api_key_configured?: boolean;
    network?: string;
    execution_enabled?: boolean;
    unavailable_reason?: string;
  };
  vaults?: YieldOption[];
};

type MoneyProfile = {
  namePt: string;
  nameEn: string;
  short: string;
  descriptionPt: string;
  descriptionEn: string;
  tone: string;
};

const MONEY_PROFILES: Record<string, MoneyProfile> = {
  USDC: {
    namePt: "Dólares",
    nameEn: "Dollars",
    short: "USD",
    descriptionPt: "Para guardar em moeda forte.",
    descriptionEn: "For holding money in dollars.",
    tone: "border-tts-confirm/50 bg-tts-confirm/10 text-tts-confirm",
  },
  CETES: {
    namePt: "Rendimento México",
    nameEn: "Mexico yield",
    short: "CETES",
    descriptionPt: "Opção de teste com rendimento disponível.",
    descriptionEn: "A test option with yield available.",
    tone: "border-tts-gold/60 bg-tts-gold-bg text-tts-gold",
  },
  USD: {
    namePt: "Dólares",
    nameEn: "Dollars",
    short: "USD",
    descriptionPt: "Para guardar em moeda forte.",
    descriptionEn: "For holding money in dollars.",
    tone: "border-tts-confirm/50 bg-tts-confirm/10 text-tts-confirm",
  },
  GBP: {
    namePt: "Libras",
    nameEn: "Pounds",
    short: "GBP",
    descriptionPt: "Para objetivos no Reino Unido.",
    descriptionEn: "For goals linked to the UK.",
    tone: "border-tts-border2 bg-tts-surface text-tts-deep",
  },
  MXN: {
    namePt: "Pesos mexicanos",
    nameEn: "Mexican pesos",
    short: "MXN",
    descriptionPt: "Para saldos e objetivos no México.",
    descriptionEn: "For balances and goals in Mexico.",
    tone: "border-tts-confirm/50 bg-tts-confirm/10 text-tts-confirm",
  },
  ARS: {
    namePt: "Pesos argentinos",
    nameEn: "Argentine pesos",
    short: "ARS",
    descriptionPt: "Para saldos e objetivos na Argentina.",
    descriptionEn: "For balances and goals in Argentina.",
    tone: "border-tts-gold/60 bg-tts-gold-bg text-tts-gold",
  },
  CAD: {
    namePt: "Dólares canadenses",
    nameEn: "Canadian dollars",
    short: "CAD",
    descriptionPt: "Para objetivos no Canadá.",
    descriptionEn: "For goals linked to Canada.",
    tone: "border-tts-border2 bg-tts-surface text-tts-deep",
  },
  AUD: {
    namePt: "Dólares australianos",
    nameEn: "Australian dollars",
    short: "AUD",
    descriptionPt: "Para objetivos na Austrália.",
    descriptionEn: "For goals linked to Australia.",
    tone: "border-tts-border2 bg-tts-surface text-tts-deep",
  },
  CHF: {
    namePt: "Francos suíços",
    nameEn: "Swiss francs",
    short: "CHF",
    descriptionPt: "Para objetivos na Suíça.",
    descriptionEn: "For goals linked to Switzerland.",
    tone: "border-tts-border2 bg-tts-surface text-tts-deep",
  },
  JPY: {
    namePt: "Ienes",
    nameEn: "Yen",
    short: "JPY",
    descriptionPt: "Para objetivos no Japão.",
    descriptionEn: "For goals linked to Japan.",
    tone: "border-tts-border2 bg-tts-surface text-tts-deep",
  },
  EURC: {
    namePt: "Euros",
    nameEn: "Euros",
    short: "EUR",
    descriptionPt: "Para objetivos ligados à Europa.",
    descriptionEn: "For goals linked to Europe.",
    tone: "border-tts-gold/60 bg-tts-gold-bg text-tts-gold",
  },
  EUR: {
    namePt: "Euros",
    nameEn: "Euros",
    short: "EUR",
    descriptionPt: "Para objetivos ligados à Europa.",
    descriptionEn: "For goals linked to Europe.",
    tone: "border-tts-gold/60 bg-tts-gold-bg text-tts-gold",
  },
  TESOURO: {
    namePt: "Reais",
    nameEn: "Reais",
    short: "BRL",
    descriptionPt: "Saldo em reais da sua conta.",
    descriptionEn: "Reais balance in your account.",
    tone: "border-tts-border bg-tts-surface text-tts-deep",
  },
  BRL: {
    namePt: "Reais",
    nameEn: "Reais",
    short: "BRL",
    descriptionPt: "Saldo em reais da sua conta.",
    descriptionEn: "Reais balance in your account.",
    tone: "border-tts-border bg-tts-surface text-tts-deep",
  },
  XLM: {
    namePt: "Saldo operacional",
    nameEn: "Operational balance",
    short: "OPS",
    descriptionPt: "Usado pelo sistema para pequenas tarifas.",
    descriptionEn: "Used by the service for small account costs.",
    tone: "border-tts-border2 bg-tts-surface/[0.6] text-tts-muted",
  },
};

function isPortuguese(language: AppLanguage) {
  return language === "pt-BR";
}

function localCopy(language: AppLanguage, pt: string, en: string) {
  return isPortuguese(language) ? pt : en;
}

function profileName(profile: MoneyProfile, language: AppLanguage) {
  return isPortuguese(language) ? profile.namePt : profile.nameEn;
}

function moneyProfile(code?: string): MoneyProfile {
  const normalized = String(code || "").trim().toUpperCase();
  return MONEY_PROFILES[normalized] || {
    namePt: "Outra moeda",
    nameEn: "Other currency",
    short: normalized || "OTHER",
    descriptionPt: "Opção adicional da sua conta.",
    descriptionEn: "An additional option in your account.",
    tone: "border-tts-border bg-tts-surface text-tts-deep",
  };
}

function optionCode(option?: YieldOption | null) {
  return String(option?.display_asset_code || option?.asset_code || "").trim().toUpperCase();
}

function shortAccount(value?: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 14) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-5)}`;
}

function optionTitle(option: YieldOption | null | undefined, language: AppLanguage) {
  const profile = moneyProfile(optionCode(option));
  if (profile.short === "BRL") return localCopy(language, "Reserva em reais", "Reais reserve");
  if (profile.short === "USD") return localCopy(language, "Reserva em dólares", "Dollar reserve");
  if (profile.short === "EUR") return localCopy(language, "Reserva em euros", "Euro reserve");
  return profileName(profile, language);
}

function formatAmount(value: unknown, language: AppLanguage = "pt-BR") {
  const parsed = Number(String(value || "0").replace(",", "."));
  if (!Number.isFinite(parsed)) return String(value || "0");
  return new Intl.NumberFormat(isPortuguese(language) ? "pt-BR" : "en-US", {
    minimumFractionDigits: parsed > 0 && parsed < 1 ? 4 : 2,
    maximumFractionDigits: 7,
  }).format(parsed);
}

function formatPercent(value: unknown, language: AppLanguage = "pt-BR") {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(String(raw || "").replace("%", "").replace(",", "."));
  if (!Number.isFinite(parsed)) return localCopy(language, "Taxa indisponível", "Rate unavailable");
  return `${parsed.toLocaleString(isPortuguese(language) ? "pt-BR" : "en-US", { maximumFractionDigits: 2 })}%`;
}

function optionRate(option: YieldOption | null | undefined, language: AppLanguage = "pt-BR") {
  return formatPercent(option?.apy_percent || option?.apy?.apyPercent || option?.apy?.apy_percent || option?.apy?.apy, language);
}

function optionRateText(option: YieldOption | null | undefined, language: AppLanguage = "pt-BR") {
  if (!option) return localCopy(language, "Sem taxa disponível", "No rate available");
  const rate = optionRate(option, language);
  return `${rate} ${localCopy(language, "ao ano", "per year")}`;
}

function parseRate(value: unknown): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(String(raw || "").replace("%", "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed / 100;
}

function optionAnnualRate(option?: YieldOption | null) {
  return parseRate(option?.apy_percent || option?.apy?.apyPercent || option?.apy?.apy_percent || option?.apy?.apy);
}

function sortYieldOptionsByRate(options: YieldOption[]) {
  return [...options].sort((left, right) => {
    const leftRate = optionAnnualRate(left) ?? -1;
    const rightRate = optionAnnualRate(right) ?? -1;
    if (rightRate !== leftRate) return rightRate - leftRate;
    return optionCode(left).localeCompare(optionCode(right));
  });
}

function normalizeDecimal(value: unknown) {
  const raw = String(value || "0").trim();
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeUiAssetCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase().split(":")[0];
  if (!code) return "";
  if (code === "USD" || code === "DOLLAR" || code === "DOLLARS") return "USDC";
  if (code === "EUR" || code === "EURC" || code === "EURO" || code === "EUROS") return "CETES";
  if (code === "TESOURO" || code === "REAL" || code === "REAIS" || code === "R$") return "BRL";
  return code;
}

function buildMoneyUrl(path: string, params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const text = String(value ?? "").trim();
    if (text) search.set(key, text);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

function buildProjectionData(amount: string, annualRate: number | null, language: AppLanguage) {
  const principal = normalizeDecimal(amount);
  const monthlyRate = annualRate === null ? 0 : annualRate / 12;
  return Array.from({ length: 13 }, (_, month) => {
    const projected = principal * Math.pow(1 + monthlyRate, month);
    const earned = Math.max(0, projected - principal);
    return {
      month,
      label: month === 0
        ? localCopy(language, "Hoje", "Today")
        : localCopy(language, `${month}m`, `${month}m`),
      balance: Number(projected.toFixed(2)),
      earned: Number(earned.toFixed(2)),
    };
  });
}

function sanitizeUiError(error: unknown, language: AppLanguage) {
  const raw = error instanceof Error ? error.message : String(error || "");
  if (!raw.trim()) return localCopy(language, "Não foi possível concluir agora. Tente novamente.", "Could not finish right now. Try again.");
  if (/pix/i.test(raw)) {
    return localCopy(language, "Não foi possível atualizar o rendimento agora. Tente novamente em alguns segundos.", "Could not update yield right now. Try again in a few seconds.");
  }
  if (/abort|timeout|timed out|demorou/i.test(raw)) {
    return localCopy(language, "A conexão demorou demais. Atualize para tentar de novo.", "The connection took too long. Refresh to try again.");
  }
  if (/session|login|unauthor|auth|token|jwt/i.test(raw)) {
    return localCopy(language, "Entre na sua conta para ver saldos e preparar rendimentos.", "Sign in to see balances and prepare yield.");
  }
  if (/defindex|vault|xdr|horizon|stellar|mainnet|wallet|issuer|public key|secret|blockchain|crypto|cripto/i.test(raw)) {
    return localCopy(language, "Ainda não foi possível carregar essa parte. Confira a configuração do serviço e tente novamente.", "This section is not available yet. Check the service configuration and try again.");
  }
  return raw
    .replace(/Defindex/gi, "serviço de rendimento")
    .replace(/vault/gi, "opção")
    .replace(/wallet/gi, "conta")
    .replace(/asset/gi, "moeda");
}

function extractYieldBalanceAmount(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "string") return String(value);
  if (Array.isArray(value)) {
    const first = value.map(extractYieldBalanceAmount).find(Boolean);
    return first || "";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct = [
      record.balance,
      record.totalBalance,
      record.total_balance,
      record.amount,
      record.dfTokens,
      record.df_tokens,
      record.shares,
      record.totalShares,
      record.total_shares,
    ].map(extractYieldBalanceAmount).find(Boolean);
    if (direct) return direct;
  }
  return "";
}

function isSessionUiError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  return /session|login|unauthor|auth|token|jwt/i.test(raw);
}

async function yieldApi(path: string, init?: RequestInit, timeoutMs = 18000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(`/api/ramp/${path}`, {
    cache: "no-store",
    credentials: "same-origin",
    ...init,
    signal: controller.signal,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  }).finally(() => {
    window.clearTimeout(timeout);
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Não foi possível preparar a solicitação.");
  }
  return payload;
}

export default function RendimentosClient({ initialLanguage, initialQuery }: { initialLanguage?: AppLanguage; initialQuery?: string } = {}) {
  const { language, setLanguage } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const appliedInitialLanguageRef = useRef(false);
  const appliedInitialQueryRef = useRef(false);
  const loadedInitialDataRef = useRef(false);
  const requestedAssetRef = useRef("");
  const [session, setSession] = useState<SessionState>({ authenticated: false, loading: true, checked: false });
  const [yieldStatus, setYieldStatus] = useState<YieldStatus | null>(null);
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [accountPublicKey, setAccountPublicKey] = useState("");
  const [selectedCode, setSelectedCode] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [activeStep, setActiveStep] = useState<YieldStep>("wallet");
  const [showStepHelp, setShowStepHelp] = useState(false);
  const [variationBps, setVariationBps] = useState("100");
  const [pin, setPin] = useState("");
  const [yieldBalance, setYieldBalance] = useState<any | null>(null);
  const [yieldResult, setYieldResult] = useState<any | null>(null);
  const [yieldBalanceLoading, setYieldBalanceLoading] = useState(false);
  const [apiState, setApiState] = useState<ApiState>({ loading: true, message: "", error: "" });

  const options = useMemo(() => Array.isArray(yieldStatus?.vaults) ? yieldStatus.vaults : [], [yieldStatus]);
  const sortedOptions = useMemo(() => sortYieldOptionsByRate(options), [options]);
  const bestOption = sortedOptions[0] || null;
  const selectedOption = useMemo(() => {
    return options.find((item) => optionCode(item) === selectedCode) || null;
  }, [options, selectedCode]);
  const configured = Boolean(yieldStatus?.runtime?.configured);
  const confirmationEnabled = Boolean(yieldStatus?.runtime?.execution_enabled);
  const safeSelectedCode = optionCode(selectedOption) || selectedCode;
  const selectedProfile = moneyProfile(safeSelectedCode);
  const bestOptionCode = optionCode(bestOption);
  const selectedHasYield = Boolean(selectedOption);
  const sessionLoading = Boolean(session.loading && !session.checked);
  const canPrepare = Boolean(!sessionLoading && session.authenticated && configured && selectedOption && Number(String(amount).replace(",", ".")) > 0);
  const balanceForSelected = balances.find((item) => normalizeUiAssetCode(item.asset_code) === safeSelectedCode);
  const projectionData = useMemo(
    () => buildProjectionData(amount, optionAnnualRate(selectedOption), language),
    [amount, selectedOption, language]
  );
  const convertToBestYieldUrl = useMemo(() => buildMoneyUrl("/convert", {
    amount,
    source_asset: safeSelectedCode,
    dest_asset: bestOptionCode,
    from: "yield",
    lang: language,
  }), [amount, bestOptionCode, safeSelectedCode, language]);
  const amountPresets = useMemo(() => {
    const short = selectedProfile.short;
    if (short === "BRL") return ["50", "100", "500", "1000"];
    if (short === "JPY" || short === "ARS") return ["1000", "5000", "10000", "25000"];
    return ["10", "50", "100", "250"];
  }, [selectedProfile.short]);
  useEffect(() => {
    if (initialLanguage && !appliedInitialLanguageRef.current) {
      appliedInitialLanguageRef.current = true;
      setLanguage(initialLanguage);
    }
  }, [initialLanguage, setLanguage]);

  useEffect(() => {
    if (appliedInitialQueryRef.current) return;
    appliedInitialQueryRef.current = true;
    const params = new URLSearchParams(initialQuery || (typeof window !== "undefined" ? window.location.search : ""));
    const queryAsset = normalizeUiAssetCode(
      params.get("asset") ||
      params.get("asset_code") ||
      params.get("currency") ||
      params.get("source_asset") ||
      params.get("source_asset_code")
    );
    const queryAmount = normalizeDecimal(
      params.get("amount") ||
      params.get("source_amount") ||
      params.get("yield_amount") ||
      ""
    );
    const queryAction = String(params.get("action") || params.get("mode") || "").trim().toLowerCase();
    const queryFlow = String(params.get("flow") || params.get("intent") || params.get("step") || "").trim().toLowerCase();
    if (queryAsset) {
      requestedAssetRef.current = queryAsset;
      setSelectedCode(queryAsset);
    }
    if (queryAmount > 0) setAmount(String(queryAmount));
    if (queryAction === "withdraw" || queryAction === "resgatar") setAction("withdraw");
    if (queryAction === "deposit" || queryAction === "guardar") setAction("deposit");
    if (queryFlow === "earn" || queryFlow === "yield" || queryFlow === "rendimento" || queryFlow === "keep") setAction("deposit");
    if (queryFlow === "withdraw" || queryFlow === "exit" || queryFlow === "saida" || queryFlow === "sair") {
      setAction("withdraw");
    }
    if (queryFlow === "earn" || queryFlow === "yield" || queryFlow === "rendimento" || queryFlow === "keep") {
      setActiveStep("plan");
    }
    if (queryFlow === "review" || queryFlow === "revisao" || queryFlow === "confirm" || queryFlow === "confirmar") {
      setActiveStep("review");
    }
    if (params.get("advanced") === "1" || params.get("advanced") === "true") setAdvancedOpen(true);
  }, [initialQuery]);

  async function refreshDashboard() {
    setApiState({ loading: true, message: "", error: "" });
    setSession((current) => ({ ...current, loading: true }));
    try {
      const statusPromise = yieldApi("defindex/yield/status", undefined, 12000).catch((error) => ({
          success: false,
          runtime: {
            configured: false,
            api_key_configured: false,
            execution_enabled: false,
            unavailable_reason: sanitizeUiError(error, language),
          },
          vaults: [],
      }));

      const sessionPayload = await getClientSession();
      const nextSession: SessionState = {
        ...sessionPayload,
        loading: false,
        checked: true,
      };
      setSession(nextSession);

      const accountPromise = nextSession.authenticated
        ? yieldApi("etherfuse/wallet-balances", undefined, 20000)
        : Promise.resolve(null);

      const statusPayload = await statusPromise;
      setYieldStatus(statusPayload);

      const vaults = Array.isArray(statusPayload?.vaults) ? statusPayload.vaults : [];
      const bestAvailable = sortYieldOptionsByRate(vaults)[0] || null;
      if (!requestedAssetRef.current && bestAvailable) {
        setSelectedCode((current) => vaults.some((item: YieldOption) => optionCode(item) === current)
          ? current
          : optionCode(bestAvailable));
      }

      if (!nextSession.authenticated) {
        setBalances([]);
        setAccountPublicKey("");
        setApiState({ loading: false, message: L("Entre para ver seus saldos e preparar rendimentos.", "Sign in to see balances and prepare yield."), error: "" });
        return;
      }

      const accountPayload = await accountPromise;
      setAccountPublicKey(String(accountPayload?.public_key || ""));
      setBalances(Array.isArray(accountPayload?.balances) ? accountPayload.balances : []);

      setApiState({ loading: false, message: L("Saldos e rendimentos atualizados.", "Balances and yield updated."), error: "" });
    } catch (error) {
      if (isSessionUiError(error)) {
        setSession({ authenticated: false, loading: false, checked: true });
      } else {
        setSession((current) => ({ ...current, loading: false, checked: true }));
      }
      setApiState({ loading: false, message: "", error: sanitizeUiError(error, language) });
    }
  }

  useEffect(() => {
    if (!session.authenticated || !configured || !selectedOption) {
      setYieldBalance(null);
      setYieldBalanceLoading(false);
      return;
    }
    let cancelled = false;
    setYieldBalanceLoading(true);
    yieldApi(`defindex/yield/balance?asset_code=${encodeURIComponent(selectedOption.asset_code)}&vault_address=${encodeURIComponent(selectedOption.vault_address)}`)
      .then((payload) => {
        if (!cancelled) setYieldBalance(payload);
      })
      .catch(() => {
        if (!cancelled) setYieldBalance(null);
      })
      .finally(() => {
        if (!cancelled) setYieldBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, selectedOption?.asset_code, selectedOption?.vault_address, session.authenticated]);

  async function prepareYield() {
    if (!selectedOption) return;
    setApiState({ loading: true, message: "", error: "" });
    setYieldResult(null);
    try {
      const payload = await yieldApi("defindex/yield/prepare", {
        method: "POST",
        body: JSON.stringify({
          action,
          amount,
          asset_code: selectedOption.asset_code,
          vault_address: selectedOption.vault_address,
          slippage_bps: variationBps,
        }),
      });
      setYieldResult(payload);
      setApiState({ loading: false, message: L("Revisão pronta. Confira tudo antes de confirmar.", "Review ready. Check everything before confirming."), error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error, language) });
    }
  }

  async function confirmYield() {
    if (!selectedOption) return;
    setApiState({ loading: true, message: "", error: "" });
    setYieldResult(null);
    try {
      const payload = await yieldApi("defindex/yield/execute", {
        method: "POST",
        body: JSON.stringify({
          action,
          amount,
          asset_code: selectedOption.asset_code,
          vault_address: selectedOption.vault_address,
          slippage_bps: variationBps,
          pin,
          wallet_pin: pin,
        }),
      });
      setYieldResult(payload);
      setPin("");
      setApiState({ loading: false, message: L("Operação confirmada. Vamos atualizar seus saldos em instantes.", "Operation confirmed. We will update your balances shortly."), error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error, language) });
    }
  }

  useEffect(() => {
    if (loadedInitialDataRef.current) return;
    loadedInitialDataRef.current = true;
    refreshDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-tts-border pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 border border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-tts-gold">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {L("Rendimentos", "Yield")}
            </div>
            <h1 className="max-w-2xl text-3xl font-black tracking-tight text-tts-deep md:text-4xl">
              {L("Guardar dinheiro rendendo", "Keep money earning")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-tts-muted md:text-base">
              {L(
                "Veja seus saldos, escolha quanto quer guardar, simule o rendimento e confirme só depois da revisão. A experiência segue o fluxo de banco: saldo, aplicação, revisão e comprovante.",
                "See your balances, choose how much to save, preview the yield, and confirm only after review. The flow follows a banking pattern: balance, deposit, review, and receipt."
              )}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:min-w-[320px]">
            <button
              type="button"
              onClick={() => setShowTutorial((current) => !current)}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {showTutorial ? L("Ocultar guia", "Hide guide") : L("Como usar", "How to use")}
            </button>
            <button
              type="button"
              onClick={refreshDashboard}
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
            >
              {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {L("Atualizar", "Refresh")}
            </button>
          </div>
        </header>

        {apiState.error ? (
          <div className="flex items-start gap-3 border border-tts-error bg-tts-error/10 p-4 text-sm text-tts-error" role="alert">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-black">{L("Precisa de atenção", "Needs attention")}</p>
              <p className="mt-1">{apiState.error}</p>
            </div>
          </div>
        ) : null}

        {apiState.message ? (
          <div className="sr-only" aria-live="polite">
            {apiState.message}
          </div>
        ) : null}

        {showTutorial ? (
          <YieldTutorialPanel
            hasOptions={options.length > 0}
            authenticated={session.authenticated}
            confirmationEnabled={confirmationEnabled}
            bestOption={bestOption}
          />
        ) : null}

        <BankOverviewPanel
          authenticated={session.authenticated}
          sessionLoading={sessionLoading}
          configured={configured}
          confirmationEnabled={confirmationEnabled}
          balances={balances}
          options={options}
          selectedOption={selectedOption}
        />

        <YieldStepNavigation
          activeStep={activeStep}
          onStepChange={(step) => {
            setActiveStep(step);
            setShowStepHelp(false);
          }}
          showHelp={showStepHelp}
          onToggleHelp={() => setShowStepHelp((current) => !current)}
        />

        {showStepHelp ? <YieldStepHelp step={activeStep} /> : null}

        <section>
          {activeStep === "wallet" ? (
          <AccountPanel
            authenticated={session.authenticated}
            sessionLoading={sessionLoading}
            balancesLoading={apiState.loading}
            accountPublicKey={accountPublicKey}
            balances={balances}
            options={options}
            selectedCode={safeSelectedCode}
            onSelect={(code) => {
              setSelectedCode(code);
              setYieldBalance(null);
              setYieldResult(null);
              setActiveStep("plan");
            }}
          />
          ) : (
          <YieldWorkspacePanel
            activeStep={activeStep}
            authenticated={session.authenticated}
            sessionLoading={sessionLoading}
            action={action}
            onActionChange={setAction}
            amount={amount}
            onAmountChange={setAmount}
            amountPresets={amountPresets}
            selectedProfile={selectedProfile}
            selectedOption={selectedOption}
            selectedHasYield={selectedHasYield}
            bestOption={bestOption}
            bestOptionCode={bestOptionCode}
            balanceForSelected={balanceForSelected}
            yieldBalance={yieldBalance}
            yieldBalanceLoading={yieldBalanceLoading}
            result={yieldResult}
            projectionData={projectionData}
            canPrepare={canPrepare}
            confirmationEnabled={confirmationEnabled}
            apiLoading={apiState.loading}
            advancedOpen={advancedOpen}
            onAdvancedOpenChange={setAdvancedOpen}
            variationBps={variationBps}
            onVariationBpsChange={setVariationBps}
            pin={pin}
            onPinChange={setPin}
            onPrepare={prepareYield}
            onConfirm={confirmYield}
            onGoToWallet={() => setActiveStep("wallet")}
            onGoToReview={() => setActiveStep("review")}
            convertToBestYieldHref={convertToBestYieldUrl}
            configured={configured}
          />
          )}
        </section>
      </section>
    </main>
  );
}

function YieldTutorialPanel({
  hasOptions,
  authenticated,
  confirmationEnabled,
  bestOption,
}: {
  hasOptions: boolean;
  authenticated: boolean;
  confirmationEnabled: boolean;
  bestOption: YieldOption | null;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const bestProfile = moneyProfile(optionCode(bestOption));
  const steps = [
    {
      title: L("1. Conta", "1. Account"),
      body: authenticated
        ? L("Conta conectada. Seus saldos entram na revisão.", "Account connected. Your balances feed the review.")
        : L("Entre para carregar saldos e preparar uma revisão real.", "Sign in to load balances and prepare a real review."),
      ready: authenticated,
    },
    {
      title: L("2. Aplicação", "2. Deposit"),
      body: hasOptions
        ? L(`Opção em destaque: ${profileName(bestProfile, language)}.`, `Highlighted option: ${profileName(bestProfile, language)}.`)
        : L("Ainda não há opção de rendimento configurada.", "No yield option is configured yet."),
      ready: hasOptions,
    },
    {
      title: L("3. Revisão", "3. Review"),
      body: confirmationEnabled
        ? L("Depois da simulação, o PIN conclui a operação.", "After the preview, the PIN completes the operation.")
        : L("Modo revisão: você simula e valida sem movimentar saldo.", "Review mode: you preview and validate without moving balance."),
      ready: confirmationEnabled,
    },
  ];

  return (
    <section className="border border-tts-confirm bg-tts-confirm/10 p-5" aria-label={L("Primeiros passos", "First steps")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
            <BookOpen className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
            {L("Como funciona", "How it works")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
            {L(
              "O fluxo é parecido com banco: escolha o saldo, informe o valor, veja taxa e projeção, depois gere a revisão antes de qualquer PIN.",
              "The flow is bank-like: choose the balance, enter the amount, see rate and projection, then generate the review before any PIN."
            )}
          </p>
        </div>
        <a
          href="#yield-plan"
          className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
        >
          <PiggyBank className="h-4 w-4" aria-hidden="true" />
          {L("Começar revisão", "Start review")}
        </a>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {steps.map((step) => (
          <div key={step.title} className={`border p-4 ${step.ready ? "border-tts-confirm bg-tts-bg" : "border-tts-gold bg-tts-gold-bg"}`}>
            <div className="flex items-center gap-2">
              {step.ready ? <CheckCircle2 className="h-4 w-4 text-tts-confirm" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-tts-gold" aria-hidden="true" />}
              <h3 className="text-sm font-black text-tts-deep">{step.title}</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-tts-muted">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function YieldStepNavigation({
  activeStep,
  onStepChange,
  showHelp,
  onToggleHelp,
}: {
  activeStep: YieldStep;
  onStepChange: (step: YieldStep) => void;
  showHelp: boolean;
  onToggleHelp: () => void;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const steps: Array<{ key: YieldStep; label: string; description: string; icon: ReactNode }> = [
    {
      key: "wallet",
      label: L("1. Carteira", "1. Balances"),
      description: L("Escolha o saldo", "Choose balance"),
      icon: <WalletCards className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "plan",
      label: L("2. Aplicar", "2. Deposit"),
      description: L("Valor e taxa", "Amount and rate"),
      icon: <PiggyBank className="h-4 w-4" aria-hidden="true" />,
    },
    {
      key: "review",
      label: L("3. Revisar", "3. Review"),
      description: L("PIN ou modo revisão", "PIN or review mode"),
      icon: <FileCheck2 className="h-4 w-4" aria-hidden="true" />,
    },
  ];

  return (
    <section className="border border-tts-border bg-tts-surface p-3">
      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
        <div className="grid gap-2 sm:grid-cols-3">
          {steps.map((step) => {
            const active = step.key === activeStep;
            return (
              <button
                key={step.key}
                type="button"
                onClick={() => onStepChange(step.key)}
                className={`flex min-h-16 items-center gap-3 border p-3 text-left transition ${
                  active ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center border ${active ? "border-tts-confirm text-tts-confirm" : "border-tts-border text-tts-muted"}`}>
                  {step.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-tts-deep">{step.label}</span>
                  <span className="mt-0.5 block text-xs text-tts-muted">{step.description}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onToggleHelp}
          className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-bg px-3 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          {showHelp ? L("Ocultar explicação", "Hide explanation") : L("Explicar etapa", "Explain step")}
        </button>
      </div>
    </section>
  );
}

function YieldStepHelp({ step }: { step: YieldStep }) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const copy = {
    wallet: {
      title: L("Carteira", "Balances"),
      body: L(
        "Aqui você só escolhe de qual saldo quer partir. É como selecionar a conta de origem no banco. Depois disso, a próxima etapa monta a aplicação.",
        "Here you only choose which balance to start from. It works like selecting the source account in a bank. The next step builds the deposit."
      ),
    },
    plan: {
      title: L("Aplicar ou resgatar", "Deposit or withdraw"),
      body: L(
        "Aqui ficam valor, ação e taxa. A tela ainda não confirma nada: ela prepara uma simulação clara para você revisar.",
        "This is where amount, action, and rate live. The screen does not confirm anything yet: it prepares a clear preview for review."
      ),
    },
    review: {
      title: L("Revisão segura", "Secure review"),
      body: L(
        "Aqui você confere operação, valor, taxa e projeção. Se o ambiente estiver com PIN ativo, confirmar movimenta saldo; em modo revisão, só valida a preparação.",
        "Here you check operation, amount, rate, and projection. If PIN is active, confirming moves balance; in review mode, it only validates preparation."
      ),
    },
  }[step];

  return (
    <section className="border border-tts-gold bg-tts-gold-bg p-4 text-sm leading-6">
      <h2 className="flex items-center gap-2 font-black text-tts-deep">
        <BookOpen className="h-4 w-4 text-tts-gold" aria-hidden="true" />
        {copy.title}
      </h2>
      <p className="mt-2 text-tts-muted">{copy.body}</p>
    </section>
  );
}

function BankOverviewPanel({
  authenticated,
  sessionLoading,
  configured,
  confirmationEnabled,
  balances,
  options,
  selectedOption,
}: {
  authenticated: boolean;
  sessionLoading: boolean;
  configured: boolean;
  confirmationEnabled: boolean;
  balances: BalanceLine[];
  options: YieldOption[];
  selectedOption: YieldOption | null;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const selectedProfile = moneyProfile(optionCode(selectedOption));
  const accountValue = sessionLoading
    ? L("Verificando", "Checking")
    : authenticated
      ? L("Conectada", "Connected")
      : L("Entrar", "Sign in");
  const accountDetail = authenticated
    ? L("Saldos protegidos por revisão e PIN.", "Balances protected by review and PIN.")
    : L("Entre para ver saldos reais.", "Sign in to see real balances.");
  const setupValue = configured && options.length
    ? `${options.length}`
    : L("Em preparo", "Setup");
  const setupDetail = configured && options.length
    ? L("Opções disponíveis para simular.", "Options available to preview.")
    : L("Configure o ambiente para liberar opções.", "Configure the environment to enable options.");
  const selectedValue = selectedOption
    ? profileName(selectedProfile, language)
    : L("Escolha saldo", "Choose balance");
  const selectedDetail = selectedOption
    ? optionRateText(selectedOption, language)
    : L("Selecione uma opção disponível.", "Select an available option.");
  const confirmationValue = confirmationEnabled
    ? L("PIN ativo", "PIN ready")
    : L("Modo revisão", "Review mode");
  const confirmationDetail = confirmationEnabled
    ? L("Confirmar com PIN movimenta saldo.", "Confirming with PIN moves balance.")
    : L("Simula e prepara sem movimentar saldo.", "Previews and prepares without moving balance.");

  return (
    <section className="grid gap-3 md:grid-cols-4" aria-label={L("Resumo bancário", "Banking summary")}>
      <BankStatusCard
        icon={<WalletCards className="h-5 w-5" aria-hidden="true" />}
        label={L("Conta", "Account")}
        value={accountValue}
        detail={accountDetail}
        tone={authenticated ? "confirm" : "warn"}
      />
      <BankStatusCard
        icon={<PiggyBank className="h-5 w-5" aria-hidden="true" />}
        label={L("Aplicações", "Yield options")}
        value={setupValue}
        detail={setupDetail}
        tone={configured && options.length ? "confirm" : "warn"}
      />
      <BankStatusCard
        icon={<Coins className="h-5 w-5" aria-hidden="true" />}
        label={L("Selecionado", "Selected")}
        value={selectedValue}
        detail={selectedDetail}
        tone={selectedOption ? "confirm" : "neutral"}
      />
      <BankStatusCard
        icon={<LockKeyhole className="h-5 w-5" aria-hidden="true" />}
        label={L("Segurança", "Security")}
        value={confirmationValue}
        detail={confirmationDetail}
        tone={confirmationEnabled ? "confirm" : "warn"}
      />
    </section>
  );
}

function BankStatusCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "confirm" | "warn" | "neutral";
}) {
  const toneClass = tone === "confirm"
    ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm"
    : tone === "warn"
      ? "border-tts-gold bg-tts-gold-bg text-tts-gold"
      : "border-tts-border bg-tts-bg text-tts-muted";

  return (
    <div className="border border-tts-border bg-tts-surface p-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center border ${toneClass}`}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-tts-muted">{label}</p>
          <p className="mt-1 text-base font-black text-tts-deep">{value}</p>
          <p className="mt-1 text-xs leading-5 text-tts-muted">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function AccountPanel({
  authenticated,
  sessionLoading,
  balancesLoading,
  accountPublicKey,
  balances,
  options,
  selectedCode,
  onSelect,
}: {
  authenticated: boolean;
  sessionLoading: boolean;
  balancesLoading: boolean;
  accountPublicKey: string;
  balances: BalanceLine[];
  options: YieldOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const balanceItems: BalanceLine[] = balances.length
    ? balances
    : authenticated && options.length
      ? options.map((option) => ({
        asset_code: optionCode(option),
        balance: "0",
      }))
      : [];

  return (
    <section className="border border-tts-border bg-tts-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
            <Coins className="h-5 w-5 text-tts-gold" aria-hidden="true" />
            {L("Carteira", "Balances")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-tts-muted">
            {sessionLoading
              ? L("Verificando sua sessão e saldos.", "Checking your session and balances.")
              : authenticated
              ? L("Toque em um saldo para montar uma revisão.", "Tap a balance to build a review.")
              : L("Entre para ver saldos reais e preparar uma aplicação.", "Sign in to see real balances and prepare a deposit.")}
          </p>
        </div>
        <span className={`inline-flex shrink-0 border px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${authenticated ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" : "border-tts-gold bg-tts-gold-bg text-tts-gold"}`}>
          {sessionLoading ? L("Carregando", "Loading") : authenticated ? L("Ativa", "Active") : L("Entrar", "Sign in")}
        </span>
      </div>

      {accountPublicKey ? (
        <p className="mt-3 border border-tts-border bg-tts-bg px-3 py-2 text-xs font-bold text-tts-muted">
          {L("ID da conta", "Account ID")}: {shortAccount(accountPublicKey)}
        </p>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniStat label={L("Saldos", "Balances")} value={sessionLoading ? L("Carregando", "Loading") : String(balanceItems.length)} detail={L("na carteira", "in account")} />
        <MiniStat label={L("Com rendimento", "Earning-ready")} value={String(options.length)} detail={L("opções", "options")} />
      </div>

      <div className="mt-5 grid gap-2">
        {balanceItems.length ? balanceItems.map((item) => {
          const code = normalizeUiAssetCode(item.asset_code);
          const profile = moneyProfile(code);
          const selected = code === selectedCode;
          const option = options.find((candidate) => optionCode(candidate) === code);
          return (
            <button
              key={`${code}-${item.asset_issuer || "default"}`}
              type="button"
              onClick={() => onSelect(code)}
              className={`grid min-h-20 grid-cols-[1fr_auto] items-center gap-3 border p-3 text-left transition ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"}`}
            >
              <span>
                <span className={`inline-flex border px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${profile.tone}`}>
                  {profile.short}
                </span>
                <span className="mt-2 block text-sm font-black text-tts-deep">{option ? optionTitle(option, language) : profileName(profile, language)}</span>
                {option ? (
                  <span className="mt-1 block text-xs font-bold text-tts-confirm">
                    {optionRateText(option, language)}
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-tts-muted">{L("Saldo disponível para converter", "Available to convert")}</span>
                )}
              </span>
              <span className="text-right">
                <span className="block text-lg font-black text-tts-deep">{formatAmount(item.balance, language)}</span>
                <span className="block text-xs font-bold text-tts-muted">{profile.short}</span>
              </span>
            </button>
          );
        }) : (
          <div className="border border-tts-border bg-tts-bg p-4 text-sm leading-6 text-tts-muted">
            {sessionLoading || (authenticated && balancesLoading)
              ? L("Carregando saldos da sua conta.", "Loading your account balances.")
              : authenticated
                ? L("Nenhum saldo apareceu ainda. Atualize em alguns segundos.", "No balance appeared yet. Refresh in a few seconds.")
                : L("Entre com segurança para carregar sua carteira.", "Sign in securely to load your account.")}
          </div>
        )}
      </div>

      {!authenticated && !sessionLoading ? (
        <a href="/login?next=/yield" className="mt-4 inline-flex min-h-11 w-full items-center justify-center bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2">
          {L("Entrar com segurança", "Sign in securely")}
        </a>
      ) : null}

      <a href="/convert" className="mt-4 inline-flex min-h-11 w-full items-center justify-center bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2">
        {L("Converter saldo", "Convert balance")}
      </a>
    </section>
  );
}

function YieldWorkspacePanel({
  activeStep,
  authenticated,
  sessionLoading,
  action,
  onActionChange,
  amount,
  onAmountChange,
  amountPresets,
  selectedProfile,
  selectedOption,
  selectedHasYield,
  bestOption,
  bestOptionCode,
  balanceForSelected,
  yieldBalance,
  yieldBalanceLoading,
  result,
  projectionData,
  canPrepare,
  confirmationEnabled,
  apiLoading,
  advancedOpen,
  onAdvancedOpenChange,
  variationBps,
  onVariationBpsChange,
  pin,
  onPinChange,
  onPrepare,
  onConfirm,
  onGoToWallet,
  onGoToReview,
  convertToBestYieldHref,
  configured,
}: {
  activeStep: "plan" | "review";
  authenticated: boolean;
  sessionLoading: boolean;
  action: "deposit" | "withdraw";
  onActionChange: (action: "deposit" | "withdraw") => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  amountPresets: string[];
  selectedProfile: MoneyProfile;
  selectedOption: YieldOption | null;
  selectedHasYield: boolean;
  bestOption: YieldOption | null;
  bestOptionCode: string;
  balanceForSelected?: BalanceLine;
  yieldBalance: any | null;
  yieldBalanceLoading: boolean;
  result: any | null;
  projectionData: Array<{ month: number; label: string; balance: number; earned: number }>;
  canPrepare: boolean;
  confirmationEnabled: boolean;
  apiLoading: boolean;
  advancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  variationBps: string;
  onVariationBpsChange: (value: string) => void;
  pin: string;
  onPinChange: (value: string) => void;
  onPrepare: () => void;
  onConfirm: () => void;
  onGoToWallet: () => void;
  onGoToReview: () => void;
  convertToBestYieldHref: string;
  configured: boolean;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const projectedEnd = projectionData[projectionData.length - 1]?.balance || normalizeDecimal(amount);
  const projectedEarned = projectionData[projectionData.length - 1]?.earned || 0;
  const profileShort = selectedProfile.short;
  const bestProfile = moneyProfile(bestOptionCode);
  const hasPrepared = Boolean(result);
  const canConfirm = canPrepare && confirmationEnabled && pin.length >= 4 && !apiLoading;
  const earningBalanceAmount = extractYieldBalanceAmount(yieldBalance?.balance ?? yieldBalance);
  const accountBalanceLabel = sessionLoading
    ? L("Carregando saldo", "Loading balance")
    : balanceForSelected
      ? `${formatAmount(balanceForSelected.balance, language)} ${profileShort}`
      : L("Saldo não disponível", "Balance unavailable");
  const earningBalanceLabel = yieldBalanceLoading
    ? L("Carregando posição", "Loading position")
    : earningBalanceAmount
      ? `${formatAmount(earningBalanceAmount, language)} ${profileShort}`
      : L("Nada aplicado ainda", "Nothing deposited yet");
  const annualRateLabel = selectedOption ? optionRateText(selectedOption, language) : L("Não disponível", "Unavailable");
  const projectionLabel = selectedOption ? `${formatAmount(projectedEnd, language)} ${profileShort}` : L("Escolha uma opção", "Choose an option");
  const actionTitle = action === "deposit"
    ? L("Aplicar saldo", "Deposit balance")
    : L("Resgatar para saldo", "Withdraw to balance");
  const actionDescription = action === "deposit"
    ? L("O valor sai do saldo disponível e passa a compor a posição rendendo depois da confirmação.", "The amount leaves available balance and becomes an earning position after confirmation.")
    : L("O valor sai da posição rendendo e volta para o saldo disponível depois da confirmação.", "The amount leaves the earning position and returns to available balance after confirmation.");
  const tooltipFormatter = (value: unknown, name: unknown) => {
    const label = String(name) === "earned" ? L("Rendimento", "Yield") : L("Saldo", "Balance");
    return [`${formatAmount(value, language)} ${profileShort}`, label];
  };

  return (
    <section id="yield-plan" className="scroll-mt-6 border border-tts-border bg-tts-surface p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
            <PiggyBank className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
            {L("Plano de rendimento", "Yield plan")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-tts-muted">
            {selectedHasYield
              ? L("Monte a aplicação, revise a simulação e confirme só quando tudo estiver correto.", "Build the deposit, review the preview, and confirm only when everything is right.")
              : L("Esse saldo ainda não tem rendimento ativo. A tela sugere uma conversão quando existir alternativa.", "This balance does not have active yield yet. The screen suggests conversion when an alternative exists.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex w-fit border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${selectedProfile.tone}`}>
            {profileShort} · {profileName(selectedProfile, language)}
          </span>
          <span className={`inline-flex w-fit border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${confirmationEnabled ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" : "border-tts-gold bg-tts-gold-bg text-tts-gold"}`}>
            {confirmationEnabled ? L("PIN ativo", "PIN ready") : L("Modo revisão", "Review mode")}
          </span>
        </div>
      </div>

      {sessionLoading ? (
        <div className="mt-5 border border-tts-border bg-tts-bg p-4 text-sm leading-6 text-tts-muted">
          <p className="flex items-center gap-2 font-black text-tts-deep">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {L("Carregando sua conta", "Loading your account")}
          </p>
          <p className="mt-1">
            {L("Estamos conferindo sua sessão antes de mostrar saldos e confirmação.", "We are checking your session before showing balances and confirmation.")}
          </p>
        </div>
      ) : !authenticated ? (
        <div className="mt-5 border border-tts-gold bg-tts-gold-bg p-4 text-sm leading-6 text-tts-muted">
          <p className="font-black text-tts-gold">{L("Entre para revisar com seus saldos", "Sign in to review with your balances")}</p>
          <p className="mt-1">
            {L(
              "O rendimento é calculado a partir da sua conta. Depois de entrar, seus saldos aparecem aqui e você pode revisar antes de qualquer confirmação.",
              "Yield is calculated from your account. After signing in, your balances appear here and you can review before any confirmation."
            )}
          </p>
          <div className="mt-3 border border-tts-border bg-tts-surface p-3">
            <p className="font-black text-tts-deep">{L("Revisão segura", "Secure review")}</p>
            <p className="mt-1 text-xs leading-5 text-tts-muted">
              {L("A tela mostra valor, taxa e operação antes do PIN.", "The screen shows amount, rate, and operation before PIN.")}
            </p>
          </div>
          <a href="/login?next=/yield" className="mt-3 inline-flex min-h-10 items-center justify-center bg-tts-gold px-3 py-2 text-xs font-black text-tts-deep transition hover:bg-tts-gold/90">
            {L("Entrar na conta", "Sign in")}
          </a>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label={L("Disponível", "Available")} value={accountBalanceLabel} detail={L("saldo da conta", "account balance")} />
        <MiniStat label={L("Rendendo", "Earning")} value={earningBalanceLabel} detail={L("posição atual", "current position")} />
        <MiniStat label={L("Taxa informada", "Reported rate")} value={annualRateLabel} detail={L("pode variar", "may vary")} />
        <MiniStat label={L("Projeção 12m", "12m projection")} value={projectionLabel} detail={L("estimativa", "estimate")} />
      </div>

      {authenticated && !selectedHasYield ? (
        <div className="mt-5 border border-tts-gold bg-tts-gold-bg p-4 text-sm leading-6 text-tts-muted">
          <p className="font-black text-tts-gold">
            {configured ? L("Sem rendimento para esta moeda", "No yield for this currency") : L("Rendimento ainda sem configuração", "Yield is not configured yet")}
          </p>
          <p className="mt-1">
            {bestOption
              ? L(
                  `Melhor opção disponível: ${profileName(bestProfile, language)} com ${optionRate(bestOption, language)} ao ano.`,
                  `Best available option: ${profileName(bestProfile, language)} at ${optionRate(bestOption, language)} per year.`
                )
              : L("Configure as opções no backend para ativar esta tela.", "Configure backend options to activate this screen.")}
          </p>
          {bestOption ? (
            <a href={convertToBestYieldHref} className="mt-3 inline-flex min-h-10 items-center justify-center bg-tts-gold px-3 py-2 text-xs font-black text-tts-deep transition hover:bg-tts-gold/90">
              {L("Converter e revisar", "Convert and review")}
            </a>
          ) : null}
        </div>
      ) : authenticated ? (
        <div className="mt-5">
          {activeStep === "plan" ? (
          <div className="border border-tts-border bg-tts-bg p-4">
            <div className="grid grid-cols-2 gap-2 border border-tts-border bg-tts-surface p-1">
              <button
                type="button"
                onClick={() => onActionChange("deposit")}
                className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black whitespace-nowrap ${action === "deposit" ? "bg-tts-confirm text-tts-deep" : "text-tts-muted"}`}
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                {L("Aplicar", "Deposit")}
              </button>
              <button
                type="button"
                onClick={() => onActionChange("withdraw")}
                className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black whitespace-nowrap ${action === "withdraw" ? "bg-tts-gold text-tts-deep" : "text-tts-muted"}`}
              >
                <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                {L("Resgatar", "Withdraw")}
              </button>
            </div>
            <div className="mt-4 border border-tts-border bg-tts-surface p-3">
              <p className="text-sm font-black text-tts-deep">{actionTitle}</p>
              <p className="mt-1 text-xs leading-5 text-tts-muted">{actionDescription}</p>
            </div>

            <label className="mt-4 block text-sm font-black text-tts-deep" htmlFor="yield-amount">
              {L("Valor", "Amount")}
            </label>
            <div className="mt-2 flex min-h-12 items-center border border-tts-border bg-tts-surface focus-within:border-tts-gold">
              <span className="border-r border-tts-border px-3 text-sm font-black text-tts-muted">{profileShort}</span>
              <input
                id="yield-amount"
                value={amount}
                onChange={(event) => onAmountChange(event.target.value.replace(/[^\d,.]/g, ""))}
                inputMode="decimal"
                className="min-h-12 flex-1 bg-transparent px-3 text-base font-bold text-tts-deep outline-none"
                aria-describedby="yield-amount-help"
              />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {amountPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onAmountChange(preset)}
                  className="min-h-9 border border-tts-border bg-tts-surface px-2 text-xs font-black text-tts-deep transition hover:border-tts-border2"
                >
                  {formatAmount(preset, language)}
                </button>
              ))}
            </div>
            <p id="yield-amount-help" className="mt-2 text-xs leading-5 text-tts-muted">
              {L("A revisão usa seus saldos da conta. Nada sai sem uma etapa de confirmação.", "Review uses your account balances. Nothing moves without a confirmation step.")}
            </p>

            <button
              type="button"
              aria-pressed={advancedOpen}
              onClick={() => onAdvancedOpenChange(!advancedOpen)}
              className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 border border-tts-border px-3 py-2 text-xs font-black text-tts-deep transition hover:border-tts-border2"
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              {advancedOpen ? L("Ocultar ajustes", "Hide settings") : L("Ajustes", "Settings")}
            </button>

            {advancedOpen ? (
              <div className="mt-4 border-t border-tts-border pt-4">
                <label className="block text-sm font-black text-tts-deep" htmlFor="yield-variation">
                  {L("Margem de segurança", "Safety margin")}
                </label>
                <select
                  id="yield-variation"
                  value={variationBps}
                  onChange={(event) => onVariationBpsChange(event.target.value)}
                  className="mt-2 min-h-12 w-full border border-tts-border bg-tts-surface px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                >
                  <option value="50">{L("Baixa", "Low")}</option>
                  <option value="100">{L("Padrão", "Standard")}</option>
                  <option value="200">{L("Alta", "High")}</option>
                </select>
              </div>
            ) : null}

            {confirmationEnabled ? (
              <div className="mt-4">
                <label className="block text-sm font-black text-tts-deep" htmlFor="yield-pin">
                  {L("PIN para confirmar", "PIN to confirm")}
                </label>
                <input
                  id="yield-pin"
                  value={pin}
                  onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  type="password"
                  className="mt-2 min-h-12 w-full border border-tts-border bg-tts-surface px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                />
              </div>
            ) : null}

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onPrepare}
                disabled={!canPrepare || apiLoading}
                className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface disabled:cursor-not-allowed disabled:opacity-45"
              >
                {apiLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                {L("Preparar revisão", "Prepare review")}
              </button>
              <button
                type="button"
                onClick={onGoToReview}
                disabled={!selectedHasYield}
                className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-gold px-3 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:opacity-45"
              >
                <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                {L("Ver revisão", "View review")}
              </button>
            </div>
          </div>
          ) : null}

          {activeStep === "review" ? (
          <div className="grid gap-4">
            <div className="border border-tts-border bg-tts-bg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-tts-deep">{L("Revisão segura", "Secure review")}</h3>
                  <p className="mt-1 text-xs leading-5 text-tts-muted">
                    {L("Resumo antes de qualquer confirmação.", "Summary before any confirmation.")}
                  </p>
                </div>
                <BadgeCheck className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MiniStat label={L("Operação", "Operation")} value={actionTitle} />
                <MiniStat label={L("Valor", "Amount")} value={`${formatAmount(amount, language)} ${profileShort}`} />
                <MiniStat label={L("Taxa", "Rate")} value={annualRateLabel} />
                <MiniStat label={L("Segurança", "Security")} value={confirmationEnabled ? L("PIN obrigatório", "PIN required") : L("Somente revisão", "Review only")} />
              </div>
              <div className="mt-4 border border-tts-border bg-tts-surface p-4 text-sm leading-6 text-tts-muted">
                {hasPrepared ? (
                  <p className="font-bold text-tts-confirm">
                    {L("Revisão preparada. Confira taxa, valor e operação antes de confirmar.", "Review prepared. Check rate, amount, and operation before confirming.")}
                  </p>
                ) : (
                  <p>{L("Prepare a revisão para validar a operação com sua conta.", "Prepare the review to validate the operation with your account.")}</p>
                )}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={onGoToWallet}
                  className="inline-flex min-h-12 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
                >
                  <WalletCards className="h-4 w-4" aria-hidden="true" />
                  {L("Trocar saldo", "Change balance")}
                </button>
                <button
                  type="button"
                  onClick={onPrepare}
                  disabled={!canPrepare || apiLoading}
                  className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {apiLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                  {L("Preparar", "Prepare")}
                </button>
                {confirmationEnabled ? (
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={!canConfirm}
                    className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-gold px-3 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                    {L("Confirmar com PIN", "Confirm with PIN")}
                  </button>
                ) : (
                  <div className="flex min-h-12 items-center border border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-bold leading-5 text-tts-gold">
                    {L("Modo revisão: valida sem movimentar saldo.", "Review mode: validates without moving balance.")}
                  </div>
                )}
              </div>
              <div className="mt-3 grid gap-2 text-xs leading-5 text-tts-muted sm:grid-cols-3">
                <p className="border border-tts-border bg-tts-surface p-3">
                  <span className="block font-black text-tts-deep">{L("1. Saldo", "1. Balance")}</span>
                  {L("Usa a carteira conectada.", "Uses the connected account.")}
                </p>
                <p className="border border-tts-border bg-tts-surface p-3">
                  <span className="block font-black text-tts-deep">{L("2. Revisão", "2. Review")}</span>
                  {L("Mostra valor e taxa antes do PIN.", "Shows amount and rate before PIN.")}
                </p>
                <p className="border border-tts-border bg-tts-surface p-3">
                  <span className="block font-black text-tts-deep">{L("3. Registro", "3. Record")}</span>
                  {L("Após confirmar, vira histórico da conta.", "After confirmation, it becomes account history.")}
                </p>
              </div>
            </div>

            <div className="border border-tts-border bg-tts-bg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-black text-tts-deep">{L("Simulação com a taxa atual", "Preview with current rate")}</h3>
                <span className="text-xs font-bold text-tts-muted">{`${formatAmount(projectedEarned, language)} ${profileShort} ${L("estimado", "estimated")}`}</span>
              </div>
              <p className="mb-3 text-xs leading-5 text-tts-muted">
                {L("A taxa pode variar. Esta simulação não é promessa de retorno.", "The rate may vary. This preview is not a promise of return.")}
              </p>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projectionData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--tts-border)" strokeDasharray="3 3" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} />
                    <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} tickFormatter={(value) => formatAmount(value, language)} />
                    <Tooltip formatter={tooltipFormatter} labelFormatter={(label) => `${L("Mês", "Month")}: ${label}`} />
                    <Area type="monotone" dataKey="balance" stroke="var(--tts-confirm)" fill="var(--tts-confirm)" fillOpacity={0.16} strokeWidth={2} name="balance" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MiniStat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-tts-muted">{label}</p>
      <p className="mt-1 text-sm font-black text-tts-deep">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-tts-muted">{detail}</p> : null}
    </div>
  );
}
