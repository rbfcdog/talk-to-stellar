"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowRightLeft,
  CheckCircle2,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  XCircle,
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

function Spin() {
  return (
    <div className="flex items-center gap-2 py-3 text-xs text-tts-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading…
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {msg}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between border-b border-tts-border/40 py-1.5 last:border-0">
      <span className="text-xs text-tts-muted">{label}</span>
      <span className={`text-xs font-semibold text-tts-deep ${mono ? "font-mono" : ""}`}>
        {String(value)}
      </span>
    </div>
  );
}

function SectionHead({
  icon,
  title,
  badge,
  loading,
  onRefresh,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  loading?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-tts-muted">{icon}</span>
        <h3 className="text-sm font-bold text-tts-deep">{title}</h3>
        {badge && <span>{badge}</span>}
      </div>
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded p-1 text-tts-muted transition-colors hover:text-tts-deep disabled:opacity-40"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}

// ── 1. Abroad Finance ─────────────────────────────────────────────────────────

function AbroadPanel() {
  const [corridors, setCorridors] = useState<any>(null);
  const [loadingCorridors, setLoadingCorridors] = useState(false);
  const [errCorridors, setErrCorridors] = useState<string | null>(null);

  const [amount, setAmount] = useState("100");
  const [quote, setQuote] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [errQuote, setErrQuote] = useState<string | null>(null);

  const [pixPayload, setPixPayload] = useState("");
  const [decoded, setDecoded] = useState<any>(null);
  const [loadingPix, setLoadingPix] = useState(false);
  const [errPix, setErrPix] = useState<string | null>(null);

  const loadCorridors = useCallback(async () => {
    setLoadingCorridors(true); setErrCorridors(null);
    try { setCorridors(await api("/api/abroad/corridors")); }
    catch (e: any) { setErrCorridors(e.message); }
    finally { setLoadingCorridors(false); }
  }, []);

  const getQuote = useCallback(async () => {
    setLoadingQuote(true); setErrQuote(null); setQuote(null);
    try { setQuote(await api(`/api/abroad/quote?amount=${encodeURIComponent(amount)}`)); }
    catch (e: any) { setErrQuote(e.message); }
    finally { setLoadingQuote(false); }
  }, [amount]);

  const decodePix = useCallback(async () => {
    if (!pixPayload.trim()) return;
    setLoadingPix(true); setErrPix(null); setDecoded(null);
    try {
      setDecoded(await api("/api/abroad/decode-pix", {
        method: "POST",
        body: JSON.stringify({ payload: pixPayload.trim() }),
      }));
    }
    catch (e: any) { setErrPix(e.message); }
    finally { setLoadingPix(false); }
  }, [pixPayload]);

  useEffect(() => { loadCorridors(); }, [loadCorridors]);

  const stellar = corridors?.stellar_usdc_pix;
  const totalCorridors = corridors?.corridors?.length ?? 0;

  return (
    <OperationalCard>
      <SectionHead
        icon={<Globe className="h-4 w-4" />}
        title="Abroad Finance — USDC→PIX"
        badge={
          stellar
            ? <StatusPill tone="confirm">Stellar corridor live</StatusPill>
            : totalCorridors > 0
            ? <StatusPill tone="gold">{totalCorridors} corridors (no Stellar)</StatusPill>
            : undefined
        }
        loading={loadingCorridors}
        onRefresh={loadCorridors}
      />
      {loadingCorridors && !corridors && <Spin />}
      {errCorridors && <Err msg={errCorridors} />}

      {/* Stellar corridor info */}
      {stellar && (
        <div className="mb-5 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
          <p className="mb-2 text-xs font-semibold text-tts-deep">Stellar USDC→PIX Corridor</p>
          <Row label="Blockchain" value={stellar.blockchain} />
          <Row label="Crypto" value={stellar.cryptoCurrency} />
          <Row label="Fiat" value={stellar.targetCurrency} />
          <Row label="Payment method" value={stellar.paymentMethod} />
          <Row
            label="Limits"
            value={`${stellar.minAmount} – ${stellar.maxAmount ?? "∞"} USDC`}
          />
        </div>
      )}

      {!stellar && corridors && (
        <div className="mb-4 rounded border border-tts-gold/30 bg-tts-gold/10 p-2 text-xs text-tts-gold">
          Stellar corridor not currently active. {totalCorridors} other corridors available (Solana, Celo…).
        </div>
      )}

      {/* Quote */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold text-tts-muted">USDC → BRL Quote</p>
        <div className="flex gap-2">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="USDC amount"
            className="text-xs"
          />
          <Button size="sm" onClick={getQuote} disabled={loadingQuote}>
            {loadingQuote ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Get Quote"}
          </Button>
        </div>
        {loadingQuote && <div className="mt-2"><Spin /></div>}
        {errQuote && <div className="mt-2"><Err msg={errQuote} /></div>}
        {quote && (
          <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            {!quote.available ? (
              <p className="text-xs text-tts-muted">{quote.message}</p>
            ) : (
              <>
                <Row label="Input" value={`${quote.inputAmount} USDC`} />
                <Row label="Output" value={`${quote.outputAmount?.toFixed(2)} BRL`} />
                <Row label="Rate" value={`1 USDC = ${quote.exchangeRate?.toFixed(4)} BRL`} />
                <Row label="Fee" value={`${quote.fee} USDC (${quote.feePercent}%)`} />
                {quote.expiresAt && (
                  <Row label="Expires" value={new Date(quote.expiresAt).toLocaleTimeString()} />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* PIX QR decode */}
      <div>
        <p className="mb-2 text-xs font-semibold text-tts-muted">Decode PIX QR Code</p>
        <p className="mb-2 text-xs text-tts-muted">
          Paste the raw string from a PIX QR code (starts with <span className="font-mono">00020126…</span>)
        </p>
        <textarea
          value={pixPayload}
          onChange={(e) => setPixPayload(e.target.value)}
          placeholder="00020126580014br.gov.bcb.pix..."
          className="mb-2 w-full rounded border border-tts-border bg-tts-bg p-2 font-mono text-xs text-tts-deep placeholder:text-tts-muted focus:outline-none focus:ring-1 focus:ring-tts-primary"
          rows={3}
        />
        <Button size="sm" onClick={decodePix} disabled={loadingPix || !pixPayload.trim()}>
          {loadingPix ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Decode"}
        </Button>
        {errPix && <div className="mt-2"><Err msg={errPix} /></div>}
        {decoded && (
          <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="PIX key" value={decoded.pixKey} mono />
            <Row label="Recipient" value={decoded.recipientName} />
            <Row label="Merchant" value={decoded.merchantName} />
            <Row label="Amount" value={decoded.amount != null ? `R$ ${decoded.amount}` : undefined} />
            <Row label="City" value={decoded.city} />
            <Row label="Description" value={decoded.description} />
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

// ── 2. Reflector Oracle ───────────────────────────────────────────────────────

const PRESET_ASSETS = ["XLM", "BRL", "USDC", "ETH", "BTC"];

function ReflectorPanel() {
  const [rates, setRates] = useState<any>(null);
  const [loadingRates, setLoadingRates] = useState(false);
  const [errRates, setErrRates] = useState<string | null>(null);

  const [customAsset, setCustomAsset] = useState("");
  const [price, setPrice] = useState<any>(null);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [errPrice, setErrPrice] = useState<string | null>(null);

  const [multiAssets, setMultiAssets] = useState("XLM,BRL,USDC");
  const [multiPrices, setMultiPrices] = useState<any>(null);
  const [loadingMulti, setLoadingMulti] = useState(false);
  const [errMulti, setErrMulti] = useState<string | null>(null);

  const loadRates = useCallback(async () => {
    setLoadingRates(true); setErrRates(null);
    try { setRates(await api("/api/reflector/rates")); }
    catch (e: any) { setErrRates(e.message); }
    finally { setLoadingRates(false); }
  }, []);

  const fetchSingle = useCallback(async (asset: string) => {
    if (!asset.trim()) return;
    setLoadingPrice(true); setErrPrice(null); setPrice(null);
    try { setPrice(await api(`/api/reflector/price/${encodeURIComponent(asset.trim())}`)); }
    catch (e: any) { setErrPrice(e.message); }
    finally { setLoadingPrice(false); }
  }, []);

  const fetchMulti = useCallback(async () => {
    setLoadingMulti(true); setErrMulti(null); setMultiPrices(null);
    try {
      const d = await api(`/api/reflector/prices?assets=${encodeURIComponent(multiAssets)}`);
      setMultiPrices(d);
    }
    catch (e: any) { setErrMulti(e.message); }
    finally { setLoadingMulti(false); }
  }, [multiAssets]);

  useEffect(() => { loadRates(); }, [loadRates]);

  return (
    <OperationalCard>
      <SectionHead
        icon={<Activity className="h-4 w-4" />}
        title="Reflector Oracle — Price Feeds"
        badge={rates ? <StatusPill tone="confirm">Live</StatusPill> : undefined}
        loading={loadingRates}
        onRefresh={loadRates}
      />

      {/* Core rates */}
      {loadingRates && !rates && <Spin />}
      {errRates && <Err msg={errRates} />}
      {rates && (
        <div className="mb-5 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
          <p className="mb-2 text-xs font-semibold text-tts-deep">Agent Rates</p>
          <Row label="XLM/USD" value={`$${rates.xlm_usd?.toFixed(6)}`} />
          <Row label="BRL/USD" value={`$${rates.brl_usd?.toFixed(6)}`} />
          <Row label="USDC/USD" value="$1.000000" />
          <Row
            label="USD→BRL"
            value={rates.brl_usd ? `R$ ${(1 / rates.brl_usd).toFixed(4)}` : undefined}
          />
          {rates.meta?.xlm?.source && <Row label="XLM source" value={rates.meta.xlm.source} />}
          {rates.meta?.xlm?.age_seconds != null && (
            <Row label="Cache age" value={`${rates.meta.xlm.age_seconds}s`} />
          )}
        </div>
      )}

      {/* Single asset lookup */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold text-tts-muted">Single Asset Price</p>
        <div className="mb-2 flex flex-wrap gap-1">
          {PRESET_ASSETS.map((a) => (
            <button
              key={a}
              onClick={() => fetchSingle(a)}
              className="rounded border border-tts-border px-2 py-0.5 text-xs text-tts-muted transition-colors hover:border-tts-primary hover:text-tts-deep"
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={customAsset}
            onChange={(e) => setCustomAsset(e.target.value)}
            placeholder="e.g. ETH, BTC, AQUA…"
            className="text-xs"
            onKeyDown={(e) => e.key === "Enter" && fetchSingle(customAsset)}
          />
          <Button size="sm" onClick={() => fetchSingle(customAsset)} disabled={loadingPrice}>
            {loadingPrice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fetch"}
          </Button>
        </div>
        {errPrice && <div className="mt-2"><Err msg={errPrice} /></div>}
        {price && (
          <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="Asset" value={price.asset} />
            <Row label="Price (USD)" value={`$${price.price?.toFixed(7)}`} />
            <Row label="Source" value={price.source} />
            <Row label="Age" value={`${price.age_seconds}s`} />
          </div>
        )}
      </div>

      {/* Multi-asset */}
      <div>
        <p className="mb-2 text-xs font-semibold text-tts-muted">Multi-Asset Prices</p>
        <div className="flex gap-2">
          <Input
            value={multiAssets}
            onChange={(e) => setMultiAssets(e.target.value)}
            placeholder="XLM,BRL,USDC,ETH"
            className="text-xs"
          />
          <Button size="sm" onClick={fetchMulti} disabled={loadingMulti}>
            {loadingMulti ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Fetch All"}
          </Button>
        </div>
        {errMulti && <div className="mt-2"><Err msg={errMulti} /></div>}
        {multiPrices && (
          <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            {Object.entries(multiPrices)
              .filter(([, v]) => v && typeof v === "object" && "price" in (v as any))
              .map(([asset, p]: any) => (
                <Row key={asset} label={`${asset}/USD`} value={`$${p.price?.toFixed(6)}`} />
              ))}
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

// ── 3. Fraud Screening ───────────────────────────────────────────────────────

const SAMPLE_ADDRESSES = [
  { label: "Binance", address: "GBZ35ZJRIKJGYH5PBKLKOZ5L5OBJWKIY3LHAZK3MQHQ3XBBN7DYHXOR" },
  { label: "Kraken", address: "GA7FCCMTTSUIC37PODEL6EOOSPDRILP6OQI5FWCWDDVDBLJV72W6RINZ" },
  { label: "Random", address: "GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37" },
];

function FraudPanel() {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [domain, setDomain] = useState("");
  const [domainResult, setDomainResult] = useState<any>(null);
  const [loadingDomain, setLoadingDomain] = useState(false);
  const [errDomain, setErrDomain] = useState<string | null>(null);

  const [batchInput, setBatchInput] = useState(
    SAMPLE_ADDRESSES.map((s) => s.address).join("\n")
  );
  const [batchResult, setBatchResult] = useState<any>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [errBatch, setErrBatch] = useState<string | null>(null);

  const screen = useCallback(async (addr: string) => {
    if (!addr.trim()) return;
    setLoading(true); setErr(null); setResult(null);
    try { setResult(await api(`/api/fraud-screening/address/${encodeURIComponent(addr.trim())}`)); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  const screenDomain = useCallback(async () => {
    if (!domain.trim()) return;
    setLoadingDomain(true); setErrDomain(null); setDomainResult(null);
    try { setDomainResult(await api(`/api/fraud-screening/domain/${encodeURIComponent(domain.trim())}`)); }
    catch (e: any) { setErrDomain(e.message); }
    finally { setLoadingDomain(false); }
  }, [domain]);

  const screenBatch = useCallback(async () => {
    const addresses = batchInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (!addresses.length) return;
    setLoadingBatch(true); setErrBatch(null); setBatchResult(null);
    try {
      setBatchResult(await api("/api/fraud-screening/batch", {
        method: "POST",
        body: JSON.stringify({ addresses }),
      }));
    }
    catch (e: any) { setErrBatch(e.message); }
    finally { setLoadingBatch(false); }
  }, [batchInput]);

  function RiskBadge({ r }: { r: any }) {
    if (r.isMalicious) return <StatusPill tone="error">Malicious</StatusPill>;
    if (r.isExchange) return <StatusPill tone="gold">Exchange</StatusPill>;
    if (r.isAnchor) return <StatusPill tone="confirm">Anchor</StatusPill>;
    return <StatusPill tone="confirm">Clean</StatusPill>;
  }

  return (
    <OperationalCard>
      <SectionHead
        icon={<Shield className="h-4 w-4" />}
        title="Fraud Screening — StellarExpert"
        badge={<StatusPill tone="confirm">No API key needed</StatusPill>}
      />
      <p className="mb-5 text-xs text-tts-muted">
        Screens Stellar addresses against StellarExpert's directory. Used before every payment to flag malicious wallets, exchanges, and anchors.
      </p>

      {/* Single address */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold text-tts-muted">Screen Address</p>
        <div className="mb-2 flex flex-wrap gap-1">
          {SAMPLE_ADDRESSES.map((s) => (
            <button
              key={s.label}
              onClick={() => { setAddress(s.address); screen(s.address); }}
              className="rounded border border-tts-border px-2 py-0.5 text-xs text-tts-muted transition-colors hover:border-tts-primary hover:text-tts-deep"
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="G... Stellar address"
            className="font-mono text-xs"
            onKeyDown={(e) => e.key === "Enter" && screen(address)}
          />
          <Button size="sm" onClick={() => screen(address)} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {err && <div className="mt-2"><Err msg={err} /></div>}
        {result && (
          <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs text-tts-muted">{result.address?.slice(0, 20)}…</span>
              <RiskBadge r={result} />
            </div>
            {result.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {result.tags.map((t: string) => (
                  <span key={t} className="rounded border border-tts-border px-1.5 py-0.5 text-xs text-tts-muted">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {result.warning && (
              <p className="mt-2 text-xs font-semibold text-tts-gold">{result.warning}</p>
            )}
            {result.note && (
              <p className="mt-1 text-xs text-tts-muted">{result.note}</p>
            )}
          </div>
        )}
      </div>

      {/* Domain */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold text-tts-muted">Screen Domain</p>
        <div className="flex gap-2">
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. lobstr.co, binance.com"
            className="text-xs"
            onKeyDown={(e) => e.key === "Enter" && screenDomain()}
          />
          <Button size="sm" onClick={screenDomain} disabled={loadingDomain}>
            {loadingDomain ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Screen"}
          </Button>
        </div>
        {errDomain && <div className="mt-2"><Err msg={errDomain} /></div>}
        {domainResult && (
          <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="Domain" value={domainResult.domain ?? domain} />
            {domainResult.tags?.length > 0 ? (
              <div className="flex flex-wrap gap-1 pt-1">
                {domainResult.tags.map((t: string) => (
                  <span key={t} className="rounded border border-tts-border px-1.5 py-0.5 text-xs text-tts-muted">{t}</span>
                ))}
              </div>
            ) : (
              <p className="pt-1 text-xs text-tts-muted">No flags found for this domain.</p>
            )}
          </div>
        )}
      </div>

      {/* Batch */}
      <div>
        <p className="mb-2 text-xs font-semibold text-tts-muted">Batch Screen (up to 50)</p>
        <textarea
          value={batchInput}
          onChange={(e) => setBatchInput(e.target.value)}
          className="mb-2 w-full rounded border border-tts-border bg-tts-bg p-2 font-mono text-xs text-tts-deep placeholder:text-tts-muted focus:outline-none focus:ring-1 focus:ring-tts-primary"
          rows={4}
          placeholder="One address per line…"
        />
        <Button size="sm" onClick={screenBatch} disabled={loadingBatch}>
          {loadingBatch ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Screening…</> : "Screen All"}
        </Button>
        {errBatch && <div className="mt-2"><Err msg={errBatch} /></div>}
        {batchResult?.results && (
          <div className="mt-3 space-y-1">
            {batchResult.results.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded border border-tts-border bg-tts-bg px-3 py-1.5">
                <span className="font-mono text-xs text-tts-muted">{r.address?.slice(0, 12)}…</span>
                <div className="flex items-center gap-2">
                  {r.tags?.length > 0 && (
                    <span className="text-xs text-tts-muted">{r.tags.join(", ")}</span>
                  )}
                  {r.isMalicious
                    ? <XCircle className="h-3.5 w-3.5 text-red-400" />
                    : <CheckCircle2 className="h-3.5 w-3.5 text-tts-confirm" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </OperationalCard>
  );
}

// ── 4. Soroswap ───────────────────────────────────────────────────────────────

const COMMON_PAIRS = [
  { from: "XLM", to: "USDC" },
  { from: "USDC", to: "XLM" },
  { from: "USDC", to: "BRZ" },
  { from: "XLM", to: "AQUA" },
];

function SoroswapPanel() {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [errTokens, setErrTokens] = useState<string | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");

  const [assetIn, setAssetIn] = useState("USDC");
  const [assetOut, setAssetOut] = useState("XLM");
  const [amount, setAmount] = useState("10");
  const [tradeType, setTradeType] = useState<"EXACT_IN" | "EXACT_OUT">("EXACT_IN");
  const [quote, setQuote] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [errQuote, setErrQuote] = useState<string | null>(null);

  const [senderAddress, setSenderAddress] = useState("");
  const [xdr, setXdr] = useState<any>(null);
  const [loadingXdr, setLoadingXdr] = useState(false);
  const [errXdr, setErrXdr] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setLoadingTokens(true); setErrTokens(null);
    try {
      const d = await api("/api/soroswap/tokens");
      if (d?.error) { setErrTokens(`Soroswap API temporarily unavailable: ${d.error}`); return; }
      setTokens(Array.isArray(d) ? d : d.tokens ?? []);
    }
    catch (e: any) { setErrTokens(e.message); }
    finally { setLoadingTokens(false); }
  }, []);

  const getQuote = useCallback(async () => {
    setLoadingQuote(true); setErrQuote(null); setQuote(null); setXdr(null);
    try {
      setQuote(await api(
        `/api/soroswap/quote?assetIn=${encodeURIComponent(assetIn)}&assetOut=${encodeURIComponent(assetOut)}&amount=${encodeURIComponent(amount)}&tradeType=${tradeType}`
      ));
    }
    catch (e: any) { setErrQuote(e.message); }
    finally { setLoadingQuote(false); }
  }, [assetIn, assetOut, amount, tradeType]);

  const buildXdr = useCallback(async () => {
    if (!quote || !senderAddress.trim()) return;
    setLoadingXdr(true); setErrXdr(null); setXdr(null);
    try {
      setXdr(await api("/api/soroswap/build", {
        method: "POST",
        body: JSON.stringify({ quote, senderAddress: senderAddress.trim() }),
      }));
    }
    catch (e: any) { setErrXdr(e.message); }
    finally { setLoadingXdr(false); }
  }, [quote, senderAddress]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const filteredTokens = tokenSearch
    ? tokens.filter((t) =>
        (t.symbol ?? "").toLowerCase().includes(tokenSearch.toLowerCase()) ||
        (t.name ?? "").toLowerCase().includes(tokenSearch.toLowerCase())
      )
    : tokens;

  return (
    <OperationalCard>
      <SectionHead
        icon={<ArrowRightLeft className="h-4 w-4" />}
        title="Soroswap — Multi-Protocol DEX"
        badge={
          tokens.length > 0
            ? <StatusPill tone="confirm">{tokens.length} tokens</StatusPill>
            : <StatusPill tone="gold">No API key</StatusPill>
        }
        loading={loadingTokens}
        onRefresh={loadTokens}
      />

      {/* Quote */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-semibold text-tts-muted">Swap Quote</p>
        <div className="mb-2 flex flex-wrap gap-1">
          {COMMON_PAIRS.map((p) => (
            <button
              key={`${p.from}-${p.to}`}
              onClick={() => { setAssetIn(p.from); setAssetOut(p.to); }}
              className="rounded border border-tts-border px-2 py-0.5 text-xs text-tts-muted transition-colors hover:border-tts-primary hover:text-tts-deep"
            >
              {p.from}→{p.to}
            </button>
          ))}
        </div>
        <div className="mb-2 grid grid-cols-3 gap-2">
          <div>
            <p className="mb-1 text-xs text-tts-muted">From</p>
            <Input value={assetIn} onChange={(e) => setAssetIn(e.target.value)} className="text-xs" />
          </div>
          <div>
            <p className="mb-1 text-xs text-tts-muted">To</p>
            <Input value={assetOut} onChange={(e) => setAssetOut(e.target.value)} className="text-xs" />
          </div>
          <div>
            <p className="mb-1 text-xs text-tts-muted">Amount</p>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="text-xs" />
          </div>
        </div>
        <div className="mb-3 flex gap-2">
          {(["EXACT_IN", "EXACT_OUT"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTradeType(t)}
              className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                tradeType === t
                  ? "border-tts-primary bg-tts-primary/10 text-tts-primary"
                  : "border-tts-border text-tts-muted hover:text-tts-deep"
              }`}
            >
              {t === "EXACT_IN" ? "Exact in" : "Exact out"}
            </button>
          ))}
        </div>
        <Button size="sm" className="w-full" onClick={getQuote} disabled={loadingQuote}>
          {loadingQuote ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Getting quote…</> : "Get Quote"}
        </Button>
        {errQuote && <div className="mt-2"><Err msg={errQuote} /></div>}
        {quote && (
          <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3 space-y-0">
            <Row label="Input" value={`${quote.amountIn} ${quote.assetIn}`} />
            <Row label="Output" value={`${quote.amountOut} ${quote.assetOut}`} />
            <Row label="Price impact" value={`${quote.priceImpact?.toFixed(4)}%`} />
            <Row label="Protocols" value={quote.protocols?.join(", ")} />
          </div>
        )}
      </div>

      {/* Build XDR */}
      {quote && (
        <div className="mb-5">
          <p className="mb-2 text-xs font-semibold text-tts-muted">Build Swap Transaction (XDR)</p>
          <div className="flex gap-2">
            <Input
              value={senderAddress}
              onChange={(e) => setSenderAddress(e.target.value)}
              placeholder="G... your Stellar address"
              className="font-mono text-xs"
            />
            <Button size="sm" onClick={buildXdr} disabled={loadingXdr || !senderAddress.trim()}>
              {loadingXdr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {errXdr && <div className="mt-2"><Err msg={errXdr} /></div>}
          {xdr && (
            <div className="mt-3 rounded border border-tts-border bg-tts-bg p-3">
              <p className="mb-1 text-xs font-semibold text-tts-deep">Unsigned XDR</p>
              <p className="break-all font-mono text-[10px] text-tts-muted">{xdr.xdr}</p>
              <a
                href={`https://lab.stellar.org/transaction/sign?xdr=${encodeURIComponent(xdr.xdr)}&networkPassphrase=Public+Global+Stellar+Network+%3B+September+2015`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-xs text-tts-primary underline underline-offset-2"
              >
                Sign in Stellar Lab →
              </a>
            </div>
          )}
        </div>
      )}

      {/* Token list */}
      {loadingTokens && !tokens.length && <Spin />}
      {errTokens && <Err msg={errTokens} />}
      {tokens.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-tts-muted">Token List ({tokens.length})</p>
          <Input
            value={tokenSearch}
            onChange={(e) => setTokenSearch(e.target.value)}
            placeholder="Search tokens…"
            className="mb-2 text-xs"
          />
          <div className="max-h-48 overflow-y-auto space-y-0">
            {filteredTokens.slice(0, 100).map((t: any, i: number) => (
              <div key={i} className="flex justify-between border-b border-tts-border/40 py-1.5 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-tts-deep">{t.symbol}</span>
                  <span className="text-xs text-tts-muted">{t.name}</span>
                </div>
                <span className="font-mono text-[10px] text-tts-muted">{String(t.address ?? "").slice(0, 10)}…</span>
              </div>
            ))}
            {filteredTokens.length > 100 && (
              <p className="pt-1 text-xs text-tts-muted">+{filteredTokens.length - 100} more</p>
            )}
          </div>
        </div>
      )}
    </OperationalCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KeyIntegrationsClient() {
  return (
    <OperationalPage>
      <OperationalHeader
        title="Key Integrations"
        description="The 4 most impactful integrations for TalkToStellar — test every feature end to end."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OperationalStat label="No API key" value="3" detail="Reflector, Fraud, Soroswap" />
        <OperationalStat label="API key needed" value="1" detail="Abroad Finance (partner)" />
        <OperationalStat label="PIX QR decode" value="Free" detail="No key required" />
        <OperationalStat label="Swap build" value="XDR" detail="Sign in Stellar Lab" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AbroadPanel />
        <ReflectorPanel />
        <FraudPanel />
        <SoroswapPanel />
      </div>
    </OperationalPage>
  );
}
