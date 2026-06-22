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
  Loader2,
  RefreshCw,
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

type UsdVirtualAccount = {
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
  virtual_accounts?: UsdVirtualAccount[];
  message?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────

function mask(value: string) {
  if (!value || value.length < 4) return value;
  return "•".repeat(Math.max(0, value.length - 4)) + value.slice(-4);
}

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

// ── Main Component ─────────────────────────────────────────────────────

export default function WireOnrampClient({
  initialQuery = "",
}: {
  initialQuery?: string;
}) {
  const searchParams = useSearchParams();
  const queryParams = new URLSearchParams(initialQuery || searchParams.toString());

  const sessionId = queryParams.get("session_id") || "";
  const amount = queryParams.get("amount") || "";
  const lang = queryParams.get("lang") || "pt-BR";
  const isEn = lang === "en";

  const L = (pt: string, en: string) => (isEn ? en : pt);

  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "no_account" | "error">("idle");
  const [data, setData] = useState<UsdAccountResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const load = useCallback(async () => {
    if (!sessionId) {
      setStatus("no_account");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const url = `/api/bridge/session/usd-account?session_id=${encodeURIComponent(sessionId)}`;
      const res = await fetch(url, { cache: "no-store" });
      const json: UsdAccountResponse = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        if (res.status === 404 || !json.has_account) {
          setStatus("no_account");
          setData(json);
          return;
        }
        throw new Error(json.message || `HTTP ${res.status}`);
      }
      setData(json);
      setStatus(json.has_account ? "ready" : "no_account");
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
      setStatus("error");
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  const usdAccounts = data?.virtual_accounts?.filter((va) =>
    ["active", "enabled", "pending"].includes(String(va.status || "").toLowerCase())
  ) ?? [];

  const activeAccount = usdAccounts[0];
  const instr = activeAccount?.deposit_instructions;

  return (
    <OperationalPage size="sm">
      <OperationalHeader
        title={L("Depositar em Dólar", "USD Deposit")}
        description={L(
          "Transfira dólares do seu banco americano via wire ou ACH",
          "Transfer dollars from your US bank via wire or ACH"
        )}
      />

      {/* Amount hint */}
      {amount && (
        <div className="mb-4 rounded-lg bg-tts-gold/10 border border-tts-gold/30 px-4 py-3 text-sm text-tts-deep">
          {L(
            `Valor desejado: US$ ${amount}`,
            `Desired amount: US$ ${amount}`
          )}
        </div>
      )}

      {/* Loading */}
      {status === "loading" && (
        <OperationalCard>
          <div className="flex items-center justify-center gap-2 py-8 text-tts-text/50">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{L("Carregando sua conta...", "Loading your account...")}</span>
          </div>
        </OperationalCard>
      )}

      {/* Error */}
      {status === "error" && (
        <OperationalCard>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-tts-error" />
            <p className="text-sm text-tts-text/60">{errorMsg}</p>
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {L("Tentar novamente", "Retry")}
            </Button>
          </div>
        </OperationalCard>
      )}

      {/* No USD account set up */}
      {status === "no_account" && (
        <OperationalCard>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <Banknote className="h-10 w-10 text-tts-gold/60" />
            <div>
              <p className="font-medium text-tts-deep">
                {L("Conta USD não configurada", "USD account not set up")}
              </p>
              <p className="mt-1 text-sm text-tts-text/60">
                {L(
                  "Para receber via wire/ACH, ative sua conta de banco americano.",
                  "To receive via wire/ACH, activate your US bank account."
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full">
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
              {!sessionId && (
                <p className="text-xs text-tts-text/40">
                  {L(
                    "Acesse pelo link enviado no WhatsApp para carregar seus dados.",
                    "Open the link sent in WhatsApp to load your data."
                  )}
                </p>
              )}
            </div>
          </div>
        </OperationalCard>
      )}

      {/* Ready — show deposit instructions */}
      {status === "ready" && activeAccount && (
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
                tone={activeAccount.status === "active" || activeAccount.status === "enabled" ? "confirm" : "gold"}
              >
                {activeAccount.status === "active" || activeAccount.status === "enabled"
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
                <DepositField label={L("Beneficiário", "Beneficiary")} value={instr.beneficiary_name} />
              )}
              {instr?.payment_rail && (
                <DepositField label="Rail" value={instr.payment_rail.toUpperCase()} />
              )}
              {instr?.reference && (
                <DepositField label="Referência" value={instr.reference} />
              )}
            </div>

            <p className="mt-4 text-xs text-tts-text/40 leading-relaxed">
              {L(
                "Envie a transferência do seu banco americano usando os dados acima. O saldo em dólar chega na sua conta TalkToStellar em 1–2 dias úteis.",
                "Send the transfer from your US bank using the details above. Your dollar balance arrives in your TalkToStellar account within 1–2 business days."
              )}
            </p>
          </OperationalCard>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <OperationalStat
              label={L("Moeda", "Currency")}
              value="USD"
            />
            <OperationalStat
              label={L("Prazo estimado", "Est. arrival")}
              value={L("1–2 dias úteis", "1–2 business days")}
            />
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {L("Atualizar", "Refresh")}
            </Button>
          </div>
        </>
      )}

      {/* KYC pending but account exists */}
      {status === "ready" && !activeAccount && data?.has_account && (
        <OperationalCard>
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-8 w-8 text-tts-gold animate-spin" />
            <p className="font-medium text-tts-deep">
              {L("Conta em processamento", "Account being processed")}
            </p>
            <p className="text-sm text-tts-text/60">
              {L(
                "Sua conta USD está sendo configurada. Aguarde alguns minutos e atualize a página.",
                "Your USD account is being set up. Wait a few minutes and refresh."
              )}
            </p>
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              {L("Atualizar", "Refresh")}
            </Button>
          </div>
        </OperationalCard>
      )}
    </OperationalPage>
  );
}
