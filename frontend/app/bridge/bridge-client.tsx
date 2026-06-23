"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  OperationalCard,
  OperationalHeader,
  OperationalPage,
  OperationalStat,
  StatusPill,
} from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";

// ── Types ──────────────────────────────────────────────────────────────

type VirtualAccount = {
  id: string;
  currency: string;
  status: string;
  deposit_instructions?: {
    payment_rail?: string;
    bank_name?: string;
    routing_number?: string;
    account_number?: string;
    bank_address?: string;
    beneficiary_name?: string;
    beneficiary_address?: string;
    reference?: string;
  };
};

type UsdAccountResponse = {
  success: boolean;
  has_account?: boolean;
  kyc_status?: string;
  customer_status?: string;
  virtual_accounts?: VirtualAccount[];
  message?: string;
};

type RateResponse = {
  success: boolean;
  rate?: number;
  from?: string;
  to?: string;
  message?: string;
};

type LoadStatus = "idle" | "loading" | "ready" | "no_account" | "no_session" | "error";

// ── Helpers ────────────────────────────────────────────────────────────

function mask(value: string) {
  if (!value || value.length < 4) return value;
  return "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4);
}

function kycTone(status?: string): "confirm" | "gold" | "error" | "default" {
  const s = (status || "").toLowerCase();
  if (s === "approved" || s === "active") return "confirm";
  if (s === "pending" || s === "under_review") return "gold";
  if (s === "rejected" || s === "failed") return "error";
  return "default";
}

function kycLabel(status: string | undefined, L: (pt: string, en: string) => string) {
  const s = (status || "").toLowerCase();
  if (s === "approved") return L("Aprovado", "Approved");
  if (s === "active") return L("Ativo", "Active");
  if (s === "pending") return L("Pendente", "Pending");
  if (s === "under_review") return L("Em análise", "Under review");
  if (s === "rejected") return L("Rejeitado", "Rejected");
  if (s === "failed") return L("Falhou", "Failed");
  if (!status) return L("—", "—");
  return status;
}

// ── Small UI pieces ────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => null);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      className="ml-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-tts-text/60 hover:text-tts-text transition-colors"
    >
      {copied ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-tts-green" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function DepositField({
  label,
  value,
  masked = false,
}: {
  label: string;
  value: string;
  masked?: boolean;
}) {
  const [revealed, setRevealed] = useState(!masked);
  return (
    <div className="flex items-center justify-between py-2 border-b border-tts-border/30 last:border-0">
      <span className="text-xs text-tts-text/50 uppercase tracking-wide min-w-32">{label}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-sm text-tts-deep font-medium">
          {masked && !revealed ? mask(value) : value}
        </span>
        {masked && (
          <button
            onClick={() => setRevealed((r) => !r)}
            className="ml-1 text-xs text-tts-text/40 hover:text-tts-text/70"
          >
            {revealed ? "ocultar" : "ver"}
          </button>
        )}
        <CopyButton text={value} />
      </div>
    </div>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────

const TABS = [
  { id: "receive", labelPt: "Receber USD", labelEn: "Receive USD" },
  { id: "rates", labelPt: "Taxas", labelEn: "Rates" },
  { id: "status", labelPt: "Status", labelEn: "Status" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabBar({
  active,
  onChange,
  isEn,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  isEn: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-tts-surface border border-tts-border p-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={[
            "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            active === t.id
              ? "bg-tts-deep text-white shadow-sm"
              : "text-tts-text/60 hover:text-tts-deep",
          ].join(" ")}
        >
          {isEn ? t.labelEn : t.labelPt}
        </button>
      ))}
    </div>
  );
}

// ── Tab 1: Receive USD ─────────────────────────────────────────────────

function ReceiveTab({
  status,
  data,
  sessionId,
  onRetry,
  L,
}: {
  status: LoadStatus;
  data: UsdAccountResponse | null;
  sessionId: string;
  onRetry: () => void;
  L: (pt: string, en: string) => string;
}) {
  const usdAccounts =
    data?.virtual_accounts?.filter((va) =>
      ["active", "enabled", "pending"].includes(
        String(va.status || "").toLowerCase()
      )
    ) ?? [];
  const activeAccount = usdAccounts[0];
  const instr = activeAccount?.deposit_instructions;

  if (status === "loading") {
    return (
      <OperationalCard>
        <div className="flex items-center justify-center gap-2 py-8 text-tts-text/50">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{L("Carregando sua conta...", "Loading your account...")}</span>
        </div>
      </OperationalCard>
    );
  }

  if (status === "error") {
    return (
      <OperationalCard>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <AlertTriangle className="h-8 w-8 text-tts-error" />
          <p className="text-sm text-tts-text/60">
            {L("Erro ao carregar os dados da conta.", "Error loading account data.")}
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            {L("Tentar novamente", "Retry")}
          </Button>
        </div>
      </OperationalCard>
    );
  }

  if (status === "no_session") {
    return (
      <OperationalCard>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Banknote className="h-10 w-10 text-tts-text/30" />
          <p className="text-sm text-tts-text/60 max-w-xs">
            {L(
              "Acesse pelo link enviado no WhatsApp para carregar seus dados.",
              "Open the link sent in WhatsApp to load your data."
            )}
          </p>
        </div>
      </OperationalCard>
    );
  }

  if (status === "no_account") {
    return (
      <OperationalCard>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <Banknote className="h-10 w-10 text-tts-gold/60" />
          <div>
            <p className="font-medium text-tts-deep">
              {L("Conta USD não configurada", "USD account not set up")}
            </p>
            <p className="mt-1 text-sm text-tts-text/60">
              {L(
                "Para receber via wire ou ACH, ative sua conta de banco americano.",
                "To receive via wire or ACH, activate your US bank account."
              )}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const url = sessionId
                ? `/bridge-test?session_id=${encodeURIComponent(sessionId)}`
                : "/bridge-test";
              window.open(url, "_blank", "noopener");
            }}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {L("Configurar conta USD", "Set up USD account")}
          </Button>
        </div>
      </OperationalCard>
    );
  }

  // status === "ready" but no active account with instructions
  if (status === "ready" && (!activeAccount || !instr)) {
    return (
      <OperationalCard>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Loader2 className="h-8 w-8 text-tts-gold animate-spin" />
          <p className="font-medium text-tts-deep">
            {L("Conta em processamento", "Account being processed")}
          </p>
          <p className="text-sm text-tts-text/60">
            {L(
              "Sua conta USD está sendo configurada. Aguarde alguns minutos e atualize.",
              "Your USD account is being set up. Wait a few minutes and refresh."
            )}
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            {L("Atualizar", "Refresh")}
          </Button>
        </div>
      </OperationalCard>
    );
  }

  // Ready with deposit instructions
  return (
    <>
      <OperationalCard>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-tts-green" />
            <span className="text-sm font-medium text-tts-deep">
              {L("Dados para transferência", "Transfer details")}
            </span>
          </div>
          <StatusPill
            tone={
              activeAccount!.status === "active" || activeAccount!.status === "enabled"
                ? "confirm"
                : "gold"
            }
          >
            {activeAccount!.status === "active" || activeAccount!.status === "enabled"
              ? L("Ativa", "Active")
              : L("Pendente", "Pending")}
          </StatusPill>
        </div>

        <div className="space-y-0">
          {instr?.bank_name && (
            <DepositField label={L("Banco", "Bank")} value={instr.bank_name} />
          )}
          {instr?.routing_number && (
            <DepositField
              label={L("Routing number", "Routing number")}
              value={instr.routing_number}
            />
          )}
          {instr?.account_number && (
            <DepositField
              label={L("Account number", "Account number")}
              value={instr.account_number}
              masked
            />
          )}
          {instr?.beneficiary_name && (
            <DepositField
              label={L("Beneficiário", "Beneficiary")}
              value={instr.beneficiary_name}
            />
          )}
          {instr?.payment_rail && (
            <DepositField label="Rail" value={instr.payment_rail.toUpperCase()} />
          )}
          {instr?.reference && (
            <DepositField label={L("Referência", "Reference")} value={instr.reference} />
          )}
        </div>

        <p className="mt-4 text-xs text-tts-text/40 leading-relaxed">
          {L(
            "Seu dólar chega em 1–2 dias úteis via banco americano.",
            "Your dollars arrive within 1–2 business days via US bank."
          )}
        </p>
      </OperationalCard>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <OperationalStat label={L("Moeda", "Currency")} value="USD" />
        <OperationalStat
          label={L("Prazo estimado", "Est. arrival")}
          value={L("1–2 dias úteis", "1–2 business days")}
        />
      </div>

      <div className="mt-4 flex justify-end">
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          {L("Atualizar", "Refresh")}
        </Button>
      </div>
    </>
  );
}

// ── Tab 2: Exchange Rates ──────────────────────────────────────────────

const RATE_PAIRS = [
  { from: "USD", to: "BRL", flag: "🇧🇷" },
  { from: "USD", to: "MXN", flag: "🇲🇽" },
  { from: "USD", to: "EUR", flag: "🇪🇺" },
] as const;

type RateEntry = {
  from: string;
  to: string;
  flag: string;
  rate?: number;
  loading: boolean;
  error?: string;
};

function RatesTab({ L }: { L: (pt: string, en: string) => string }) {
  const [rates, setRates] = useState<RateEntry[]>(
    RATE_PAIRS.map((p) => ({ ...p, loading: true }))
  );

  const loadRates = useCallback(async () => {
    setRates(RATE_PAIRS.map((p) => ({ ...p, loading: true, error: undefined, rate: undefined })));

    const results = await Promise.allSettled(
      RATE_PAIRS.map(async (p) => {
        const res = await fetch(
          `/api/bridge/exchange-rates?from=${p.from}&to=${p.to}`,
          { cache: "no-store" }
        );
        const json: RateResponse = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          throw new Error(json.message || `HTTP ${res.status}`);
        }
        return json.rate;
      })
    );

    setRates(
      RATE_PAIRS.map((p, i) => {
        const r = results[i];
        return {
          ...p,
          loading: false,
          rate: r.status === "fulfilled" ? (r.value as number) : undefined,
          error: r.status === "rejected" ? String(r.reason) : undefined,
        };
      })
    );
  }, []);

  useEffect(() => {
    loadRates();
  }, [loadRates]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rates.map((entry) => (
          <OperationalCard key={`${entry.from}-${entry.to}`}>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-tts-text/40" />
              <span className="text-xs text-tts-text/50 uppercase tracking-wide">
                {entry.from} → {entry.to}
              </span>
              <span>{entry.flag}</span>
            </div>
            {entry.loading ? (
              <div className="flex items-center gap-2 text-tts-text/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">{L("Carregando...", "Loading...")}</span>
              </div>
            ) : entry.error ? (
              <div className="flex items-center gap-1 text-tts-error">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{L("Erro", "Error")}</span>
              </div>
            ) : (
              <OperationalStat
                label={`1 ${entry.from}`}
                value={
                  entry.rate != null
                    ? `${entry.rate.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ${entry.to}`
                    : "—"
                }
              />
            )}
          </OperationalCard>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-tts-text/40 leading-relaxed">
          {L(
            "Taxas indicativas Bridge.xyz. Podem variar no momento da operação.",
            "Indicative rates from Bridge.xyz. May vary at the time of the transaction."
          )}
        </p>
        <Button size="sm" variant="outline" onClick={loadRates}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          {L("Atualizar", "Refresh")}
        </Button>
      </div>
    </div>
  );
}

// ── Tab 3: Status ──────────────────────────────────────────────────────

function StatusTab({
  status,
  data,
  sessionId,
  onRetry,
  L,
}: {
  status: LoadStatus;
  data: UsdAccountResponse | null;
  sessionId: string;
  onRetry: () => void;
  L: (pt: string, en: string) => string;
}) {
  if (status === "loading") {
    return (
      <OperationalCard>
        <div className="flex items-center justify-center gap-2 py-8 text-tts-text/50">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{L("Verificando status...", "Checking status...")}</span>
        </div>
      </OperationalCard>
    );
  }

  if (status === "error") {
    return (
      <OperationalCard>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <AlertTriangle className="h-8 w-8 text-tts-error" />
          <p className="text-sm text-tts-text/60">
            {L("Erro ao carregar o status.", "Error loading status.")}
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            {L("Tentar novamente", "Retry")}
          </Button>
        </div>
      </OperationalCard>
    );
  }

  if (status === "no_session" || !data) {
    return (
      <OperationalCard>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <ShieldCheck className="h-10 w-10 text-tts-text/30" />
          <p className="text-sm text-tts-text/60 max-w-xs">
            {L(
              "Acesse pelo link enviado no WhatsApp para ver seu status.",
              "Open the link sent in WhatsApp to view your status."
            )}
          </p>
        </div>
      </OperationalCard>
    );
  }

  if (status === "no_account") {
    return (
      <OperationalCard>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <ShieldCheck className="h-10 w-10 text-tts-gold/60" />
          <div>
            <p className="font-medium text-tts-deep">
              {L("Conta não configurada", "Account not set up")}
            </p>
            <p className="mt-1 text-sm text-tts-text/60">
              {L(
                "Complete o KYC para ativar sua conta USD.",
                "Complete KYC to activate your USD account."
              )}
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const url = sessionId
                ? `/bridge-test?session_id=${encodeURIComponent(sessionId)}`
                : "/bridge-test";
              window.open(url, "_blank", "noopener");
            }}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            {L("Fazer KYC", "Complete KYC")}
          </Button>
        </div>
      </OperationalCard>
    );
  }

  // Has data — show KYC / customer status
  const kycStatus = data.kyc_status;
  const customerStatus = data.customer_status;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <OperationalCard>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-tts-text/40" />
            <span className="text-xs text-tts-text/50 uppercase tracking-wide">
              {L("KYC", "KYC")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={kycTone(kycStatus)}>
              {kycLabel(kycStatus, L)}
            </StatusPill>
          </div>
          {kycStatus && (
            <p className="mt-2 font-mono text-xs text-tts-text/40">{kycStatus}</p>
          )}
        </OperationalCard>

        <OperationalCard>
          <div className="flex items-center gap-2 mb-3">
            <Banknote className="h-4 w-4 text-tts-text/40" />
            <span className="text-xs text-tts-text/50 uppercase tracking-wide">
              {L("Cliente", "Customer")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill tone={kycTone(customerStatus)}>
              {kycLabel(customerStatus, L)}
            </StatusPill>
          </div>
          {customerStatus && (
            <p className="mt-2 font-mono text-xs text-tts-text/40">{customerStatus}</p>
          )}
        </OperationalCard>
      </div>

      {(kycStatus !== "approved" || customerStatus !== "active") && (
        <div className="rounded-lg bg-tts-gold/10 border border-tts-gold/30 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-tts-gold mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-tts-deep font-medium">
              {L("Ação necessária", "Action required")}
            </p>
            <p className="mt-1 text-xs text-tts-text/60">
              {L(
                "Seu KYC ou status de cliente ainda não está aprovado. Complete o processo para liberar sua conta.",
                "Your KYC or customer status is not yet approved. Complete the process to unlock your account."
              )}
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => {
                const url = sessionId
                  ? `/bridge-test?session_id=${encodeURIComponent(sessionId)}`
                  : "/bridge-test";
                window.open(url, "_blank", "noopener");
              }}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              {L("Continuar KYC", "Continue KYC")}
            </Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          {L("Atualizar", "Refresh")}
        </Button>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export default function BridgeClient({ initialQuery = "" }: { initialQuery?: string }) {
  const searchParams = useSearchParams();
  const queryParams = new URLSearchParams(initialQuery || searchParams.toString());

  const sessionId = queryParams.get("session_id") || "";
  const amount = queryParams.get("amount") || "";
  const lang = queryParams.get("lang") || "pt-BR";
  const isEn = lang === "en" || lang === "en-US";

  const L = (pt: string, en: string) => (isEn ? en : pt);

  const [activeTab, setActiveTab] = useState<TabId>("receive");
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [data, setData] = useState<UsdAccountResponse | null>(null);

  const loadAccount = useCallback(async () => {
    if (!sessionId) {
      setStatus("no_session");
      return;
    }
    setStatus("loading");
    try {
      const url = `/api/bridge/session/usd-account?session_id=${encodeURIComponent(sessionId)}`;
      const res = await fetch(url, { cache: "no-store" });
      const json: UsdAccountResponse = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (res.status === 404 || json.has_account === false) {
          setData(json);
          setStatus("no_account");
          return;
        }
        throw new Error(json.message || `HTTP ${res.status}`);
      }
      setData(json);
      setStatus(json.has_account ? "ready" : "no_account");
    } catch {
      setStatus("error");
    }
  }, [sessionId]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  return (
    <OperationalPage size="sm">
      <OperationalHeader
        title={L("Receber em Dólar", "Receive in USD")}
        description={L(
          "Transfira dólares do seu banco americano via wire ou ACH",
          "Transfer dollars from your US bank via wire or ACH"
        )}
      />

      {/* Amount hint */}
      {amount && (
        <div className="rounded-lg bg-tts-gold/10 border border-tts-gold/30 px-4 py-3 text-sm text-tts-deep font-medium">
          {L(`Valor desejado: US$ ${amount}`, `Desired amount: US$ ${amount}`)}
        </div>
      )}

      {/* Tab bar */}
      <TabBar active={activeTab} onChange={setActiveTab} isEn={isEn} />

      {/* Tab panels */}
      {activeTab === "receive" && (
        <ReceiveTab
          status={status}
          data={data}
          sessionId={sessionId}
          onRetry={loadAccount}
          L={L}
        />
      )}
      {activeTab === "rates" && <RatesTab L={L} />}
      {activeTab === "status" && (
        <StatusTab
          status={status}
          data={data}
          sessionId={sessionId}
          onRetry={loadAccount}
          L={L}
        />
      )}
    </OperationalPage>
  );
}
