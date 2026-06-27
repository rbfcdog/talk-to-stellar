"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Banknote,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Layers,
  Loader2,
  Send,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// The full account suite shown on the on-ramp and off-ramp screens. It renders
// every virtual account (USD deposit rail), every custodial wallet (per chain),
// and every associated Stellar wallet with full detail — and lets the user move
// USDC between any custodial/Stellar account through the unified
// `/api/bridge/internal-transfer` endpoint (custodial⇄custodial, custodial⇄stellar,
// stellar⇄stellar). Virtual accounts are fiat deposit rails, so they appear with
// full detail (status, destination, deposit instructions) but are not on-chain
// transfer endpoints.

export type SuiteVA = {
  id: string;
  status?: string;
  currency?: string;
  total_received_usd?: number;
  destination_chain?: string | null;
  destination_address?: string | null;
  bridge_wallet_id?: string | null;
  source_deposit_instructions?: Record<string, unknown> | null;
  deposit_instructions?: Record<string, unknown> | null;
};

export type SuiteCustodial = {
  id: string;
  chain: string | null;
  address?: string | null;
  balances?: Array<{ currency: string; amount: string }>;
};

export type SuiteStellar = {
  public_key: string;
  label?: string | null;
  is_primary?: boolean;
  usdc_balance?: string | null;
  last_balance?: Array<{ asset_code: string; balance: string }>;
};

type TransferAccount = {
  uid: string;
  // The real on-chain leg used by the backend transfer.
  kind: "custodial" | "stellar";
  // Where this account comes from, for the dropdown icon/label.
  origin: "custodial" | "stellar" | "va";
  label: string;
  sub: string;
  walletId?: string;
  address?: string;
  usdc: number;
};

const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (k?: string | null) => (k && k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-6)}` : k || "—");

function depositField(va: SuiteVA, ...keys: string[]): string | null {
  const sources = [va.source_deposit_instructions, va.deposit_instructions];
  for (const src of sources) {
    if (!src) continue;
    for (const k of keys) {
      const v = (src as Record<string, unknown>)[k];
      if (v != null && String(v).trim()) return String(v);
    }
  }
  return null;
}

function CopyChip({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        try { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); } catch { /* */ }
      }}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-tts-deep hover:text-tts-deep/70"
      title={value}
    >
      {short(value)}
      {done ? <Check className="h-3 w-3 text-tts-confirm" /> : <Copy className="h-3 w-3 opacity-50" />}
    </button>
  );
}

// One-at-a-time carousel with prev/next + "i / N", used for every account
// section so VAs, custodial wallets and Stellar wallets all page the same way.
function Paginated<T>({ items, isEn, render }: {
  items: T[];
  isEn: boolean;
  render: (item: T, index: number) => ReactNode;
}) {
  const L = (pt: string, en: string) => (isEn ? en : pt);
  const [i, setI] = useState(0);
  if (!items.length) return null;
  const idx = Math.min(i, items.length - 1);
  return (
    <div>
      {render(items[idx], idx)}
      {items.length > 1 && (
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setI(Math.max(0, idx - 1))}
            disabled={idx === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-tts-border px-2.5 py-1 text-[11px] font-bold text-tts-deep transition disabled:opacity-30 hover:bg-tts-bg"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> {L("Anterior", "Prev")}
          </button>
          <span className="text-[10px] font-bold tabular-nums text-tts-muted">{idx + 1} / {items.length}</span>
          <button
            type="button"
            onClick={() => setI(Math.min(items.length - 1, idx + 1))}
            disabled={idx === items.length - 1}
            className="inline-flex items-center gap-1 rounded-lg border border-tts-border px-2.5 py-1 text-[11px] font-bold text-tts-deep transition disabled:opacity-30 hover:bg-tts-bg"
          >
            {L("Próximo", "Next")} <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// A labeled field inside a detail card. `copy` renders the value as a CopyChip.
function Field({ label, value, copy = false, mono = false }: {
  label: string;
  value?: string | number | null;
  copy?: boolean;
  mono?: boolean;
}) {
  if (value == null || String(value).trim() === "") return null;
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-tts-muted">{label}</p>
      {copy ? (
        <div className="mt-0.5"><CopyChip value={String(value)} /></div>
      ) : (
        <p className={`mt-0.5 break-words text-xs font-semibold text-tts-deep ${mono ? "font-mono" : ""}`}>{String(value)}</p>
      )}
    </div>
  );
}

export function WalletsSuiteCard({
  virtualAccounts = [],
  custodial = [],
  stellar = [],
  isEn = false,
  className = "",
  customerId = "",
  email = "",
  onTransferDone,
}: {
  virtualAccounts?: SuiteVA[];
  custodial?: SuiteCustodial[];
  stellar?: SuiteStellar[];
  isEn?: boolean;
  className?: string;
  customerId?: string;
  email?: string;
  onTransferDone?: () => void;
}) {
  const L = (pt: string, en: string) => (isEn ? en : pt);

  const custodialUsdc = (w: SuiteCustodial) =>
    (w.balances ?? []).filter((b) => b.currency === "USDC").reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const stellarUsdc = (w: SuiteStellar) =>
    w.usdc_balance != null
      ? Number(w.usdc_balance) || 0
      : Number((w.last_balance || []).find((b) => b.asset_code === "USDC")?.balance ?? 0) || 0;

  const vaReceived = virtualAccounts.reduce((s, v) => s + (Number(v.total_received_usd) || 0), 0);

  // Flat list of accounts that can send/receive a USDC transfer. Virtual accounts
  // are inflow rails: their money lands in a linked wallet, so a VA resolves to
  // that wallet's on-chain leg (custodial via bridge_wallet_id, or Stellar via a
  // destination address) — that's how a VA can act as a money source here.
  const transferAccounts: TransferAccount[] = useMemo(() => {
    const list: TransferAccount[] = [];
    virtualAccounts.forEach((va) => {
      const stellarDest = String(va.destination_chain || "").toLowerCase() === "stellar" && va.destination_address;
      if (stellarDest) {
        list.push({
          uid: `va:${va.id}`, kind: "stellar", origin: "va",
          label: `${L("Depósito", "Deposit")} ${va.currency || "USD"}`,
          sub: short(va.destination_address), address: va.destination_address!,
          usdc: Number(va.total_received_usd) || 0,
        });
      } else if (va.bridge_wallet_id) {
        list.push({
          uid: `va:${va.id}`, kind: "custodial", origin: "va",
          label: `${L("Depósito", "Deposit")} ${va.currency || "USD"}`,
          sub: short(va.bridge_wallet_id), walletId: va.bridge_wallet_id!,
          usdc: Number(va.total_received_usd) || 0,
        });
      }
    });
    custodial.forEach((w) => {
      list.push({
        uid: `cw:${w.id}`,
        kind: "custodial", origin: "custodial",
        label: `${(w.chain || "custodial").toString()}`,
        sub: short(w.address || w.id),
        walletId: w.id,
        address: w.address || undefined,
        usdc: custodialUsdc(w),
      });
    });
    stellar.forEach((w) => {
      list.push({
        uid: `st:${w.public_key}`,
        kind: "stellar", origin: "stellar",
        label: w.label || "Stellar",
        sub: short(w.public_key),
        address: w.public_key,
        usdc: stellarUsdc(w),
      });
    });
    return list;
  }, [virtualAccounts, custodial, stellar, isEn]);

  const canTransfer = transferAccounts.length >= 1 && (Boolean(customerId) || stellar.length >= 1);

  // Transfer source/destination are lifted here so a card's "Transfer" button can
  // prefill them and scroll to the panel.
  const [fromUid, setFromUid] = useState("");
  const [toUid, setToUid] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const primaryStellarUid = useMemo(() => {
    const w = stellar.find((s) => s.is_primary) || stellar[0];
    return w ? `st:${w.public_key}` : "";
  }, [stellar]);

  // Prefill the transfer panel from a card and scroll up to it.
  function requestTransfer(from: string, to?: string) {
    if (!transferAccounts.some((a) => a.uid === from)) return; // not a usable source
    setFromUid(from);
    if (to && to !== from) setToUid(to);
    else if (toUid === from) setToUid("");
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function TransferButton({ uid, to, label }: { uid: string; to?: string; label: string }) {
    if (!canTransfer || !transferAccounts.some((a) => a.uid === uid)) return null;
    return (
      <button
        type="button"
        onClick={() => requestTransfer(uid, to)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-tts-deep px-3 py-2 text-xs font-bold text-tts-surface transition hover:opacity-90"
      >
        <Send className="h-3.5 w-3.5" /> {label}
      </button>
    );
  }

  if (!virtualAccounts.length && !custodial.length && !stellar.length) return null;

  return (
    <div className={`rounded-2xl border border-tts-border bg-tts-surface p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-bold text-tts-deep">{L("Sua conta completa", "Your full account")}</p>
        {canTransfer && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-tts-muted">
            {transferAccounts.length} {L("contas", "accounts")}
          </span>
        )}
      </div>

      {/* Move money panel */}
      {canTransfer && (
        <div ref={panelRef}>
          <TransferPanel
            isEn={isEn}
            accounts={transferAccounts}
            customerId={customerId}
            email={email}
            onDone={onTransferDone}
            fromUid={fromUid}
            setFromUid={setFromUid}
            toUid={toUid}
            setToUid={setToUid}
          />
        </div>
      )}

      {/* Virtual accounts — full detail card */}
      {virtualAccounts.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            <span className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5" /> {L("Contas de depósito (USD)", "Deposit accounts (USD)")}</span>
            <span className="tabular-nums text-tts-deep">{f2(vaReceived)} {L("recebido", "received")}</span>
          </p>
          <Paginated
            items={virtualAccounts}
            isEn={isEn}
            render={(va) => {
              const account = depositField(va, "iban", "account_number", "bank_account_number");
              const routing = depositField(va, "routing_number", "bic", "sort_code", "aba");
              const bank = depositField(va, "bank_name", "bank", "beneficiary_bank_name");
              const beneficiary = depositField(va, "beneficiary_name", "account_holder_name", "beneficiary", "bank_beneficiary_name");
              const beneficiaryAddress = depositField(va, "beneficiary_address", "account_holder_address", "bank_beneficiary_address");
              const bankAddress = depositField(va, "bank_address");
              const reference = depositField(va, "deposit_message", "reference", "payment_reference");
              const uid = `va:${va.id}`;
              return (
                <div className="rounded-2xl border border-tts-border bg-tts-bg/60 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tts-confirm/15 text-tts-confirm"><Banknote className="h-4 w-4" /></span>
                      <div>
                        <p className="text-base font-bold uppercase text-tts-deep">{va.currency || "USD"}</p>
                        <p className="text-[11px] font-semibold text-tts-muted">{L("Conta de depósito", "Deposit account")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black tabular-nums text-tts-deep">{f2(Number(va.total_received_usd) || 0)}</p>
                      <p className="text-[10px] font-bold uppercase text-tts-muted">{L("recebido", "received")}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label={L("Status", "Status")} value={va.status} />
                    <Field label="ID" value={va.id} copy />
                    <Field label={L("Banco", "Bank")} value={bank} />
                    <Field label={L("Beneficiário", "Beneficiary")} value={beneficiary} />
                    <Field label={L("Conta", "Account number")} value={account} copy />
                    <Field label={L("Routing", "Routing")} value={routing} copy />
                    <Field label={L("Rede destino", "Destination network")} value={va.destination_chain} />
                    <Field label={L("Endereço destino", "Destination address")} value={va.destination_address} copy />
                    <Field label={L("Endereço do banco", "Bank address")} value={bankAddress} />
                    <Field label={L("Beneficiário (endereço)", "Beneficiary address")} value={beneficiaryAddress} />
                    <Field label={L("Referência", "Reference")} value={reference} />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <TransferButton uid={uid} to={primaryStellarUid} label={L("Enviar para carteira Stellar", "Send to Stellar wallet")} />
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {/* Custodial wallets — full detail card */}
      {custodial.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            <Layers className="h-3.5 w-3.5" /> {L("Carteiras custodiais", "Custodial wallets")}
          </p>
          <Paginated
            items={custodial}
            isEn={isEn}
            render={(w) => {
              const uid = `cw:${w.id}`;
              return (
                <div className="rounded-2xl border border-tts-border bg-tts-bg/60 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tts-deep/10 text-tts-deep"><Layers className="h-4 w-4" /></span>
                      <div>
                        <p className="text-base font-bold capitalize text-tts-deep">{w.chain || "—"}</p>
                        <p className="text-[11px] font-semibold text-tts-muted">{L("Carteira custodial", "Custodial wallet")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black tabular-nums text-tts-deep">{f2(custodialUsdc(w))}</p>
                      <p className="text-[10px] font-bold uppercase text-tts-muted">USDC</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="ID" value={w.id} copy />
                    <Field label={L("Endereço", "Address")} value={w.address} copy />
                    {(w.balances ?? []).map((b, i) => (
                      <Field key={`${b.currency}-${i}`} label={b.currency} value={`${f2(Number(b.amount) || 0)} ${b.currency}`} />
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <TransferButton uid={uid} to={primaryStellarUid} label={L("Transferir", "Transfer")} />
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}

      {/* Stellar wallets — full detail card */}
      {stellar.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-tts-muted">
            <Wallet className="h-3.5 w-3.5" /> {L("Carteiras Stellar", "Stellar wallets")}
          </p>
          <Paginated
            items={stellar}
            isEn={isEn}
            render={(w) => {
              const uid = `st:${w.public_key}`;
              return (
                <div className="rounded-2xl border border-tts-border bg-tts-bg/60 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tts-gold/15 text-tts-gold"><Wallet className="h-4 w-4" /></span>
                      <div>
                        <p className="flex items-center gap-2 text-base font-bold text-tts-deep">
                          {w.label || "Stellar"}
                          {w.is_primary && <span className="rounded-full bg-tts-confirm/15 px-2 py-0.5 text-[9px] font-bold uppercase text-tts-confirm">{L("Principal", "Primary")}</span>}
                        </p>
                        <p className="text-[11px] font-semibold text-tts-muted">{L("Carteira Stellar", "Stellar wallet")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black tabular-nums text-tts-deep">{f2(stellarUsdc(w))}</p>
                      <p className="text-[10px] font-bold uppercase text-tts-muted">USDC</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    <Field label={L("Chave pública", "Public key")} value={w.public_key} copy />
                    {(w.last_balance || []).map((b, i) => (
                      <Field key={`${b.asset_code}-${i}`} label={b.asset_code} value={`${f2(Number(b.balance) || 0)} ${b.asset_code}`} />
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <TransferButton uid={uid} label={L("Transferir", "Transfer")} />
                  </div>
                </div>
              );
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Move-money panel ─────────────────────────────────────────────────────────

function TransferPanel({
  isEn,
  accounts,
  customerId,
  email,
  onDone,
  fromUid,
  setFromUid,
  toUid,
  setToUid,
}: {
  isEn: boolean;
  accounts: TransferAccount[];
  customerId: string;
  email: string;
  onDone?: () => void;
  fromUid: string;
  setFromUid: (v: string) => void;
  toUid: string;
  setToUid: (v: string) => void;
}) {
  const L = (pt: string, en: string) => (isEn ? en : pt);
  const [useCustom, setUseCustom] = useState(false);
  const [customAddr, setCustomAddr] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState<{ kind?: string; ref?: string } | null>(null);

  const from = accounts.find((a) => a.uid === fromUid) || null;
  // A custodial source needs the Bridge customer; a Stellar source needs only its key.
  const eligibleDest = accounts.filter((a) => a.uid !== fromUid);

  const customValid = /^G[A-Z2-7]{55}$/.test(customAddr.trim());
  const to = useCustom
    ? (customValid ? ({ uid: "custom", kind: "stellar", label: "Stellar", sub: short(customAddr), address: customAddr.trim(), usdc: 0 } as TransferAccount) : null)
    : accounts.find((a) => a.uid === toUid) || null;

  // custodial legs require the customer id; stellar→stellar does not.
  const needsCustomer = from?.kind === "custodial" || to?.kind === "custodial";
  const amountNum = Math.max(0, Number(amount) || 0);
  const overBalance = from ? amountNum > from.usdc + 1e-7 : false;
  const canSubmit = Boolean(
    from && to && amountNum > 0 && !overBalance && !busy && (!needsCustomer || customerId),
  );

  async function submit() {
    if (!canSubmit || !from || !to) return;
    setBusy(true); setErr(""); setOk(null);
    try {
      const res = await fetch(`/api/bridge/internal-transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          customer_id: customerId,
          amount: String(amountNum),
          source: from.kind === "custodial" ? { kind: "custodial", wallet_id: from.walletId } : { kind: "stellar", address: from.address },
          destination: to.kind === "custodial" ? { kind: "custodial", wallet_id: to.walletId } : { kind: "stellar", address: to.address },
          confirm_mainnet: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) throw new Error(json.message || `HTTP ${res.status}`);
      const ref = json?.transfer?.id || json?.deposit?.hash || json?.transfer?.hash;
      setOk({ kind: json.kind, ref });
      setAmount("");
      onDone?.();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const selectCls = "w-full rounded-xl border-2 border-tts-border bg-tts-surface px-3 py-2.5 text-sm font-semibold text-tts-deep focus:border-tts-deep focus:outline-none";

  return (
    <div className="mb-4 rounded-xl border border-tts-border bg-tts-bg/60 p-3">
      <div className="flex w-full items-center gap-1.5 text-sm font-bold text-tts-deep">
        <ArrowLeftRight className="h-4 w-4" /> {L("Mover dinheiro entre contas", "Move money between accounts")}
      </div>

      <div className="mt-3 space-y-3">
          {/* From */}
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-tts-muted">{L("De", "From")}</p>
            <select className={selectCls} value={fromUid} onChange={(e) => { setFromUid(e.target.value); if (e.target.value === toUid) setToUid(""); }}>
              <option value="">{L("Selecione a origem", "Select source")}</option>
              {accounts.map((a) => (
                <option key={a.uid} value={a.uid}>
                  {a.origin === "va" ? "💵" : a.kind === "custodial" ? "🏦" : "✦"} {a.label} · {a.sub} · {f2(a.usdc)} USDC
                </option>
              ))}
            </select>
          </div>

          {/* To */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted">{L("Para", "To")}</p>
              <button type="button" onClick={() => setUseCustom((v) => !v)} className="text-[11px] font-bold text-tts-deep hover:underline">
                {useCustom ? L("Escolher conta", "Pick account") : L("Outro endereço Stellar", "Other Stellar address")}
              </button>
            </div>
            {useCustom ? (
              <Input value={customAddr} onChange={(e) => setCustomAddr(e.target.value)} placeholder="G…" className="font-mono text-xs" />
            ) : (
              <select className={selectCls} value={toUid} onChange={(e) => setToUid(e.target.value)} disabled={!fromUid}>
                <option value="">{L("Selecione o destino", "Select destination")}</option>
                {eligibleDest.map((a) => (
                  <option key={a.uid} value={a.uid}>
                    {a.origin === "va" ? "💵" : a.kind === "custodial" ? "🏦" : "✦"} {a.label} · {a.sub} · {f2(a.usdc)} USDC
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Amount */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-tts-muted">{L("Valor (USDC)", "Amount (USDC)")}</p>
              {from && (
                <button type="button" onClick={() => setAmount(String(Math.floor(from.usdc * 100) / 100))} className="text-[11px] font-bold text-tts-deep hover:underline">
                  {L("Tudo", "Max")} ({f2(from.usdc)})
                </button>
              )}
            </div>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="font-bold" />
            {overBalance && <p className="mt-1 text-[11px] font-semibold text-tts-error">{L("Acima do saldo", "Over balance")}</p>}
            {needsCustomer && !customerId && (
              <p className="mt-1 text-[11px] font-semibold text-tts-error">{L("Transferências com carteira custodial exigem conta Bridge.", "Custodial-wallet transfers need a Bridge account.")}</p>
            )}
          </div>

          {err && <p className="text-[11px] font-semibold text-tts-error">{err}</p>}
          {ok && (
            <div className="rounded-lg border border-tts-border bg-tts-surface px-3 py-2">
              <p className="text-[11px] font-bold text-tts-confirm">{L("Transferência enviada!", "Transfer sent!")}</p>
              {ok.ref && <p className="break-all font-mono text-[11px] text-tts-muted">{ok.ref}</p>}
            </div>
          )}

          <Button onClick={submit} disabled={!canSubmit} className="w-full" size="sm">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeftRight className="mr-2 h-4 w-4" />}
            {busy ? L("Enviando…", "Sending…") : L("Transferir", "Transfer")}
          </Button>
          {from && to && (
            <p className="text-center text-[10px] text-tts-muted">
              {from.kind === "stellar" && to.kind === "stellar"
                ? L("Pagamento USDC on-chain na Stellar.", "On-chain USDC payment on Stellar.")
                : L("Liquidado pela Bridge entre as carteiras.", "Settled by Bridge across the wallets.")}
            </p>
          )}
      </div>
    </div>
  );
}
