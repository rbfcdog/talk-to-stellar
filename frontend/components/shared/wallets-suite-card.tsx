"use client";

import { Banknote, Layers, Wallet } from "lucide-react";

// The full account suite shown on the on-ramp and off-ramp screens: virtual
// accounts (USD deposit rails), custodial wallets (per chain), and the
// associated Stellar wallets — each with its USDC balance.

export type SuiteVA = {
  id: string;
  status?: string;
  currency?: string;
  total_received_usd?: number;
};

export type SuiteCustodial = {
  id: string;
  chain: string | null;
  balances?: Array<{ currency: string; amount: string }>;
};

export type SuiteStellar = {
  public_key: string;
  label?: string | null;
  is_primary?: boolean;
  usdc_balance?: string | null;
  last_balance?: Array<{ asset_code: string; balance: string }>;
};

const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (k: string) => (k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-6)}` : k);

export function WalletsSuiteCard({
  virtualAccounts = [],
  custodial = [],
  stellar = [],
  isEn = false,
  className = "",
}: {
  virtualAccounts?: SuiteVA[];
  custodial?: SuiteCustodial[];
  stellar?: SuiteStellar[];
  isEn?: boolean;
  className?: string;
}) {
  const L = (pt: string, en: string) => (isEn ? en : pt);

  const custodialRows = custodial.map((w) => ({
    id: w.id,
    chain: w.chain || "—",
    usdc: (w.balances ?? []).filter((b) => b.currency === "USDC").reduce((s, b) => s + (Number(b.amount) || 0), 0),
  }));
  const stellarRows = stellar.map((w) => ({
    key: w.public_key,
    label: w.label || "Stellar",
    primary: Boolean(w.is_primary),
    usdc:
      w.usdc_balance != null
        ? Number(w.usdc_balance) || 0
        : Number((w.last_balance || []).find((b) => b.asset_code === "USDC")?.balance ?? 0) || 0,
  }));
  const vaReceived = virtualAccounts.reduce((s, v) => s + (Number(v.total_received_usd) || 0), 0);

  if (!virtualAccounts.length && !custodialRows.length && !stellarRows.length) return null;

  return (
    <div className={`rounded-2xl border border-tts-border bg-tts-surface p-5 ${className}`}>
      <p className="mb-4 text-sm font-bold text-tts-deep">{L("Sua conta completa", "Your full account")}</p>

      {/* Virtual accounts */}
      {virtualAccounts.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            <Banknote className="h-3.5 w-3.5" /> {L("Contas de depósito (USD)", "Deposit accounts (USD)")}
          </p>
          <div className="flex items-center justify-between rounded-lg bg-tts-bg/70 px-3 py-2">
            <span className="text-sm font-semibold text-tts-deep">
              {virtualAccounts.length} {virtualAccounts.length === 1 ? L("conta", "account") : L("contas", "accounts")}
            </span>
            <span className="text-sm font-bold tabular-nums text-tts-deep">
              {f2(vaReceived)} <span className="font-medium text-tts-muted">{L("recebido", "received")}</span>
            </span>
          </div>
        </div>
      )}

      {/* Custodial wallets */}
      {custodialRows.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            <Layers className="h-3.5 w-3.5" /> {L("Carteiras custodiais", "Custodial wallets")}
          </p>
          <div className="space-y-2">
            {custodialRows.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-lg bg-tts-bg/70 px-3 py-2">
                <span className="text-sm font-semibold capitalize text-tts-deep">{w.chain}</span>
                <span className="text-sm font-bold tabular-nums text-tts-deep">{f2(w.usdc)} <span className="font-medium text-tts-muted">USDC</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stellar wallets */}
      {stellarRows.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            <Wallet className="h-3.5 w-3.5" /> {L("Carteiras Stellar", "Stellar wallets")}
          </p>
          <div className="space-y-2">
            {stellarRows.map((w) => (
              <div key={w.key} className="flex items-center justify-between rounded-lg bg-tts-bg/70 px-3 py-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs font-semibold text-tts-deep">{short(w.key)}</span>
                  {w.primary && <span className="ml-2 text-[10px] font-medium text-tts-confirm">{L("Principal", "Primary")}</span>}
                </div>
                <span className="text-sm font-bold tabular-nums text-tts-deep">{f2(w.usdc)} <span className="font-medium text-tts-muted">USDC</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
