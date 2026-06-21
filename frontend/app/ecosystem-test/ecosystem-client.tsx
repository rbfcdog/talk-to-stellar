"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  TrendingUp,
  Wifi,
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
import { Input } from "@/components/ui/input";

// ── helpers ─────────────────────────────────────────────────────────────────

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || body.message || `HTTP ${r.status}`);
  return body;
}

function Err({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-tts-error/30 bg-tts-error/10 p-3 text-xs text-tts-error">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {msg}
    </div>
  );
}

function Spin() {
  return (
    <div className="flex items-center gap-2 text-xs text-tts-muted">
      <Loader2 className="h-4 w-4 animate-spin" />
      Loading…
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string | number | boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-tts-border/40 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-tts-muted">{label}</span>
      <span className={`text-xs font-semibold text-tts-deep ${mono ? "font-mono" : ""}`}>
        {String(value)}
      </span>
    </div>
  );
}

// ── Section: Network Stats ───────────────────────────────────────────────────

function NetworkSection() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [s, h] = await Promise.all([
        api("/api/network/stats"),
        api("/api/network/health"),
      ]);
      setStats({ ...s, health: h });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const fee = stats?.fees;
  const ledger = stats?.ledger;

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Activity className="h-4 w-4 text-tts-gold" />
          Stellar Network
        </h2>
        <div className="flex items-center gap-2">
          {stats?.health && (
            <StatusPill tone={stats.health.healthy ? "confirm" : "error"}>
              {stats.health.latencyMs ? `${stats.health.latencyMs}ms` : (stats.health.healthy ? "Online" : "Degraded")}
            </StatusPill>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !stats && <Spin />}
      {err && <Err msg={err} />}

      {stats && (
        <div className="space-y-0">
          {ledger && <Row label="Latest ledger" value={ledger.sequence?.toLocaleString()} />}
          {fee && <Row label="Base fee" value={`${fee.baseFeeStroops} stroops`} />}
          {fee && <Row label="p50 fee" value={`${fee.p50FeeStroops} stroops`} />}
          {fee && <Row label="TPS" value={`${stats.tps} ops/s`} />}
          {fee && (
            <Row
              label="Capacity"
              value={`${Math.round((fee.capacityUsage ?? 0) * 100)}%`}
            />
          )}
          {stats.recommendedFeeMicroXlm !== undefined && (
            <Row label="Recommended fee" value={`${stats.recommendedFeeMicroXlm} µXLM`} />
          )}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: Oracle Prices (Reflector) ──────────────────────────────────────

function OracleSection() {
  const [prices, setPrices] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await api("/api/oracle/prices?assets=XLM,BRL,USDC,BTC,ETH");
      setPrices(data);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const entries: any[] = prices?.prices ?? [];

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <TrendingUp className="h-4 w-4 text-tts-gold" />
          Reflector Oracle Prices
        </h2>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && !prices && <Spin />}
      {err && <Err msg={err} />}

      {entries.length > 0 && (
        <div className="space-y-0">
          {entries.map((p: any) => (
            <Row
              key={p.asset}
              label={`${p.asset}/USD`}
              value={`$${typeof p.price === "number" ? p.price.toFixed(p.asset === "BRL" ? 4 : 2) : p.price}`}
            />
          ))}
          {prices?.source && <Row label="Source" value={prices.source} />}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: Aquarius DeFi Rewards ──────────────────────────────────────────

function AquariusSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await api("/api/aquarius/rewards?limit=8"));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Zap className="h-4 w-4 text-tts-gold" />
          Aquarius AQUA Rewards
        </h2>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && !data && <Spin />}
      {err && <Err msg={err} />}

      {data && (
        <div className="space-y-1">
          <p className="mb-2 text-xs text-tts-muted">
            XLM/USDC pool:{" "}
            <strong className="text-tts-deep">
              {data.xlmUsdcDailyAqua?.toLocaleString() ?? "—"} AQUA/day
            </strong>
          </p>
          {data.topPools?.map((p: any, i: number) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0"
            >
              <span className="font-mono text-xs text-tts-deep">{p.pair}</span>
              <span className="text-xs font-semibold text-tts-gold">
                {p.dailyTotalReward?.toLocaleString()} AQUA/d
              </span>
            </div>
          ))}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: BRL Stablecoins ────────────────────────────────────────────────

const BRL_TOKENS = [
  {
    code: "BRZ",
    provider: "Transfero",
    issuer: "GABMA6FPH3OJXNTGWO7PROF7I5WPQUZOB4BLTBTP4FK6QV7HWISLIEO2",
    domain: "stellar.brztoken.io",
    stat: "$185M market cap",
  },
  {
    code: "BRLT",
    provider: "Settle Network / StableX",
    issuer: "GCHQ3F2BF5P74DMDNOOGHT5DUCKC773AW5DTOFINC26W4KGYFPYDPRSO",
    domain: "sep.stablex.cloud",
    stat: "474+ accounts",
  },
];

function BrlSection() {
  return (
    <OperationalCard>
      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
        <Globe className="h-4 w-4 text-tts-gold" />
        BRL Stablecoins on Stellar
      </h2>
      <p className="mb-4 text-xs text-tts-muted">
        nTokens (Brazil&apos;s former only BRL anchor) discontinued Dec 2024. BRZ and BRLT are the
        native BRL layer on Stellar today.
      </p>
      <div className="space-y-4">
        {BRL_TOKENS.map((t) => (
          <div key={t.code} className="rounded border border-tts-border/60 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-bold text-tts-deep">{t.code}</span>
              <StatusPill tone="confirm">{t.stat}</StatusPill>
            </div>
            <p className="text-xs text-tts-muted">{t.provider} · {t.domain}</p>
            <p className="mt-1 truncate font-mono text-[10px] text-tts-muted">{t.issuer}</p>
          </div>
        ))}
      </div>
    </OperationalCard>
  );
}

// ── Section: Abroad Finance + PIX QR Decoder ────────────────────────────────

function AbroadSection() {
  const [corridors, setCorridors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [qrPayload, setQrPayload] = useState("");
  const [qrResult, setQrResult] = useState<any>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrErr, setQrErr] = useState<string | null>(null);

  const loadCorridors = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await api("/api/abroad/corridors");
      setCorridors(d.corridors ?? d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCorridors(); }, [loadCorridors]);

  const decodeQr = useCallback(async () => {
    if (!qrPayload.trim()) return;
    setQrLoading(true);
    setQrErr(null);
    setQrResult(null);
    try {
      setQrResult(await api("/api/abroad/decode-pix", {
        method: "POST",
        body: JSON.stringify({ payload: qrPayload.trim() }),
      }));
    } catch (e: any) {
      setQrErr(e.message);
    } finally {
      setQrLoading(false);
    }
  }, [qrPayload]);

  const stellarCorridor = corridors.find(
    (c) => c.blockchain === "STELLAR" && c.cryptoCurrency === "USDC"
  );

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <ArrowRightLeft className="h-4 w-4 text-tts-gold" />
          Abroad Finance — USDC→PIX
        </h2>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={loadCorridors} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && !corridors.length && <Spin />}
      {err && <Err msg={err} />}

      {stellarCorridor && (
        <div className="mb-4 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-tts-confirm">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Stellar USDC → PIX corridor active
          </p>
          <p className="text-xs text-tts-muted">
            Min ${stellarCorridor.minAmount} · Max ${stellarCorridor.maxAmount?.toLocaleString() ?? "unlimited"} · 910+ txns/month
          </p>
        </div>
      )}

      <div className="mb-2 text-xs font-semibold text-tts-muted">
        All corridors ({corridors.length})
      </div>
      <div className="mb-4 max-h-40 overflow-y-auto space-y-0">
        {corridors.map((c, i) => (
          <div
            key={i}
            className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0"
          >
            <span className="text-xs text-tts-deep">
              {c.blockchain} {c.cryptoCurrency}
            </span>
            <span className="text-xs text-tts-muted">
              → {c.paymentMethod} ({c.targetCurrency})
            </span>
          </div>
        ))}
      </div>

      {/* PIX QR Decoder */}
      <div className="border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-semibold text-tts-deep">PIX QR Decoder</p>
        <p className="mb-3 text-xs text-tts-muted">
          Paste a raw PIX QR code string (starts with 00020126…) to decode recipient, amount, and key.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="00020126…"
            value={qrPayload}
            onChange={(e) => setQrPayload(e.target.value)}
            className="font-mono text-xs"
          />
          <Button
            size="sm"
            onClick={decodeQr}
            disabled={!qrPayload.trim() || qrLoading}
            className="shrink-0"
          >
            {qrLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {qrErr && <div className="mt-2"><Err msg={qrErr} /></div>}
        {qrResult && (
          <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            {qrResult.pixKey && <Row label="PIX Key" value={qrResult.pixKey} mono />}
            {qrResult.recipientName && <Row label="Recipient" value={qrResult.recipientName} />}
            {qrResult.amount != null && <Row label="Amount" value={`R$${qrResult.amount}`} />}
            {qrResult.city && <Row label="City" value={qrResult.city} />}
            {qrResult.description && <Row label="Description" value={qrResult.description} />}
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

// ── Section: Soroswap Token Swap ─────────────────────────────────────────────

function SoroswapSection() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [fromToken, setFromToken] = useState("XLM");
  const [toToken, setToToken] = useState("USDC");
  const [amount, setAmount] = useState("10");
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await api("/api/swap/tokens");
      setTokens(d.tokens ?? d);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const getQuote = useCallback(async () => {
    setQuoteLoading(true);
    setQuoteErr(null);
    setQuoteResult(null);
    try {
      const d = await api(
        `/api/swap/quote?assetIn=${fromToken}&assetOut=${toToken}&amount=${amount}&tradeType=EXACT_IN`
      );
      setQuoteResult(d);
    } catch (e: any) {
      setQuoteErr(e.message);
    } finally {
      setQuoteLoading(false);
    }
  }, [fromToken, toToken, amount]);

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <ArrowRightLeft className="h-4 w-4 text-tts-gold" />
          Soroswap DEX
        </h2>
        <StatusPill tone="default">{tokens.length} tokens</StatusPill>
      </div>

      {loading && !tokens.length && <Spin />}
      {err && <Err msg={err} />}

      {/* Quote builder */}
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="mb-1 text-xs font-semibold text-tts-muted">From</p>
            <select
              value={fromToken}
              onChange={(e) => setFromToken(e.target.value)}
              className="w-full rounded border border-tts-border bg-tts-bg px-2 py-1.5 text-xs text-tts-deep"
            >
              <option value="XLM">XLM</option>
              <option value="USDC">USDC</option>
              <option value="BRZ">BRZ</option>
              <option value="BRLT">BRLT</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-tts-muted">To</p>
            <select
              value={toToken}
              onChange={(e) => setToToken(e.target.value)}
              className="w-full rounded border border-tts-border bg-tts-bg px-2 py-1.5 text-xs text-tts-deep"
            >
              <option value="USDC">USDC</option>
              <option value="XLM">XLM</option>
              <option value="BRZ">BRZ</option>
              <option value="BRLT">BRLT</option>
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold text-tts-muted">Amount</p>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-xs"
            />
          </div>
        </div>

        <Button size="sm" className="w-full" onClick={getQuote} disabled={quoteLoading}>
          {quoteLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting quote…</> : "Get Swap Quote"}
        </Button>

        {quoteErr && <Err msg={quoteErr} />}
        {quoteResult && (
          <div className="rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            {quoteResult.outputAmount != null && (
              <Row label="Output" value={`${quoteResult.outputAmount} ${toToken}`} />
            )}
            {quoteResult.priceImpact != null && (
              <Row label="Price impact" value={`${quoteResult.priceImpact}%`} />
            )}
            {quoteResult.path && (
              <Row label="Route" value={quoteResult.path?.join(" → ")} />
            )}
            {quoteResult.xdr && (
              <p className="mt-2 break-all font-mono text-[10px] text-tts-muted">
                XDR: {quoteResult.xdr.slice(0, 60)}…
              </p>
            )}
          </div>
        )}
      </div>

      {/* Token list */}
      {tokens.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-tts-muted hover:text-tts-deep">
            All tokens ({tokens.length}) ↓
          </summary>
          <div className="mt-2 max-h-32 overflow-y-auto">
            {tokens.map((t: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1 text-xs">
                <span className="font-semibold text-tts-deep">{t.code ?? t.symbol}</span>
                <span className="font-mono text-tts-muted">
                  {String(t.contract ?? t.address ?? "").slice(0, 10)}…
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </OperationalCard>
  );
}

// ── Section: CCTP Cross-chain ────────────────────────────────────────────────

function CctpSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      setData(await api("/api/cctp/chains"));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const chains: any[] = data?.chains ?? [];

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Globe className="h-4 w-4 text-tts-gold" />
          CCTP Cross-chain USDC
        </h2>
        <StatusPill tone="default">
          {chains.length} chains
        </StatusPill>
      </div>

      {loading && !data && <Spin />}
      {err && <Err msg={err} />}

      {data && (
        <>
          <p className="mb-3 text-xs text-tts-muted">
            Circle&apos;s CCTP lets you bridge USDC from EVM chains directly onto Stellar.
            Stellar domain ID: <strong className="text-tts-deep">{data.stellarDomainId ?? 4}</strong>.
          </p>
          <div className="space-y-0">
            {chains.map((c: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0"
              >
                <span className="text-xs font-semibold text-tts-deep">{c.name ?? c.chain}</span>
                <span className="font-mono text-xs text-tts-muted">domain {c.domainId ?? c.domain}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </OperationalCard>
  );
}

// ── Section: Blend v2 Lending ───────────────────────────────────────────────

function BlendSection() {
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api("/api/blend/pools");
      setPools(Array.isArray(d.pools) ? d.pools : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <TrendingUp className="h-4 w-4 text-tts-gold" />
          Blend v2 Lending
        </h2>
        <div className="flex items-center gap-2">
          {pools.length > 0 && <StatusPill tone="confirm">{pools.length} pools</StatusPill>}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {loading && !pools.length && <Spin />}
      {error && <Err msg={error} />}
      <p className="mb-3 text-xs text-tts-muted">
        Blend is Stellar&apos;s DeFi lending protocol — deposit USDC/XLM and earn variable APY.
        Used by Meru, Beans, Freighter, and DeFindex vaults.
      </p>
      {pools.length > 0 && (
        <div className="space-y-0">
          {pools.slice(0, 5).map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0">
              <span className="text-xs font-semibold text-tts-deep">{p.name ?? p.id?.slice(0, 10) ?? `Pool ${i + 1}`}</span>
              <span className="text-xs text-tts-muted">
                {p.tvl ? `$${Number(p.tvl).toLocaleString()}` : p.status ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: Stellar Broker ──────────────────────────────────────────────────

function StellarBrokerSection() {
  const [from, setFrom] = useState("XLM");
  const [to, setTo] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getQuote = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const d = await api(`/api/broker/quote?from=${from}&to=${to}&amount=${amount}`);
      setQuote(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [from, to, amount]);

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <ArrowRightLeft className="h-4 w-4 text-tts-gold" />
          Stellar Broker Router
        </h2>
        <StatusPill tone="default">Multi-DEX</StatusPill>
      </div>
      <p className="mb-3 text-xs text-tts-muted">
        Routes swaps across Soroswap, Aquarius AMM, SDEX, and Classic AMMs for best execution price.
      </p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-tts-muted">From</p>
          <select value={from} onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded border border-tts-border bg-tts-bg px-2 py-1.5 text-xs text-tts-deep">
            <option>XLM</option><option>USDC</option><option>BRZ</option>
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-tts-muted">To</p>
          <select value={to} onChange={(e) => setTo(e.target.value)}
            className="w-full rounded border border-tts-border bg-tts-bg px-2 py-1.5 text-xs text-tts-deep">
            <option>USDC</option><option>XLM</option><option>BRZ</option>
          </select>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-tts-muted">Amount</p>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-xs" />
        </div>
      </div>
      <Button size="sm" className="w-full" onClick={getQuote} disabled={loading}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Routing…</> : "Get Best Quote"}
      </Button>
      {error && <div className="mt-2"><Err msg={error} /></div>}
      {quote && (
        <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
          {quote.outputAmount != null && <Row label="Output" value={`${quote.outputAmount} ${to}`} />}
          {quote.price != null && <Row label="Price" value={String(quote.price)} />}
          {quote.route && <Row label="Route" value={Array.isArray(quote.route) ? quote.route.join(" → ") : String(quote.route)} />}
          {quote.fee != null && <Row label="Fee" value={String(quote.fee)} />}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: Allbridge ───────────────────────────────────────────────────────

function AllbridgeSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api("/api/allbridge/stellar-tokens"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const stellar = data?.stellar;
  const tokens: any[] = stellar?.tokens ?? (Array.isArray(stellar) ? stellar : []);

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Globe className="h-4 w-4 text-tts-gold" />
          Allbridge Cross-Chain
        </h2>
        <div className="flex items-center gap-2">
          {tokens.length > 0 && <StatusPill tone="confirm">{tokens.length} tokens</StatusPill>}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {loading && !data && <Spin />}
      {error && <Err msg={error} />}
      <p className="mb-3 text-xs text-tts-muted">
        Native 1:1 stablecoin bridge — send USDC from Base/Ethereum/Solana directly to Stellar
        with automatic account activation. No DEX slippage.
      </p>
      {tokens.length > 0 && (
        <div className="space-y-0">
          {tokens.map((t: any, i: number) => (
            <div key={i} className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0">
              <span className="text-xs font-semibold text-tts-deep">{t.symbol ?? t.name}</span>
              <span className="font-mono text-xs text-tts-muted">{String(t.tokenAddress ?? t.contract ?? "").slice(0, 12)}…</span>
            </div>
          ))}
        </div>
      )}
      {data && !tokens.length && (
        <div className="rounded border border-tts-border bg-tts-bg p-3">
          <pre className="text-[10px] text-tts-muted overflow-x-auto">{JSON.stringify(stellar, null, 2).slice(0, 300)}</pre>
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: Axelar ──────────────────────────────────────────────────────────

function AxelarSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api("/api/axelar/chains"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const chains: any[] = data?.chains ?? [];

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Zap className="h-4 w-4 text-tts-gold" />
          Axelar Cross-Chain
        </h2>
        <div className="flex items-center gap-2">
          {data && <StatusPill tone="default">{data.count ?? chains.length} chains</StatusPill>}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      {loading && !data && <Spin />}
      {error && <Err msg={error} />}
      <p className="mb-3 text-xs text-tts-muted">
        General-purpose cross-chain messaging and Interchain Token Service.
        Stellar support via axelar-amplifier-stellar.
      </p>
      {chains.length > 0 && (
        <div className="max-h-40 overflow-y-auto space-y-0">
          {chains.slice(0, 10).map((c: any, i: number) => (
            <div key={i} className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0">
              <span className="text-xs font-semibold text-tts-deep">{c.name ?? c.id ?? c.chain_id}</span>
              <StatusPill tone={c.status === 'active' ? 'confirm' : 'default'}>{c.status ?? '—'}</StatusPill>
            </div>
          ))}
          {chains.length > 10 && (
            <p className="pt-1 text-xs text-tts-muted">+{chains.length - 10} more chains</p>
          )}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: Near Intents ────────────────────────────────────────────────────

function NearIntentsSection() {
  const [assetIn, setAssetIn] = useState("nep141:eth.token.near");
  const [assetOut, setAssetOut] = useState("nep141:ft.usdc.near");
  const [amountIn, setAmountIn] = useState("1000000000000000000");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getQuote = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const d = await api("/api/near-intents/quote", {
        method: "POST",
        body: JSON.stringify({ asset_in: assetIn, asset_out: assetOut, amount_in: amountIn }),
      });
      setQuote(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [assetIn, assetOut, amountIn]);

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Activity className="h-4 w-4 text-tts-gold" />
          Near Intents 1Click
        </h2>
        <StatusPill tone="default">Multi-chain</StatusPill>
      </div>
      <p className="mb-3 text-xs text-tts-muted">
        Solver-based execution: express intent ("USDC on Stellar") and solvers compete to fill
        it optimally across ETH, BTC, SOL, NEAR in one API call.
      </p>
      <div className="mb-3 space-y-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-tts-muted">Asset In (NEP-141 identifier)</p>
          <Input value={assetIn} onChange={(e) => setAssetIn(e.target.value)} className="font-mono text-xs" />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-tts-muted">Asset Out</p>
          <Input value={assetOut} onChange={(e) => setAssetOut(e.target.value)} className="font-mono text-xs" />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-tts-muted">Amount In (wei/atomic)</p>
          <Input value={amountIn} onChange={(e) => setAmountIn(e.target.value)} className="font-mono text-xs" />
        </div>
      </div>
      <Button size="sm" className="w-full" onClick={getQuote} disabled={loading}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting intent quote…</> : "Get Quote"}
      </Button>
      {error && <div className="mt-2"><Err msg={error} /></div>}
      {quote && (
        <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3">
          <pre className="text-[10px] text-tts-muted overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(quote, null, 2).slice(0, 400)}
          </pre>
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: Fraud Screening ────────────────────────────────────────────────

function FraudSection({ address }: { address: string }) {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const screen = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      setResult(await api(`/api/fraud-screen/address/${encodeURIComponent(address)}`));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Shield className="h-4 w-4 text-tts-gold" />
          Fraud Screening
        </h2>
        <Button size="sm" onClick={screen} disabled={!address || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Screen"}
        </Button>
      </div>

      {!address && (
        <p className="text-xs text-tts-muted">Enter a Stellar address above to screen it.</p>
      )}
      {err && <Err msg={err} />}
      {result && (
        <div className={`rounded border p-3 ${result.blocked
          ? "border-tts-error/30 bg-tts-error/10"
          : "border-tts-confirm/30 bg-tts-confirm/10"}`}>
          <p className={`flex items-center gap-2 text-sm font-bold ${result.blocked ? "text-tts-error" : "text-tts-confirm"}`}>
            {result.blocked
              ? <><AlertTriangle className="h-4 w-4" /> BLOCKED</>
              : <><CheckCircle2 className="h-4 w-4" /> CLEAN</>}
          </p>
          {result.tags?.length > 0 && (
            <p className="mt-1 text-xs text-tts-muted">Tags: {result.tags.join(", ")}</p>
          )}
          <p className="mt-1 text-xs text-tts-muted">
            Risk score: {result.riskScore ?? "—"} · Source: {result.source ?? "—"}
          </p>
        </div>
      )}
    </OperationalCard>
  );
}

// ── Section: Ecosystem Overview (master aggregator) ──────────────────────────

function EcosystemSection({ address }: { address: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setErr(null);
    setData(null);
    try {
      setData(await api(`/api/ecosystem/${encodeURIComponent(address)}`));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [address]);

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Wifi className="h-4 w-4 text-tts-gold" />
          Ecosystem Overview
        </h2>
        <div className="flex items-center gap-2">
          {data && (
            <StatusPill tone="confirm">
              ~${data.portfolioUsd?.toFixed(2)}
            </StatusPill>
          )}
          <Button size="sm" onClick={load} disabled={!address || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
          </Button>
        </div>
      </div>

      {!address && (
        <p className="text-xs text-tts-muted">
          Enter a Stellar address above — this combines every integration into a single call.
        </p>
      )}
      {err && <Err msg={err} />}

      {data && (
        <div className="space-y-4">
          {/* Balances */}
          <div>
            <p className="mb-1 text-xs font-semibold text-tts-muted">Wallet Balances</p>
            <div className="space-y-0">
              <Row label="USDC" value={`$${parseFloat(data.usdcBalance ?? "0").toFixed(2)}`} />
              <Row label="XLM" value={`${parseFloat(data.xlmBalance ?? "0").toFixed(2)} XLM`} />
              {data.brl_stablecoins?.brz_balance !== "0" && (
                <Row label="BRZ" value={`R$${data.brl_stablecoins.brz_balance}`} />
              )}
              {data.brl_stablecoins?.brlt_balance !== "0" && (
                <Row label="BRLT" value={`R$${data.brl_stablecoins.brlt_balance}`} />
              )}
            </div>
          </div>

          {/* Rates */}
          {data.rates && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Oracle Rates</p>
              <div className="space-y-0">
                <Row label="XLM/USD" value={`$${data.rates.xlm_usd}`} />
                <Row label="BRL/USD" value={`$${data.rates.brl_usd}`} />
              </div>
            </div>
          )}

          {/* Network */}
          {data.network_stats && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Network Health</p>
              <div className="space-y-0">
                <Row label="Ledger" value={data.network_stats.latestLedger?.toLocaleString()} />
                <Row label="TPS" value={`${data.network_stats.tps} ops/s`} />
                <Row label="Capacity" value={`${Math.round(data.network_stats.capacityUsage * 100)}%`} />
              </div>
            </div>
          )}

          {/* Abroad corridor */}
          {data.abroad && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">PIX Corridor</p>
              <Row
                label="USDC→PIX available"
                value={data.abroad.stellar_usdc_pix_available ? "Yes" : "No"}
              />
              {data.abroad.stellar_usdc_pix_available && (
                <Row
                  label="Limits"
                  value={`$${data.abroad.min_amount} – $${data.abroad.max_amount?.toLocaleString()}`}
                />
              )}
            </div>
          )}

          {/* DeFi */}
          {data.defi && (
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">DeFi (Aquarius)</p>
              <Row label="XLM/USDC pool" value={`${data.defi.aquarius_xlm_usdc_daily_aqua?.toLocaleString() ?? 0} AQUA/day`} />
            </div>
          )}

          {/* Fraud */}
          {data.fraud_screen && (
            <div className={`rounded border p-2 text-xs ${data.fraud_screen.blocked
              ? "border-tts-error/30 bg-tts-error/10 text-tts-error"
              : "border-tts-confirm/30 bg-tts-confirm/10 text-tts-confirm"}`}>
              {data.fraud_screen.blocked ? "⚠ BLOCKED" : "✓ Address clean"}
            </div>
          )}

          <p className="text-[10px] text-tts-muted">Fetched at: {data.fetchedAt}</p>
        </div>
      )}
    </OperationalCard>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function EcosystemClient() {
  const [address, setAddress] = useState("");
  const [stagedAddress, setStagedAddress] = useState("");

  const handleLookup = () => setStagedAddress(address.trim());

  return (
    <OperationalPage size="xl">
      <OperationalHeader
        eyebrow="Stellar Integrations"
        title="Ecosystem Dashboard"
        description="Live test panel for every TalkToStellar integration — network health, oracle prices, Aquarius DeFi rewards, BRL stablecoins, Abroad Finance PIX corridor, Soroswap DEX, CCTP cross-chain bridge, and full ecosystem overview."
        actions={
          <StatusPill tone="confirm">
            <Activity className="mr-1 h-3 w-3" />
            All systems live
          </StatusPill>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <OperationalStat label="Settlement" value="5s" detail="Stellar block time" tone="gold" />
        <OperationalStat label="Tx fee" value="$0.0001" detail="100 stroops" />
        <OperationalStat label="BRL volume" value="$318B" detail="Jul 24–Jun 25 in Brazil" />
        <OperationalStat label="Integrations" value="14" detail="Active on Stellar" />
      </div>

      {/* Address input — shared across ecosystem + fraud sections */}
      <div className="flex gap-2">
        <Input
          placeholder="G… (Stellar address for ecosystem overview & fraud screen)"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="font-mono text-xs"
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
        />
        <Button onClick={handleLookup} disabled={!address.trim()}>
          <Search className="mr-2 h-4 w-4" />
          Load
        </Button>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <NetworkSection />
        <OracleSection />
        <AquariusSection />
        <BrlSection />
        <AbroadSection />
        <SoroswapSection />
        <CctpSection />
        <BlendSection />
        <StellarBrokerSection />
        <AllbridgeSection />
        <AxelarSection />
        <NearIntentsSection />
        <FraudSection address={stagedAddress} />
      </div>

      {/* Full-width ecosystem overview */}
      <EcosystemSection address={stagedAddress} />

      {/* API reference */}
      <OperationalCard>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-tts-deep">
          <ChevronRight className="h-4 w-4 text-tts-gold" />
          API Quick Reference
        </h2>
        <div className="space-y-0">
          {[
            ["GET", "/api/network/stats", "Stellar network health, TPS, fees"],
            ["GET", "/api/network/health", "Quick reachability + latency"],
            ["GET", "/api/oracle/prices?assets=XLM,BRL", "Reflector on-chain price oracle"],
            ["GET", "/api/aquarius/rewards?limit=10", "Top AQUA reward pools"],
            ["GET", "/api/aquarius/rewards/pair?asset1=XLM&asset2=USDC", "Specific pair AQUA reward"],
            ["GET", "/api/abroad/corridors", "USDC→PIX corridors with limits"],
            ["POST", "/api/abroad/decode-pix", "Decode a Brazilian PIX QR code"],
            ["GET", "/api/swap/tokens", "Soroswap token list"],
            ["GET", "/api/swap/quote?assetIn=XLM&assetOut=USDC&amount=10&tradeType=EXACT_IN", "DEX swap quote"],
            ["GET", "/api/cctp/chains", "CCTP-supported EVM chains → Stellar"],
            ["GET", "/api/fraud-screen/address/:address", "TRM Labs fraud screening"],
            ["GET", "/api/blend/pools", "Blend v2 lending pools — TVL, APY"],
            ["GET", "/api/blend/user/:address", "User lending positions"],
            ["GET", "/api/broker/quote?from=XLM&to=USDC&amount=100", "Best swap quote across all DEXs"],
            ["GET", "/api/broker/assets", "All Stellar Broker supported assets"],
            ["GET", "/api/allbridge/chains", "Allbridge chains + Stellar token list"],
            ["POST", "/api/allbridge/receive-amount", "Cross-chain receive amount estimate"],
            ["GET", "/api/axelar/chains", "Axelar supported chains (60+)"],
            ["GET", "/api/axelar/transfer/:txHash", "Axelar cross-chain transfer status"],
            ["GET", "/api/near-intents/tokens", "Near Intents supported tokens"],
            ["POST", "/api/near-intents/quote", "1Click multi-chain swap quote"],
            ["GET", "/api/ecosystem/:address", "Full overview — all of the above in one call"],
            ["GET", "/api/ecosystem/:address/summary", "Portuguese WhatsApp summary text"],
          ].map(([method, path, desc]) => (
            <div
              key={path}
              className="flex flex-wrap items-center gap-x-3 border-b border-tts-border/40 py-2 last:border-0"
            >
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${method === "GET" ? "bg-tts-confirm/15 text-tts-confirm" : "bg-tts-gold/15 text-tts-gold"}`}>
                {method}
              </span>
              <span className="font-mono text-xs text-tts-deep">{path}</span>
              <span className="text-xs text-tts-muted">{desc}</span>
            </div>
          ))}
        </div>
      </OperationalCard>
    </OperationalPage>
  );
}
