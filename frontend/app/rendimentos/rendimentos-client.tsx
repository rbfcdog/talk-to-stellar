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
  CheckCircle2,
  Coins,
  Loader2,
  PiggyBank,
  QrCode,
  RefreshCw,
  ShieldCheck,
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
  const [selectedCode, setSelectedCode] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [flowIntent, setFlowIntent] = useState<FlowIntent>("earn");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [cycleMode, setCycleMode] = useState(false);
  const [cycleDestinationPixKey, setCycleDestinationPixKey] = useState("");
  const [variationBps, setVariationBps] = useState("100");
  const [pin, setPin] = useState("");
  const [yieldBalance, setYieldBalance] = useState<any | null>(null);
  const [yieldResult, setYieldResult] = useState<any | null>(null);
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
  const totalBalances = balances.length;
  const safeSelectedCode = optionCode(selectedOption) || selectedCode;
  const selectedProfile = moneyProfile(safeSelectedCode);
  const bestOptionCode = optionCode(bestOption);
  const bestProfile = moneyProfile(bestOptionCode || safeSelectedCode);
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
  const keepMoneyUrl = useMemo(() => buildMoneyUrl(cycleMode ? "/money-cycle" : "/yield", {
    action,
    asset: safeSelectedCode,
    amount,
    advanced: advancedOpen ? "1" : "",
    cycle: cycleMode ? "1" : "",
    destination_pix_key: cycleDestinationPixKey,
    lang: language,
  }), [action, amount, advancedOpen, cycleDestinationPixKey, cycleMode, safeSelectedCode, language]);
  const cycleMoneyUrl = useMemo(() => buildMoneyUrl("/money-cycle", {
    cycle: "1",
    action: "deposit",
    asset: safeSelectedCode,
    amount,
    destination_pix_key: cycleDestinationPixKey,
    advanced: "1",
    lang: language,
  }), [amount, cycleDestinationPixKey, safeSelectedCode, language]);
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
  const earnReviewUrl = selectedHasYield || !bestOptionCode ? "#yield-plan" : convertToBestYieldUrl;
  const primaryFlowUrl = flowIntent === "add"
    ? addMoneyUrl
    : flowIntent === "withdraw"
      ? sendMoneyUrl
      : earnReviewUrl;
  const primaryFlowLabel = flowIntent === "add"
    ? L("Abrir PIX de entrada", "Open PIX add")
    : flowIntent === "withdraw"
      ? L("Abrir retirada PIX", "Open PIX withdrawal")
      : !selectedHasYield && bestOptionCode
        ? L("Converter para render", "Convert to earn")
        : L("Revisar rendimento", "Review yield");
  const flowChatPrompt = flowIntent === "add"
    ? L(`colocar ${amount || "0"} reais com PIX e manter em ${profileName(selectedProfile, language)}`, `add ${amount || "0"} reais with PIX and keep it in ${profileName(selectedProfile, language)}`)
    : flowIntent === "withdraw"
      ? L(`retirar ${amount || "0"} ${profileName(selectedProfile, language)} para meu PIX${cycleDestinationPixKey ? ` ${cycleDestinationPixKey}` : ""}`, `withdraw ${amount || "0"} ${profileName(selectedProfile, language)} to my PIX${cycleDestinationPixKey ? ` ${cycleDestinationPixKey}` : ""}`)
      : L(`deixar ${amount || "0"} ${profileName(selectedProfile, language)} rendendo`, `keep ${amount || "0"} ${profileName(selectedProfile, language)} earning`);
  const flowChatUrl = useMemo(() => buildMoneyUrl("/chat", {
    prompt: flowChatPrompt,
    lang: language,
  }), [flowChatPrompt, language]);

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
    if (queryCycleMode) setCycleMode(true);
    if (queryAsset) {
      requestedAssetRef.current = queryAsset;
      setSelectedCode(queryAsset);
    }
    if (queryAmount > 0) setAmount(String(queryAmount));
    if (queryAction === "withdraw" || queryAction === "resgatar") setAction("withdraw");
    if (queryAction === "deposit" || queryAction === "guardar") setAction("deposit");
    if (queryFlow === "add" || queryFlow === "bring" || queryFlow === "entrada") setFlowIntent("add");
    if (queryFlow === "earn" || queryFlow === "yield" || queryFlow === "rendimento" || queryFlow === "keep") setFlowIntent("earn");
    if (queryFlow === "withdraw" || queryFlow === "exit" || queryFlow === "saida" || queryFlow === "sair") {
      setFlowIntent("withdraw");
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
        setApiState({ loading: false, message: L("Entre para ver seus saldos e preparar rendimentos.", "Sign in to see balances and prepare yield."), error: "" });
        return;
      }

      const accountPayload = await financialApi("wallet").catch(() => ({ wallet: null }));
      if (accountPayload?.wallet?.public_key) {
        const balancePayload = await financialApi("balance").catch(() => ({ balances: [] }));
        setBalances(Array.isArray(balancePayload?.balances) ? balancePayload.balances : []);
      } else {
        setBalances([]);
      }

      setApiState({ loading: false, message: L("Saldos e rendimentos atualizados.", "Balances and yield updated."), error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error, language) });
    }
  }

  async function refreshYieldBalance() {
    if (!selectedOption) return;
    setApiState({ loading: true, message: "", error: "" });
    try {
      const payload = await yieldApi(`defindex/yield/balance?asset_code=${encodeURIComponent(selectedOption.asset_code)}&vault_address=${encodeURIComponent(selectedOption.vault_address)}`);
      setYieldBalance(payload);
      setApiState({ loading: false, message: L("Saldo de rendimento atualizado.", "Yield balance updated."), error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: sanitizeUiError(error, language) });
    }
  }

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
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-5 border-b border-tts-border pb-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 border border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-tts-gold">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {L("Rendimentos", "Yield")}
            </div>
            <h1 className="max-w-3xl text-3xl font-black tracking-tight text-tts-deep md:text-5xl">
              {L("Saldos que trabalham por você", "Balances that work for you")}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-tts-muted md:text-base">
              {L(
                "Veja seu dinheiro por moeda, escolha quanto quer deixar rendendo e confirme tudo com calma. A tela prioriza nomes simples, valores claros e ações reversíveis.",
                "See your money by currency, choose how much you want to put to work, and review everything calmly. This screen uses simple names, clear values, and reversible actions."
              )}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={refreshDashboard}
              className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
            >
              {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {L("Atualizar saldos", "Refresh balances")}
            </button>
            <a
              href="/chat"
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {L("Acessar minha conta", "Access my account")}
            </a>
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
          <div className="border border-tts-confirm bg-tts-confirm/10 p-4 text-sm font-semibold text-tts-confirm" aria-live="polite">
            {apiState.message}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-4" aria-label={L("Resumo da conta", "Account summary")}>
          <Metric label={L("Moedas na conta", "Currencies")} value={String(totalBalances || options.length || 0)} detail={L("Saldos disponíveis", "Available balances")} />
          <Metric label={L("Opções rendendo", "Yield options")} value={String(options.length)} detail={configured ? L("Prontas para simular", "Ready to preview") : L("Aguardando configuração", "Waiting for setup")} />
          <Metric label="PIX" value={pixAvailable ? L("Disponível", "Available") : L("Pendente", "Pending")} detail={L("Entrada e retirada em reais", "Add and withdraw in reais")} />
          <Metric label={L("Confirmação", "Confirmation")} value={confirmationEnabled ? L("Ativa", "Active") : L("Em preparo", "In setup")} detail={confirmationEnabled ? L("PIN habilitado", "PIN enabled") : L("Somente revisão", "Review only")} />
        </section>

        <EssentialFlowPanel
          flowIntent={flowIntent}
          onFlowIntentChange={(next) => {
            setFlowIntent(next);
            if (next === "earn") setAction("deposit");
            if (next === "withdraw") setAction("withdraw");
          }}
          amount={amount}
          onAmountChange={setAmount}
          amountPresets={amountPresets}
          selectedProfile={selectedProfile}
          selectedHasYield={selectedHasYield}
          bestOption={bestOption}
          bestProfile={bestProfile}
          authenticated={session.authenticated}
          confirmationEnabled={confirmationEnabled}
          pixAvailable={pixAvailable}
          destinationPixKey={cycleDestinationPixKey}
          onDestinationPixKeyChange={setCycleDestinationPixKey}
          primaryHref={primaryFlowUrl}
          primaryLabel={primaryFlowLabel}
          chatHref={flowChatUrl}
          convertToBestYieldHref={convertToBestYieldUrl}
        />

        <section className="border border-tts-border bg-tts-surface p-5" aria-label={L("Ciclo do dinheiro", "Money cycle")}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                <WalletCards className="h-5 w-5 text-tts-gold" aria-hidden="true" />
                {cycleMode ? L("Ciclo completo consolidado", "Consolidated money cycle") : L("Entrar, render e sair", "Add, earn, and send out")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
                {L(
                  "O dinheiro entra por PIX, fica na melhor opção de rendimento disponível para você revisar, e sai por PIX com a chave informada na hora.",
                  "Money comes in by PIX, moves into the best available earning option for review, and goes out by PIX with the key entered at the moment."
                )}
              </p>
            </div>
            <span className="inline-flex w-fit border border-tts-border bg-tts-bg px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-tts-muted">
              {selectedProfile.short} · {profileName(selectedProfile, language)}
            </span>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <CycleStep
              index="1"
              title={L("Injetar por PIX", "Add by PIX")}
              detail={L("Use o PIX de entrada para criar saldo na moeda escolhida.", "Use PIX in to create balance in the selected currency.")}
              href={addMoneyUrl}
              action={L("Abrir entrada", "Open add money")}
            />
            <CycleStep
              index="2"
              title={L("Render melhor", "Earn best available")}
              detail={bestOption
                ? L(
                    `Melhor opção atual: ${profileName(bestProfile, language)} com ${optionRate(bestOption, language)} ao ano.`,
                    `Current best option: ${profileName(bestProfile, language)} at ${optionRate(bestOption, language)} per year.`
                  )
                : L("Aguardando configuração das opções de rendimento.", "Waiting for earning options to be configured.")}
              href={bestOption ? buildMoneyUrl(cycleMode ? "/money-cycle" : "/yield", { cycle: cycleMode ? "1" : "", asset: bestOptionCode, amount, destination_pix_key: cycleDestinationPixKey, advanced: "1", lang: language }) : keepMoneyUrl}
              action={bestOption ? L("Usar melhor opção", "Use best option") : L("Abrir revisão", "Open review")}
            />
            <CycleStep
              index="3"
              title={L("Sair para PIX", "Send out to PIX")}
              detail={cycleDestinationPixKey
                ? L(`Saída preparada para ${cycleDestinationPixKey}. Você ainda revisa antes do PIN.`, `Exit prepared for ${cycleDestinationPixKey}. You still review before PIN.`)
                : L("A retirada pergunta a chave PIX dinamicamente antes do PIN.", "Withdrawal asks for the PIX key dynamically before PIN.")}
              href={sendMoneyUrl}
              action={L("Abrir saída", "Open withdrawal")}
            />
          </div>

          <div className="mt-5 border border-tts-confirm bg-tts-confirm/10 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-black text-tts-confirm">{L("Ambiente consolidado", "Consolidated environment")}</p>
                <p className="mt-1 text-sm leading-6 text-tts-muted">
                  {selectedHasYield
                    ? L("A moeda selecionada já tem uma opção de rendimento para revisão.", "The selected currency already has an earning option ready for review.")
                    : bestOption
                      ? L("A moeda selecionada ainda não tem rendimento configurado aqui; use a melhor opção disponível ou troque a moeda.", "The selected currency does not have earning configured here yet; use the best available option or switch currency.")
                      : L("Configure uma opção de rendimento para completar o ciclo interno.", "Configure an earning option to complete the internal cycle.")}
                </p>
              </div>
              <a
                href={cycleMoneyUrl}
                className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-confirm px-4 py-2 text-sm font-black text-tts-deep transition hover:bg-tts-confirm/90"
              >
                <WalletCards className="h-4 w-4" aria-hidden="true" />
                {L("Abrir ciclo", "Open cycle")}
              </a>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ActionLink href={addMoneyUrl} icon={<ArrowDownToLine className="h-4 w-4" aria-hidden="true" />} title={L("Trazer dinheiro", "Add money")} body={L("Abra PIX já com a moeda e o valor preenchidos.", "Open PIX with currency and amount prefilled.")} />
            <ActionLink href={keepMoneyUrl} icon={<PiggyBank className="h-4 w-4" aria-hidden="true" />} title={L("Manter rendendo", "Keep earning")} body={L("Continue nesta tela para revisar taxa, valor e confirmação.", "Stay on this screen to review rate, amount, and confirmation.")} />
            <ActionLink href={sendMoneyUrl} icon={<ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />} title={L("Mandar para PIX", "Send to PIX")} body={L("A retirada pede a chave PIX dinamicamente antes do PIN.", "Withdrawal asks for the PIX key dynamically before PIN.")} />
          </div>
        </section>

        <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <BalancePanel balances={balances} options={options} selectedCode={safeSelectedCode} onSelect={setSelectedCode} />

          <section id="yield-plan" className="scroll-mt-6 border border-tts-border bg-tts-surface p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
                  <PiggyBank className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                  {L("Plano de rendimento", "Yield plan")}
                </h2>
                <p className="mt-2 text-sm leading-6 text-tts-muted">
                  {L("Escolha uma moeda, informe o valor e revise antes de confirmar.", "Choose a currency, enter an amount, and review before confirming.")}
                </p>
              </div>
              <button
                type="button"
                aria-pressed={advancedOpen}
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {advancedOpen ? L("Ocultar ajustes", "Hide settings") : L("Modo avançado", "Advanced mode")}
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={L("Moeda para rendimento", "Currency for yield")}>
              {options.length ? options.map((option) => {
                const code = optionCode(option);
                const profile = moneyProfile(code);
                const selected = code === safeSelectedCode;
                const recommended = code === bestOptionCode;
                return (
                  <button
                    key={`${option.asset_code}-${option.vault_address}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setSelectedCode(code);
                      setYieldBalance(null);
                      setYieldResult(null);
                    }}
                    className={`min-h-[128px] border p-4 text-left transition ${selected ? "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"}`}
                  >
                    <span className={`inline-flex border px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${profile.tone}`}>
                      {profile.short}
                    </span>
                    {recommended ? (
                      <span className="ml-2 inline-flex border border-tts-confirm bg-tts-confirm/10 px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-tts-confirm">
                        {L("Melhor", "Best")}
                      </span>
                    ) : null}
                    <span className="mt-3 block text-lg font-black text-tts-deep">{optionTitle(option, language)}</span>
                    <span className="mt-1 block text-sm text-tts-muted">{profileDescription(profile, language)}</span>
                    <span className="mt-3 inline-flex items-center gap-2 text-sm font-black text-tts-confirm">
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                      {optionRate(option, language)} {L("ao ano", "per year")}
                    </span>
                  </button>
                );
              }) : (
                <div className="border border-tts-gold bg-tts-gold-bg p-4 text-sm text-tts-gold md:col-span-3">
                  {L("As opções de rendimento ainda não foram configuradas para este ambiente.", "Yield options have not been set up for this environment yet.")}
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
              <div className="border border-tts-border bg-tts-bg p-4">
                <div className="grid grid-cols-2 gap-2 border border-tts-border bg-tts-surface p-1">
                  <button
                    type="button"
                    onClick={() => setAction("deposit")}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black whitespace-nowrap ${action === "deposit" ? "bg-tts-confirm text-tts-deep" : "text-tts-muted"}`}
                  >
                    <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                    {L("Guardar", "Save")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAction("withdraw")}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black whitespace-nowrap ${action === "withdraw" ? "bg-tts-gold text-tts-deep" : "text-tts-muted"}`}
                  >
                    <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                    {L("Resgatar", "Withdraw")}
                  </button>
                </div>

                <label className="mt-4 block text-sm font-black text-tts-deep" htmlFor="yield-amount">
                  {L("Valor em", "Amount in")} {profileName(selectedProfile, language).toLowerCase()}
                </label>
                <input
                  id="yield-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value.replace(/[^\d,.]/g, ""))}
                  inputMode="decimal"
                  className="mt-2 min-h-12 w-full border border-tts-border bg-tts-surface px-3 text-base font-bold text-tts-deep outline-none focus:border-tts-gold"
                  aria-describedby="yield-amount-help"
                />
                <p id="yield-amount-help" className="mt-2 text-xs leading-5 text-tts-muted">
                  {L("Você pode revisar antes de confirmar. Nenhum valor sai sem PIN.", "You can review before confirming. No money moves without your PIN.")}
                </p>

                {advancedOpen ? (
                  <div className="mt-4 border-t border-tts-border pt-4">
                    <label className="block text-sm font-black text-tts-deep" htmlFor="yield-variation">
                      {L("Margem de segurança", "Safety margin")}
                    </label>
                    <select
                      id="yield-variation"
                      value={variationBps}
                      onChange={(event) => setVariationBps(event.target.value)}
                      className="mt-2 min-h-12 w-full border border-tts-border bg-tts-surface px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                    >
                      <option value="50">{L("Baixa", "Low")}</option>
                      <option value="100">{L("Padrão", "Standard")}</option>
                      <option value="200">{L("Alta", "High")}</option>
                    </select>

                    <label className="mt-4 block text-sm font-black text-tts-deep" htmlFor="yield-pin">
                      {L("PIN para confirmar", "PIN to confirm")}
                    </label>
                    <input
                      id="yield-pin"
                      value={pin}
                      onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                      inputMode="numeric"
                      type="password"
                      className="mt-2 min-h-12 w-full border border-tts-border bg-tts-surface px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold"
                    />
                  </div>
                ) : null}

                <div className="mt-5 grid gap-2">
                  <button
                    type="button"
                    onClick={refreshYieldBalance}
                    disabled={!canPrepare || apiState.loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border px-3 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {L("Ver saldo", "Check balance")}
                  </button>
                  <button
                    type="button"
                    onClick={prepareYield}
                    disabled={!canPrepare || apiState.loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    {L("Revisar", "Review")}
                  </button>
                  <button
                    type="button"
                    onClick={confirmYield}
                    disabled={!canPrepare || !confirmationEnabled || pin.length < 4 || apiState.loading}
                    className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-gold px-3 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {L("Confirmar", "Confirm")}
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                <ReviewPanel
                  action={action}
                  amount={amount}
                  profile={selectedProfile}
                  option={selectedOption}
                  balanceForSelected={balanceForSelected}
                  yieldBalance={yieldBalance}
                  result={yieldResult}
                  confirmationEnabled={confirmationEnabled}
                />
              </div>
            </div>
          </section>
        </section>

        <YieldProjectionPanel
          data={projectionData}
          profile={selectedProfile}
          option={selectedOption}
          amount={amount}
        />

        <section className="grid gap-4 lg:grid-cols-3">
          <ActionLink href={addMoneyUrl} icon={<QrCode className="h-4 w-4" aria-hidden="true" />} title={L("Adicionar por PIX", "Add with PIX")} body={L("Abre com valor e moeda já preenchidos.", "Opens with amount and currency prefilled.")} />
          <ActionLink href={sendMoneyUrl} icon={<ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />} title={L("Retirar por PIX", "Withdraw with PIX")} body={L("Usa a chave PIX informada nesta tela.", "Uses the PIX key entered on this screen.")} />
          <ActionLink href={flowChatUrl} icon={<Sparkles className="h-4 w-4" aria-hidden="true" />} title={L("Pedir ajuda", "Ask for help")} body={L("Leva o pedido atual para o chat.", "Sends the current request to chat.")} />
        </section>

        <section className="border border-tts-border bg-tts-surface p-5">
          <h2 className="text-lg font-black text-tts-deep">{L("Antes de confirmar", "Before confirming")}</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <InfoBlock title={L("Você escolhe a moeda", "You choose the currency")} body={L("Dólares, euros e reais aparecem com nomes simples para reduzir erro de seleção.", "Dollars, euros, and reais appear with simple names to reduce selection mistakes.")} />
            <InfoBlock title={L("Nada é automático", "Nothing is automatic")} body={L("A tela prepara a solicitação primeiro. A confirmação final depende do seu PIN.", "The screen prepares the request first. Final confirmation depends on your PIN.")} />
            <InfoBlock title={L("PIX fica separado", "PIX stays separate")} body={L("Entrada e retirada em reais continuam em botões próprios para ficar claro o caminho do dinheiro.", "Adding and withdrawing reais remain in their own buttons so the money path stays clear.")} />
          </div>
        </section>
      </section>
    </main>
  );
}

function EssentialFlowPanel({
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
  chatHref,
  convertToBestYieldHref,
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
  chatHref: string;
  convertToBestYieldHref: string;
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
                  "Escolha a intenção principal. A tela ajusta o próximo botão, o chat e a chave PIX sem trocar de contexto.",
                  "Choose the main intent. The screen adjusts the next button, chat, and PIX key without changing context."
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
                {L("Este mesmo valor alimenta os botões de PIX, rendimento e chat.", "This same amount feeds PIX, yield, and chat actions.")}
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
            <a
              href={chatHref}
              className="inline-flex min-h-12 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {L("Pedir no chat", "Ask in chat")}
            </a>
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

function ReadinessItem({ ready, label, detail }: { ready: boolean; label: string; detail: string }) {
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

function BalancePanel({
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

function YieldProjectionPanel({
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

function ReviewPanel({
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

function ActionLink({ href, icon, title, body }: { href: string; icon: ReactNode; title: string; body: string }) {
  return (
    <a href={href} className="group border border-tts-border bg-tts-surface p-5 transition hover:border-tts-border2">
      <span className="inline-flex h-10 w-10 items-center justify-center bg-tts-deep text-tts-surface">
        {icon}
      </span>
      <span className="mt-4 block text-lg font-black text-tts-deep">{title}</span>
      <span className="mt-2 block text-sm leading-6 text-tts-muted">{body}</span>
    </a>
  );
}

function CycleStep({ index, title, detail, href, action }: { index: string; title: string; detail: string; href: string; action: string }) {
  return (
    <a href={href} className="group flex min-h-[172px] flex-col justify-between border border-tts-border bg-tts-bg p-4 transition hover:border-tts-confirm hover:bg-tts-confirm/5">
      <span>
        <span className="inline-flex h-8 w-8 items-center justify-center bg-tts-deep text-sm font-black text-tts-surface">
          {index}
        </span>
        <span className="mt-4 block text-lg font-black text-tts-deep">{title}</span>
        <span className="mt-2 block text-sm leading-6 text-tts-muted">{detail}</span>
      </span>
      <span className="mt-4 text-sm font-black text-tts-confirm">{action}</span>
    </a>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
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

function InfoBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="border border-tts-border bg-tts-bg p-4">
      <p className="font-black text-tts-deep">{title}</p>
      <p className="mt-2 text-sm leading-6 text-tts-muted">{body}</p>
    </div>
  );
}
