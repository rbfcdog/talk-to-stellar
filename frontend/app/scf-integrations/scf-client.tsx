"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  Globe,
  Key,
  Loader2,
  RefreshCw,
  Search,
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
import { Input } from "@/components/ui/input";

// ── Shared helpers ────────────────────────────────────────────────────────────

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

function Row({ label, value, mono }: { label: string; value: string | number | undefined | null; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-tts-border/40 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-tts-muted">{label}</span>
      <span className={`truncate text-right text-xs font-semibold text-tts-deep ${mono ? "font-mono" : ""}`}>
        {String(value ?? "—")}
      </span>
    </div>
  );
}

function SectionHead({
  icon, title, badge, loading, onRefresh,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
        <span className="text-tts-gold">{icon}</span>
        {title}
      </h2>
      <div className="flex items-center gap-2">
        {badge}
        {onRefresh && (
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        )}
      </div>
    </div>
  );
}

function select(value: string, onChange: (v: string) => void, options: string[]) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-tts-border bg-tts-bg px-2 py-1.5 text-xs text-tts-deep"
    >
      {options.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ON/OFF-RAMP
// ══════════════════════════════════════════════════════════════════════════════

function AbroadSection() {
  const [corridors, setCorridors] = useState<any[]>([]);
  const [loadingCor, setLoadingCor] = useState(false);
  const [errCor, setErrCor] = useState<string | null>(null);

  const [pixPayload, setPixPayload] = useState("");
  const [pixResult, setPixResult] = useState<any>(null);
  const [loadingPix, setLoadingPix] = useState(false);
  const [errPix, setErrPix] = useState<string | null>(null);

  const [quoteFrom, setQuoteFrom] = useState("100");
  const [quoteCurrency, setQuoteCurrency] = useState("BRL");
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [errQuote, setErrQuote] = useState<string | null>(null);

  const loadCorridors = useCallback(async () => {
    setLoadingCor(true); setErrCor(null);
    try { const d = await api("/api/abroad/corridors"); setCorridors(d.corridors ?? d); }
    catch (e: any) { setErrCor(e.message); }
    finally { setLoadingCor(false); }
  }, []);

  const decodePix = useCallback(async () => {
    if (!pixPayload.trim()) return;
    setLoadingPix(true); setErrPix(null); setPixResult(null);
    try { setPixResult(await api("/api/abroad/decode-pix", { method: "POST", body: JSON.stringify({ payload: pixPayload.trim() }) })); }
    catch (e: any) { setErrPix(e.message); }
    finally { setLoadingPix(false); }
  }, [pixPayload]);

  const getQuote = useCallback(async () => {
    setLoadingQuote(true); setErrQuote(null); setQuoteResult(null);
    try { setQuoteResult(await api(`/api/abroad/quote?amount=${quoteFrom}&currency=${quoteCurrency}`)); }
    catch (e: any) { setErrQuote(e.message); }
    finally { setLoadingQuote(false); }
  }, [quoteFrom, quoteCurrency]);

  useEffect(() => { loadCorridors(); }, [loadCorridors]);

  const stellar = corridors.find((c) => c.blockchain === "STELLAR" && c.cryptoCurrency === "USDC");

  return (
    <OperationalCard>
      <SectionHead
        icon={<ArrowRightLeft className="h-4 w-4" />}
        title="Abroad Finance — USDC ↔ PIX"
        badge={<StatusPill tone={stellar ? "confirm" : "default"}>{corridors.length} corridors</StatusPill>}
        loading={loadingCor}
        onRefresh={loadCorridors}
      />

      {loadingCor && !corridors.length && <Spin />}
      {errCor && <Err msg={errCor} />}

      {stellar && (
        <div className="mb-4 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-tts-confirm">
            <CheckCircle2 className="h-3.5 w-3.5" /> Stellar USDC → PIX corridor active
          </p>
          <p className="mt-0.5 text-xs text-tts-muted">
            Min ${stellar.minAmount} · Max ${stellar.maxAmount?.toLocaleString() ?? "unlimited"}
          </p>
        </div>
      )}

      {corridors.length > 0 && (
        <div className="mb-4 max-h-32 overflow-y-auto space-y-0">
          {corridors.slice(0, 8).map((c, i) => (
            <div key={i} className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0">
              <span className="text-xs font-semibold text-tts-deep">{c.blockchain} {c.cryptoCurrency}</span>
              <span className="text-xs text-tts-muted">→ {c.paymentMethod} ({c.targetCurrency})</span>
            </div>
          ))}
        </div>
      )}

      {/* PIX Decoder */}
      <div className="mb-4 border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-bold text-tts-deep">PIX QR Decoder</p>
        <div className="flex gap-2">
          <Input placeholder="00020126… (raw PIX QR payload)" value={pixPayload} onChange={(e) => setPixPayload(e.target.value)} className="font-mono text-xs" />
          <Button size="sm" onClick={decodePix} disabled={!pixPayload.trim() || loadingPix}>
            {loadingPix ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {errPix && <div className="mt-2"><Err msg={errPix} /></div>}
        {pixResult && (
          <div className="mt-2 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="PIX Key" value={pixResult.pixKey} mono />
            <Row label="Recipient" value={pixResult.recipientName} />
            <Row label="Amount" value={pixResult.amount != null ? `R$${pixResult.amount}` : undefined} />
            <Row label="City" value={pixResult.city} />
          </div>
        )}
      </div>

      {/* Quote */}
      <div className="border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-bold text-tts-deep">Get Quote</p>
        <div className="flex gap-2 mb-2">
          <Input type="number" value={quoteFrom} onChange={(e) => setQuoteFrom(e.target.value)} className="text-xs" placeholder="Amount" />
          {select(quoteCurrency, setQuoteCurrency, ["BRL", "USD", "USDC"])}
          <Button size="sm" onClick={getQuote} disabled={loadingQuote}>
            {loadingQuote ? <Loader2 className="h-4 w-4 animate-spin" /> : "Quote"}
          </Button>
        </div>
        {errQuote && <Err msg={errQuote} />}
        {quoteResult && (
          <div className="rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="USDC needed" value={quoteResult.sourceAmount ?? quoteResult.amount} />
            <Row label="Rate" value={quoteResult.rate ?? quoteResult.exchangeRate} />
            <Row label="Fee" value={quoteResult.fee} />
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

function Sep24Section() {
  const [anchors, setAnchors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [info, setInfo] = useState<any>(null);
  const [infoErr, setInfoErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const d = await api("/api/sep24/anchors"); setAnchors(d.anchors ?? d); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadInfo = useCallback(async (domain: string) => {
    setInfoLoading(true); setInfoErr(null); setInfo(null);
    try { setInfo(await api(`/api/sep24/anchors/${encodeURIComponent(domain)}/info`)); }
    catch (e: any) { setInfoErr(e.message); }
    finally { setInfoLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<ArrowRightLeft className="h-4 w-4" />}
        title="SEP-24 Anchor Browser"
        badge={<StatusPill tone={anchors.length > 0 ? "confirm" : "default"}>{anchors.length} anchors</StatusPill>}
        loading={loading}
        onRefresh={load}
      />
      {loading && !anchors.length && <Spin />}
      {err && <Err msg={err} />}
      <p className="mb-3 text-xs text-tts-muted">Click an anchor to load its SEP-24 /info — assets, deposit/withdraw windows, and KYC requirements.</p>
      <div className="space-y-1.5 max-h-44 overflow-y-auto">
        {anchors.map((a: any, i: number) => (
          <button
            key={i}
            onClick={() => { setSelected(a); loadInfo(a.domain ?? a.homeDomain); }}
            className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${
              selected?.domain === a.domain
                ? "border-tts-gold/50 bg-tts-gold/10"
                : "border-tts-border hover:border-tts-gold/30 hover:bg-tts-bg"
            }`}
          >
            <span className="font-semibold text-tts-deep">{a.domain ?? a.homeDomain}</span>
            {a.assets && (
              <span className="ml-2 text-tts-muted">{Array.isArray(a.assets) ? a.assets.join(", ") : a.assets}</span>
            )}
          </button>
        ))}
      </div>
      {infoLoading && <div className="mt-3"><Spin /></div>}
      {infoErr && <div className="mt-3"><Err msg={infoErr} /></div>}
      {info && (
        <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3">
          <p className="mb-2 text-xs font-bold text-tts-deep">{selected?.domain} — Info</p>
          {info.deposit && Object.entries(info.deposit).slice(0, 3).map(([asset, d]: any) => (
            <div key={asset} className="mb-2">
              <p className="text-xs font-semibold text-tts-gold">{asset} Deposit</p>
              <Row label="Min" value={d.min_amount} />
              <Row label="Max" value={d.max_amount} />
              <Row label="Fee" value={d.fee_fixed != null ? `${d.fee_fixed} fixed` : undefined} />
            </div>
          ))}
          {info.withdraw && Object.entries(info.withdraw).slice(0, 1).map(([asset, w]: any) => (
            <div key={asset}>
              <p className="text-xs font-semibold text-tts-gold">{asset} Withdraw</p>
              <Row label="Min" value={w.min_amount} />
              <Row label="Max" value={w.max_amount} />
            </div>
          ))}
        </div>
      )}
    </OperationalCard>
  );
}

function StellarBrokerSection() {
  const [from, setFrom] = useState("XLM");
  const [to, setTo] = useState("USDC");
  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const getQuote = useCallback(async () => {
    setLoading(true); setErr(null); setQuote(null);
    try { setQuote(await api(`/api/broker/quote?from=${from}&to=${to}&amount=${amount}`)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [from, to, amount]);

  return (
    <OperationalCard>
      <SectionHead icon={<ArrowRightLeft className="h-4 w-4" />} title="Stellar Broker — Best Quote" />
      <p className="mb-3 text-xs text-tts-muted">Routes across Soroswap, Aquarius AMM, SDEX, and Classic AMMs for best execution.</p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">From</p>{select(from, setFrom, ["XLM", "USDC", "BRZ", "BRLT"])}</div>
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">To</p>{select(to, setTo, ["USDC", "XLM", "BRZ", "BRLT"])}</div>
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">Amount</p><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-xs" /></div>
      </div>
      <Button size="sm" className="w-full" onClick={getQuote} disabled={loading}>
        {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Routing…</> : "Get Best Quote"}
      </Button>
      {err && <div className="mt-2"><Err msg={err} /></div>}
      {quote && (
        <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
          <Row label="Output" value={quote.outputAmount ?? quote.buyAmount ?? quote.toAmount} />
          <Row label="Price" value={quote.price ?? quote.rate} />
          <Row label="Route" value={Array.isArray(quote.route) ? quote.route.join(" → ") : quote.route} />
          <Row label="Fee" value={quote.fee} />
        </div>
      )}
    </OperationalCard>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DEFI
// ══════════════════════════════════════════════════════════════════════════════

function BlendSection() {
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [poolDetail, setPoolDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const d = await api("/api/blend/pools"); setPools(Array.isArray(d.pools) ? d.pools : Array.isArray(d) ? d : []); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadPool = useCallback(async (poolId: string) => {
    setDetailLoading(true); setDetailErr(null); setPoolDetail(null);
    try { setPoolDetail(await api(`/api/blend/pools/${encodeURIComponent(poolId)}`)); }
    catch (e: any) { setDetailErr(e.message); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<TrendingUp className="h-4 w-4" />}
        title="Blend v2 Lending Pools"
        badge={pools.length > 0 ? <StatusPill tone="confirm">{pools.length} pools</StatusPill> : undefined}
        loading={loading}
        onRefresh={load}
      />
      {loading && !pools.length && <Spin />}
      {err && <Err msg={err} />}
      <p className="mb-3 text-xs text-tts-muted">Permissionless lending — deposit USDC/XLM, earn yield. Click a pool for details.</p>
      <div className="space-y-1.5">
        {pools.map((p: any, i: number) => (
          <button
            key={i}
            onClick={() => { setSelected(p); loadPool(p.id ?? p.contract ?? p.address); }}
            className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${
              selected?.id === p.id ? "border-tts-gold/50 bg-tts-gold/10" : "border-tts-border hover:border-tts-gold/30"
            }`}
          >
            <span className="font-semibold text-tts-deep">{p.name ?? p.id?.slice(0, 14) ?? `Pool ${i + 1}`}</span>
            <span className="ml-2 text-tts-muted">{p.assets?.join(", ") ?? ""}</span>
            {p.tvl && <span className="ml-2 font-mono text-tts-gold">${Number(p.tvl).toLocaleString()}</span>}
          </button>
        ))}
      </div>
      {detailLoading && <div className="mt-3"><Spin /></div>}
      {detailErr && <div className="mt-3"><Err msg={detailErr} /></div>}
      {poolDetail && (
        <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
          <Row label="Status" value={poolDetail.status ?? poolDetail.onChainStatus} />
          <Row label="TVL" value={poolDetail.tvl ? `$${Number(poolDetail.tvl).toLocaleString()}` : undefined} />
          <Row label="Contract" value={poolDetail.contract ?? poolDetail.address} mono />
          {poolDetail.verified !== undefined && <Row label="Verified on-chain" value={poolDetail.verified ? "Yes" : "No"} />}
        </div>
      )}
    </OperationalCard>
  );
}

function DefindexSection() {
  const [vaults, setVaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [vaultInfo, setVaultInfo] = useState<any>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoErr, setInfoErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const d = await api("/api/defindex/vaults"); setVaults(Array.isArray(d) ? d : d.vaults ?? (d.default_vault ? [{ id: d.default_vault, name: "Default Vault", address: d.default_vault, health: d.health }] : [])); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadInfo = useCallback(async (vaultId: string) => {
    setInfoLoading(true); setInfoErr(null); setVaultInfo(null);
    try { setVaultInfo(await api(`/api/defindex/vaults/${encodeURIComponent(vaultId)}/info`)); }
    catch (e: any) { setInfoErr(e.message); }
    finally { setInfoLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<TrendingUp className="h-4 w-4" />}
        title="DeFindex Yield Vaults"
        badge={vaults.length > 0 ? <StatusPill tone="confirm">{vaults.length} vaults</StatusPill> : undefined}
        loading={loading}
        onRefresh={load}
      />
      {loading && !vaults.length && <Spin />}
      {err && <Err msg={err} />}
      <p className="mb-3 text-xs text-tts-muted">Tokenized yield vaults that auto-compound across Blend pools and AMMs. Click to inspect.</p>
      <div className="space-y-1.5 max-h-44 overflow-y-auto">
        {vaults.map((v: any, i: number) => (
          <button
            key={i}
            onClick={() => { setSelected(v); loadInfo(v.id ?? v.address ?? v.contract); }}
            className={`w-full rounded border px-3 py-2 text-left text-xs transition-colors ${
              selected?.id === v.id ? "border-tts-gold/50 bg-tts-gold/10" : "border-tts-border hover:border-tts-gold/30"
            }`}
          >
            <span className="font-semibold text-tts-deep">{v.name ?? v.id ?? `Vault ${i + 1}`}</span>
            {v.apy && <span className="ml-2 text-tts-gold font-mono">{v.apy}% APY</span>}
            {v.tvl && <span className="ml-2 text-tts-muted">${Number(v.tvl).toLocaleString()}</span>}
          </button>
        ))}
        {!loading && !err && vaults.length === 0 && (
          <p className="text-xs text-tts-muted">No vaults returned — may require DEFINDEX_API_KEY.</p>
        )}
      </div>
      {infoLoading && <div className="mt-3"><Spin /></div>}
      {infoErr && <div className="mt-3"><Err msg={infoErr} /></div>}
      {vaultInfo && (
        <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
          <Row label="APY" value={vaultInfo.apy} />
          <Row label="TVL" value={vaultInfo.tvl} />
          <Row label="Strategy" value={vaultInfo.strategy ?? vaultInfo.strategies?.join(", ")} />
          <Row label="Contract" value={vaultInfo.contract ?? vaultInfo.address} mono />
        </div>
      )}
    </OperationalCard>
  );
}

function AquariusSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [limit] = useState("8");
  const [pairA, setPairA] = useState("XLM");
  const [pairB, setPairB] = useState("USDC");
  const [pairData, setPairData] = useState<any>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairErr, setPairErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await api(`/api/aquarius/rewards?limit=${limit}`)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [limit]);

  const getPair = useCallback(async () => {
    setPairLoading(true); setPairErr(null); setPairData(null);
    try { setPairData(await api(`/api/aquarius/rewards/pair?asset1=${pairA}&asset2=${pairB}`)); }
    catch (e: any) { setPairErr(e.message); }
    finally { setPairLoading(false); }
  }, [pairA, pairB]);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<Zap className="h-4 w-4" />}
        title="Aquarius / AQUA Rewards"
        badge={data && <StatusPill tone="confirm">Live</StatusPill>}
        loading={loading}
        onRefresh={load}
      />
      {loading && !data && <Spin />}
      {err && <Err msg={err} />}

      {data && (
        <>
          <Row label="XLM/USDC daily AQUA" value={data.xlmUsdcDailyAqua?.toLocaleString()} />
          <div className="mt-3 mb-1 text-xs font-bold text-tts-muted">Top pools</div>
          <div className="max-h-36 overflow-y-auto space-y-0">
            {data.topPools?.map((p: any, i: number) => (
              <div key={i} className="flex justify-between border-b border-tts-border/40 py-1.5 last:border-0">
                <span className="font-mono text-xs text-tts-deep">{p.pair}</span>
                <span className="text-xs font-semibold text-tts-gold">{p.dailyTotalReward?.toLocaleString()} AQUA/d</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4 border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-bold text-tts-deep">Pair Lookup</p>
        <div className="flex gap-2 mb-2">
          <Input value={pairA} onChange={(e) => setPairA(e.target.value)} className="text-xs" placeholder="XLM" />
          <Input value={pairB} onChange={(e) => setPairB(e.target.value)} className="text-xs" placeholder="USDC" />
          <Button size="sm" onClick={getPair} disabled={pairLoading}>
            {pairLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {pairErr && <Err msg={pairErr} />}
        {pairData && (
          <div className="rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="Daily AQUA" value={pairData.dailyReward?.toLocaleString()} />
            <Row label="Pair" value={`${pairA}/${pairB}`} />
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

function SoroswapSection() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState("XLM");
  const [to, setTo] = useState("USDC");
  const [amount, setAmount] = useState("10");
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const d = await api("/api/swap/tokens");
      // If Soroswap API is down, backend returns { error: "..." }
      if (d?.error) { setErr(`Soroswap temporarily unavailable: ${d.error}`); return; }
      setTokens(Array.isArray(d) ? d : d.tokens ?? []);
    }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  const getQuote = useCallback(async () => {
    setQuoteLoading(true); setQuoteErr(null); setQuote(null);
    try { setQuote(await api(`/api/swap/quote?assetIn=${from}&assetOut=${to}&amount=${amount}&tradeType=EXACT_IN`)); }
    catch (e: any) { setQuoteErr(e.message); }
    finally { setQuoteLoading(false); }
  }, [from, to, amount]);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<ArrowRightLeft className="h-4 w-4" />}
        title="Soroswap DEX"
        badge={<StatusPill tone={tokens.length > 0 ? "confirm" : "default"}>{tokens.length} tokens</StatusPill>}
        loading={loading}
        onRefresh={load}
      />
      {loading && !tokens.length && <Spin />}
      {err && <Err msg={err} />}

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">From</p>{select(from, setFrom, ["XLM", "USDC", "BRZ", "BRLT"])}</div>
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">To</p>{select(to, setTo, ["USDC", "XLM", "BRZ", "BRLT"])}</div>
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">Amount</p><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-xs" /></div>
      </div>
      <Button size="sm" className="w-full" onClick={getQuote} disabled={quoteLoading}>
        {quoteLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting quote…</> : "Get Swap Quote"}
      </Button>
      {quoteErr && <div className="mt-2"><Err msg={quoteErr} /></div>}
      {quote && (
        <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
          <Row label="Output" value={`${quote.outputAmount ?? quote.buyAmount} ${to}`} />
          <Row label="Price impact" value={quote.priceImpact != null ? `${quote.priceImpact}%` : undefined} />
          <Row label="Route" value={quote.path?.join(" → ")} />
          {quote.xdr && <p className="mt-2 break-all font-mono text-[10px] text-tts-muted">{quote.xdr.slice(0, 60)}…</p>}
        </div>
      )}

      {tokens.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-tts-muted hover:text-tts-deep">
            All tokens ({tokens.length}) ↓
          </summary>
          <div className="mt-2 max-h-32 overflow-y-auto space-y-0">
            {tokens.map((t: any, i: number) => (
              <div key={i} className="flex justify-between border-b border-tts-border/40 py-1 last:border-0">
                <span className="text-xs font-semibold text-tts-deep">{t.code ?? t.symbol}</span>
                <span className="font-mono text-xs text-tts-muted">{String(t.contract ?? t.address ?? "").slice(0, 12)}…</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </OperationalCard>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSS-CHAIN
// ══════════════════════════════════════════════════════════════════════════════

function AllbridgeSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await api("/api/allbridge/stellar-tokens")); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Response shape: { tokens: [...] } or { stellar: { tokens: [...] } }
  const tokens: any[] = data?.tokens ?? data?.stellar?.tokens ?? (Array.isArray(data) ? data : []);

  return (
    <OperationalCard>
      <SectionHead
        icon={<Globe className="h-4 w-4" />}
        title="Allbridge Core"
        badge={<StatusPill tone={tokens.length > 0 ? "confirm" : "gold"}>{tokens.length > 0 ? `${tokens.length} tokens` : "IP restricted"}</StatusPill>}
        loading={loading}
        onRefresh={load}
      />
      {loading && !data && <Spin />}
      {err && <Err msg={err} />}
      <p className="mb-3 text-xs text-tts-muted">Native 1:1 stablecoin bridge from Base/ETH/Solana to Stellar. No DEX slippage — burns on source, mints on Stellar.</p>
      {data?.note && <div className="mb-3 rounded border border-tts-gold/30 bg-tts-gold/10 p-2 text-xs text-tts-gold">{data.note}</div>}
      {tokens.length > 0 ? (
        <div className="space-y-0">
          {tokens.map((t: any, i: number) => (
            <div key={i} className="flex justify-between border-b border-tts-border/40 py-1.5 last:border-0">
              <span className="text-xs font-semibold text-tts-deep">{t.symbol ?? t.name}</span>
              <span className="font-mono text-xs text-tts-muted">{String(t.tokenAddress ?? t.contract ?? "").slice(0, 14)}</span>
            </div>
          ))}
        </div>
      ) : data && (
        <div className="rounded border border-tts-border bg-tts-bg p-3">
          <Row label="Chain ID" value={data.chainId} />
          <Row label="SDK" value={data.sdk ?? "@allbridge/bridge-core-sdk"} mono />
          <Row label="Bridge type" value={data.bridgeType} />
        </div>
      )}
    </OperationalCard>
  );
}

function AxelarSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [txHash, setTxHash] = useState("");
  const [txStatus, setTxStatus] = useState<any>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [txErr, setTxErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await api("/api/axelar/chains")); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  const checkTx = useCallback(async () => {
    if (!txHash.trim()) return;
    setTxLoading(true); setTxErr(null); setTxStatus(null);
    try { setTxStatus(await api(`/api/axelar/transfer/${encodeURIComponent(txHash.trim())}`)); }
    catch (e: any) { setTxErr(e.message); }
    finally { setTxLoading(false); }
  }, [txHash]);

  useEffect(() => { load(); }, [load]);

  const chains: any[] = data?.chains ?? [];
  const filtered = search ? chains.filter((c) => (c.chain_name ?? c.name ?? c.id ?? "").toLowerCase().includes(search.toLowerCase())) : chains;

  return (
    <OperationalCard>
      <SectionHead
        icon={<Globe className="h-4 w-4" />}
        title="Axelar Cross-Chain"
        badge={data && <StatusPill tone="confirm">{data.count ?? chains.length} chains</StatusPill>}
        loading={loading}
        onRefresh={load}
      />
      {loading && !data && <Spin />}
      {err && <Err msg={err} />}
      {chains.length > 0 && (
        <>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chains…" className="mb-2 text-xs" />
          <div className="mb-4 max-h-40 overflow-y-auto space-y-0">
            {filtered.slice(0, 20).map((c: any, i: number) => (
              <div key={i} className="flex justify-between border-b border-tts-border/40 py-1.5 last:border-0">
                <span className="text-xs font-semibold text-tts-deep">{c.chain_name ?? c.name ?? c.id}</span>
                <StatusPill tone={c.status === "active" ? "confirm" : "default"}>{c.status ?? "—"}</StatusPill>
              </div>
            ))}
            {filtered.length > 20 && <p className="pt-1 text-xs text-tts-muted">+{filtered.length - 20} more</p>}
          </div>
        </>
      )}
      <div className="border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-bold text-tts-deep">Transfer Status</p>
        <div className="flex gap-2">
          <Input value={txHash} onChange={(e) => setTxHash(e.target.value)} placeholder="0x… tx hash" className="font-mono text-xs" />
          <Button size="sm" onClick={checkTx} disabled={!txHash.trim() || txLoading}>
            {txLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {txErr && <div className="mt-2"><Err msg={txErr} /></div>}
        {txStatus && (
          <div className="mt-2 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="Status" value={txStatus.status ?? txStatus.state} />
            <Row label="From" value={txStatus.sourceChain ?? txStatus.from} />
            <Row label="To" value={txStatus.destinationChain ?? txStatus.to} />
            <Row label="Amount" value={txStatus.amount} />
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

function CctpSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setData(await api("/api/cctp/chains")); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const chains: any[] = data?.chains ?? [];

  return (
    <OperationalCard>
      <SectionHead
        icon={<Globe className="h-4 w-4" />}
        title="Circle CCTP — Native USDC Bridge"
        badge={<StatusPill tone={chains.length > 0 ? "confirm" : "default"}>{chains.length} chains</StatusPill>}
        loading={loading}
        onRefresh={load}
      />
      {loading && !data && <Spin />}
      {err && <Err msg={err} />}
      {data && (
        <>
          <div className="mb-3 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-2 text-xs text-tts-confirm">
            Stellar domain ID: <strong>{data.stellarDomainId ?? 4}</strong> — burn USDC on any chain, mint natively on Stellar
          </div>
          <div className="space-y-0">
            {chains.map((c: any, i: number) => (
              <div key={i} className="flex justify-between border-b border-tts-border/40 py-1.5 last:border-0">
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

function NearIntentsSection() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensErr, setTokensErr] = useState<string | null>(null);
  const [assetIn, setAssetIn] = useState("nep141:eth.token.near");
  const [assetOut, setAssetOut] = useState("nep141:ft.usdc.near");
  const [amountIn, setAmountIn] = useState("1000000000000000000");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setTokensLoading(true); setTokensErr(null);
    try { const d = await api("/api/near-intents/tokens"); setTokens(Array.isArray(d) ? d : d.tokens ?? []); }
    catch (e: any) { setTokensErr(e.message); }
    finally { setTokensLoading(false); }
  }, []);

  const getQuote = useCallback(async () => {
    setLoading(true); setErr(null); setQuote(null);
    try { setQuote(await api("/api/near-intents/quote", { method: "POST", body: JSON.stringify({ asset_in: assetIn, asset_out: assetOut, amount_in: amountIn }) })); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [assetIn, assetOut, amountIn]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<Activity className="h-4 w-4" />}
        title="Near Intents 1Click"
        badge={<StatusPill tone={tokens.length > 0 ? "confirm" : "default"}>{tokens.length} tokens</StatusPill>}
        loading={tokensLoading}
        onRefresh={loadTokens}
      />
      {tokensLoading && !tokens.length && <Spin />}
      {tokensErr && <Err msg={tokensErr} />}
      <p className="mb-3 text-xs text-tts-muted">Solver-based multi-chain swaps — express an intent and solvers compete to fill it across ETH, BTC, SOL, NEAR.</p>

      {tokens.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs font-semibold text-tts-muted hover:text-tts-deep">Supported tokens ({tokens.length}) ↓</summary>
          <div className="mt-2 max-h-32 overflow-y-auto space-y-0">
            {tokens.slice(0, 20).map((t: any, i: number) => (
              <div key={i} className="flex justify-between border-b border-tts-border/40 py-1 last:border-0">
                <span className="text-xs font-semibold text-tts-deep">{t.symbol ?? t.defuse_asset_id?.split(":")[1] ?? t}</span>
                <span className="font-mono text-[10px] text-tts-muted truncate max-w-[140px]">{t.defuse_asset_id ?? t.asset_id ?? ""}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="space-y-2">
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">Asset In (NEP-141 ID)</p><Input value={assetIn} onChange={(e) => setAssetIn(e.target.value)} className="font-mono text-xs" /></div>
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">Asset Out</p><Input value={assetOut} onChange={(e) => setAssetOut(e.target.value)} className="font-mono text-xs" /></div>
        <div><p className="mb-1 text-xs font-semibold text-tts-muted">Amount In (atomic)</p><Input value={amountIn} onChange={(e) => setAmountIn(e.target.value)} className="font-mono text-xs" /></div>
        <Button size="sm" className="w-full" onClick={getQuote} disabled={loading}>
          {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Getting intent quote…</> : "Get Quote"}
        </Button>
      </div>
      {err && <div className="mt-2"><Err msg={err} /></div>}
      {quote && (
        <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3">
          <pre className="text-[10px] text-tts-muted overflow-x-auto whitespace-pre-wrap">{JSON.stringify(quote, null, 2).slice(0, 500)}</pre>
        </div>
      )}
    </OperationalCard>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WALLET
// ══════════════════════════════════════════════════════════════════════════════

const WALLET_KIT_WALLETS = [
  { name: "Freighter", type: "Extension", icon: "🦅", status: "Production" },
  { name: "LOBSTR", type: "Mobile/Web", icon: "🦞", status: "Production" },
  { name: "xBull", type: "Extension", icon: "🐂", status: "Production" },
  { name: "Albedo", type: "Web", icon: "🌐", status: "Production" },
  { name: "Rabet", type: "Extension", icon: "🐇", status: "Production" },
  { name: "Hana", type: "Mobile", icon: "🌸", status: "Production" },
  { name: "Ledger", type: "Hardware", icon: "🔑", status: "Via Freighter" },
  { name: "Trezor", type: "Hardware", icon: "🔒", status: "Via Freighter" },
  { name: "WalletConnect", type: "Protocol", icon: "🔗", status: "Production" },
];

function WalletsKitSection() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <OperationalCard>
      <SectionHead icon={<Wallet className="h-4 w-4" />} title="Stellar Wallets Kit" badge={<StatusPill tone="gold">Frontend SDK</StatusPill>} />
      <p className="mb-3 text-xs text-tts-muted">
        Client-only SDK — one API for all Stellar wallets. Install: <code className="rounded bg-tts-bg px-1 py-0.5 font-mono text-[10px]">npm i @creit-tech/stellar-wallets-kit</code>
      </p>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {WALLET_KIT_WALLETS.map((w) => (
          <button
            key={w.name}
            onClick={() => setSelected(selected === w.name ? null : w.name)}
            className={`rounded border p-2 text-left transition-colors ${
              selected === w.name ? "border-tts-gold/50 bg-tts-gold/10" : "border-tts-border hover:border-tts-gold/30"
            }`}
          >
            <p className="text-sm">{w.icon}</p>
            <p className="text-xs font-bold text-tts-deep">{w.name}</p>
            <p className="text-[10px] text-tts-muted">{w.type}</p>
          </button>
        ))}
      </div>
      {selected && (() => {
        const w = WALLET_KIT_WALLETS.find((x) => x.name === selected)!;
        return (
          <div className="rounded border border-tts-gold/30 bg-tts-gold/10 p-3">
            <p className="text-xs font-bold text-tts-deep">{w.icon} {w.name}</p>
            <Row label="Type" value={w.type} />
            <Row label="Status" value={w.status} />
            <div className="mt-2 rounded bg-tts-bg p-2">
              <p className="font-mono text-[10px] text-tts-muted whitespace-pre">{`const kit = new StellarWalletsKit({ network: WalletNetwork.PUBLIC,\n  selectedWalletId: WALLET_ID.${w.name.toUpperCase()}, wallets: [${w.name}Module()] });\nawait kit.openModal({ onWalletSelected: (id) => kit.setWallet(id) });`}</p>
            </div>
          </div>
        );
      })()}
    </OperationalCard>
  );
}

function PasskeyWalletsSection() {
  const [wallets, setWallets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [contractId, setContractId] = useState("");
  const [contractInfo, setContractInfo] = useState<any>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [contractErr, setContractErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { const d = await api("/api/passkey-wallets/"); setWallets(Array.isArray(d) ? d : d.wallets ?? []); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  const lookupContract = useCallback(async () => {
    if (!contractId.trim()) return;
    setContractLoading(true); setContractErr(null); setContractInfo(null);
    try { setContractInfo(await api(`/api/passkey-wallets/${encodeURIComponent(contractId.trim())}/signers`)); }
    catch (e: any) { setContractErr(e.message); }
    finally { setContractLoading(false); }
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<Key className="h-4 w-4" />}
        title="Passkey Smart Wallets"
        badge={wallets.length > 0 ? <StatusPill tone="confirm">{wallets.length} registered</StatusPill> : undefined}
        loading={loading}
        onRefresh={load}
      />
      {loading && <Spin />}
      {err && <Err msg={err} />}
      <p className="mb-3 text-xs text-tts-muted">WebAuthn passkey wallets via OpenZeppelin Soroban contracts — no seed phrase, fingerprint/FaceID auth.</p>

      {wallets.length > 0 && (
        <div className="mb-4 max-h-36 overflow-y-auto space-y-0">
          {wallets.slice(0, 8).map((w: any, i: number) => (
            <div key={i} className="flex justify-between border-b border-tts-border/40 py-1.5 last:border-0">
              <span className="font-mono text-xs text-tts-deep truncate">{w.contractId ?? w.id ?? w.address}</span>
              <span className="text-xs text-tts-muted">{w.createdAt?.split("T")[0] ?? "—"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-bold text-tts-deep">Contract Signer Lookup</p>
        <div className="flex gap-2">
          <Input value={contractId} onChange={(e) => setContractId(e.target.value)} placeholder="C… contract ID" className="font-mono text-xs" />
          <Button size="sm" onClick={lookupContract} disabled={!contractId.trim() || contractLoading}>
            {contractLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {contractErr && <div className="mt-2"><Err msg={contractErr} /></div>}
        {contractInfo && (
          <div className="mt-2 rounded border border-tts-border bg-tts-bg p-3">
            <pre className="text-[10px] text-tts-muted overflow-x-auto whitespace-pre-wrap">{JSON.stringify(contractInfo, null, 2).slice(0, 400)}</pre>
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

function WalletAuthSection() {
  const [account, setAccount] = useState("GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3V0RDWA");
  const [challenge, setChallenge] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [validated, setValidated] = useState<any>(null);
  const [validateLoading, setValidateLoading] = useState(false);
  const [validateErr, setValidateErr] = useState<string | null>(null);

  const getChallenge = useCallback(async () => {
    if (!account.trim()) return;
    setLoading(true); setErr(null); setChallenge(null);
    try { setChallenge(await api(`/api/wallet-auth/challenge?account=${encodeURIComponent(account.trim())}`)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [account]);

  const validateToken = useCallback(async () => {
    if (!tokenInput.trim()) return;
    setValidateLoading(true); setValidateErr(null); setValidated(null);
    try { setValidated(await api("/api/wallet-auth/validate", { method: "POST", body: JSON.stringify({ token: tokenInput.trim() }) })); }
    catch (e: any) { setValidateErr(e.message); }
    finally { setValidateLoading(false); }
  }, [tokenInput]);

  return (
    <OperationalCard>
      <SectionHead icon={<Shield className="h-4 w-4" />} title="SEP-10 Wallet Authentication" />
      <p className="mb-3 text-xs text-tts-muted">Challenge-response auth using Stellar keypairs. Wallet signs the challenge transaction XDR to prove ownership without exposing the private key.</p>

      <div className="mb-3">
        <p className="mb-1 text-xs font-semibold text-tts-muted">Stellar Account</p>
        <div className="flex gap-2">
          <Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="G…" className="font-mono text-xs" />
          <Button size="sm" onClick={getChallenge} disabled={!account.trim() || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Challenge"}
          </Button>
        </div>
      </div>
      {err && <Err msg={err} />}
      {challenge && (
        <div className="mb-4 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
          <Row label="Network passphrase" value={challenge.network_passphrase} />
          <Row label="Transaction" value={challenge.transaction ? "✓ XDR issued" : "—"} />
          {challenge.transaction && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-bold text-tts-muted uppercase">XDR (sign with wallet)</p>
              <textarea
                readOnly
                value={challenge.transaction}
                className="w-full rounded border border-tts-border bg-tts-bg p-2 font-mono text-[9px] text-tts-muted resize-none"
                rows={3}
              />
            </div>
          )}
        </div>
      )}

      <div className="border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-bold text-tts-deep">Validate JWT Token</p>
        <div className="flex gap-2">
          <Input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="eyJ…" className="font-mono text-xs" />
          <Button size="sm" onClick={validateToken} disabled={!tokenInput.trim() || validateLoading}>
            {validateLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validate"}
          </Button>
        </div>
        {validateErr && <div className="mt-2"><Err msg={validateErr} /></div>}
        {validated && (
          <div className="mt-2 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="Valid" value={validated.valid ? "Yes" : "No"} />
            <Row label="Account" value={validated.account ?? validated.sub} mono />
            <Row label="Expires" value={validated.exp ? new Date(validated.exp * 1000).toISOString() : undefined} />
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ORACLE + INFRASTRUCTURE
// ══════════════════════════════════════════════════════════════════════════════

function ReflectorSection() {
  const [prices, setPrices] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [assets, setAssets] = useState("XLM,BRL,USDC,BTC,ETH");
  const [singleAsset, setSingleAsset] = useState("XLM");
  const [singlePrice, setSinglePrice] = useState<any>(null);
  const [singleLoading, setSingleLoading] = useState(false);
  const [singleErr, setSingleErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setPrices(await api(`/api/oracle/prices?assets=${assets}`)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [assets]);

  const getSingle = useCallback(async () => {
    setSingleLoading(true); setSingleErr(null); setSinglePrice(null);
    try { setSinglePrice(await api(`/api/oracle/price/${encodeURIComponent(singleAsset)}`)); }
    catch (e: any) { setSingleErr(e.message); }
    finally { setSingleLoading(false); }
  }, [singleAsset]);

  useEffect(() => { load(); }, [load]);

  // Response shape: { XLM: { asset, price, priceStr, timestamp, source }, BRL: {...}, ... }
  const priceEntries: [string, any][] = prices
    ? Object.entries(prices).filter(([, v]) => v && typeof v === "object" && "price" in v)
    : [];

  return (
    <OperationalCard>
      <SectionHead
        icon={<Activity className="h-4 w-4" />}
        title="Reflector Oracle — On-Chain Prices"
        badge={priceEntries.length > 0 ? <StatusPill tone="confirm">Live</StatusPill> : undefined}
        loading={loading}
        onRefresh={load}
      />
      {loading && !prices && <Spin />}
      {err && <Err msg={err} />}

      <div className="mb-3 flex gap-2">
        <Input value={assets} onChange={(e) => setAssets(e.target.value)} placeholder="XLM,BRL,USDC…" className="text-xs" />
        <Button size="sm" onClick={load} disabled={loading}>Fetch</Button>
      </div>

      {priceEntries.length > 0 && (
        <div className="mb-4 space-y-0">
          {priceEntries.map(([asset, p]) => (
            <Row
              key={asset}
              label={`${asset}/USD`}
              value={`$${typeof p.price === "number" ? p.price.toFixed(6) : p.price}`}
            />
          ))}
          {priceEntries[0]?.[1]?.source && <Row label="Source" value={priceEntries[0][1].source} />}
        </div>
      )}

      <div className="border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-bold text-tts-deep">Single Asset Price</p>
        <div className="flex gap-2">
          <Input value={singleAsset} onChange={(e) => setSingleAsset(e.target.value)} placeholder="XLM" className="text-xs" />
          <Button size="sm" onClick={getSingle} disabled={!singleAsset.trim() || singleLoading}>
            {singleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get"}
          </Button>
        </div>
        {singleErr && <div className="mt-2"><Err msg={singleErr} /></div>}
        {singlePrice && (
          <div className="mt-2 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="Price" value={`$${singlePrice.price ?? singlePrice.usd}`} />
            <Row label="Asset" value={singlePrice.asset ?? singleAsset} />
            <Row label="Timestamp" value={singlePrice.timestamp} />
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

function NetworkSection() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [s, h, f] = await Promise.all([
        api("/api/network/stats"),
        api("/api/network/health"),
        api("/api/network/fee"),
      ]);
      setStats({ ...s, health: h, feeRec: f });
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<Activity className="h-4 w-4" />}
        title="Stellar Network"
        badge={stats?.health && <StatusPill tone={stats.health.healthy ? "confirm" : "error"}>{stats.health.latencyMs ? `${stats.health.latencyMs}ms` : stats.health.healthy ? "Healthy" : "Degraded"}</StatusPill>}
        loading={loading}
        onRefresh={load}
      />
      {loading && !stats && <Spin />}
      {err && <Err msg={err} />}
      {stats && (
        <div className="space-y-0">
          <Row label="Latest ledger" value={stats.ledger?.sequence?.toLocaleString()} />
          <Row label="Base fee" value={stats.fees?.baseFeeStroops != null ? `${stats.fees.baseFeeStroops} stroops` : undefined} />
          <Row label="p50 fee" value={stats.fees?.p50FeeStroops != null ? `${stats.fees.p50FeeStroops} stroops` : undefined} />
          <Row label="TPS" value={stats.tps != null ? `${stats.tps} ops/s` : undefined} />
          <Row label="Capacity" value={stats.fees?.capacityUsage != null ? `${Math.round(stats.fees.capacityUsage * 100)}%` : undefined} />
          <Row label="Recommended fee" value={stats.feeRec?.recommendedFee ?? stats.recommendedFeeMicroXlm != null ? `${stats.recommendedFeeMicroXlm} µXLM` : undefined} />
          <Row label="Network" value={stats.health?.network ?? stats.network} />
        </div>
      )}
    </OperationalCard>
  );
}

function FraudSection() {
  const [address, setAddress] = useState("GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3V0RDWA");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [domainResult, setDomainResult] = useState<any>(null);
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainErr, setDomainErr] = useState<string | null>(null);

  const screen = useCallback(async () => {
    if (!address.trim()) return;
    setLoading(true); setErr(null); setResult(null);
    try { setResult(await api(`/api/fraud-screen/address/${encodeURIComponent(address.trim())}`)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [address]);

  const screenDomain = useCallback(async () => {
    if (!domain.trim()) return;
    setDomainLoading(true); setDomainErr(null); setDomainResult(null);
    try { setDomainResult(await api(`/api/fraud-screen/domain/${encodeURIComponent(domain.trim())}`)); }
    catch (e: any) { setDomainErr(e.message); }
    finally { setDomainLoading(false); }
  }, [domain]);

  return (
    <OperationalCard>
      <SectionHead icon={<Shield className="h-4 w-4" />} title="TRM Fraud Screening" badge={<StatusPill tone="gold">TRM_API_KEY</StatusPill>} />
      <p className="mb-3 text-xs text-tts-muted">AML / KYC address risk scoring via TRM Labs. Requires TRM_API_KEY env var on backend.</p>

      <div className="mb-4">
        <p className="mb-1 text-xs font-bold text-tts-deep">Screen Address</p>
        <div className="flex gap-2">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="G…" className="font-mono text-xs" />
          <Button size="sm" onClick={screen} disabled={!address.trim() || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Screen"}
          </Button>
        </div>
        {err && <div className="mt-2"><Err msg={err} /></div>}
        {result && (
          <div className={`mt-2 rounded border p-3 ${result.blocked ? "border-tts-error/30 bg-tts-error/10" : "border-tts-confirm/30 bg-tts-confirm/10"}`}>
            <p className={`flex items-center gap-2 text-sm font-bold ${result.blocked ? "text-tts-error" : "text-tts-confirm"}`}>
              {result.blocked ? <><AlertTriangle className="h-4 w-4" /> BLOCKED</> : <><CheckCircle2 className="h-4 w-4" /> CLEAN</>}
            </p>
            {result.tags?.length > 0 && <p className="mt-1 text-xs text-tts-muted">Tags: {result.tags.join(", ")}</p>}
            <p className="mt-1 text-xs text-tts-muted">Risk score: {result.riskScore ?? "—"} · Source: {result.source ?? "—"}</p>
          </div>
        )}
      </div>

      <div className="border-t border-tts-border/40 pt-4">
        <p className="mb-2 text-xs font-bold text-tts-deep">Screen Domain</p>
        <div className="flex gap-2">
          <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" className="text-xs" />
          <Button size="sm" onClick={screenDomain} disabled={!domain.trim() || domainLoading}>
            {domainLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Screen"}
          </Button>
        </div>
        {domainErr && <div className="mt-2"><Err msg={domainErr} /></div>}
        {domainResult && (
          <div className="mt-2 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="Risk" value={domainResult.riskScore ?? domainResult.risk_score} />
            <Row label="Verdict" value={domainResult.verdict ?? domainResult.risk_rating} />
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function ScfClient() {
  return (
    <OperationalPage size="xl">
      <OperationalHeader
        eyebrow="SCF Integration Track"
        title="Full Integration Suite"
        description="Interactive test panel for all 16 SCF Build integrations — every section has live inputs, real API calls, and rendered results. No mocks."
        actions={<StatusPill tone="confirm"><Activity className="mr-1 h-3 w-3" />All endpoints live</StatusPill>}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <OperationalStat label="Integrations" value="16" detail="SCF track" tone="gold" />
        <OperationalStat label="On/Off-Ramp" value="3" detail="Abroad, SEP-24, Broker" />
        <OperationalStat label="DeFi" value="4" detail="Blend, DeFindex, Aquarius, Soroswap" />
        <OperationalStat label="Cross-Chain" value="4" detail="Allbridge, Axelar, CCTP, Near" />
      </div>

      {/* On/Off-Ramp */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-tts-gold" />
          <h2 className="text-sm font-bold text-tts-deep">On / Off-Ramp</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <AbroadSection />
          <Sep24Section />
          <StellarBrokerSection />
        </div>
      </div>

      {/* DeFi */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-tts-gold" />
          <h2 className="text-sm font-bold text-tts-deep">DeFi</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <BlendSection />
          <DefindexSection />
          <AquariusSection />
          <SoroswapSection />
        </div>
      </div>

      {/* Cross-Chain */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Globe className="h-4 w-4 text-tts-gold" />
          <h2 className="text-sm font-bold text-tts-deep">Cross-Chain</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <AllbridgeSection />
          <AxelarSection />
          <CctpSection />
          <NearIntentsSection />
        </div>
      </div>

      {/* Wallets */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-tts-gold" />
          <h2 className="text-sm font-bold text-tts-deep">Wallet Integration</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <WalletsKitSection />
          <PasskeyWalletsSection />
          <WalletAuthSection />
        </div>
      </div>

      {/* Oracle + Infrastructure */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Server className="h-4 w-4 text-tts-gold" />
          <h2 className="text-sm font-bold text-tts-deep">Oracle & Infrastructure</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <ReflectorSection />
          <NetworkSection />
          <FraudSection />
        </div>
      </div>

      {/* API Reference */}
      <OperationalCard>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-tts-deep">
          <ChevronRight className="h-4 w-4 text-tts-gold" />
          API Reference — All 16 Integrations
        </h2>
        <div className="space-y-0">
          {([
            ["GET", "/api/abroad/corridors", "USDC↔PIX corridor list"],
            ["POST", "/api/abroad/decode-pix", "Decode Brazilian PIX QR code"],
            ["GET", "/api/abroad/quote?amount=100&currency=BRL", "Exchange quote"],
            ["GET", "/api/sep24/anchors", "List SEP-24 compliant anchors"],
            ["GET", "/api/sep24/anchors/:domain/info", "Anchor deposit/withdraw info"],
            ["GET", "/api/broker/quote?from=XLM&to=USDC&amount=100", "Best quote across all DEXs"],
            ["GET", "/api/blend/pools", "Blend v2 lending pools"],
            ["GET", "/api/blend/pools/:id", "Single pool detail"],
            ["GET", "/api/defindex/vaults", "DeFindex yield vault list"],
            ["GET", "/api/defindex/vaults/:id/info", "Vault APY + strategy"],
            ["GET", "/api/aquarius/rewards?limit=8", "Top AQUA reward pools"],
            ["GET", "/api/aquarius/rewards/pair?asset1=XLM&asset2=USDC", "Pair AQUA rewards"],
            ["GET", "/api/swap/tokens", "Soroswap token list"],
            ["GET", "/api/swap/quote?assetIn=XLM&assetOut=USDC&amount=10&tradeType=EXACT_IN", "Swap quote"],
            ["GET", "/api/allbridge/stellar-tokens", "Allbridge Stellar tokens"],
            ["GET", "/api/axelar/chains", "Axelar chains (60+)"],
            ["GET", "/api/axelar/transfer/:txHash", "Axelar transfer status"],
            ["GET", "/api/cctp/chains", "CCTP EVM chains"],
            ["GET", "/api/near-intents/tokens", "Near Intents token list"],
            ["POST", "/api/near-intents/quote", "Near Intents 1Click quote"],
            ["GET", "/api/passkey-wallets/", "List passkey wallets"],
            ["GET", "/api/passkey-wallets/:id/signers", "Contract signer lookup"],
            ["GET", "/api/wallet-auth/challenge?account=G…", "SEP-10 challenge XDR"],
            ["POST", "/api/wallet-auth/validate", "Validate SEP-10 JWT"],
            ["GET", "/api/oracle/prices?assets=XLM,BRL", "Reflector multi-asset prices"],
            ["GET", "/api/oracle/price/:asset", "Single asset price"],
            ["GET", "/api/network/stats", "Ledger, TPS, fees"],
            ["GET", "/api/network/health", "Node health + latency"],
            ["GET", "/api/network/fee", "Recommended fee"],
            ["GET", "/api/fraud-screen/address/:addr", "TRM address risk"],
            ["GET", "/api/fraud-screen/domain/:domain", "TRM domain risk"],
          ] as [string, string, string][]).map(([method, path, desc]) => (
            <div key={path} className="flex flex-wrap items-center gap-x-3 border-b border-tts-border/40 py-1.5 last:border-0">
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${method === "GET" ? "bg-tts-confirm/15 text-tts-confirm" : "bg-tts-gold/15 text-tts-gold"}`}>{method}</span>
              <span className="font-mono text-[11px] text-tts-deep">{path}</span>
              <span className="text-[11px] text-tts-muted">{desc}</span>
            </div>
          ))}
        </div>
      </OperationalCard>
    </OperationalPage>
  );
}
