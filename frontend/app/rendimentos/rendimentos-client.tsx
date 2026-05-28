"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Coins,
  FileCheck2,
  Loader2,
  LockKeyhole,
  PiggyBank,
  RefreshCw,
  SlidersHorizontal,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { AccountStatusCard } from "@/components/shared/account-status";
import { extractDefindexPositionAmount } from "@/lib/defindex-position";
import { useLanguage, type AppLanguage } from "@/lib/i18n";
import { getClientSession } from "@/lib/session";

type ApiState = {
  loading: boolean;
  message: string;
  error: string;
};

type YieldApiError = Error & { code?: string; requestId?: string; supportCode?: string };

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
  hardcoded_asset_override?: boolean;
  requires_wallet_asset_conversion?: boolean;
  execution_available?: boolean;
  execution_blocked_code?: string;
  execution_blocked_reason?: string;
  unavailable_reason?: string;
  wallet_source_asset?: { code?: string; issuer?: string };
  vault_deposit_asset?: { code?: string; issuer?: string; contract?: string };
  conversion_note?: string;
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
    compliance_approved?: boolean;
    compliance_mode?: string;
    unavailable_reason?: string;
    execution_blocked_reason?: string;
    disclosure?: {
      environment?: string;
      source?: string;
      rate_label?: string;
      testnet?: boolean;
      not_guaranteed?: boolean;
      not_investment_advice?: boolean;
      not_bank_deposit?: boolean;
    };
  };
  vaults?: YieldOption[];
};

type RendimentosView = "application" | "returns";

type PositionState = {
  loading: boolean;
  amount: string;
  error: string;
  raw?: unknown;
  anomaly?: "testnet_conversion_loss";
};

type YieldSuccessNotice = {
  action: "deposit" | "withdraw";
  reviewedAmount: string;
  reviewedAsset: string;
  vaultAmount?: string;
  vaultAsset?: string;
  hash?: string;
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
    descriptionPt: "Saldo em dólares da conta.",
    descriptionEn: "Dollar balance in the account.",
    tone: "border-tts-confirm/50 bg-tts-confirm/10 text-tts-confirm",
  },
  CETES: {
    namePt: "Opção México (teste)",
    nameEn: "Mexico option (test)",
    short: "CETES",
    descriptionPt: "Opção testnet para simulação.",
    descriptionEn: "Testnet option for preview.",
    tone: "border-tts-gold/60 bg-tts-gold-bg text-tts-gold",
  },
  USD: {
    namePt: "Dólares",
    nameEn: "Dollars",
    short: "USD",
    descriptionPt: "Saldo em dólares da conta.",
    descriptionEn: "Dollar balance in the account.",
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
    namePt: "XLM",
    nameEn: "XLM",
    short: "XLM",
    descriptionPt: "Saldo em XLM da conta.",
    descriptionEn: "XLM balance in the account.",
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

function optionRateText(option: YieldOption | null | undefined, language: AppLanguage = "pt-BR") {
  if (!option) return localCopy(language, "Não disponível", "Unavailable");
  if (option.execution_available === false) return localCopy(language, "Bloqueada neste testnet", "Blocked in this testnet");
  return localCopy(language, "Opção disponível", "Available option");
}

function optionExecutionBlocked(option: YieldOption | null | undefined) {
  return Boolean(option && (option.execution_available === false || option.execution_blocked_code));
}

function formatReturnPercent(value: unknown, language: AppLanguage = "pt-BR") {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(String(raw || "").replace("%", "").replace(",", "."));
  if (!Number.isFinite(parsed)) return localCopy(language, "Indisponível", "Unavailable");
  return `${parsed.toLocaleString(isPortuguese(language) ? "pt-BR" : "en-US", { maximumFractionDigits: 2 })}%`;
}

function optionReturnRate(option?: YieldOption | null) {
  const raw = option?.apy_percent || option?.apy?.apyPercent || option?.apy?.apy_percent || option?.apy?.apy;
  const parsed = Number(String(Array.isArray(raw) ? raw[0] : raw || "").replace("%", "").replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed / 100;
}

function optionReturnText(option: YieldOption | null | undefined, language: AppLanguage = "pt-BR") {
  if (!option) return localCopy(language, "Indisponível", "Unavailable");
  return formatReturnPercent(option?.apy_percent || option?.apy?.apyPercent || option?.apy?.apy_percent || option?.apy?.apy, language);
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

function isSuspiciousTestnetConversionPosition(option: YieldOption, position?: PositionState) {
  if (!position || position.loading || position.error) return false;
  const amount = normalizeDecimal(position.amount);
  return Boolean(option.requires_wallet_asset_conversion && amount > 0 && amount < 1);
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

function buildReturnChartData(amount: string, annualRate: number | null, language: AppLanguage) {
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
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code || "").trim()
    : "";
  const raw = error instanceof Error ? error.message : String(error || "");
  if (code === "yield_execution_disabled") {
    return localCopy(language, "A confirmação com PIN ainda não está ativada neste ambiente. Você pode preparar a revisão, mas não movimentar saldo.", "PIN confirmation is not enabled in this environment yet. You can prepare the review, but not move funds.");
  }
  if (code === "yield_account_setup_required") {
    return localCopy(language, "Revisão preparada. Não precisa criar outra conta; falta ativar esta moeda para confirmação nesta conta. Tente novamente em alguns segundos ou escolha outra opção.", "Review prepared. You do not need a new account; this currency still needs to be activated for confirmation on this account. Try again in a few seconds or choose another option.");
  }
  if (code === "yield_asset_incompatible") {
    return localCopy(language, "Revisão preparada. Esta opção de teste usa outra emissão da moeda selecionada. Escolha outra opção ou aguarde uma opção compatível.", "Review prepared. This test option uses another issuance of the selected currency. Choose another option or wait for a compatible option.");
  }
  if (code === "yield_asset_conversion_required") {
    return localCopy(language, "Revisão preparada. Esta aplicação usa uma versão diferente da moeda neste testnet; falta saldo nessa versão antes de confirmar.", "Review prepared. This application uses a different testnet asset version; that version still needs balance before confirmation.");
  }
  if (code === "yield_asset_conversion_unavailable") {
    return localCopy(language, "Revisão preparada, mas a rota segura para converter o saldo da conta para a moeda usada nesta aplicação não está disponível agora.", "Review prepared, but the safe route to convert the account balance into the asset used by this application is not available right now.");
  }
  if (code === "yield_execution_unavailable") {
    return localCopy(language, "Revisão preparada, mas a confirmação por PIN ainda não está disponível para esta opção. Tente outra opção ou tente novamente em alguns segundos.", "Review prepared, but PIN confirmation is not available for this option yet. Try another option or try again in a few seconds.");
  }
  if (code === "account_signing_unavailable") {
    return localCopy(language, "Esta conta ainda não está pronta para assinar esta operação. Entre novamente e tente outra vez.", "This account is not ready to sign this operation yet. Sign in again and try once more.");
  }
  if (code === "missing_pin") {
    return localCopy(language, "Digite o PIN da conta para confirmar.", "Enter the account PIN to confirm.");
  }
  if (code === "review_not_prepared") {
    return localCopy(language, "Prepare a revisão novamente e confirme em seguida.", "Prepare the review again, then confirm.");
  }
  if (code === "execution_unavailable") {
    return localCopy(language, "Não foi possível concluir a confirmação agora. Prepare uma nova revisão e tente novamente.", "Could not finish confirmation right now. Prepare a new review and try again.");
  }
  if (code === "invalid_pin") {
    return localCopy(language, "Não consegui validar o PIN. Confira e tente novamente.", "I could not validate the PIN. Check it and try again.");
  }
  if (code === "insufficient_balance") {
    return localCopy(language, "Saldo insuficiente para revisar esse valor. Ajuste o valor e tente novamente.", "Insufficient balance for this amount. Adjust the amount and try again.");
  }
  if (code === "yield_unavailable") {
    return localCopy(language, "Não foi possível atualizar a revisão agora. Tente novamente em alguns segundos.", "Could not update the review right now. Try again in a few seconds.");
  }
  if (!raw.trim()) return localCopy(language, "Não foi possível concluir agora. Tente novamente.", "Could not finish right now. Try again.");
  if (/pix/i.test(raw)) {
    return localCopy(language, "Não foi possível atualizar a revisão agora. Tente novamente em alguns segundos.", "Could not update the review right now. Try again in a few seconds.");
  }
  if (/abort|timeout|timed out|demorou/i.test(raw)) {
    return localCopy(language, "A conexão demorou demais. Atualize para tentar de novo.", "The connection took too long. Refresh to try again.");
  }
  if (/session|login|unauthor|auth|token|jwt/i.test(raw)) {
    return localCopy(language, "Entre na sua conta para ver saldos e preparar uma revisão.", "Sign in to see balances and prepare a review.");
  }
  if (/defindex|vault|xdr|horizon|stellar|mainnet|wallet|issuer|public key|secret|blockchain|crypto|cripto/i.test(raw)) {
    return localCopy(language, "Ainda não foi possível carregar essa parte. Confira a configuração do serviço e tente novamente.", "This section is not available yet. Check the service configuration and try again.");
  }
  return raw
    .replace(/Defindex/gi, "serviço de revisão")
    .replace(/vault/gi, "opção")
    .replace(/wallet/gi, "conta")
    .replace(/asset/gi, "moeda");
}

function uiErrorTrace(error: unknown, language: AppLanguage) {
  if (!error || typeof error !== "object") return "";
  const requestId = String((error as YieldApiError).requestId || "").trim();
  const supportCode = String((error as YieldApiError).supportCode || "").trim();
  const trace = requestId || supportCode;
  if (!trace) return "";
  return localCopy(language, `ID do erro: ${trace}`, `Error ID: ${trace}`);
}

function yieldUiError(error: unknown, language: AppLanguage) {
  const message = sanitizeUiError(error, language);
  const trace = uiErrorTrace(error, language);
  return trace ? `${message}\n${trace}` : message;
}

function isSessionUiError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  return /session|login|unauthor|auth|token|jwt/i.test(raw);
}

function isInsufficientBalanceNotice(message: string) {
  return /saldo insuficiente|insufficient|not enough balance/i.test(String(message || ""));
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
  const responseRequestId = response.headers.get("x-request-id") ||
    String(payload?.request_id || payload?.requestId || "").trim();
  if (!response.ok || payload?.success === false) {
    const apiError = new Error(payload?.message || payload?.error || "Não foi possível preparar a solicitação.") as YieldApiError;
    if (payload?.code) apiError.code = String(payload.code);
    if (responseRequestId) apiError.requestId = responseRequestId;
    if (payload?.support_code || payload?.supportCode) apiError.supportCode = String(payload.support_code || payload.supportCode);
    throw apiError;
  }
  return payload;
}

export default function RendimentosClient({
  initialLanguage,
  initialQuery,
  view = "application",
}: {
  initialLanguage?: AppLanguage;
  initialQuery?: string;
  view?: RendimentosView;
} = {}) {
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
  const [variationBps, setVariationBps] = useState("100");
  const [pin, setPin] = useState("");
  const [positionBalances, setPositionBalances] = useState<Record<string, PositionState>>({});
  const [yieldResult, setYieldResult] = useState<any | null>(null);
  const [successNotice, setSuccessNotice] = useState<YieldSuccessNotice | null>(null);
  const [apiState, setApiState] = useState<ApiState>({ loading: true, message: "", error: "" });

  const options = useMemo(() => Array.isArray(yieldStatus?.vaults) ? yieldStatus.vaults : [], [yieldStatus]);
  const sortedOptions = useMemo(() => [...options], [options]);
  const bestOption = sortedOptions[0] || null;
  const selectedOption = useMemo(() => {
    return options.find((item) => optionCode(item) === selectedCode) || null;
  }, [options, selectedCode]);
  const actionableOption = selectedOption;
  const configured = Boolean(yieldStatus?.runtime?.configured);
  const confirmationEnabled = Boolean(yieldStatus?.runtime?.execution_enabled);
  const complianceApproved = Boolean(yieldStatus?.runtime?.compliance_approved);
  const yieldNetwork = String(yieldStatus?.runtime?.network || "").toLowerCase();
  const isTestnetYield = yieldNetwork === "testnet" || Boolean(yieldStatus?.runtime?.disclosure?.testnet);
  const executionBlockedReason = String(yieldStatus?.runtime?.execution_blocked_reason || "");
  const safeSelectedCode = normalizeUiAssetCode(selectedCode) || optionCode(actionableOption) || selectedCode;
  const selectedProfile = moneyProfile(safeSelectedCode);
  const bestOptionCode = optionCode(bestOption);
  const actionableOptionCode = optionCode(actionableOption);
  const selectedHasDirectOption = Boolean(selectedOption);
  const selectedHasYield = Boolean(selectedOption);
  const selectedExecutionBlocked = optionExecutionBlocked(actionableOption);
  const autoRouteToOption = Boolean(actionableOption && actionableOptionCode && actionableOptionCode !== safeSelectedCode);
  const sessionLoading = Boolean(session.loading && !session.checked);
  const canPrepare = Boolean(!sessionLoading && session.authenticated && configured && actionableOption && !selectedExecutionBlocked && Number(String(amount).replace(",", ".")) > 0);
  const balanceForSelected = balances.find((item) => normalizeUiAssetCode(item.asset_code) === safeSelectedCode);
  const requestedAmount = normalizeDecimal(amount);
  const selectedBalanceAmount = normalizeDecimal(balanceForSelected?.balance || "0");
  const selectedBalanceInsufficient = Boolean(
    session.authenticated &&
    requestedAmount > 0 &&
    (!balanceForSelected || selectedBalanceAmount + 0.0000001 < requestedAmount)
  );
  const alternativeConversionBalance = useMemo(() => {
    return [...balances]
      .filter((item) => {
        const code = normalizeUiAssetCode(item.asset_code);
        return Boolean(code && code !== safeSelectedCode && normalizeDecimal(item.balance) > 0.0000001);
      })
      .sort((a, b) => normalizeDecimal(b.balance) - normalizeDecimal(a.balance))[0] || null;
  }, [balances, safeSelectedCode]);
  const alternativeConversionCode = normalizeUiAssetCode(alternativeConversionBalance?.asset_code);
  const smartConvertSourceCode = selectedBalanceInsufficient
    ? alternativeConversionCode || (safeSelectedCode === "BRL" ? "USDC" : "BRL")
    : safeSelectedCode;
  const smartConvertDestCode = selectedBalanceInsufficient
    ? actionableOptionCode || safeSelectedCode || bestOptionCode || "USDC"
    : bestOptionCode || actionableOptionCode || "USDC";
  const convertToBestYieldUrl = useMemo(() => buildMoneyUrl("/convert", {
    amount,
    source_asset: safeSelectedCode,
    dest_asset: bestOptionCode,
    from: "yield",
    lang: language,
  }), [amount, bestOptionCode, safeSelectedCode, language]);
  const convertAssetsUrl = useMemo(() => buildMoneyUrl("/convert", {
    amount,
    source_asset: smartConvertSourceCode,
    dest_asset: smartConvertDestCode,
    from: "review",
    next: "review",
    lang: language,
  }), [amount, smartConvertDestCode, smartConvertSourceCode, language]);
  const pixTopUpUrl = useMemo(() => buildMoneyUrl("/pix-on", {
    amount,
    asset: "BRL",
    from: "review",
    lang: language,
  }), [amount, language]);
  const returnsUrl = useMemo(() => buildMoneyUrl("/rendimentos", {
    amount,
    asset: safeSelectedCode,
    lang: language,
  }), [amount, safeSelectedCode, language]);
  const newApplicationUrl = useMemo(() => buildMoneyUrl("/review", {
    amount,
    asset: safeSelectedCode,
    lang: language,
  }), [amount, safeSelectedCode, language]);
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
            unavailable_reason: yieldUiError(error, language),
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
      const bestAvailable = vaults[0] || null;
      if (!requestedAssetRef.current && bestAvailable) {
        setSelectedCode((current) => vaults.some((item: YieldOption) => optionCode(item) === current)
          ? current
          : optionCode(bestAvailable));
      }

      if (!nextSession.authenticated) {
        setBalances([]);
        setAccountPublicKey("");
        setApiState({ loading: false, message: L("Entre para ver seus saldos e preparar uma revisão.", "Sign in to see balances and prepare a review."), error: "" });
        return;
      }

      const accountPayload = await accountPromise;
      setAccountPublicKey(String(accountPayload?.public_key || ""));
      setBalances(Array.isArray(accountPayload?.balances) ? accountPayload.balances : []);

      setApiState({ loading: false, message: L("Saldos e posições atualizados.", "Balances and positions updated."), error: "" });
    } catch (error) {
      if (isSessionUiError(error)) {
        setSession({ authenticated: false, loading: false, checked: true });
      } else {
        setSession((current) => ({ ...current, loading: false, checked: true }));
      }
      setApiState({ loading: false, message: "", error: yieldUiError(error, language) });
    }
  }

  useEffect(() => {
    setYieldResult(null);
    setPin("");
  }, [action, amount, actionableOption?.vault_address, safeSelectedCode]);

  async function prepareYield() {
    if (!actionableOption) return;
    setApiState({ loading: true, message: "", error: "" });
    setYieldResult(null);
    try {
      const payload = await yieldApi("defindex/yield/prepare", {
        method: "POST",
        body: JSON.stringify({
          action,
          amount,
          source_asset_code: safeSelectedCode,
          asset_code: actionableOption.asset_code,
          vault_address: actionableOption.vault_address,
          slippage_bps: variationBps,
        }),
      });
      setYieldResult(payload);
      setActiveStep("review");
      const blockedCode = String(payload?.execution_blocked_code || "").trim();
      const blockedMessage = blockedCode
        ? sanitizeUiError({ code: blockedCode, message: payload?.execution_blocked_reason }, language)
        : "";
      setApiState({
        loading: false,
        message: payload?.execution_ready === false
          ? blockedMessage || L("Revisão preparada em modo consulta. Nenhum saldo será movimentado.", "Review prepared in view-only mode. No funds will move.")
          : payload?.conversion_required
            ? L("Revisão pronta. O PIN também prepara a conversão segura para a versão usada nesta aplicação.", "Review ready. The PIN also prepares the safe conversion into the version used by this application.")
          : L("Revisão pronta. Confira tudo antes de confirmar.", "Review ready. Check everything before confirming."),
        error: "",
      });
    } catch (error) {
      setApiState({ loading: false, message: "", error: yieldUiError(error, language) });
    }
  }

  async function confirmYield() {
    if (!actionableOption) return;
    if (!yieldResult) {
      setActiveStep("review");
      setApiState({ loading: false, message: "", error: L("Prepare a revisão antes de confirmar com PIN.", "Prepare the review before confirming with PIN.") });
      return;
    }
    if (yieldResult?.execution_ready === false) {
      const blockedCode = String(yieldResult?.execution_blocked_code || "").trim();
      setActiveStep("review");
      setApiState({
        loading: false,
        message: blockedCode
          ? sanitizeUiError({ code: blockedCode, message: yieldResult?.execution_blocked_reason }, language)
          : L("Esta revisão está apenas para consulta. Escolha outra opção ou prepare novamente mais tarde.", "This review is view-only. Choose another option or prepare again later."),
        error: "",
      });
      return;
    }
    setApiState({ loading: true, message: "", error: "" });
    try {
      const payload = await yieldApi("defindex/yield/execute", {
        method: "POST",
        body: JSON.stringify({
          action,
          amount,
          source_asset_code: safeSelectedCode,
          asset_code: actionableOption.asset_code,
          vault_address: actionableOption.vault_address,
          slippage_bps: variationBps,
          pin,
          wallet_pin: pin,
        }),
      }, 60000);
      setYieldResult(payload);
      setPin("");
      setSuccessNotice({
        action,
        reviewedAmount: amount,
        reviewedAsset: selectedProfile.short,
        vaultAmount: String(payload?.amount || "").trim(),
        vaultAsset: String(payload?.vault?.display_asset_code || payload?.vault?.asset_code || "").trim(),
        hash: String(payload?.hash || "").trim(),
      });
      setApiState({ loading: false, message: L("Operação confirmada. Vamos atualizar seus saldos em instantes.", "Operation confirmed. We will update your balances shortly."), error: "" });
    } catch (error) {
      setApiState({ loading: false, message: "", error: yieldUiError(error, language) });
    }
  }

  useEffect(() => {
    if (loadedInitialDataRef.current) return;
    loadedInitialDataRef.current = true;
    refreshDashboard();
  }, []);

  useEffect(() => {
    if (view !== "returns" || !session.authenticated || !options.length) return;
    let cancelled = false;
    const initialEntries = Object.fromEntries(options.map((option) => [
      optionCode(option),
      { loading: true, amount: "0", error: "" },
    ]));
    setPositionBalances(initialEntries);

    Promise.all(options.map(async (option) => {
      const code = optionCode(option);
      try {
        const payload = await yieldApi(
          `defindex/yield/balance?asset_code=${encodeURIComponent(option.asset_code)}&vault_address=${encodeURIComponent(option.vault_address)}`,
          undefined,
          22000
        );
        return [code, {
          loading: false,
          amount: extractDefindexPositionAmount(payload?.position || payload?.balance),
          error: "",
          raw: payload?.balance,
        }] as const;
      } catch (error) {
        return [code, {
          loading: false,
          amount: "0",
          error: sanitizeUiError(error, language),
        }] as const;
      }
    })).then((entries) => {
      if (cancelled) return;
      setPositionBalances(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [view, session.authenticated, options, language]);

  if (view === "returns") {
    return (
      <CurrentInvestmentsPage
        language={language}
        session={session}
        sessionLoading={sessionLoading}
        apiState={apiState}
        accountPublicKey={accountPublicKey}
        options={options}
        amount={amount}
        positionBalances={positionBalances}
        isTestnet={isTestnetYield}
        onRefresh={refreshDashboard}
        newApplicationUrl={newApplicationUrl}
      />
    );
  }

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      {successNotice ? (
        <YieldSuccessDialog
          language={language}
          notice={successNotice}
          returnsHref={returnsUrl}
          onClose={() => setSuccessNotice(null)}
          onRefresh={() => {
            setSuccessNotice(null);
            refreshDashboard();
          }}
        />
      ) : null}
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-tts-border pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="max-w-2xl text-2xl font-black tracking-tight text-tts-deep md:text-3xl">
              {L("Aplicação", "Application")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
              {L(
                "Escolha um saldo, informe o valor e revise antes do PIN. Se a opção usar outra emissão no testnet, o app só confirma quando houver uma rota segura.",
                "Choose a balance, enter the amount, and review before PIN. If the option uses another testnet issuance, the app only confirms when a safe route exists."
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            <a
              href={returnsUrl}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              {L("Investimentos atuais", "Current investments")}
            </a>
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
              <p className="mt-1 whitespace-pre-line">{apiState.error}</p>
              {isInsufficientBalanceNotice(apiState.error) ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <a
                    href={convertAssetsUrl}
                    className="inline-flex min-h-10 items-center justify-center gap-2 bg-tts-error px-3 py-2 text-xs font-black text-tts-surface transition hover:bg-tts-error/90"
                  >
                    <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
                    {alternativeConversionCode
                      ? L(
                          `Converter ${moneyProfile(alternativeConversionCode).short} para ${profileName(selectedProfile, language)}`,
                          `Convert ${moneyProfile(alternativeConversionCode).short} to ${profileName(selectedProfile, language)}`
                        )
                      : L("Abrir conversão de ativos", "Open asset conversion")}
                  </a>
                  <a
                    href={pixTopUpUrl}
                    className="inline-flex min-h-10 items-center justify-center gap-2 border border-tts-error/40 bg-tts-surface px-3 py-2 text-xs font-black text-tts-error transition hover:border-tts-error"
                  >
                    <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
                    {L("Colocar via PIX", "Add with PIX")}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {apiState.message ? (
          <div className="flex items-start gap-3 border border-tts-confirm bg-tts-confirm/10 p-4 text-sm text-tts-confirm" role="status" aria-live="polite">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-black">{L("Status", "Status")}</p>
              <p className="mt-1 whitespace-pre-line">{apiState.message}</p>
            </div>
          </div>
        ) : null}

        <YieldComplianceNotice
          isTestnet={isTestnetYield}
          complianceApproved={complianceApproved}
          confirmationEnabled={confirmationEnabled}
          executionBlockedReason={executionBlockedReason}
        />

        {showTutorial ? (
          <YieldTutorialPanel
            hasOptions={options.length > 0}
            authenticated={session.authenticated}
            confirmationEnabled={confirmationEnabled}
            isTestnet={isTestnetYield}
            bestOption={bestOption}
          />
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.4fr)]">
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
              setYieldResult(null);
              setActiveStep("plan");
            }}
          />
          <YieldWorkspacePanel
            activeStep={activeStep === "wallet" ? "plan" : activeStep}
            authenticated={session.authenticated}
            sessionLoading={sessionLoading}
            action={action}
            onActionChange={setAction}
            amount={amount}
            onAmountChange={setAmount}
            amountPresets={amountPresets}
            selectedProfile={selectedProfile}
            selectedCode={safeSelectedCode}
            selectedOption={actionableOption}
            selectedHasYield={selectedHasYield}
            selectedHasDirectOption={selectedHasDirectOption}
            autoRouteToOption={autoRouteToOption}
            bestOption={bestOption}
            options={options}
            bestOptionCode={bestOptionCode}
            balanceForSelected={balanceForSelected}
            result={yieldResult}
            returnsHref={returnsUrl}
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
            convertToBestYieldHref={convertToBestYieldUrl}
            convertAssetsHref={convertAssetsUrl}
            pixTopUpHref={pixTopUpUrl}
            selectedBalanceInsufficient={selectedBalanceInsufficient}
            alternativeConversionCode={alternativeConversionCode}
            configured={configured}
          />
        </section>
      </section>
    </main>
  );
}

function YieldSuccessDialog({
  language,
  notice,
  returnsHref,
  onClose,
  onRefresh,
}: {
  language: AppLanguage;
  notice: YieldSuccessNotice;
  returnsHref: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const isDeposit = notice.action === "deposit";
  const title = isDeposit
    ? L("Aplicação enviada", "Application sent")
    : L("Resgate enviado", "Withdrawal sent");
  const vaultAmount = normalizeDecimal(notice.vaultAmount || "0");
  const reviewedAmount = normalizeDecimal(notice.reviewedAmount || "0");
  const showVaultAmount = vaultAmount > 0 && Math.abs(vaultAmount - reviewedAmount) > 0.0000001;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg border border-tts-border bg-tts-surface p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-tts-confirm/15 text-tts-confirm">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-confirm">
              {L("Confirmado", "Confirmed")}
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-tts-deep">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-tts-muted">
              {L(
                "A operação foi enviada para a rede. A posição pode levar alguns segundos para atualizar.",
                "The operation was sent to the network. The position can take a few seconds to update."
              )}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <MiniStat
            label={L("Valor revisado", "Reviewed amount")}
            value={`${formatAmount(notice.reviewedAmount, language)} ${notice.reviewedAsset}`}
          />
          <MiniStat
            label={L("Próximo passo", "Next step")}
            value={L("Ver posição", "View position")}
            detail={L("atualize em alguns segundos", "refresh in a few seconds")}
          />
        </div>

        {showVaultAmount ? (
          <div className="mt-4 border border-tts-gold bg-tts-gold-bg p-3 text-sm leading-6 text-tts-gold">
            <p className="font-black">{L("Conversão de teste detectada", "Test conversion detected")}</p>
            <p className="mt-1">
              {L(
                `O valor recebido pela opção foi ${formatAmount(notice.vaultAmount, language)} ${notice.vaultAsset || notice.reviewedAsset}. A interface mostra a posição reportada pelo vault.`,
                `The amount received by the option was ${formatAmount(notice.vaultAmount, language)} ${notice.vaultAsset || notice.reviewedAsset}. The interface shows the position reported by the vault.`
              )}
            </p>
          </div>
        ) : null}

        {notice.hash ? (
          <div className="mt-4 border border-tts-border bg-tts-bg p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-tts-muted">
              {L("Comprovante da rede", "Network receipt")}
            </p>
            <p className="mt-2 break-all font-mono-financial text-xs text-tts-deep">{notice.hash}</p>
          </div>
        ) : null}

        <div className="mt-5 grid gap-2 sm:grid-cols-3">
          <a
            href={returnsHref}
            className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            {L("Ver posições", "View positions")}
          </a>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-sm font-black text-tts-deep"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {L("Atualizar", "Refresh")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center border border-tts-border bg-tts-surface px-3 py-2 text-sm font-black text-tts-deep"
          >
            {L("Fechar", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function YieldComplianceNotice({
  isTestnet,
  complianceApproved,
  confirmationEnabled,
  executionBlockedReason,
}: {
  isTestnet: boolean;
  complianceApproved: boolean;
  confirmationEnabled: boolean;
  executionBlockedReason: string;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const modeLabel = confirmationEnabled
    ? L("Execução aprovada", "Execution approved")
    : L("Somente revisão", "Review only");
  const blocked = executionBlockedReason && !confirmationEnabled;

  return (
    <section className="border border-tts-gold bg-tts-gold-bg p-3 text-sm leading-6" aria-label={L("Aviso de revisão", "Review notice")}>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="flex items-start gap-2 text-tts-muted">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-tts-gold" aria-hidden="true" />
          <span>
            {L(
              "Somente revisão. Não é garantia nem depósito bancário.",
              "Review only. Not guaranteed and not a bank deposit."
            )}
            {isTestnet ? ` ${L("Testnet.", "Testnet.")}` : ""}
            {blocked ? ` ${L("Bloqueio atual", "Current block")}: ${executionBlockedReason}` : ""}
          </span>
        </p>
        <span className={`inline-flex w-fit shrink-0 border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${complianceApproved ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" : "border-tts-gold bg-tts-bg text-tts-gold"}`}>
          {modeLabel}
        </span>
      </div>
    </section>
  );
}

function YieldTutorialPanel({
  hasOptions,
  authenticated,
  confirmationEnabled,
  isTestnet,
  bestOption,
}: {
  hasOptions: boolean;
  authenticated: boolean;
  confirmationEnabled: boolean;
  isTestnet: boolean;
  bestOption: YieldOption | null;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const bestProfile = moneyProfile(optionCode(bestOption));
  const steps = [
    {
      title: L("1. Conta", "1. Account"),
      body: authenticated
        ? L(
            "A tela usa a conta conectada para buscar saldos disponíveis e posições já abertas. Você escolhe o saldo de origem antes de qualquer simulação.",
            "The screen uses the connected account to load available balances and existing positions. You choose the source balance before any preview."
          )
        : L(
            "Entre na conta para carregar saldos, posição e limites de revisão. Sem login, nada é preparado para confirmação.",
            "Sign in to load balances, position, and review limits. Without sign-in, nothing is prepared for confirmation."
          ),
      ready: authenticated,
    },
    {
      title: L("2. Simulação", "2. Preview"),
      body: hasOptions
        ? L(
            `Opção disponível: ${profileName(bestProfile, language)}. Ela aparece porque já tem configuração para revisar a operação.`,
            `Available option: ${profileName(bestProfile, language)}. It appears because it is configured for operation review.`
          )
        : L(
            "Ainda não há opção configurada. A tela continua segura para consulta, mas não prepara operação até existir uma opção ativa.",
            "No option is configured yet. The screen remains safe for viewing, but it will not prepare an operation until an active option exists."
          ),
      ready: hasOptions,
    },
    {
      title: L("3. Revisão", "3. Review"),
      body: confirmationEnabled
        ? L(
            "Depois da simulação, a revisão mostra operação e valor. Só o botão final com PIN movimenta saldo.",
            "After the preview, the review shows operation and amount. Only the final PIN button moves balance."
          )
        : L(
            "Modo revisão: você testa valor e operação sem movimentar saldo. Execução real fica bloqueada até aprovação de compliance.",
            "Review mode: you test amount and operation without moving balance. Real execution stays blocked until compliance approval."
          ),
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
              "Use de cima para baixo: confirme a conta, escolha um saldo, simule o valor e monte a revisão. O PIN fica no fim para evitar confirmação acidental.",
              "Use it top to bottom: confirm the account, choose a balance, preview the amount, and build the review. PIN stays at the end to avoid accidental confirmation."
            )}
          </p>
          {isTestnet ? (
            <p className="mt-2 text-xs font-bold text-tts-muted">
              {L("Como está em testnet, estes números servem para validar a experiência, não para decisão financeira real.", "Because this is testnet, these numbers validate the experience, not real financial decisions.")}
            </p>
          ) : null}
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
  const balanceItems = useMemo(() => options.map((option) => {
    const code = optionCode(option);
    const balance = balances.find((item) => normalizeUiAssetCode(item.asset_code) === code);
    return {
      asset_code: code,
      asset_issuer: balance?.asset_issuer,
      balance: balance?.balance || "0",
      option,
    };
  }), [balances, options]);

  return (
    <section className="border border-tts-border bg-tts-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
            <Coins className="h-5 w-5 text-tts-gold" aria-hidden="true" />
            {L("Escolha o saldo", "Choose balance")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-tts-muted">
            {sessionLoading
              ? L("Carregando sua conta.", "Loading your account.")
              : authenticated
              ? L("Toque em uma moeda com opção ativa.", "Tap a currency with an active option.")
              : L("Entre para carregar seus saldos.", "Sign in to load your balances.")}
          </p>
        </div>
      </div>

      <AccountStatusCard
        state={sessionLoading ? "loading" : authenticated ? "connected" : "signed-out"}
        accountId={accountPublicKey}
        ctaHref="/login?next=/review"
        compact
        className="mt-4"
      />

      <div className="mt-4 grid gap-2">
        {balanceItems.length ? balanceItems.map((item) => {
          const code = normalizeUiAssetCode(item.asset_code);
          const profile = moneyProfile(code);
          const selected = code === selectedCode;
          const option = item.option;
          const blocked = optionExecutionBlocked(option);
          return (
            <button
              key={`${code}-${item.asset_issuer || "default"}`}
              type="button"
              onClick={() => onSelect(code)}
              className={`grid min-h-20 grid-cols-[1fr_auto] items-center gap-3 border p-3 text-left transition ${selected ? blocked ? "border-tts-gold bg-tts-gold-bg" : "border-tts-confirm bg-tts-confirm/10" : "border-tts-border bg-tts-bg hover:border-tts-border2"}`}
            >
              <span>
                <span className={`inline-flex border px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${profile.tone}`}>
                  {profile.short}
                </span>
                <span className="mt-2 block text-sm font-black text-tts-deep">{option ? optionTitle(option, language) : profileName(profile, language)}</span>
                {option ? (
                  <span className={`mt-1 block text-xs font-bold ${blocked ? "text-tts-gold" : "text-tts-confirm"}`}>
                    {optionRateText(option, language)}
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-tts-muted">{L("Conversão automática se houver rota", "Automatic conversion if a route exists")}</span>
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
        <a href="/login?next=/review" className="mt-4 inline-flex min-h-11 w-full items-center justify-center bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2">
          {L("Entrar com segurança", "Sign in securely")}
        </a>
      ) : null}
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
  selectedCode,
  selectedOption,
  selectedHasYield,
  selectedHasDirectOption,
  autoRouteToOption,
  bestOption,
  options,
  bestOptionCode,
  balanceForSelected,
  result,
  returnsHref,
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
  convertToBestYieldHref,
  convertAssetsHref,
  pixTopUpHref,
  selectedBalanceInsufficient,
  alternativeConversionCode,
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
  selectedCode: string;
  selectedOption: YieldOption | null;
  selectedHasYield: boolean;
  selectedHasDirectOption: boolean;
  autoRouteToOption: boolean;
  bestOption: YieldOption | null;
  options: YieldOption[];
  bestOptionCode: string;
  balanceForSelected?: BalanceLine;
  result: any | null;
  returnsHref: string;
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
  convertToBestYieldHref: string;
  convertAssetsHref: string;
  pixTopUpHref: string;
  selectedBalanceInsufficient: boolean;
  alternativeConversionCode: string;
  configured: boolean;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const profileShort = selectedProfile.short;
  const targetProfile = moneyProfile(optionCode(selectedOption));
  const selectedNeedsWalletConversion = Boolean(autoRouteToOption || selectedOption?.requires_wallet_asset_conversion || result?.conversion_required);
  const selectedExecutionBlocked = optionExecutionBlocked(selectedOption);
  const unavailableTitle = configured
    ? L("Sem opção ativa para revisar", "No active option to review")
    : L("Opções ainda sem configuração", "Options are not configured yet");
  const unavailableDescription = L(
    "Esse saldo ainda não tem opção ativa neste ambiente. Use a conversão para trocar por uma moeda disponível e depois volte para investir.",
    "This balance has no active option in this environment. Use conversion to switch into an available currency, then return to invest."
  );
  const routeDescription = selectedExecutionBlocked
    ? L(
        "Esta opção aceita outra emissão de dólar no ambiente de teste. Para investir saldo real de dólares, é preciso uma opção compatível com a mesma emissão da sua conta.",
        "This option accepts another dollar issuance in the test environment. To invest real dollar balance, a compatible option with the same account issuance is required."
      )
    : !selectedHasDirectOption && autoRouteToOption && selectedOption
    ? L(
        `A revisão usa seu saldo em ${profileName(selectedProfile, language)} e só confirma a troca para ${profileName(targetProfile, language)} se o backend encontrar uma rota segura.`,
        `The review uses your ${profileName(selectedProfile, language)} balance and only confirms the swap to ${profileName(targetProfile, language)} if the backend finds a safe route.`
      )
    : selectedNeedsWalletConversion
      ? L("Esta opção usa uma emissão diferente no ambiente de teste. A confirmação só fica disponível se houver rota segura antes do PIN.", "This option uses a different issuance in the test environment. Confirmation is only available when a safe route exists before PIN.")
      : "";
  const hasPrepared = Boolean(result);
  const submitted = Boolean(result?.submitted || result?.hash);
  const preparedExecutionBlocked = Boolean(hasPrepared && result?.execution_ready === false);
  const confirmationAvailable = confirmationEnabled && !preparedExecutionBlocked && !selectedExecutionBlocked;
  const canPrepareAction = canPrepare && !selectedExecutionBlocked;
  const canConfirm = canPrepareAction && confirmationAvailable && hasPrepared && !submitted && pin.length >= 4 && !apiLoading;
  const blockedCode = String(result?.execution_blocked_code || "").trim();
  const preparedBlockedMessage = blockedCode === "yield_account_setup_required"
    ? L("Revisão preparada. Não precisa criar outra conta; falta ativar esta moeda para confirmação nesta conta. Tente novamente em alguns segundos ou escolha outra opção.", "Review prepared. You do not need a new account; this currency still needs to be activated for confirmation on this account. Try again in a few seconds or choose another option.")
    : blockedCode === "yield_asset_incompatible"
      ? L("Revisão preparada. Esta opção de teste usa outra emissão da moeda selecionada. Escolha outra opção ou aguarde uma opção compatível.", "Review prepared. This test option uses another issuance of the selected currency. Choose another option or wait for a compatible option.")
      : blockedCode === "yield_asset_conversion_required"
        ? L("Revisão preparada. Falta saldo na versão da moeda usada por esta aplicação antes de confirmar.", "Review prepared. The asset version used by this application still needs balance before confirmation.")
        : blockedCode === "yield_asset_conversion_unavailable"
          ? L("Revisão preparada, mas a rota segura entre o saldo da conta e a aplicação não está disponível agora.", "Review prepared, but the safe route between the account balance and the application is not available right now.")
          : L("Revisão preparada em modo consulta. A confirmação por PIN ainda não está disponível para esta opção.", "Review prepared in view-only mode. PIN confirmation is not available for this option yet.");
  const blockedActionLabel = blockedCode === "yield_account_setup_required"
    ? L("Moeda aguardando ativação", "Currency awaiting activation")
    : blockedCode === "yield_asset_incompatible"
      ? L("Opção incompatível", "Incompatible option")
      : blockedCode === "yield_asset_conversion_required" || blockedCode === "yield_asset_conversion_unavailable"
        ? L("Conversão aguardando rota segura", "Conversion awaiting safe route")
        : L("Modo revisão: sem movimentar saldo.", "Review mode: no funds move.");
  const accountBalanceLabel = sessionLoading
    ? L("Carregando saldo", "Loading balance")
    : balanceForSelected
      ? `${formatAmount(balanceForSelected.balance, language)} ${profileShort}`
      : L("Saldo não disponível", "Balance unavailable");
  const alternativeProfile = moneyProfile(alternativeConversionCode);
  const optionAvailabilityLabel = selectedOption ? optionRateText(selectedOption, language) : L("Não disponível", "Unavailable");
  const reviewAmountLabel = selectedOption ? `${formatAmount(amount || 0, language)} ${profileShort}` : L("Escolha uma opção", "Choose an option");
  const actionTitle = action === "deposit"
    ? selectedExecutionBlocked ? L("Investir indisponível", "Invest unavailable") : L("Investir", "Invest")
    : L("Retirar", "Withdraw");
  const confirmLabel = submitted
    ? L("Movimentação enviada", "Movement sent")
    : action === "deposit"
      ? L("Confirmar investimento", "Confirm investment")
      : L("Confirmar retirada", "Confirm withdrawal");
  const actionDescription = action === "deposit"
    ? selectedExecutionBlocked
      ? L("Esta opção está bloqueada para evitar que dólares reais sejam convertidos por uma rota testnet distorcida.", "This option is blocked to avoid sending real dollar balance through a distorted testnet route.")
      : selectedNeedsWalletConversion
      ? L("Confere a rota da moeda e só confirma se ela estiver segura. Nada sai sem PIN.", "Checks the asset route and only confirms when it is safe. Nothing moves without PIN.")
      : L("Prepara o investimento na opção selecionada. Em modo revisão, nada sai da conta.", "Prepares the investment into the selected option. In review mode, nothing leaves the account.")
    : L("Prepara a retirada da posição para o saldo disponível. Em modo revisão, nada sai da conta.", "Prepares withdrawal from the position back to available balance. In review mode, nothing leaves the account.");
  return (
    <section id="yield-plan" className="scroll-mt-6 border border-tts-border bg-tts-surface p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black text-tts-deep">
            <PiggyBank className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
            {L("Revisão de aplicação", "Application review")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-tts-muted">
            {selectedHasYield
              ? routeDescription || L("Defina entrada ou saída, informe o valor e gere uma revisão. A confirmação fica separada para você conferir a operação e o impacto no saldo.", "Choose entry or exit, enter the amount, and generate a review. Confirmation stays separate so you can check the operation and balance impact.")
              : unavailableDescription}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex w-fit border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${selectedProfile.tone}`}>
            {profileShort} · {profileName(selectedProfile, language)}
          </span>
          <span className={`inline-flex w-fit border px-3 py-2 text-xs font-black uppercase tracking-[0.14em] ${confirmationAvailable ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm" : "border-tts-gold bg-tts-gold-bg text-tts-gold"}`}>
            {confirmationAvailable ? L("Execução aprovada", "Execution approved") : L("Só revisão", "Review only")}
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
              "A revisão usa os dados da sua conta. Depois de entrar, seus saldos aparecem aqui e você pode conferir antes de qualquer confirmação.",
              "The review uses your account data. After signing in, your balances appear here and you can review before any confirmation."
            )}
          </p>
          <div className="mt-3 border border-tts-border bg-tts-surface p-3">
            <p className="font-black text-tts-deep">{L("Revisão segura", "Secure review")}</p>
            <p className="mt-1 text-xs leading-5 text-tts-muted">
              {L("A tela mostra valor e operação antes do PIN.", "The screen shows amount and operation before PIN.")}
            </p>
          </div>
          <a href="/login?next=/review" className="mt-3 inline-flex min-h-10 items-center justify-center bg-tts-gold px-3 py-2 text-xs font-black text-tts-deep transition hover:bg-tts-gold/90">
            {L("Entrar na conta", "Sign in")}
          </a>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MiniStat label={L("Disponível", "Available")} value={accountBalanceLabel} detail={L("saldo da conta", "account balance")} />
        <MiniStat
          label={L("Opção", "Option")}
          value={optionAvailabilityLabel}
          detail={selectedExecutionBlocked ? L("não executa dinheiro real", "does not execute real balance") : L("disponível para revisão", "available for review")}
        />
        <MiniStat label={L("Valor revisado", "Reviewed amount")} value={reviewAmountLabel} detail={L("antes do PIN", "before PIN")} />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <a
          href={convertAssetsHref}
          className={`inline-flex min-h-11 w-full items-center justify-center gap-2 px-3 py-2 text-sm font-black transition sm:w-auto ${
            selectedBalanceInsufficient
              ? "border border-tts-gold bg-tts-gold text-tts-deep hover:bg-tts-gold/90"
              : "border border-tts-border bg-tts-surface text-tts-deep hover:border-tts-border2"
          }`}
        >
          {selectedBalanceInsufficient ? <ArrowRightLeft className="h-4 w-4" aria-hidden="true" /> : <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />}
          {selectedBalanceInsufficient ? L("Converter para continuar", "Convert to continue") : L("Converter ativos", "Convert assets")}
        </a>
        <a
          href={returnsHref}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 border border-tts-border bg-tts-surface px-3 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2 sm:w-auto"
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          {L("Ver investimentos atuais", "View current investments")}
        </a>
      </div>

      {authenticated && selectedHasYield && selectedBalanceInsufficient ? (
        <div className="mt-5 border border-tts-gold bg-tts-gold-bg p-4 text-sm leading-6 text-tts-gold">
          <p className="font-black">
            {L(`Saldo insuficiente em ${profileName(selectedProfile, language)}`, `Insufficient ${profileName(selectedProfile, language)} balance`)}
          </p>
          <p className="mt-1">
            {alternativeConversionCode
              ? L(
                  `Você pode converter saldo em ${profileName(alternativeProfile, language)} para ${profileName(selectedProfile, language)} e voltar para revisar.`,
                  `You can convert ${profileName(alternativeProfile, language)} balance to ${profileName(selectedProfile, language)} and return to review.`
                )
              : L("Abra a conversão para trocar outro ativo antes de revisar este valor.", "Open conversion to switch another asset before reviewing this amount.")}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <a
              href={convertAssetsHref}
              className="inline-flex min-h-10 items-center justify-center gap-2 bg-tts-gold px-3 py-2 text-xs font-black text-tts-deep transition hover:bg-tts-gold/90"
            >
              <ArrowRightLeft className="h-4 w-4" aria-hidden="true" />
              {alternativeConversionCode
                ? L(
                    `Converter ${alternativeProfile.short} para ${selectedProfile.short}`,
                    `Convert ${alternativeProfile.short} to ${selectedProfile.short}`
                  )
                : L("Abrir conversão", "Open conversion")}
            </a>
            <a
              href={pixTopUpHref}
              className="inline-flex min-h-10 items-center justify-center gap-2 border border-tts-gold bg-tts-surface px-3 py-2 text-xs font-black text-tts-gold transition hover:border-tts-border2"
            >
              <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
              {L("Colocar via PIX", "Add with PIX")}
            </a>
          </div>
        </div>
      ) : null}

      {authenticated && selectedHasYield && routeDescription ? (
        <div className={`mt-5 border p-4 text-sm leading-6 ${selectedExecutionBlocked ? "border-tts-gold bg-tts-gold-bg text-tts-gold" : "border-tts-confirm bg-tts-confirm/10 text-tts-confirm"}`}>
          <p className="font-black">
            {selectedExecutionBlocked
              ? L("Opção bloqueada para dinheiro real", "Option blocked for real balance")
              : L("Rota checada antes da confirmação", "Route checked before confirmation")}
          </p>
          <p className="mt-1">{routeDescription}</p>
        </div>
      ) : null}

      {authenticated && !selectedHasYield ? (
        <div className="mt-5 border border-tts-gold bg-tts-gold-bg p-4 text-sm leading-6 text-tts-muted">
          <p className="font-black text-tts-gold">{unavailableTitle}</p>
          <p className="mt-1">
            {bestOption
              ? L(
                  `Moedas com opção ativa agora: ${options.map((option) => profileName(moneyProfile(optionCode(option)), language)).join(", ")}.`,
                  `Currencies with active options now: ${options.map((option) => profileName(moneyProfile(optionCode(option)), language)).join(", ")}.`
                )
              : L("Configure as opções no backend para ativar esta tela.", "Configure backend options to activate this screen.")}
          </p>
          {bestOption ? (
            <a href={convertToBestYieldHref || convertAssetsHref} className="mt-3 inline-flex min-h-10 items-center justify-center bg-tts-gold px-3 py-2 text-xs font-black text-tts-deep transition hover:bg-tts-gold/90">
              {L("Converter para opção ativa", "Convert to an active option")}
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
                {L("Investir", "Invest")}
              </button>
              <button
                type="button"
                onClick={() => onActionChange("withdraw")}
                className={`inline-flex min-h-11 items-center justify-center gap-2 px-3 text-sm font-black whitespace-nowrap ${action === "withdraw" ? "bg-tts-gold text-tts-deep" : "text-tts-muted"}`}
              >
                <ArrowUpFromLine className="h-4 w-4" aria-hidden="true" />
                {L("Retirar", "Withdraw")}
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

            <div className="mt-5">
              <button
                type="button"
                onClick={onPrepare}
                disabled={!canPrepareAction || apiLoading}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface disabled:cursor-not-allowed disabled:opacity-45"
              >
                {apiLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                {L("Preparar revisão", "Prepare review")}
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
                    {L("Confira a operação montada e o valor antes de qualquer confirmação.", "Check the assembled operation and amount before any confirmation.")}
                  </p>
                </div>
                <BadgeCheck className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MiniStat label={L("Operação", "Operation")} value={actionTitle} />
                <MiniStat label={L("Valor", "Amount")} value={`${formatAmount(amount, language)} ${profileShort}`} />
                <MiniStat label={L("Opção", "Option")} value={optionAvailabilityLabel} />
                <MiniStat
                  label={L("Segurança", "Security")}
                  value={submitted ? L("Enviado", "Sent") : confirmationAvailable ? L("PIN obrigatório", "PIN required") : L("Somente revisão", "Review only")}
                />
              </div>
              <div className="mt-4 border border-tts-border bg-tts-surface p-4 text-sm leading-6 text-tts-muted">
                {submitted ? (
                  <div>
                    <p className="font-bold text-tts-confirm">
                      {L("Movimentação enviada. A posição será atualizada assim que a rede confirmar.", "Movement sent. The position will update after network confirmation.")}
                    </p>
                    {result?.hash ? (
                      <p className="mt-2 break-all font-mono-financial text-xs text-tts-muted">
                        {L("Comprovante da rede", "Network receipt")}: {String(result.hash)}
                      </p>
                    ) : null}
                  </div>
                ) : preparedExecutionBlocked ? (
                  <p className="font-bold text-tts-gold">
                    {preparedBlockedMessage}
                  </p>
                ) : hasPrepared ? (
                  <p className="font-bold text-tts-confirm">
                    {L("Revisão preparada. Confira valor e operação antes de confirmar.", "Review prepared. Check amount and operation before confirming.")}
                  </p>
                ) : (
                  <p>{L("Prepare a revisão para validar a operação com sua conta.", "Prepare the review to validate the operation with your account.")}</p>
                )}
              </div>
              {confirmationAvailable ? (
                <div className="mt-4 border border-tts-border bg-tts-surface p-4">
                  <label className="block text-sm font-black text-tts-deep" htmlFor="yield-pin-review">
                    {L("PIN para confirmar", "PIN to confirm")}
                  </label>
                  <p className="mt-1 text-xs leading-5 text-tts-muted">
                    {hasPrepared
                      ? L("Digite o PIN apenas depois de conferir a revisão acima.", "Enter the PIN only after checking the review above.")
                      : L("Primeiro prepare a revisão; depois o PIN libera a confirmação.", "Prepare the review first; then the PIN enables confirmation.")}
                  </p>
                  <input
                    id="yield-pin-review"
                    value={pin}
                    onChange={(event) => onPinChange(event.target.value.replace(/\D/g, "").slice(0, 8))}
                    inputMode="numeric"
                    type="password"
                    disabled={!hasPrepared || submitted || apiLoading}
                    className="mt-3 min-h-12 w-full border border-tts-border bg-tts-bg px-3 text-sm font-bold text-tts-deep outline-none focus:border-tts-gold disabled:cursor-not-allowed disabled:opacity-55"
                  />
                </div>
              ) : null}
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
                  disabled={!canPrepareAction || apiLoading}
                  className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {apiLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileCheck2 className="h-4 w-4" aria-hidden="true" />}
                  {L("Preparar", "Prepare")}
                </button>
                {confirmationAvailable ? (
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={!canConfirm}
                    className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-gold px-3 py-2 text-sm font-black text-tts-deep disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {apiLoading && hasPrepared ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : submitted ? (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                    )}
                    {apiLoading && hasPrepared
                      ? L("Confirmando...", "Confirming...")
                      : hasPrepared ? confirmLabel : L("Prepare primeiro", "Prepare first")}
                  </button>
                ) : (
                  <div className="flex min-h-12 items-center border border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-bold leading-5 text-tts-gold">
                    {preparedExecutionBlocked ? blockedActionLabel : L("Modo revisão: sem movimentar saldo.", "Review mode: no funds move.")}
                  </div>
                )}
              </div>
            </div>
          </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CurrentInvestmentsPage({
  language,
  session,
  sessionLoading,
  apiState,
  accountPublicKey,
  options,
  amount,
  positionBalances,
  isTestnet,
  onRefresh,
  newApplicationUrl,
}: {
  language: AppLanguage;
  session: SessionState;
  sessionLoading: boolean;
  apiState: ApiState;
  accountPublicKey: string;
  amount: string;
  options: YieldOption[];
  positionBalances: Record<string, PositionState>;
  isTestnet: boolean;
  onRefresh: () => void;
  newApplicationUrl: string;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const availableOptions = options.filter((option) => !option.apy_error);
  const activePositions = availableOptions.filter((option) => {
    const position = positionBalances[optionCode(option)];
    return normalizeDecimal(position?.amount || "0") > 0 && !isSuspiciousTestnetConversionPosition(option, position);
  }).length;
  const anomalousPositions = availableOptions.filter((option) => isSuspiciousTestnetConversionPosition(option, positionBalances[optionCode(option)])).length;

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-tts-border pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="max-w-2xl text-2xl font-black tracking-tight text-tts-deep md:text-3xl">
              {L("Investimentos atuais", "Current investments")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-tts-muted">
              {L(
                "Consulte quanto há aplicado agora em cada opção. Nova aplicação e confirmação ficam em outra tela.",
                "Check how much is currently applied in each option. New applications and confirmation stay on another screen."
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 md:justify-end">
            <a
              href={newApplicationUrl}
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-tts-deep px-4 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
            >
              <PiggyBank className="h-4 w-4" aria-hidden="true" />
              {L("Nova aplicação", "New application")}
            </a>
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex min-h-11 items-center justify-center gap-2 border border-tts-border bg-tts-surface px-4 py-2 text-sm font-black text-tts-deep transition hover:border-tts-border2"
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
              <p className="mt-1 whitespace-pre-line">{apiState.error}</p>
            </div>
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <MiniStat
            label={L("Conta", "Account")}
            value={sessionLoading ? L("Verificando", "Checking") : session.authenticated ? L("Conectada", "Connected") : L("Entrar", "Sign in")}
            detail={accountPublicKey ? `ID: ${accountPublicKey.slice(0, 6)}...${accountPublicKey.slice(-5)}` : undefined}
          />
          <MiniStat label={L("Opções consultadas", "Checked options")} value={String(availableOptions.length)} detail={L("ativas neste ambiente", "active in this environment")} />
          <MiniStat
            label={L("Com saldo aplicado", "With current balance")}
            value={String(activePositions)}
            detail={anomalousPositions > 0
              ? L(`${anomalousPositions} posição de teste separada`, `${anomalousPositions} separate test position`)
              : L("posição maior que zero", "position above zero")}
          />
        </section>

        {isTestnet ? (
          <section className="border border-tts-gold bg-tts-gold-bg p-3 text-xs leading-5 text-tts-gold">
            {L("Testnet: dados estimados e variáveis, usados só para acompanhamento técnico.", "Testnet: estimated and variable data, used only for technical tracking.")}
          </section>
        ) : null}

        {!session.authenticated && !sessionLoading ? (
          <section className="border border-tts-border bg-tts-surface p-5">
            <AccountStatusCard
              state="signed-out"
              accountId=""
              ctaHref="/login?next=/rendimentos"
              compact
            />
          </section>
        ) : null}

        {session.authenticated ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            {availableOptions.length ? availableOptions.map((option) => (
              <InvestmentOptionCard
                key={`${option.vault_address}-${option.asset_code}`}
                option={option}
                language={language}
                amount={amount}
                position={positionBalances[optionCode(option)] || { loading: true, amount: "0", error: "" }}
              />
            )) : (
              <p className="text-sm leading-6 text-tts-muted">
                {L("Nenhuma opção disponível agora.", "No option available right now.")}
              </p>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}

function InvestmentOptionCard({
  option,
  language,
  amount,
  position,
}: {
  option: YieldOption;
  language: AppLanguage;
  amount: string;
  position?: PositionState;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const code = optionCode(option);
  const profile = moneyProfile(code);
  const isLoadingPosition = Boolean(!position || position.loading);
  const hasPositionError = Boolean(position?.error);
  const positionAmount = normalizeDecimal(position?.amount || "0");
  const hasTestnetConversionAnomaly = isSuspiciousTestnetConversionPosition(option, position);
  const displayPositionAmount = hasTestnetConversionAnomaly ? 0 : positionAmount;
  const projectionBase = displayPositionAmount > 0 ? String(displayPositionAmount) : amount;
  const chartData = buildReturnChartData(projectionBase, optionReturnRate(option), language);
  const reviewHref = buildMoneyUrl("/review", {
    asset: code,
    amount: amount || "100",
    lang: language,
  });

  return (
    <article className="border border-tts-border bg-tts-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className={`inline-flex border px-2 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${profile.tone}`}>
            {profile.short}
          </span>
          <h2 className="mt-2 text-lg font-black text-tts-deep">{profileName(profile, language)}</h2>
          <p className="mt-1 text-xs leading-5 text-tts-muted">
            {L("Consulta da posição atual nesta opção.", "Current position for this option.")}
          </p>
        </div>
        <TrendingUp className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
      </div>

      <div className="mt-4 border border-tts-confirm bg-tts-confirm/10 p-4">
        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-tts-confirm">
          {L("Posição atual", "Current position")}
        </p>
        <p className="mt-2 text-2xl font-black text-tts-deep">
          {isLoadingPosition
            ? L("Consultando", "Checking")
            : hasPositionError
              ? L("Consulta indisponível", "Unavailable")
              : hasTestnetConversionAnomaly
              ? L("Ajuste necessário", "Needs adjustment")
              : displayPositionAmount > 0
              ? `${formatAmount(displayPositionAmount, language)} ${profile.short}`
              : L("Nada aplicado agora", "Nothing applied now")}
        </p>
        <p className="mt-1 text-xs leading-5 text-tts-muted">
          {hasPositionError
            ? position?.error
            : hasTestnetConversionAnomaly
              ? L(`O vault reportou só ${formatAmount(positionAmount, language)} ${profile.short} após uma conversão testnet distorcida. Este valor foi separado da posição normal para não parecer um investimento válido.`, `The vault reported only ${formatAmount(positionAmount, language)} ${profile.short} after a distorted testnet conversion. This value is separated from the normal position so it does not look like a valid investment.`)
              : L("Valor consultado diretamente da posição atual da conta.", "Value checked from the account's current position.")}
        </p>
      </div>

      {hasTestnetConversionAnomaly ? (
        <div className="mt-3 border border-tts-gold bg-tts-gold-bg p-3 text-xs leading-5 text-tts-gold">
          {L(
            "Esta posição veio de uma rota de teste antiga que converteu a moeda para outra emissão com perda forte. Novas confirmações distorcidas estão bloqueadas; para corrigir esta posição antiga, faça resgate/reparo técnico ou use uma nova opção compatível.",
            "This position came from an old test route that converted the currency into another issuance with heavy loss. New distorted confirmations are blocked; to fix this old position, withdraw/repair it technically or use a compatible new option."
          )}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniStat
          label={L("Status", "Status")}
          value={isLoadingPosition
            ? L("Consultando", "Checking")
            : hasPositionError
              ? L("Tente atualizar", "Try refresh")
              : hasTestnetConversionAnomaly
                ? L("Separado", "Separated")
                : displayPositionAmount > 0
                  ? L("Com saldo", "Has balance")
                  : L("Sem posição", "No position")}
          detail={hasPositionError
            ? L("consulta falhou", "check failed")
            : hasTestnetConversionAnomaly
              ? L("conversão testnet distorcida", "distorted testnet conversion")
              : L("posição atual", "current position")}
        />
        <MiniStat label={L("Taxa atual", "Current rate")} value={optionReturnText(option, language)} detail={L("estimada", "estimated")} />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-3 text-xs text-tts-muted">
          <span className="font-black uppercase tracking-[0.14em]">{L("Simulação separada", "Separate simulation")}</span>
          <span>{L("não é posição atual", "not current position")}</span>
        </div>
        <ReturnLineChart data={chartData} currency={profile.short} />
      </div>

      <a
        href={reviewHref}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-tts-deep px-3 py-2 text-sm font-black text-tts-surface transition hover:bg-tts-deep2"
      >
        <PiggyBank className="h-4 w-4" aria-hidden="true" />
        {L("Nova aplicação nesta opção", "New application in this option")}
      </a>
    </article>
  );
}

function ReturnLineChart({
  data,
  currency,
}: {
  data: Array<{ month: number; label: string; balance: number; earned: number }>;
  currency: string;
}) {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const width = 640;
  const height = 220;
  const paddingX = 32;
  const paddingY = 26;
  const values = data.map((item) => item.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = data.map((item, index) => {
    const x = paddingX + (index / Math.max(1, data.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((item.balance - min) / span) * (height - paddingY * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
  const areaPoints = `${paddingX},${height - paddingY} ${points} ${width - paddingX},${height - paddingY}`;
  const last = data[data.length - 1];

  return (
    <div className="border border-tts-border bg-tts-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-tts-muted">
            {L("Gráfico de simulação", "Simulation chart")}
          </p>
          <p className="mt-1 text-sm font-black text-tts-deep">
            {last ? `${formatAmount(last.balance, language)} ${currency}` : `0 ${currency}`}
          </p>
        </div>
        <span className="text-xs font-bold text-tts-muted">{L("12 meses", "12 months")}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-56 w-full" role="img" aria-label={L("Gráfico de simulação", "Simulation chart")}>
        <defs>
          <linearGradient id="returnAreaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = paddingY + line * ((height - paddingY * 2) / 3);
          return <line key={line} x1={paddingX} x2={width - paddingX} y1={y} y2={y} className="stroke-tts-border" strokeWidth="1" />;
        })}
        <polygon points={areaPoints} className="fill-tts-confirm text-tts-confirm" opacity="0.28" />
        <polyline points={points} fill="none" className="stroke-tts-confirm" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {data.filter((item) => item.month % 3 === 0).map((item, index) => {
          const x = paddingX + (item.month / Math.max(1, data.length - 1)) * (width - paddingX * 2);
          return (
            <text key={item.month} x={x} y={height - 6} textAnchor={index === 0 ? "start" : item.month === 12 ? "end" : "middle"} className="fill-tts-muted text-[11px] font-bold">
              {item.label}
            </text>
          );
        })}
      </svg>
    </div>
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
