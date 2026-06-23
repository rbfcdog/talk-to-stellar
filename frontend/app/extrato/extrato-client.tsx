"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Wallet,
} from "lucide-react";

const BRIDGE_BASE = "/api/bridge";
const HORIZON = "https://horizon.stellar.org";

// ── Types ─────────────────────────────────────────────────────────────────────

type VA = {
  id?: string;
  status?: string;
  source_currency?: string;
  destination_chain?: string;
  destination_address?: string;
  source_deposit_instructions?: Record<string, string | unknown>;
};

type VABal = { amount: string; currency: string; source?: string; label?: string };

type StellarWallet = {
  id: number;
  public_key: string;
  label?: string;
  is_funded: boolean;
  has_usdc_trustline: boolean;
};

type StellarBal = {
  asset_type: string;
  asset_code?: string;
  balance: string;
  asset_issuer?: string;
};

type AccountData = {
  email: string;
  customerId: string;
  firstName?: string;
  lastName?: string;
  vas: VA[];
  vaBalances: Record<string, VABal[]>;
  stellarWallets: StellarWallet[];
  stellarBalances: Record<string, StellarBal[]>;
};

// ── API helpers ───────────────────────────────────────────────────────────────

async function bridgeFetch(path: string) {
  const r = await fetch(BRIDGE_BASE, {
    headers: { "Content-Type": "application/json", "x-bridge-path": path },
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message || `${path} → ${r.status}`);
  return data;
}

async function loadAccount(email: string): Promise<AccountData> {
  const customerRes = await bridgeFetch(`/customers/by-email?email=${encodeURIComponent(email)}`);
  const customer = customerRes.customer;
  if (!customer?.id) throw new Error("Nenhuma conta encontrada para este e-mail.");

  const id = customer.id as string;

  // Virtual accounts
  let vas: VA[] = [];
  try {
    const vaRes = await bridgeFetch(`/customers/${encodeURIComponent(id)}/virtual-accounts/cached`);
    vas = vaRes.virtual_accounts || [];
  } catch {}

  // VA balances
  const vaBalances: Record<string, VABal[]> = {};
  await Promise.allSettled(
    vas
      .filter((va) => va.id)
      .map(async (va) => {
        try {
          const b = await bridgeFetch(
            `/customers/${encodeURIComponent(id)}/virtual-accounts/${encodeURIComponent(va.id!)}/balance`,
          );
          vaBalances[va.id!] = b.balances || [];
        } catch {}
      }),
  );

  // Stellar wallets
  let stellarWallets: StellarWallet[] = [];
  try {
    const wr = await fetch(`/api/stellar-wallets?user_id=${encodeURIComponent(email)}`);
    const wd = await wr.json();
    stellarWallets = wd.wallets || [];
  } catch {}

  // Stellar balances from Horizon
  const stellarBalances: Record<string, StellarBal[]> = {};
  await Promise.allSettled(
    stellarWallets.map(async (w) => {
      try {
        const r = await fetch(`${HORIZON}/accounts/${encodeURIComponent(w.public_key)}`);
        if (r.ok) {
          const d = await r.json();
          stellarBalances[w.public_key] = d.balances || [];
        }
      } catch {}
    }),
  );

  return {
    email,
    customerId: id,
    firstName: customer.first_name,
    lastName: customer.last_name,
    vas,
    vaBalances,
    stellarWallets,
    stellarBalances,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUsd(v: string | number | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "0.00";
}

function fmtXlm(v: string | number | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(4) : "0.0000";
}

function shortKey(k: string) {
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

function vaInstructions(va: VA) {
  const i = va.source_deposit_instructions as Record<string, string> | undefined;
  if (!i) return [];
  const fields: [string, string][] = [];
  if (i.bank_name) fields.push(["Banco", String(i.bank_name)]);
  if (i.bank_routing_number) fields.push(["Routing number", String(i.bank_routing_number)]);
  if (i.bank_account_number) fields.push(["Account number", String(i.bank_account_number)]);
  if (i.bank_beneficiary_name) fields.push(["Beneficiário", String(i.bank_beneficiary_name)]);
  if (i.bank_address) fields.push(["Endereço do banco", String(i.bank_address)]);
  if (i.iban) fields.push(["IBAN", String(i.iban)]);
  if (i.bic) fields.push(["BIC / SWIFT", String(i.bic)]);
  if (i.deposit_message || i.wire_reference)
    fields.push(["Referência", String(i.deposit_message || i.wire_reference)]);
  return fields;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExtratoClient() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AccountData | null>(null);
  const [copied, setCopied] = useState("");
  const didAuto = useRef(false);

  useEffect(() => {
    const prefill = params.get("email");
    if (prefill && !didAuto.current) {
      didAuto.current = true;
      setEmail(prefill);
      run(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copy(v: string) {
    navigator.clipboard.writeText(v).catch(() => {});
    setCopied(v);
    setTimeout(() => setCopied(""), 2000);
  }

  async function run(emailOverride?: string) {
    const e = (emailOverride ?? email).trim().toLowerCase();
    if (!e) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      setData(await loadAccount(e));
    } catch (err: any) {
      setError(err.message || "Erro ao carregar informações.");
    } finally {
      setLoading(false);
    }
  }

  // ── Total USD balance across all VAs
  const totalUsd = data
    ? Object.values(data.vaBalances)
        .flat()
        .filter((b) => b.source !== "activity")
        .reduce((sum, b) => sum + Number(b.amount || 0), 0)
    : 0;

  // ── Total USDC across Stellar wallets
  const totalUsdc = data
    ? Object.values(data.stellarBalances)
        .flat()
        .filter((b) => b.asset_code === "USDC")
        .reduce((sum, b) => sum + Number(b.balance || 0), 0)
    : 0;

  const name = data?.firstName
    ? `${data.firstName}${data.lastName ? " " + data.lastName : ""}`
    : null;

  return (
    <div className="min-h-screen bg-tts-bg px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-tts-muted mb-1">TalkToStellar</p>
          <h1 className="text-2xl font-bold">Extrato de Conta</h1>
          <p className="mt-1 text-sm text-tts-muted">Saldo e informações da conta financeira</p>
        </div>

        {/* Email input */}
        <div className="border border-tts-border bg-tts-surface p-5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-tts-muted mb-2">
            E-mail da conta
          </label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="usuario@email.com"
              className="flex-1 border border-tts-border bg-tts-bg px-3 py-2.5 text-sm outline-none focus:border-tts-deep placeholder:text-tts-muted/40"
            />
            <button
              onClick={() => run()}
              disabled={loading || !email.trim()}
              className="flex items-center gap-2 bg-tts-deep px-4 py-2.5 text-sm font-bold text-tts-surface disabled:opacity-40 transition hover:opacity-90"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Buscando…" : "Buscar"}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm text-red-400 font-medium">{error}</p>
          )}
        </div>

        {/* Loaded content */}
        {data && (
          <>
            {/* Summary bar */}
            <div className="border border-tts-border bg-tts-surface p-5">
              <div className="flex items-start justify-between">
                <div>
                  {name && (
                    <p className="text-xs font-bold uppercase tracking-wider text-tts-muted mb-0.5">
                      {name}
                    </p>
                  )}
                  <p className="text-xs text-tts-muted font-mono">{data.email}</p>
                </div>
                <button
                  onClick={() => run()}
                  disabled={loading}
                  className="flex items-center gap-1.5 border border-tts-border px-3 py-1.5 text-xs font-bold disabled:opacity-40 hover:bg-tts-bg transition"
                >
                  <RefreshCw className="h-3 w-3" />
                  Atualizar
                </button>
              </div>

              {/* Quick totals */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded border border-tts-border bg-tts-bg p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted mb-1.5">
                    Conta USD
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    <span className="text-sm text-tts-muted mr-1">US$</span>
                    {fmtUsd(totalUsd)}
                  </p>
                </div>
                <div className="rounded border border-tts-border bg-tts-bg p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted mb-1.5">
                    Carteira Stellar
                  </p>
                  <p className="text-2xl font-bold tabular-nums">
                    <span className="text-sm text-tts-muted mr-1">US$</span>
                    {fmtUsd(totalUsdc)}
                  </p>
                  <p className="text-[10px] text-tts-muted mt-0.5">USDC on-chain</p>
                </div>
              </div>
            </div>

            {/* Virtual accounts */}
            {data.vas.length > 0 && (
              <div className="border border-tts-border bg-tts-surface">
                <div className="border-b border-tts-border px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ArrowDownLeft className="h-4 w-4 text-tts-muted" />
                    <p className="text-sm font-bold">Conta USD — Recebimento</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-tts-muted">
                    {data.vas.length} {data.vas.length === 1 ? "conta" : "contas"}
                  </span>
                </div>

                <div className="divide-y divide-tts-border">
                  {data.vas.map((va) => {
                    const bals = va.id ? (data.vaBalances[va.id] || []) : [];
                    const liveBals = bals.filter((b) => b.source !== "activity");
                    const actBals = bals.filter((b) => b.source === "activity");
                    const instrFields = vaInstructions(va);
                    const isActive = va.status === "active" || va.status === "activated";

                    return (
                      <div key={va.id} className="p-5 space-y-4">
                        {/* VA header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isActive
                              ? <CheckCircle2 className="h-4 w-4 text-tts-confirm" />
                              : <Clock className="h-4 w-4 text-tts-gold" />
                            }
                            <span className="text-sm font-bold">
                              {(va.source_currency || "USD").toUpperCase()} Virtual Account
                            </span>
                          </div>
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${
                            isActive
                              ? "border-tts-confirm/30 bg-tts-confirm/10 text-tts-confirm"
                              : "border-tts-gold/30 bg-tts-gold/10 text-tts-gold"
                          }`}>
                            {va.status || "unknown"}
                          </span>
                        </div>

                        {/* Balance */}
                        {liveBals.length > 0 && (
                          <div className="rounded border border-tts-border bg-tts-bg p-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted mb-2">
                              Saldo disponível
                            </p>
                            {liveBals.map((b, i) => (
                              <div key={i} className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold tabular-nums">
                                  {fmtUsd(b.amount)}
                                </span>
                                <span className="text-sm font-bold text-tts-muted uppercase">
                                  {b.currency}
                                </span>
                                {b.label && (
                                  <span className="text-xs text-tts-muted">({b.label})</span>
                                )}
                              </div>
                            ))}
                            {actBals.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-tts-border space-y-1">
                                <p className="text-[10px] uppercase font-bold text-tts-muted">Recebidos (atividade)</p>
                                {actBals.map((b, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <span className="font-bold">{fmtUsd(b.amount)}</span>
                                    <span className="text-tts-muted uppercase">{b.currency}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Deposit instructions */}
                        {instrFields.length > 0 && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-tts-muted mb-2">
                              Dados para recebimento (Wire)
                            </p>
                            <div className="space-y-1.5">
                              {instrFields.map(([label, value]) => (
                                <div
                                  key={label}
                                  className="flex items-center justify-between gap-3 rounded border border-tts-border bg-tts-bg px-3 py-2"
                                >
                                  <span className="text-xs text-tts-muted shrink-0 w-32">{label}</span>
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-mono text-xs font-semibold truncate">{value}</span>
                                    <button
                                      onClick={() => copy(value)}
                                      className="shrink-0 text-tts-muted hover:text-tts-confirm transition"
                                      title="Copiar"
                                    >
                                      {copied === value
                                        ? <CheckCircle2 className="h-3.5 w-3.5 text-tts-confirm" />
                                        : <Copy className="h-3.5 w-3.5" />
                                      }
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stellar wallets */}
            {data.stellarWallets.length > 0 && (
              <div className="border border-tts-border bg-tts-surface">
                <div className="border-b border-tts-border px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-tts-muted" />
                    <p className="text-sm font-bold">Carteira Stellar</p>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-tts-muted">
                    {data.stellarWallets.length} {data.stellarWallets.length === 1 ? "carteira" : "carteiras"}
                  </span>
                </div>

                <div className="divide-y divide-tts-border">
                  {data.stellarWallets.map((w) => {
                    const bals = data.stellarBalances[w.public_key] || [];
                    const xlm = bals.find((b) => b.asset_type === "native");
                    const usdc = bals.find((b) => b.asset_code === "USDC");
                    const otherTokens = bals.filter(
                      (b) => b.asset_type !== "native" && b.asset_code !== "USDC" && Number(b.balance) > 0,
                    );

                    return (
                      <div key={w.public_key} className="p-5 space-y-4">
                        {/* Wallet header */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {w.label && (
                              <p className="text-xs font-bold text-tts-muted mb-0.5">{w.label}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold break-all">
                                {shortKey(w.public_key)}
                              </span>
                              <button
                                onClick={() => copy(w.public_key)}
                                className="shrink-0 text-tts-muted hover:text-tts-confirm transition"
                                title="Copiar endereço"
                              >
                                {copied === w.public_key
                                  ? <CheckCircle2 className="h-3.5 w-3.5 text-tts-confirm" />
                                  : <Copy className="h-3.5 w-3.5" />
                                }
                              </button>
                            </div>
                          </div>
                          {w.is_funded && (
                            <span className="shrink-0 text-[10px] font-bold uppercase border border-tts-confirm/30 bg-tts-confirm/10 text-tts-confirm px-2 py-0.5 rounded">
                              Ativa
                            </span>
                          )}
                        </div>

                        {/* Balances */}
                        <div className="grid grid-cols-2 gap-2">
                          {/* XLM */}
                          <div className="rounded border border-tts-border bg-tts-bg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted mb-1">XLM</p>
                            <p className="text-xl font-bold tabular-nums">{fmtXlm(xlm?.balance)}</p>
                          </div>

                          {/* USDC */}
                          <div className="rounded border border-tts-border bg-tts-bg p-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted mb-1">USDC</p>
                            <p className="text-xl font-bold tabular-nums">
                              {usdc ? fmtUsd(usdc.balance) : <span className="text-tts-muted text-sm">sem trustline</span>}
                            </p>
                          </div>
                        </div>

                        {/* Other tokens */}
                        {otherTokens.length > 0 && (
                          <div className="space-y-1.5">
                            {otherTokens.map((b) => (
                              <div
                                key={b.asset_code || b.asset_type}
                                className="flex items-center justify-between px-3 py-2 rounded border border-tts-border bg-tts-bg text-xs"
                              >
                                <span className="font-bold text-tts-muted">{b.asset_code || b.asset_type}</span>
                                <span className="font-mono font-bold">{fmtXlm(b.balance)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Not yet on-chain */}
                        {bals.length === 0 && !w.is_funded && (
                          <p className="text-xs text-tts-muted">
                            Carteira ainda não financiada na rede Stellar.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {data.vas.length === 0 && data.stellarWallets.length === 0 && (
              <div className="border border-tts-border bg-tts-surface p-8 text-center space-y-2">
                <ShieldCheck className="h-8 w-8 text-tts-muted mx-auto" />
                <p className="text-sm font-bold">Conta encontrada</p>
                <p className="text-xs text-tts-muted">
                  Nenhuma carteira ou conta virtual cadastrada ainda.
                </p>
              </div>
            )}

            {/* Footer */}
            <p className="text-center text-xs text-tts-muted pb-4">
              TalkToStellar · {data.email}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
