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
  Loader2,
  LockKeyhole,
  Plus,
  WalletCards,
} from "lucide-react";
import { extractDefindexPositionAmount } from "@/lib/defindex-position";
import { useLanguage, type AppLanguage } from "@/lib/i18n";
import { getClientSession } from "@/lib/session";

type ApiState = { loading: boolean; message: string; error: string };
type YieldApiError = Error & { code?: string; requestId?: string; supportCode?: string };
type YieldStep = "plan" | "review";
type SessionState = { authenticated: boolean; sessionId?: string; loading?: boolean; checked?: boolean };
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
type YieldSuccessNotice = { action: "deposit" | "withdraw"; reviewedAmount: string; reviewedAsset: string; vaultAmount?: string; vaultAsset?: string; hash?: string; };

const MONEY_PROFILES: Record<string, { namePt: string; nameEn: string; short: string }> = {
  USDC: { namePt: "Dólares", nameEn: "Dollars", short: "USD" },
  CETES: { namePt: "CETES", nameEn: "CETES", short: "CETES" },
  USD: { namePt: "Dólares", nameEn: "Dollars", short: "USD" },
  XLM: { namePt: "XLM", nameEn: "XLM", short: "XLM" },
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

function sparklineValues(baseAmount: number, ratePercent: number) {
  const base = baseAmount > 0 ? baseAmount : 1;
  const rate = Math.max(0.01, ratePercent / 100);
  return Array.from({ length: 8 }, (_, i) => base * (1 + rate * (i / 7)));
}
function normalizeUiAssetCode(value: unknown) {
  const code = String(value || "").trim().toUpperCase().split(":")[0];
  if (!code) return "";
  if (["USD", "DOLLAR", "DOLLARS"].includes(code)) return "USDC";
  if (["EUR", "EURC", "EURO", "EUROS"].includes(code)) return "CETES";
  if (["TESOURO", "REAL", "REAIS", "R$"].includes(code)) return "BRL";
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

async function yieldApi(path: string, init?: RequestInit, timeoutMs = 18000) {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetch(`/api/ramp/${path}`, {
    cache: "no-store", credentials: "same-origin", ...init,
    signal: controller.signal,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
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
  const [session, setSession] = useState<SessionState>({ authenticated: false, loading: true, checked: false });
  const [yieldStatus, setYieldStatus] = useState<YieldStatus | null>(null);
  const [balances, setBalances] = useState<BalanceLine[]>([]);
  const [selectedCode, setSelectedCode] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [activeStep, setActiveStep] = useState<YieldStep>("plan");
  const [variationBps, setVariationBps] = useState("100");
  const [pin, setPin] = useState("");
  const [positionBalances, setPositionBalances] = useState<Record<string, PositionState>>({});
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
  const selectedProfile = moneyProfile(safeSelectedCode);
  const bestOptionCode = optionCode(bestOption);
  const actionableOptionCode = optionCode(actionableOption);
  const selectedHasYield = Boolean(selectedOption);
  const selectedExecutionBlocked = optionExecutionBlocked(actionableOption);
  const sessionLoading = Boolean(session.loading && !session.checked);
  const canPrepare = Boolean(!sessionLoading && session.authenticated && configured && actionableOption && !selectedExecutionBlocked && Number(String(amount).replace(",", ".")) > 0);
  const balanceForSelected = balances.find((item) => normalizeUiAssetCode(item.asset_code) === safeSelectedCode);
  const requestedAmount = normalizeDecimal(amount);
  const selectedBalanceAmount = normalizeDecimal(balanceForSelected?.balance || "0");
  const selectedBalanceInsufficient = Boolean(session.authenticated && requestedAmount > 0 && (!balanceForSelected || selectedBalanceAmount + 0.0000001 < requestedAmount));
  const alternativeConversionBalance = useMemo(() => {
    return [...balances].filter((item: BalanceLine) => { const c = normalizeUiAssetCode(item.asset_code); return Boolean(c && c !== safeSelectedCode && normalizeDecimal(item.balance) > 0.0000001); }).sort((a, b) => normalizeDecimal(b.balance) - normalizeDecimal(a.balance))[0] || null;
  }, [balances, safeSelectedCode]);
  const alternativeConversionCode = normalizeUiAssetCode(alternativeConversionBalance?.asset_code);
  const smartConvertSourceCode = selectedBalanceInsufficient ? alternativeConversionCode || (safeSelectedCode === "BRL" ? "USDC" : "BRL") : safeSelectedCode;
  const smartConvertDestCode = selectedBalanceInsufficient ? actionableOptionCode || safeSelectedCode || bestOptionCode || "USDC" : bestOptionCode || actionableOptionCode || "USDC";
  const returnsUrl = useMemo(() => buildMoneyUrl("/rendimentos", { view: "returns", amount, asset: safeSelectedCode, lang: language }), [amount, safeSelectedCode, language]);
  const newApplicationUrl = useMemo(() => buildMoneyUrl("/rendimentos", { view: "application", action: "deposit", amount, asset: safeSelectedCode, lang: language }), [amount, safeSelectedCode, language]);
  const convertAssetsUrl = useMemo(() => buildMoneyUrl("/convert", { amount, source_asset: smartConvertSourceCode, dest_asset: smartConvertDestCode, from: "review", next: "review", lang: language }), [amount, smartConvertDestCode, smartConvertSourceCode, language]);
  const pixTopUpUrl = useMemo(() => buildMoneyUrl("/pix-on", { amount, asset: "BRL", from: "review", lang: language }), [amount, language]);
  const amountPresets = useMemo(() => {
    const s = selectedProfile.short;
    if (s === "BRL") return ["50", "100", "500", "1000"];
    if (["JPY", "ARS"].includes(s)) return ["1000", "5000", "10000", "25000"];
    return ["10", "50", "100", "250"];
  }, [selectedProfile.short]);

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
        const accountPromise = nextSession.authenticated ? yieldApi("etherfuse/wallet-balances", undefined, 20000) : Promise.resolve(null);
        const statusPayload = await statusPromise;
        setYieldStatus(statusPayload);
        const vaults = Array.isArray(statusPayload?.vaults) ? statusPayload.vaults : [];
        const bestAvailable = vaults[0] || null;
        if (!requestedAssetRef.current && bestAvailable) setSelectedCode((c) => vaults.some((item: YieldOption) => optionCode(item) === c) ? c : optionCode(bestAvailable));
        if (!nextSession.authenticated) { setBalances([]); setApiState({ loading: false, message: L("Entre para ver seus saldos.", "Sign in to see balances."), error: "" }); return; }
        const accountPayload = await accountPromise;
        setBalances(Array.isArray(accountPayload?.balances) ? accountPayload.balances : []);
        setApiState({ loading: false, message: "", error: "" });
      } catch (error) {
        if (isSessionUiError(error)) setSession({ authenticated: false, loading: false, checked: true });
        else setSession((c) => ({ ...c, loading: false, checked: true }));
        setApiState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) });
      }
    })();
  }, []);

  useEffect(() => { setYieldResult(null); setPin(""); }, [action, amount, actionableOption?.vault_address, safeSelectedCode]);
  useEffect(() => {
    if (tab !== "returns" || !session.authenticated || !options.length) return;
    let cancelled = false;
    const initial = Object.fromEntries(options.map((o) => [optionCode(o), { loading: true, amount: "0", error: "" }]));
    setPositionBalances(initial);
    Promise.all(options.map(async (o) => {
      const code = optionCode(o);
      try {
        const payload = await yieldApi(`defindex/yield/balance?asset_code=${encodeURIComponent(o.asset_code)}&vault_address=${encodeURIComponent(o.vault_address)}`, undefined, 22000);
        return [code, { loading: false, amount: extractDefindexPositionAmount(payload?.position || payload?.balance), error: "", raw: payload?.balance, source: String(payload?.balance_source || payload?.balance?.source || "") }] as const;
      } catch (error) {
        return [code, { loading: false, amount: "0", error: String(error instanceof Error ? error.message : error) }] as const;
      }
    })).then((entries) => { if (!cancelled) setPositionBalances(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [tab, session.authenticated, options, language]);

  async function prepareYield() {
    if (!actionableOption) return;
    setApiState({ loading: true, message: "", error: "" });
    setYieldResult(null);
    try {
      const payload = await yieldApi("defindex/yield/prepare", { method: "POST", body: JSON.stringify({ action, amount, source_asset_code: safeSelectedCode, asset_code: actionableOption.asset_code, vault_address: actionableOption.vault_address, slippage_bps: variationBps }) });
      setYieldResult(payload);
      setActiveStep("review");
      setApiState({ loading: false, message: payload?.execution_ready === false ? (String(payload?.execution_blocked_code || "") ? String(payload?.execution_blocked_reason || "") : "") : "", error: "" });
    } catch (error) { setApiState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) }); }
  }

  async function confirmYield() {
    if (!actionableOption || !yieldResult) return;
    setApiState({ loading: true, message: "", error: "" });
    try {
      const payload = await yieldApi("defindex/yield/execute", { method: "POST", body: JSON.stringify({ action, amount, source_asset_code: safeSelectedCode, asset_code: actionableOption.asset_code, vault_address: actionableOption.vault_address, slippage_bps: variationBps, pin, wallet_pin: pin }) }, 60000);
      setYieldResult(payload);
      setPin("");
      setSuccessNotice({ action, reviewedAmount: amount, reviewedAsset: selectedProfile.short, vaultAmount: String(payload?.amount || "").trim(), vaultAsset: String(payload?.vault?.display_asset_code || payload?.vault?.asset_code || "").trim(), hash: String(payload?.hash || "").trim() });
      setApiState({ loading: false, message: L("Operação confirmada.", "Operation confirmed."), error: "" });
    } catch (error) { setApiState({ loading: false, message: "", error: String(error instanceof Error ? error.message : error) }); }
  }

  const tabClass = (t: string) =>
    `flex-1 py-3 text-sm font-bold text-center transition cursor-pointer ${tab === t ? "text-tts-deep border-b-2 border-tts-deep" : "text-tts-muted hover:text-tts-deep"}`;

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      {successNotice && <SuccessDialog language={language} notice={successNotice} returnsHref={returnsUrl} onClose={() => setSuccessNotice(null)} onRefresh={() => { setSuccessNotice(null); /* refresh */ }} />}

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <div className="flex border-b border-tts-border mb-6">
          <div className={tabClass("returns")} onClick={() => setTab("returns")}>{L("Rendimentos", "Returns")}</div>
          <div className={tabClass("apply")} onClick={() => setTab("apply")}>{L("Aplicar", "Apply")}</div>
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

        {tab === "returns" && (
          <ReturnsTab
            language={language} session={session} sessionLoading={sessionLoading} options={options}
            positionBalances={positionBalances} isTestnet={isTestnetYield}
            onRefresh={() => {}} newApplicationUrl={newApplicationUrl}
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
      </div>
    </main>
  );
}

function ReturnsTab({ language, session, sessionLoading, options, positionBalances, isTestnet, onRefresh, newApplicationUrl }: {
  language: AppLanguage; session: SessionState; sessionLoading: boolean;
  options: YieldOption[]; positionBalances: Record<string, PositionState>;
  isTestnet: boolean; onRefresh: () => void; newApplicationUrl: string;
}) {
  const L = (pt: string, en: string) => localCopy(language, pt, en);
  const rows = options.filter((o) => String(o.vault_address || "").trim()).map((o) => {
    const code = optionCode(o);
    const pos = positionBalances[code];
    const amt = normalizeDecimal(pos?.amount || "0");
    return { option: o, code, profile: moneyProfile(code), amount: amt, loading: Boolean(!pos || pos.loading), error: String(pos?.error || ""), rate: optionRatePercent(o) };
  });
  const usdRow = rows.find((r) => r.profile.short === "USD");
  const cetesRow = rows.find((r) => r.profile.short === "CETES");
  const xlmRow = rows.find((r) => r.profile.short === "XLM");
  const ctk = (v: number, rate: number) => v > 0 ? v / rate : 0;
  const totalUsd = (usdRow?.amount || 0) + ctk(cetesRow?.amount || 0, 5.6) + ctk(xlmRow?.amount || 0, 1 / 0.09);

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
          <div className="grid grid-cols-3 gap-4">
            <StatCard label={L("Total", "Total")} value={totalUsd > 0 ? `${formatAmount(totalUsd, language)} USD` : L("—", "—")} sub={L("valor estimado", "estimated value")} />
            <StatCard label={L("Opções", "Options")} value={String(rows.length)} sub={L("disponíveis", "available")} />
            <StatCard label={L("Ambiente", "Environment")} value={L("Testnet", "Testnet")} sub={L("valores estimados", "estimated values")} />
          </div>

          {rows.map((row) => {
            const spv = sparklineValues(row.amount, row.rate);
            const maxSpv = Math.max(...spv);
            return (
              <div key={row.code} className="border border-tts-border bg-tts-surface p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-xs font-bold text-tts-muted uppercase tracking-wide">{row.profile.short}</span>
                    <h3 className="text-lg font-bold mt-0.5">{profileName(row.profile, language)}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold">{row.loading ? L("...", "...") : row.error ? L("—", "—") : `${formatAmount(row.amount, language)} ${row.profile.short}`}</p>
                  </div>
                </div>
                {row.amount > 0 && row.rate > 0 && (
                  <div className="flex items-end gap-1 h-14 mb-3">
                    {spv.map((v, i) => (
                      <div key={i} className="flex-1 rounded-t bg-tts-confirm/70" style={{ height: `${Math.max(8, (v / maxSpv) * 100)}%` }} />
                    ))}
                  </div>
                )}
                <a href={buildMoneyUrl("/rendimentos", { view: "application", action: "deposit", asset: row.code, amount: "100", lang: language })}
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
  const hasPrepared = Boolean(yieldResult);
  const submitted = Boolean(yieldResult?.submitted || yieldResult?.hash);
  const preparedBlocked = Boolean(hasPrepared && yieldResult?.execution_ready === false);
  const confirmAvailable = confirmationEnabled && !preparedBlocked && !selectedExecutionBlocked;
  const canConfirm = canPrepare && confirmAvailable && hasPrepared && !submitted && pin.length >= 4;
  const blockedCode = String(yieldResult?.execution_blocked_code || "").trim();
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
    <div className="space-y-6">
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
        <div className="border border-tts-gold bg-tts-gold-bg p-4 text-sm">
          <p className="font-bold text-tts-gold mb-2">{L("Saldo insuficiente", "Insufficient balance")}</p>
          <div className="flex gap-2">
            <a href={convertAssetsUrl} className="flex items-center gap-1.5 bg-tts-gold text-tts-deep px-3 py-2 text-xs font-bold"><ArrowRightLeft className="h-3.5 w-3.5" /> {L("Converter", "Convert")}</a>
            <a href={pixTopUpUrl} className="flex items-center gap-1.5 border border-tts-gold text-tts-gold px-3 py-2 text-xs font-bold"><ArrowDownToLine className="h-3.5 w-3.5" /> PIX</a>
          </div>
        </div>
      )}

      {activeStep === "plan" && (
        <div className="border border-tts-border bg-tts-surface p-5 space-y-5">
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

          <button onClick={onPrepare} disabled={!canPrepare}
            className="w-full py-3.5 bg-tts-deep text-tts-surface font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition">
            {apiState.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
            {action === "deposit" ? L("Investir", "Invest") : L("Retirar", "Withdraw")}
          </button>
        </div>
      )}

      {activeStep === "review" && (
        <div className="border border-tts-border bg-tts-surface p-5 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">{L("Confirmação", "Confirmation")}</h3>
            <BadgeCheck className="h-5 w-5 text-tts-confirm" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard label={L("Operação", "Operation")} value={action === "deposit" ? L("Investir", "Invest") : L("Retirar", "Withdraw")} />
            <StatCard label={L("Valor", "Amount")} value={`${formatAmount(amount, language)} ${profileShort}`} />
          </div>

          {hasPrepared && !submitted && (
            <div className="border border-tts-border bg-tts-bg p-4">
              <label className="text-xs font-bold text-tts-muted uppercase tracking-wide mb-2 block">PIN</label>
              <input value={pin} onChange={(e) => onPinChange(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric" type="password" placeholder={L("Digite seu PIN", "Enter your PIN")}
                className="w-full border border-tts-border bg-tts-surface px-4 py-3 text-sm font-bold outline-none focus:border-tts-deep" />
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setActiveStep("plan"); onPinChange(""); }}
              className="flex-1 py-3 border border-tts-border text-sm font-bold hover:bg-tts-bg transition">
              {L("Voltar", "Back")}
            </button>
            {confirmAvailable ? (
              <button onClick={onConfirm} disabled={!canConfirm}
                className="flex-1 py-3 bg-tts-deep text-tts-surface font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition">
                <LockKeyhole className="h-4 w-4" /> {L("Confirmar", "Confirm")}
              </button>
            ) : (
              <div className="flex-1 py-3 border border-tts-gold bg-tts-gold-bg text-tts-gold text-sm font-bold text-center">
                {preparedBlocked ? (blockedCode === "yield_account_setup_required" ? L("Ativar moeda", "Activate currency") : L("Somente consulta", "View only")) : L("Somente consulta", "View only")}
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
