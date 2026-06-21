"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Key,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import {
  OperationalCard,
  OperationalHeader,
  OperationalPage,
  OperationalStat,
  StatusPill,
} from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

type CardStatus = "idle" | "loading" | "ok" | "degraded" | "needs_key" | "frontend_sdk" | "self_hosted";

interface IntegDef {
  id: string;
  name: string;
  category: string;
  docs: string;
  description: string;
  probe: () => Promise<{ label: string; value: string }[]>;
  staticStatus?: Exclude<CardStatus, "idle" | "loading" | "ok" | "degraded">;
  staticNote?: string;
}

interface CardState {
  status: CardStatus;
  latency?: number;
  rows?: { label: string; value: string }[];
  error?: string;
}

// ── Integration definitions ───────────────────────────────────────────────────

async function get(path: string): Promise<any> {
  const t0 = Date.now();
  const r = await fetch(path, { headers: { "Content-Type": "application/json" } });
  const body = await r.json().catch(() => ({}));
  return { data: body, ok: r.ok, status: r.status, ms: Date.now() - t0 };
}

const INTEGRATIONS: IntegDef[] = [
  // ── On/Off-Ramp
  {
    id: "abroad_finance",
    name: "Abroad Finance",
    category: "on_off_ramp",
    docs: "https://abroad.finance",
    description: "BRL ↔ USDC corridors for Brazil via PIX",
    probe: async () => {
      const r = await get("/api/abroad/corridors");
      const list = Array.isArray(r.data) ? r.data : r.data?.corridors ?? [];
      return [
        { label: "corridors", value: String(list.length) },
        ...(list[0] ? [{ label: "first", value: `${list[0].from ?? list[0].source ?? list[0].id ?? JSON.stringify(list[0]).slice(0, 40)}` }] : []),
      ];
    },
  },
  {
    id: "sep24",
    name: "SEP-24 Anchors",
    category: "on_off_ramp",
    docs: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md",
    description: "Hosted deposit/withdrawal with SDF-compliant anchors",
    probe: async () => {
      const r = await get("/api/sep24/anchors");
      const list = Array.isArray(r.data) ? r.data : r.data?.anchors ?? [];
      return [
        { label: "anchors", value: String(list.length) },
        ...(list[0] ? [{ label: "first", value: list[0].domain ?? list[0].name ?? JSON.stringify(list[0]).slice(0, 40) }] : []),
      ];
    },
  },
  {
    id: "stellar_broker",
    name: "Stellar Broker",
    category: "on_off_ramp",
    docs: "https://stellar.broker",
    description: "DEX aggregator quotes for XLM/USDC swaps",
    probe: async () => {
      const r = await get("/api/broker/quote?from=XLM&to=USDC&amount=100");
      const d = r.data;
      return [
        { label: "sell 100 XLM", value: d.buyAmount ?? d.toAmount ?? d.amount ?? "—" },
        { label: "price", value: d.price ?? d.rate ?? "—" },
        { label: "provider", value: d.provider ?? d.source ?? "broker" },
      ];
    },
  },
  // ── DeFi
  {
    id: "blend_v2",
    name: "Blend v2",
    category: "defi",
    docs: "https://blend.capital",
    description: "Permissionless lending pools on Soroban",
    probe: async () => {
      const r = await get("/api/blend/pools");
      const list = Array.isArray(r.data) ? r.data : r.data?.pools ?? [];
      return [
        { label: "pools", value: String(list.length) },
        ...(list.map((p: any) => ({ label: p.id ?? "pool", value: p.assets?.join(", ") ?? p.contract?.slice(0, 12) + "…" })).slice(0, 2)),
      ];
    },
  },
  {
    id: "defindex",
    name: "DeFindex",
    category: "defi",
    docs: "https://docs.defindex.io",
    description: "Tokenized yield vaults aggregating Blend and AMMs",
    probe: async () => {
      const r = await get("/api/defindex/vaults");
      const list = Array.isArray(r.data) ? r.data : r.data?.vaults ?? [];
      return [
        { label: "vaults", value: String(list.length) },
        ...(list[0] ? [{ label: "first", value: list[0].name ?? list[0].id ?? JSON.stringify(list[0]).slice(0, 40) }] : []),
      ];
    },
  },
  {
    id: "aquarius",
    name: "Aquarius / AQUA",
    category: "defi",
    docs: "https://aqua.network",
    description: "AMM + governance rewards for liquidity providers",
    probe: async () => {
      const r = await get("/api/aquarius/rewards?limit=5");
      const list = Array.isArray(r.data) ? r.data : r.data?.rewards ?? r.data?.results ?? [];
      return [
        { label: "reward pairs", value: String(list.length) },
        ...(list[0] ? [{ label: "top pair", value: `${list[0].asset1_code ?? ""}/${list[0].asset2_code ?? list[0].pair ?? ""}` }] : []),
      ];
    },
  },
  {
    id: "soroswap",
    name: "Soroswap",
    category: "defi",
    docs: "https://soroswap.finance",
    description: "AMM + DEX aggregator on Soroban",
    probe: async () => {
      const r = await get("/api/swap/tokens");
      const list = Array.isArray(r.data) ? r.data : r.data?.tokens ?? [];
      return [
        { label: "tokens", value: String(list.length) },
        { label: "includes", value: list.slice(0, 3).map((t: any) => t.code ?? t.symbol ?? t).join(", ") },
      ];
    },
  },
  // ── Cross-Chain
  {
    id: "allbridge",
    name: "Allbridge",
    category: "cross_chain",
    docs: "https://allbridge.io",
    description: "Liquidity-pool bridge to EVM/Solana chains",
    probe: async () => {
      const r = await get("/api/allbridge/stellar-tokens");
      const list = Array.isArray(r.data) ? r.data : r.data?.tokens ?? [];
      return [
        { label: "stellar tokens", value: String(list.length) },
        ...(list[0] ? [{ label: "first", value: list[0].symbol ?? list[0].name ?? JSON.stringify(list[0]).slice(0, 30) }] : []),
        { label: "note", value: r.data?.note ?? "IP-restricted — static fallback" },
      ];
    },
  },
  {
    id: "axelar",
    name: "Axelar",
    category: "cross_chain",
    docs: "https://axelar.network",
    description: "Cross-chain messaging and GMP to 60+ chains",
    probe: async () => {
      const r = await get("/api/axelar/chains");
      const list = Array.isArray(r.data) ? r.data : r.data?.chains ?? [];
      return [
        { label: "chains", value: String(list.length) },
        { label: "sample", value: list.slice(0, 4).map((c: any) => c.name ?? c.id ?? c).join(", ") },
      ];
    },
  },
  {
    id: "cctp",
    name: "Circle CCTP",
    category: "cross_chain",
    docs: "https://www.circle.com/cross-chain-transfer-protocol",
    description: "Native USDC burn-and-mint across EVM chains",
    probe: async () => {
      const r = await get("/api/cctp/chains");
      const list = Array.isArray(r.data) ? r.data : r.data?.chains ?? [];
      return [
        { label: "chains", value: String(list.length) },
        { label: "includes", value: list.slice(0, 4).map((c: any) => c.name ?? c.id ?? c).join(", ") },
      ];
    },
  },
  {
    id: "near_intents",
    name: "Near Intents 1Click",
    category: "cross_chain",
    docs: "https://1click.chaindefuser.com",
    description: "Intent-based cross-chain swaps via NEAR ecosystem",
    probe: async () => {
      const r = await get("/api/near-intents/tokens");
      const list = Array.isArray(r.data) ? r.data : r.data?.tokens ?? [];
      return [
        { label: "tokens", value: String(list.length) },
        { label: "sample", value: list.slice(0, 3).map((t: any) => t.symbol ?? t.defuse_asset_id ?? t).join(", ") },
      ];
    },
  },
  // ── Wallet
  {
    id: "stellar_wallets_kit",
    name: "Stellar Wallets Kit",
    category: "wallet",
    docs: "https://github.com/Creit-Tech/Stellar-Wallets-Kit",
    description: "Multi-wallet SDK: Freighter, LOBSTR, xBull, Ledger, WalletConnect",
    staticStatus: "frontend_sdk",
    staticNote: "Client-only SDK — no backend probe. Install: npm i @creit-tech/stellar-wallets-kit",
    probe: async () => [],
  },
  {
    id: "passkey_wallets",
    name: "Passkey Smart Wallets",
    category: "wallet",
    docs: "https://github.com/kalepail/passkey-kit",
    description: "WebAuthn passkey wallets via OpenZeppelin Soroban contracts",
    probe: async () => {
      const r = await get("/api/passkey-wallets/");
      const list = Array.isArray(r.data) ? r.data : r.data?.wallets ?? [];
      return [
        { label: "registered wallets", value: String(list.length) },
        { label: "endpoint", value: "/api/passkey-wallets/" },
      ];
    },
  },
  {
    id: "wallet_auth",
    name: "SEP-10 Wallet Auth",
    category: "wallet",
    docs: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md",
    description: "Challenge-response authentication using Stellar keypairs",
    probe: async () => {
      const r = await get("/api/wallet-auth/challenge?account=GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3V0RDWA");
      return [
        { label: "network passphrase", value: r.data?.network_passphrase ?? r.data?.network ?? "—" },
        { label: "transaction", value: r.data?.transaction ? "✓ issued" : "—" },
      ];
    },
  },
  // ── Oracle
  {
    id: "reflector",
    name: "Reflector Oracle",
    category: "oracle",
    docs: "https://reflector.network",
    description: "SEP-40 on-chain price oracle for XLM, USDC, BRL and more",
    probe: async () => {
      const r = await get("/api/oracle/prices?assets=XLM,BRL,USDC,BTC");
      const prices = r.data?.prices ?? r.data ?? {};
      return Object.entries(prices).slice(0, 4).map(([k, v]: any) => ({
        label: k,
        value: typeof v === "object" ? String(v.price ?? v.usd ?? JSON.stringify(v).slice(0, 20)) : String(v),
      }));
    },
  },
  // ── Infrastructure
  {
    id: "stellar_network",
    name: "Stellar Network",
    category: "infrastructure",
    docs: "https://developers.stellar.org",
    description: "Live Horizon stats: ledger, fee, ops, TPS",
    probe: async () => {
      const r = await get("/api/network/stats");
      const d = r.data;
      return [
        { label: "ledger", value: String(d.latest_ledger ?? d.ledger ?? "—") },
        { label: "base fee", value: String(d.base_fee_in_stroops ?? d.fee ?? "—") },
        { label: "tx/ledger", value: String(d.tx_per_ledger ?? "—") },
        { label: "network", value: d.network ?? "—" },
      ];
    },
  },
  {
    id: "trm_fraud",
    name: "TRM Fraud Screening",
    category: "infrastructure",
    docs: "https://www.trmlabs.com",
    description: "AML / address risk scoring via TRM Labs API",
    probe: async () => {
      const r = await get("/api/fraud-screen/address/GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3V0RDWA");
      if (r.status === 402 || r.data?.error?.includes("key") || r.data?.error?.includes("API")) {
        throw Object.assign(new Error("needs_key"), { needsKey: true });
      }
      return [
        { label: "risk score", value: String(r.data?.risk_score ?? r.data?.score ?? "—") },
        { label: "verdict", value: r.data?.verdict ?? r.data?.risk_rating ?? "—" },
      ];
    },
  },
];

// ── Category metadata ─────────────────────────────────────────────────────────

const CAT_LABEL: Record<string, string> = {
  on_off_ramp: "On/Off-Ramp",
  defi: "DeFi",
  cross_chain: "Cross-Chain",
  wallet: "Wallet",
  oracle: "Oracle",
  infrastructure: "Infrastructure",
};

const CAT_ICON: Record<string, React.ReactNode> = {
  on_off_ramp: <ArrowRightLeft className="h-3.5 w-3.5" />,
  defi: <TrendingUp className="h-3.5 w-3.5" />,
  cross_chain: <Globe className="h-3.5 w-3.5" />,
  wallet: <Wallet className="h-3.5 w-3.5" />,
  oracle: <Activity className="h-3.5 w-3.5" />,
  infrastructure: <Server className="h-3.5 w-3.5" />,
};

const CAT_ORDER = ["on_off_ramp", "defi", "cross_chain", "wallet", "oracle", "infrastructure"];

// ── Status helpers ────────────────────────────────────────────────────────────

function tone(s: CardStatus): "confirm" | "error" | "gold" | "default" {
  if (s === "ok") return "confirm";
  if (s === "degraded") return "error";
  if (s === "needs_key") return "gold";
  return "default";
}

const STATUS_LABEL: Record<CardStatus, string> = {
  idle: "Pending",
  loading: "Testing…",
  ok: "Live",
  degraded: "Degraded",
  needs_key: "Needs Key",
  frontend_sdk: "Frontend SDK",
  self_hosted: "Self-Hosted",
};

function StatusIcon({ s }: { s: CardStatus }) {
  if (s === "loading") return <Loader2 className="h-4 w-4 animate-spin text-tts-muted" />;
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 text-tts-confirm" />;
  if (s === "degraded") return <AlertTriangle className="h-4 w-4 text-tts-error" />;
  if (s === "needs_key") return <Key className="h-4 w-4 text-tts-gold" />;
  if (s === "frontend_sdk") return <Zap className="h-4 w-4 text-tts-gold" />;
  if (s === "self_hosted") return <Server className="h-4 w-4 text-tts-muted" />;
  return <Shield className="h-4 w-4 text-tts-muted" />;
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegCard({ def, onRun }: { def: IntegDef; onRun: (id: string) => void }) {
  const [state, setState] = useState<CardState>({
    status: def.staticStatus ?? "idle",
  });
  const run = useCallback(async () => {
    if (def.staticStatus) return;
    setState((p) => ({ ...p, status: "loading", error: undefined }));
    const t0 = Date.now();
    try {
      const rows = await def.probe();
      setState({ status: "ok", latency: Date.now() - t0, rows });
    } catch (e: any) {
      const ms = Date.now() - t0;
      if (e.needsKey) {
        setState({ status: "needs_key", latency: ms, error: "API key required" });
      } else {
        setState({ status: "degraded", latency: ms, error: e.message });
      }
    }
    onRun(def.id);
  }, [def, onRun]);

  useEffect(() => { if (!def.staticStatus) run(); }, []);

  const s = state.status;

  return (
    <div className={`rounded-md border bg-tts-bg/40 p-3 transition-colors ${
      s === "ok" ? "border-tts-confirm/30"
      : s === "degraded" ? "border-tts-error/30"
      : s === "needs_key" || s === "frontend_sdk" ? "border-tts-gold/30"
      : "border-tts-border"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon s={s} />
          <div className="min-w-0">
            <p className="text-xs font-bold text-tts-deep truncate">{def.name}</p>
            <span className="flex items-center gap-0.5 text-[10px] text-tts-muted">
              {CAT_ICON[def.category]}&nbsp;{CAT_LABEL[def.category]}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusPill tone={tone(s)}>{STATUS_LABEL[s]}</StatusPill>
          {state.latency !== undefined && (
            <span className="flex items-center gap-0.5 text-[10px] text-tts-muted">
              <Clock className="h-2.5 w-2.5" />{state.latency}ms
            </span>
          )}
          {!def.staticStatus && (
            <button onClick={run} disabled={s === "loading"} className="rounded p-0.5 text-tts-muted hover:text-tts-deep disabled:opacity-40">
              <RefreshCw className={`h-3 w-3 ${s === "loading" ? "animate-spin" : ""}`} />
            </button>
          )}
          <a href={def.docs} target="_blank" rel="noopener noreferrer" className="text-tts-muted hover:text-tts-confirm">
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Description */}
      <p className="mt-2 text-[11px] text-tts-muted leading-relaxed">{def.description}</p>

      {/* Static note */}
      {def.staticNote && (
        <p className="mt-1.5 text-[10px] text-tts-muted italic">{def.staticNote}</p>
      )}

      {/* Live data rows */}
      {state.rows && state.rows.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {state.rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="text-tts-muted shrink-0">{row.label}</span>
              <span className="font-mono font-semibold text-tts-deep truncate max-w-[180px]">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {state.error && state.status !== "needs_key" && (
        <p className="mt-2 font-mono text-[10px] text-tts-error truncate">{state.error}</p>
      )}
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────

function CategorySection({ cat, defs, states, onRun }: {
  cat: string;
  defs: IntegDef[];
  states: Record<string, CardStatus>;
  onRun: (id: string) => void;
}) {
  const liveCount = defs.filter((d) => states[d.id] === "ok").length;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-tts-gold">{CAT_ICON[cat]}</span>
        <h2 className="text-sm font-bold text-tts-deep">{CAT_LABEL[cat]}</h2>
        <StatusPill tone={liveCount === defs.length ? "confirm" : liveCount > 0 ? "gold" : "default"}>
          {liveCount}/{defs.length}
        </StatusPill>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {defs.map((d) => <IntegCard key={d.id} def={d} onRun={onRun} />)}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ScfClient() {
  const [statuses, setStatuses] = useState<Record<string, CardStatus>>(() =>
    Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i.staticStatus ?? "idle"]))
  );
  const [reloadKey, setReloadKey] = useState(0);

  const onRun = useCallback((id: string) => {
    // cards self-report — we just trigger a re-read
    setStatuses((p) => ({ ...p }));
  }, []);

  const reloadAll = useCallback(() => {
    setReloadKey((k) => k + 1);
    setStatuses(Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i.staticStatus ?? "idle"])));
  }, []);

  const byCategory = INTEGRATIONS.reduce<Record<string, IntegDef[]>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});

  const total = INTEGRATIONS.length;
  const ok = Object.values(statuses).filter((s) => s === "ok").length;
  const needsKey = Object.values(statuses).filter((s) => s === "needs_key").length;
  const sdk = Object.values(statuses).filter((s) => s === "frontend_sdk" || s === "self_hosted").length;

  return (
    <OperationalPage size="xl">
      <OperationalHeader
        eyebrow="SCF Integration Track"
        title="Full Integration Suite"
        description={`Live status for all ${total} SCF Build integrations — each card calls its own endpoint independently. DeFi, cross-chain, wallets, oracle, and infrastructure.`}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill tone={ok > 0 ? "confirm" : "default"}>
              {ok} live / {total} total
            </StatusPill>
            <Button size="sm" variant="outline" onClick={reloadAll}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retest all
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <OperationalStat label="Live" value={String(ok)} detail="responding now" tone="confirm" />
        <OperationalStat label="Needs Key" value={String(needsKey)} detail="API key required" tone="gold" />
        <OperationalStat label="SDK / Static" value={String(sdk)} detail="no backend probe" />
        <OperationalStat label="Total" value={String(total)} detail="integrations" />
      </div>

      <div key={reloadKey} className="space-y-8">
        {CAT_ORDER.filter((cat) => byCategory[cat]?.length).map((cat) => (
          <CategorySection
            key={cat}
            cat={cat}
            defs={byCategory[cat]}
            states={statuses}
            onRun={onRun}
          />
        ))}
      </div>

      <OperationalCard>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-tts-deep">
          <ChevronRight className="h-4 w-4 text-tts-gold" />
          Individual API Reference
        </h2>
        <div className="space-y-0">
          {[
            ["GET", "/api/abroad/corridors", "BRL↔USDC corridors"],
            ["GET", "/api/sep24/anchors", "SEP-24 anchor list"],
            ["GET", "/api/broker/quote?from=XLM&to=USDC&amount=100", "Stellar Broker quote"],
            ["GET", "/api/blend/pools", "Blend v2 lending pools"],
            ["GET", "/api/defindex/vaults", "DeFindex yield vaults"],
            ["GET", "/api/aquarius/rewards?limit=5", "Aquarius reward pairs"],
            ["GET", "/api/swap/tokens", "Soroswap token list"],
            ["GET", "/api/allbridge/stellar-tokens", "Allbridge Stellar tokens"],
            ["GET", "/api/axelar/chains", "Axelar supported chains"],
            ["GET", "/api/cctp/chains", "Circle CCTP chains"],
            ["GET", "/api/near-intents/tokens", "Near Intents tokens"],
            ["GET", "/api/passkey-wallets/", "Passkey wallets list"],
            ["GET", "/api/wallet-auth/challenge?account=G…", "SEP-10 challenge"],
            ["GET", "/api/oracle/prices?assets=XLM,USDC", "Reflector prices"],
            ["GET", "/api/network/stats", "Stellar network stats"],
            ["GET", "/api/fraud-screen/address/:addr", "TRM risk score"],
          ].map(([method, path, desc]) => (
            <div key={path} className="flex flex-wrap items-center gap-x-3 border-b border-tts-border/40 py-1.5 last:border-0">
              <span className="shrink-0 rounded bg-tts-confirm/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-tts-confirm">{method}</span>
              <span className="font-mono text-[11px] text-tts-deep">{path}</span>
              <span className="text-[11px] text-tts-muted">{desc}</span>
            </div>
          ))}
        </div>
      </OperationalCard>
    </OperationalPage>
  );
}
