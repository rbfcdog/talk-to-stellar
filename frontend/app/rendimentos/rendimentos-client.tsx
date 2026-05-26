"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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
  BookOpen,
  CheckCircle2,
  Coins,
  Loader2,
  PiggyBank,
  QrCode,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useLanguage, type AppLanguage } from "@/lib/i18n";
import { getClientSession } from "@/lib/session";

type ApiState = {
  loading: boolean;
  message: string;
  error: string;
};

type SessionState = {
  authenticated: boolean;
  sessionId?: string;
};

type BalanceLine = {
  asset_code: string;
  asset_type?: string;
  asset_issuer?: string;
  balance: string;
};

type RampConfig = {
  success?: boolean;
  provider?: string;
  sandbox?: boolean;
  available?: boolean;
  unavailable_reason?: string;
  asset?: {
    code?: string;
    issuer?: string;
    identifier?: string;
  };
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

type FlowIntent = "add" | "earn" | "withdraw";

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
    descriptionPt: "Para entradas e saídas por PIX.",
    descriptionEn: "For adding and withdrawing with PIX.",
    tone: "border-tts-border bg-tts-surface text-tts-deep",
  },
  BRL: {
    namePt: "Reais",
    nameEn: "Reais",
    short: "BRL",
    descriptionPt: "Para entradas e saídas por PIX.",
    descriptionEn: "For adding and withdrawing with PIX.",
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

function profileDescription(profile: MoneyProfile, language: AppLanguage) {
  return isPortuguese(language) ? profile.descriptionPt : profile.descriptionEn;
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
  if (!Number.isFinite(parsed)) return localCopy(language, "A consultar", "Pending");
  return `${parsed.toLocaleString(isPortuguese(language) ? "pt-BR" : "en-US", { maximumFractionDigits: 2 })}%`;
}

function optionRate(option: YieldOption | null | undefined, language: AppLanguage = "pt-BR") {
  return formatPercent(option?.apy_percent || option?.apy?.apyPercent || option?.apy?.apy_percent || option?.apy?.apy, language);
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
  if (code === "EURC" || code === "EURO" || code === "EUROS") return "EUR";
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

async function financialApi(path: string, init?: RequestInit) {
  const response = await fetch(`/api/financial/mainnet/${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Não foi possível carregar os dados da conta.");
  }
  return payload;
}

async function rampConfigApi(): Promise<RampConfig> {
  const response = await fetch("/api/ramp/etherfuse/config", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Não foi possível carregar o status do PIX.");
  }
  return payload;
}

async function yieldApi(path: string, init?: RequestInit) {
  const response = await fetch(`/api/ramp/${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
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
  const [session, setSession] = useState<SessionState>({ authenticated: false });
  const [rampConfig, setRampConfig] = useState<RampConfig | null>(null);
  const [yieldStatus, setYieldStatus] = useState<YieldStatus | null>(null);
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [accountPublicKey, setAccountPublicKey] = useState("");
  const [selectedCode, setSelectedCode] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [cycleDestinationPixKey, setCycleDestinationPixKey] = useState("");
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
  const pixAvailable = Boolean(rampConfig?.available);
  const safeSelectedCode = optionCode(selectedOption) || selectedCode;
  const selectedProfile = moneyProfile(safeSelectedCode);
  const bestOptionCode = optionCode(bestOption);
  const selectedHasYield = Boolean(selectedOption);
  const canPrepare = Boolean(session.authenticated && configured && selectedOption && Number(String(amount).replace(",", ".")) > 0);
  const balanceForSelected = balances.find((item) => String(item.asset_code || "").toUpperCase() === safeSelectedCode);
  const projectionData = useMemo(
    () => buildProjectionData(amount, optionAnnualRate(selectedOption), language),
    [amount, selectedOption, language]
  );
  const addMoneyUrl = useMemo(() => buildMoneyUrl("/pix-on", {
    mode: "onramp",
    asset: safeSelectedCode,
    amount,
    currency: "BRL",
    from: "yield",
    lang: language,
  }), [amount, safeSelectedCode, language]);
  const sendMoneyUrl = useMemo(() => buildMoneyUrl("/pix-off", {
    mode: "offramp",
    asset: safeSelectedCode,
    source_asset: safeSelectedCode,
    source_amount: amount,
    destination_pix_key: cycleDestinationPixKey,
    from: "yield",
    lang: language,
  }), [amount, cycleDestinationPixKey, safeSelectedCode, language]);
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
    const path = typeof window !== "undefined" ? window.location.pathname : "";
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
    const queryDestinationPixKey = String(
      params.get("destination_pix_key") ||
      params.get("pix_key") ||
      params.get("destination_pix") ||
      params.get("to_pix") ||
      ""
    ).trim();
    const queryCycleMode = params.get("cycle") === "1" || params.get("cycle") === "true" || path === "/money-cycle";
    if (queryCycleMode) setShowTutorial(true);
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
    if (queryDestinationPixKey) setCycleDestinationPixKey(queryDestinationPixKey);
    if (params.get("advanced") === "1" || params.get("advanced") === "true") setAdvancedOpen(true);
  }, [initialQuery]);

  async function refreshDashboard() {
    setApiState({ loading: true, message: "", error: "" });
    try {
      const [sessionPayload, rampPayload, statusPayload] = await Promise.all([
        getClientSession(),
        rampConfigApi().catch((error) => ({
          success: false,
          available: false,
          unavailable_reason: sanitizeUiError(error, language),
        })),
        yieldApi("defindex/yield/status").catch((error) => ({
          success: false,
          runtime: {
            configured: false,
            api_key_configured: false,
            execution_enabled: false,
            unavailable_reason: sanitizeUiError(error, language),
          },
          vaults: [],
        })),
      ]);

      setSession(sessionPayload);
      setRampConfig(rampPayload);
      setYieldStatus(statusPayload);

      const vaults = Array.isArray(statusPayload?.vaults) ? statusPayload.vaults : [];
      const bestAvailable = sortYieldOptionsByRate(vaults)[0] || null;
      if (!requestedAssetRef.current && bestAvailable && !vaults.some((item: YieldOption) => optionCode(item) === selectedCode)) {
        setSelectedCode(optionCode(bestAvailable));
      }

      if (!sessionPayload.authenticated) {
        setBalances([]);
        setAccountPublicKey("");
        setApiState({ loading: false, message: L("Entre para ver seus saldos e preparar rendimentos.", "Sign in to see balances and prepare yield."), error: "" });
        return;
      }

      const accountPayload = await financialApi("wallet").catch(() => ({ wallet: null }));
      if (accountPayload?.wallet?.public_key) {
        setAccountPublicKey(String(accountPayload.wallet.public_key));
        const balancePayload = await financialApi("balance").catch(() => ({ balances: [] }));
        setBalances(Array.isArray(balancePayload?.balances) ? balancePayload.balances : []);
      } else {
        setAccountPublicKey("");
        setBalances([]);
      }

      setApiState({ loading: false, message: L("Saldos e rendimentos atualizados.", "Balances and yield updated."), error: "" });
    } catch (error) {
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
      setApiState({ loading: false, message: L("Solicitação pronta. Revise e confirme quando quiser.", "Request ready. Review and confirm whenever you want."), error: "" });
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
      setApiState({ loading: false, message: L("Pedido confirmado. Vamos atualizar seus saldos em instantes.", "Request confirmed. We will update your balances shortly."), error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error, language) });
    }
  }

  useEffect(() => {
    if (loadedInitialDataRef.current) return;
    if (initialLanguage && language !== initialLanguage) return;
    loadedInitialDataRef.current = true;
    refreshDashboard();
  }, [initialLanguage, language]);

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
              {L("Rendimento da sua conta", "Yield from your account")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-tts-muted md:text-base">
              {L(
                "Escolha um saldo da conta, veja a taxa disponível e revise antes de confirmar. Nada sai sem revisão.",
                "Choose an account balance, see the available rate, and review before confirming. Nothing moves without review."
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

        <section className="grid items-start gap-5 lg:grid-cols-[minmax(280px,0.78fr)_minmax(0,1.22fr)]">
          <AccountPanel
            authenticated={session.authenticated}
            accountPublicKey={accountPublicKey}
            balances={balances}
            options={options}
            selectedCode={safeSelectedCode}
            onSelect={(code) => {
              setSelectedCode(code);
              setYieldBalance(null);
              setYieldResult(null);
            }}
            pixAvailable={pixAvailable}
            addMoneyUrl={addMoneyUrl}
            sendMoneyUrl={sendMoneyUrl}
          />

          <YieldWorkspacePanel
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
            convertToBestYieldHref={convertToBestYieldUrl}
            configured={configured}
          />
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
      title: L("1. Entre na sua conta", "1. Sign in"),
      body: authenticated
        ? L("Conta carregada. Você já pode revisar valores.", "Account loaded. You can review values.")
        : L("Sem login, a tela só mostra uma simulação.", "Without sign-in, this screen only shows a preview."),
      ready: authenticated,
    },
    {
      title: L("2. Escolha uma opção disponível", "2. Choose an available option"),
      body: hasOptions
        ? L(`Melhor opção agora: ${profileName(bestProfile, language)}.`, `Best option now: ${profileName(bestProfile, language)}.`)
        : L("O backend ainda não devolveu nenhuma opção de rendimento.", "The backend has not returned any yield option yet."),
      ready: hasOptions,
    },
    {
      title: L("3. Revise antes do PIN", "3. Review before PIN"),
      body: confirmationEnabled
        ? L("Depois da revisão, o PIN conclui a operação.", "After review, the PIN completes the operation.")
        : L("Neste ambiente, a confirmação final ainda fica desligada.", "In this environment, final confirmation is still off."),
      ready: confirmationEnabled,
    },
  ];

  return (
    <section className="border border-tts-confirm bg-tts-confirm/10 p-5" aria-label={L("Primeiros passos", "First steps")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
            <BookOpen className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
            {L("Primeiros passos para render", "First steps to earn")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
            {L(
              "Use esta tela de cima para baixo: escolha uma opção disponível, informe o valor, revise a simulação e só depois confirme.",
              "Use this screen top to bottom: choose an available option, enter the amount, review the preview, and only then confirm."
            )}
          </p>
        </div>
        <a
          href="#yield-plan"
          className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
        >
          <PiggyBank className="h-4 w-4" aria-hidden="true" />
          {L("Ir ao plano", "Go to plan")}
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

function AccountPanel({
  authenticated,
  accountPublicKey,
  balances,
  options,
  selectedCode,
  onSelect,
  pixAvailable,
  addMoneyUrl,
  sendMoneyUrl,
}: {
  authenticated: boolean;
  accountPublicKey: string;
  balances: BalanceLine[];
  options: YieldOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
  pixAvailable: boolean;
  addMoneyUrl: string;
  sendMoneyUrl: string;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const balanceItems: BalanceLine[] = balances.length
    ? balances
    : options.length
      ? options.map((option) => ({
        asset_code: optionCode(option),
        balance: "0",
      }))
      : [{
        asset_code: selectedCode,
        balance: "0",
      }];

  return (
    <section className="border border-tts-border bg-tts-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
            <Coins className="h-5 w-5 text-tts-gold" aria-hidden="true" />
            {L("Sua conta", "Your account")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-tts-muted">
            {authenticated
              ? L("Escolha um saldo para revisar rendimento.", "Choose a balance to review yield.")
              : L("Entre para carregar seus saldos.", "Sign in to load your balances.")}
          </p>
        </div>
        <span className={`inline-flex shrink-0 border px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${authenticated ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" : "border-tts-gold bg-tts-gold-bg text-tts-gold"}`}>
          {authenticated ? L("Conectada", "Connected") : L("Sem conta", "No account")}
        </span>
      </div>

      {accountPublicKey ? (
        <p className="mt-3 border border-tts-border bg-tts-bg px-3 py-2 text-xs font-bold text-tts-muted">
          {L("Conta", "Account")}: {shortAccount(accountPublicKey)}
        </p>
      ) : null}

      <div className="mt-5 grid gap-2">
        {balanceItems.length ? balanceItems.map((item) => {
          const code = String(item.asset_code || "").toUpperCase();
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
                    {optionRate(option, language)} {L("ao ano", "per year")}
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-tts-muted">{L("Sem rendimento ativo", "No active yield")}</span>
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
            {L("Entre na sua conta para carregar seus saldos.", "Sign in to load your balances.")}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <a
          href={addMoneyUrl}
          className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-sm font-black ${pixAvailable ? "bg-tts-deep text-tts-surface hover:bg-tts-deep2" : "border border-tts-border text-tts-muted"}`}
        >
          <QrCode className="h-4 w-4" aria-hidden="true" />
          {L("Adicionar PIX", "Add PIX")}
        </a>
        <a
          href={sendMoneyUrl}
          className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 py-2 text-sm font-black ${pixAvailable ? "border border-tts-border bg-tts-bg text-tts-deep hover:border-tts-border2" : "border border-tts-border text-tts-muted"}`}
        >
          <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
          {L("Retirar PIX", "Withdraw PIX")}
        </a>
      </div>
    </section>
  );
}

function YieldWorkspacePanel({
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
  convertToBestYieldHref,
  configured,
}: {
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
            {L("Rendimento selecionado", "Selected yield")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-tts-muted">
            {selectedHasYield
              ? L("Esse saldo está conectado a uma opção de rendimento.", "This balance is connected to a yield option.")
              : L("Esse saldo ainda não tem rendimento ativo neste ambiente.", "This balance does not have active yield in this environment yet.")}
          </p>
        </div>
        <span className={`inline-flex w-fit border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${selectedProfile.tone}`}>
          {profileShort} · {profileName(selectedProfile, language)}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label={L("Saldo na conta", "Account balance")} value={balanceForSelected ? formatAmount(balanceForSelected.balance, language) : L("A consultar", "Pending")} />
        <MiniStat label={L("Saldo rendendo", "Earning balance")} value={yieldBalanceLoading ? L("Carregando", "Loading") : yieldBalance?.balance ? formatAmount(yieldBalance.balance, language) : L("A consultar", "Pending")} />
        <MiniStat label={L("Taxa anual", "Annual rate")} value={selectedOption ? optionRate(selectedOption, language) : L("Indisponível", "Unavailable")} />
        <MiniStat label={L("Em 12 meses", "In 12 months")} value={selectedOption ? `${formatAmount(projectedEnd, language)} ${profileShort}` : L("Aguardando", "Waiting")} />
      </div>

      {!selectedHasYield ? (
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
              {L("Converter para melhor opção", "Convert to best option")}
            </a>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
          <div className="border border-tts-border bg-tts-bg p-4">
            <div className="grid grid-cols-2 gap-2 border border-tts-border bg-tts-surface p-1">
              <button
                type="button"
                onClick={() => onActionChange("deposit")}
                className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black whitespace-nowrap ${action === "deposit" ? "bg-tts-confirm text-tts-deep" : "text-tts-muted"}`}
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                {L("Guardar", "Save")}
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
              {L("A revisão usa seus saldos da conta. Nenhum valor sai sem confirmação.", "Review uses your account balances. Nothing moves without confirmation.")}
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
                {apiLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                {L("Revisar", "Review")}
              </button>
              {confirmationEnabled ? (
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={!canConfirm}
                  className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-gold px-3 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {L("Confirmar", "Confirm")}
                </button>
              ) : (
                <div className="flex min-h-12 items-center border border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-bold leading-5 text-tts-gold">
                  {L("Confirmação final desligada neste ambiente.", "Final confirmation is off in this environment.")}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <div className="border border-tts-border bg-tts-bg p-4">
              <h3 className="text-base font-black text-tts-deep">{L("Revisão", "Review")}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MiniStat label={L("Ação", "Action")} value={action === "deposit" ? L("Guardar rendendo", "Save for yield") : L("Resgatar", "Withdraw")} />
                <MiniStat label={L("Valor", "Amount")} value={`${formatAmount(amount, language)} ${profileShort}`} />
              </div>
              <div className="mt-4 border border-tts-border bg-tts-surface p-4 text-sm leading-6 text-tts-muted">
                {hasPrepared ? (
                  <p className="font-bold text-tts-confirm">
                    {L("Solicitação preparada. Confira os valores antes de confirmar.", "Request prepared. Check values before confirming.")}
                  </p>
                ) : (
                  <p>{L("Clique em revisar para preparar a operação com sua conta.", "Click review to prepare the operation with your account.")}</p>
                )}
              </div>
            </div>

            <div className="border border-tts-border bg-tts-bg p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-base font-black text-tts-deep">{L("Projeção", "Projection")}</h3>
                <span className="text-xs font-bold text-tts-muted">{`${formatAmount(projectedEarned, language)} ${profileShort} ${L("estimado", "estimated")}`}</span>
              </div>
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
        </div>
      )}
    </section>
  );
}

export function EssentialFlowPanel({
  flowIntent,
  onFlowIntentChange,
  amount,
  onAmountChange,
  amountPresets,
  selectedProfile,
  selectedHasYield,
  bestOption,
  bestProfile,
  authenticated,
  confirmationEnabled,
  pixAvailable,
  destinationPixKey,
  onDestinationPixKeyChange,
  primaryHref,
  primaryLabel,
  convertToBestYieldHref,
  onShowTutorial,
}: {
  flowIntent: FlowIntent;
  onFlowIntentChange: (intent: FlowIntent) => void;
  amount: string;
  onAmountChange: (amount: string) => void;
  amountPresets: string[];
  selectedProfile: MoneyProfile;
  selectedHasYield: boolean;
  bestOption: YieldOption | null;
  bestProfile: MoneyProfile;
  authenticated: boolean;
  confirmationEnabled: boolean;
  pixAvailable: boolean;
  destinationPixKey: string;
  onDestinationPixKeyChange: (value: string) => void;
  primaryHref: string;
  primaryLabel: string;
  convertToBestYieldHref: string;
  onShowTutorial: () => void;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const amountReady = normalizeDecimal(amount) > 0;
  const bestOptionText = bestOption
    ? `${profileName(bestProfile, language)} · ${optionRate(bestOption, language)} ${L("ao ano", "per year")}`
    : L("Aguardando opção", "Waiting for option");
  const selectedName = profileName(selectedProfile, language);
  const actionSummary = flowIntent === "add"
    ? L("Entrada por PIX", "PIX add")
    : flowIntent === "withdraw"
      ? L("Saída por PIX", "PIX withdrawal")
      : selectedHasYield
        ? L("Revisão de rendimento", "Yield review")
        : L("Conversão para render", "Convert to earn");
  const flowOptions: Array<{
    id: FlowIntent;
    title: string;
    detail: string;
    icon: ReactNode;
  }> = [
    {
      id: "add",
      title: L("Trazer", "Add"),
      detail: L("PIX de entrada com valor preenchido.", "PIX add with amount prefilled."),
      icon: <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: "earn",
      title: L("Render", "Earn"),
      detail: selectedHasYield
        ? L("Revisar rendimento da moeda escolhida.", "Review yield for the selected currency.")
        : L("Converter para a melhor opção disponível.", "Convert to the best available option."),
      icon: <PiggyBank className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: "withdraw",
      title: L("Sair", "Withdraw"),
      detail: L("PIX de saída com chave dinâmica.", "PIX withdrawal with a dynamic key."),
      icon: <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />,
    },
  ];
  const readiness = [
    {
      key: "account",
      label: L("Conta", "Account"),
      ready: authenticated,
      detail: authenticated ? L("Pronta para revisar operações.", "Ready to review operations.") : L("Entre para consultar saldos e confirmar.", "Sign in to check balances and confirm."),
    },
    {
      key: "amount",
      label: L("Valor definido", "Amount set"),
      ready: amountReady,
      detail: amountReady ? `${formatAmount(amount, language)} ${selectedProfile.short}` : L("Informe um valor maior que zero.", "Enter an amount above zero."),
    },
    ...(flowIntent === "add" || flowIntent === "withdraw" ? [{
      key: "pix",
      label: L("PIX disponível", "PIX available"),
      ready: pixAvailable,
      detail: pixAvailable ? L("Entrada e saída podem continuar.", "Add and withdraw can continue.") : L("PIX ainda não está disponível neste ambiente.", "PIX is not available in this environment yet."),
    }] : []),
    ...(flowIntent === "earn" ? [{
      key: "yield",
      label: L("Rendimento", "Yield"),
      ready: selectedHasYield || Boolean(bestOption),
      detail: selectedHasYield ? L("A moeda escolhida tem revisão de rendimento.", "The selected currency has yield review.") : bestOptionText,
    }, {
      key: "confirmation",
      label: L("Confirmação", "Confirmation"),
      ready: confirmationEnabled,
      detail: confirmationEnabled ? L("PIN habilitado para concluir.", "PIN enabled to finish.") : L("Você ainda pode revisar a simulação.", "You can still review the preview."),
    }] : []),
    ...(flowIntent === "withdraw" ? [{
      key: "pix-key",
      label: L("Chave PIX de saída", "Withdrawal PIX key"),
      ready: Boolean(destinationPixKey.trim()),
      detail: destinationPixKey.trim() || L("Pode preencher agora ou na tela de retirada.", "You can fill it now or on the withdrawal screen."),
    }] : []),
    ...(flowIntent === "add" ? [{
      key: "destination",
      label: L("Destino", "Destination"),
      ready: true,
      detail: L(`Saldo em ${selectedName} depois do PIX.`, `Balance in ${selectedName} after PIX.`),
    }] : []),
  ];
  const blockers = readiness.filter((item) => !item.ready).length;
  const readinessTone = blockers === 0 ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" : "border-tts-gold bg-tts-gold-bg text-tts-gold";
  const readinessText = blockers === 0
    ? L("Pronto para avançar", "Ready to continue")
    : L(`${blockers} ponto${blockers > 1 ? "s" : ""} para revisar`, `${blockers} item${blockers > 1 ? "s" : ""} to review`);

  return (
    <section className="border border-tts-border bg-tts-surface p-5" aria-label={L("Plano essencial", "Essential plan")}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                <ShieldCheck className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                {L("O que fazer agora", "What to do now")}
              </h2>
              <p className="mt-2 text-sm leading-6 text-tts-muted">
                {L(
                  "Escolha o que quer fazer. A tela mantém valor, moeda e chave PIX no mesmo lugar.",
                  "Choose what you want to do. The screen keeps amount, currency, and PIX key in one place."
                )}
              </p>
            </div>
            <span className={`inline-flex w-fit border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${selectedProfile.tone}`}>
              {selectedProfile.short} · {selectedName}
            </span>
          </div>

          <div className="mt-5 grid gap-2 md:grid-cols-3" role="tablist" aria-label={L("Intenção do fluxo", "Flow intent")}>
            {flowOptions.map((option) => {
              const selected = option.id === flowIntent;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onFlowIntentChange(option.id)}
                  className={`min-h-[118px] border p-4 text-left transition ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"}`}
                >
                  <span className={`inline-flex h-9 w-9 items-center justify-center ${selected ? "bg-tts-confirm text-tts-deep" : "bg-tts-surface text-tts-muted"}`}>
                    {option.icon}
                  </span>
                  <span className="mt-3 block text-base font-black text-tts-deep">{option.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-tts-muted">{option.detail}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div>
              <label className="block text-sm font-black text-tts-deep" htmlFor="essential-flow-amount">
                {L("Valor", "Amount")}
              </label>
              <input
                id="essential-flow-amount"
                value={amount}
                onChange={(event) => onAmountChange(event.target.value.replace(/[^\d,.]/g, ""))}
                inputMode="decimal"
                className="mt-2 min-h-12 w-full border border-tts-border bg-tts-bg px-3 text-base font-bold text-tts-deep outline-none focus:border-tts-gold"
              />
              <div className="mt-2 grid grid-cols-4 gap-2">
                {amountPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onAmountChange(preset)}
                    className="min-h-9 border border-tts-border bg-tts-bg px-2 text-xs font-black text-tts-deep transition hover:border-tts-border2"
                  >
                    {formatAmount(preset, language)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-tts-muted">
                {L("Este mesmo valor alimenta a entrada, a retirada e a revisão.", "This same amount feeds add money, withdrawal, and review.")}
              </p>
            </div>

            <div>
              <label className="block text-sm font-black text-tts-deep" htmlFor="essential-flow-pix-key">
                {L("Chave PIX para saída", "PIX key for withdrawal")}
              </label>
              <input
                id="essential-flow-pix-key"
                value={destinationPixKey}
                onChange={(event) => onDestinationPixKeyChange(event.target.value)}
                placeholder={L("email, CPF, telefone ou chave aleatória", "email, tax ID, phone, or random key")}
                className="mt-2 min-h-12 w-full border border-tts-border bg-tts-bg px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
              />
              <p className="mt-2 text-xs leading-5 text-tts-muted">
                {flowIntent === "withdraw"
                  ? L("Preencher aqui evita repetir a chave na retirada.", "Filling it here avoids typing the key again at withdrawal.")
                  : L("Opcional agora; fica pronto se você decidir sair para PIX.", "Optional now; ready if you decide to send out to PIX.")}
              </p>
            </div>
          </div>
        </div>

        <div className="border border-tts-border bg-tts-bg p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-black text-tts-deep">{L("Próximo passo", "Next step")}</h3>
              <p className="mt-1 text-sm leading-5 text-tts-muted">{actionSummary}</p>
            </div>
            <span className={`inline-flex w-fit border px-2 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${readinessTone}`}>
              {readinessText}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {readiness.map((item) => (
              <ReadinessItem key={item.key} ready={item.ready} label={item.label} detail={item.detail} />
            ))}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <a
              href={primaryHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
            >
              {flowIntent === "add" ? <QrCode className="h-4 w-4" aria-hidden="true" /> : flowIntent === "withdraw" ? <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" /> : <PiggyBank className="h-4 w-4" aria-hidden="true" />}
              {primaryLabel}
            </a>
            <button
              type="button"
              onClick={onShowTutorial}
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              {L("Como usar", "How to use")}
            </button>
          </div>

          {!selectedHasYield && bestOption ? (
            <div className="mt-4 border border-tts-gold bg-tts-gold-bg p-3 text-sm leading-6 text-tts-gold">
              <p className="font-black">{L("Sugestão essencial", "Essential suggestion")}</p>
              <p className="mt-1">
                {L(
                  `A moeda ${selectedProfile.short} ainda não tem rendimento aqui. A melhor opção disponível agora é ${bestOptionText}.`,
                  `${selectedProfile.short} does not have yield here yet. The best available option now is ${bestOptionText}.`
                )}
              </p>
              <a href={convertToBestYieldHref} className="mt-3 inline-flex min-h-10 items-center justify-center bg-tts-gold px-3 py-2 text-xs font-black text-tts-deep transition hover:bg-tts-gold/90">
                {L("Converter para melhor opção", "Convert to best option")}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ReadinessItem({ ready, label, detail }: { ready: boolean; label: string; detail: string }) {
  return (
    <div className={`border p-3 ${ready ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-gold bg-tts-gold-bg"}`}>
      <div className="flex items-center gap-2">
        {ready ? <CheckCircle2 className="h-4 w-4 text-tts-confirm" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-tts-gold" aria-hidden="true" />}
        <p className={`text-sm font-black ${ready ? "text-tts-confirm" : "text-tts-gold"}`}>{label}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-tts-muted">{detail}</p>
    </div>
  );
}

export function BalancePanel({
  balances,
  options,
  selectedCode,
  onSelect,
}: {
  balances: BalanceLine[];
  options: YieldOption[];
  selectedCode: string;
  onSelect: (code: string) => void;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const balanceItems: BalanceLine[] = balances.length
    ? balances
    : options.length
      ? options.map((option) => ({
      asset_code: optionCode(option),
      balance: "0",
    }))
      : [{
        asset_code: selectedCode,
        balance: "0",
      }];

  return (
    <section className="border border-tts-border bg-tts-surface p-5">
      <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
        <Coins className="h-5 w-5 text-tts-gold" aria-hidden="true" />
        {L("Seus saldos", "Your balances")}
      </h2>
      <p className="mt-2 text-sm leading-6 text-tts-muted">
        {L("Toque em uma moeda para usar no plano de rendimento.", "Tap a currency to use it in the yield plan.")}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {balanceItems.length ? balanceItems.map((item) => {
          const code = String(item.asset_code || "").toUpperCase();
          const profile = moneyProfile(code);
          const selected = code === selectedCode;
          return (
            <button
              key={`${code}-${item.asset_issuer || "default"}`}
              type="button"
              onClick={() => onSelect(code)}
              className={`min-h-[128px] border p-4 text-left transition ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"}`}
            >
              <span className={`inline-flex border px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${profile.tone}`}>
                {profile.short}
              </span>
              <span className="mt-3 block text-2xl font-black text-tts-deep">{formatAmount(item.balance, language)}</span>
              <span className="mt-1 block text-sm font-bold text-tts-muted">{profileName(profile, language)}</span>
              <span className="mt-3 block text-xs leading-5 text-tts-muted">{profileDescription(profile, language)}</span>
            </button>
          );
        }) : (
          <div className="border border-tts-border bg-tts-bg p-4 text-sm leading-6 text-tts-muted sm:col-span-2">
            {L("Entre na sua conta para carregar seus saldos.", "Sign in to load your balances.")}
          </div>
        )}
      </div>
    </section>
  );
}

export function YieldProjectionPanel({
  data,
  profile,
  option,
  amount,
}: {
  data: Array<{ month: number; label: string; balance: number; earned: number }>;
  profile: MoneyProfile;
  option: YieldOption | null;
  amount: string;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const rate = optionRate(option, language);
  const profileShort = profile.short;
  const projectedEnd = data[data.length - 1]?.balance || 0;
  const projectedEarned = data[data.length - 1]?.earned || 0;

  if (!option) {
    return (
      <section className="border border-tts-border bg-tts-surface p-5">
        <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
          <Sparkles className="h-5 w-5 text-tts-gold" aria-hidden="true" />
          {L("Projeção de rendimento", "Yield projection")}
        </h2>
        <div className="mt-4 border border-tts-gold bg-tts-gold-bg p-4 text-sm leading-6 text-tts-muted">
          <p className="font-black text-tts-gold">{L("Aguardando opção ativa", "Waiting for an active option")}</p>
          <p className="mt-1">
            {L(
              "Configure uma opção de rendimento no backend para ver taxa, projeção e revisão antes do PIN.",
              "Configure a backend yield option to see rate, projection, and review before PIN."
            )}
          </p>
        </div>
      </section>
    );
  }

  const tooltipFormatter = (value: unknown, name: unknown) => {
    const label = String(name) === "earned" ? L("Rendimento", "Yield") : L("Saldo", "Balance");
    return [`${formatAmount(value, language)} ${profileShort}`, label];
  };

  return (
    <section className="border border-tts-border bg-tts-surface p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
            <Sparkles className="h-5 w-5 text-tts-gold" aria-hidden="true" />
            {L("Projeção de rendimento", "Yield projection")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
            {L(
              "Simulação simples com o valor informado. A taxa pode variar e a confirmação final sempre acontece antes do PIN.",
              "Simple preview using the amount entered. Rates can vary, and final confirmation always happens before PIN."
            )}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[320px]">
          <MiniStat label={L("Taxa anual", "Annual rate")} value={rate} />
          <MiniStat label={L("Em 12 meses", "In 12 months")} value={`${formatAmount(projectedEnd, language)} ${profileShort}`} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="border border-tts-border bg-tts-bg p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-black text-tts-deep">{L("Saldo projetado", "Projected balance")}</h3>
            <span className="text-xs font-bold text-tts-muted">{`${formatAmount(amount, language)} ${profileShort}`}</span>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--tts-border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} tickFormatter={(value) => formatAmount(value, language)} />
                <Tooltip formatter={tooltipFormatter} labelFormatter={(label) => `${L("Mês", "Month")}: ${label}`} />
                <Area type="monotone" dataKey="balance" stroke="var(--tts-confirm)" fill="var(--tts-confirm)" fillOpacity={0.16} strokeWidth={2} name="balance" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-tts-border bg-tts-bg p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-base font-black text-tts-deep">{L("Rendimento acumulado", "Accumulated yield")}</h3>
            <span className="text-xs font-bold text-tts-muted">{`${formatAmount(projectedEarned, language)} ${profileShort}`}</span>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.slice(1)} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--tts-border)" strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} width={58} tick={{ fill: "var(--tts-muted)", fontSize: 12 }} tickFormatter={(value) => formatAmount(value, language)} />
                <Tooltip formatter={tooltipFormatter} labelFormatter={(label) => `${L("Mês", "Month")}: ${label}`} />
                <Bar dataKey="earned" fill="var(--tts-gold)" name="earned" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ReviewPanel({
  action,
  amount,
  profile,
  option,
  balanceForSelected,
  yieldBalance,
  result,
  confirmationEnabled,
}: {
  action: "deposit" | "withdraw";
  amount: string;
  profile: MoneyProfile;
  option: YieldOption | null;
  balanceForSelected?: BalanceLine;
  yieldBalance: any | null;
  result: any | null;
  confirmationEnabled: boolean;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  if (!option) {
    return (
      <section className="border border-tts-border bg-tts-bg p-4">
        <h3 className="text-base font-black text-tts-deep">{L("Escolha uma opção para revisar", "Choose an option to review")}</h3>
        <div className="mt-4 border border-tts-gold bg-tts-gold-bg p-4 text-sm leading-6 text-tts-muted">
          <p className="font-black text-tts-gold">{L("Rendimento ainda não configurado", "Yield is not configured yet")}</p>
          <p className="mt-1">
            {L(
              "Assim que o backend devolver pelo menos uma opção, esta área mostra valor, taxa, saldo e confirmação.",
              "As soon as the backend returns at least one option, this area shows amount, rate, balance, and confirmation."
            )}
          </p>
        </div>
      </section>
    );
  }
  return (
    <section className="border border-tts-border bg-tts-bg p-4">
      <h3 className="text-base font-black text-tts-deep">{L("Resumo antes do PIN", "Summary before PIN")}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniStat label={L("Ação", "Action")} value={action === "deposit" ? L("Guardar rendendo", "Save for yield") : L("Resgatar", "Withdraw")} />
        <MiniStat label={L("Valor", "Amount")} value={`${formatAmount(amount, language)} ${profile.short}`} />
        <MiniStat label={L("Moeda", "Currency")} value={profileName(profile, language)} />
        <MiniStat label={L("Rendimento", "Yield")} value={optionRate(option, language)} />
        <MiniStat label={L("Saldo na conta", "Account balance")} value={balanceForSelected ? formatAmount(balanceForSelected.balance, language) : L("A consultar", "Pending")} />
        <MiniStat label={L("Saldo rendendo", "Yield balance")} value={yieldBalance?.balance ? formatAmount(yieldBalance.balance, language) : L("A consultar", "Pending")} />
      </div>

      <div className="mt-4 border border-tts-border bg-tts-surface p-4 text-sm leading-6 text-tts-muted">
        {result ? (
          <p className="font-bold text-tts-confirm">
            {L("Solicitação preparada. Revise os valores e confirme apenas se estiver tudo certo.", "Request prepared. Review the values and only confirm if everything looks right.")}
          </p>
        ) : (
          <p>
            {L("Primeiro revise a solicitação. Depois, se a confirmação estiver disponível, use seu PIN para concluir.", "Review the request first. Then, if confirmation is available, use your PIN to finish.")}
          </p>
        )}
      </div>

      {!confirmationEnabled ? (
        <div className="mt-3 border border-tts-gold bg-tts-gold-bg p-3 text-sm font-bold text-tts-gold">
          {L("A confirmação final ainda está em preparo neste ambiente.", "Final confirmation is still being prepared in this environment.")}
        </div>
      ) : null}
    </section>
  );
}

export function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">{label}</p>
      <p className="mt-2 text-xl font-black text-tts-deep">{value}</p>
      <p className="mt-1 text-sm leading-5 text-tts-muted">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-tts-border bg-tts-surface p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-tts-muted">{label}</p>
      <p className="mt-1 text-sm font-black text-tts-deep">{value}</p>
    </div>
  );
}
