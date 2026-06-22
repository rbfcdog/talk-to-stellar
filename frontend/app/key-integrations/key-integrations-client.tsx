"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  TrendingUp,
  Wallet,
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

// ── 1. Blend v2 Lending ────────────────────────────────────────────────────────

const BLEND_API = '/api/blend';

function BlendPanel() {
  const [pools, setPools] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api(`${BLEND_API}/pools`);
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
        Stellar DeFi lending — deposit USDC/XLM into permissionless pools and earn variable APY.
        Track on-chain contracts via StellarExpert.
      </p>
      {pools.length > 0 && (
        <div className="space-y-0">
          {pools.map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-tts-deep">{p.name ?? p.id}</span>
                <span className="ml-2 font-mono text-[10px] text-tts-muted/60">{p.contract?.slice(0, 10)}…</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.assets && (
                  <span className="text-[10px] text-tts-muted">{p.assets.join(', ')}</span>
                )}
                <StatusPill tone={p.on_chain ? 'confirm' : 'gold'}>{p.on_chain ? 'on-chain' : 'pending'}</StatusPill>
              </div>
            </div>
          ))}
        </div>
      )}
    </OperationalCard>
  );
}

// ── 2. Soroswap ───────────────────────────────────────────────────────────────

const COMMON_PAIRS = [
  { from: "XLM", to: "USDC" },
  { from: "USDC", to: "XLM" },
  { from: "USDC", to: "BRZ" },
  { from: "XLM", to: "AQUA" },
];

function freighterError(result: any): string | null {
  const error = result?.error;
  if (!error) return null;
  return typeof error === "string" ? error : error.message || "Freighter request failed";
}

function normalizeFreighterNetwork(network?: string): "TESTNET" | "PUBLIC" {
  const n = String(network || "").toUpperCase();
  return n === "TESTNET" ? "TESTNET" : "PUBLIC";
}

function networkPassphrase(network?: string): string {
  return normalizeFreighterNetwork(network) === "TESTNET"
    ? "Test SDF Network ; September 2015"
    : "Public Global Stellar Network ; September 2015";
}

function shortAddress(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

function stellarLabSignUrl(xdr: string, passphrase: string): string {
  return `https://lab.stellar.org/transaction/sign?xdr=${encodeURIComponent(xdr)}&networkPassphrase=${encodeURIComponent(passphrase)}`;
}

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
  const [swapNetwork, setSwapNetwork] = useState<"TESTNET" | "PUBLIC">("TESTNET");

  const [walletAddress, setWalletAddress] = useState("");
  const [walletNetwork, setWalletNetwork] = useState("");
  const [connectingWallet, setConnectingWallet] = useState(false);
  const [errWallet, setErrWallet] = useState<string | null>(null);

  const [signedXdr, setSignedXdr] = useState("");
  const [signerAddress, setSignerAddress] = useState("");
  const [signingXdr, setSigningXdr] = useState(false);
  const [submittingSwap, setSubmittingSwap] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const [errSubmit, setErrSubmit] = useState<string | null>(null);

  const loadTokens = useCallback(async () => {
    setLoadingTokens(true); setErrTokens(null);
    try {
      const d = await api("/api/swap/tokens");
      if (d?.error) { setErrTokens(`Soroswap API temporarily unavailable: ${d.error}`); return; }
      if (d?.network) setSwapNetwork(normalizeFreighterNetwork(d.network));
      setTokens(Array.isArray(d) ? d : d.tokens ?? []);
    }
    catch (e: any) { setErrTokens(e.message); }
    finally { setLoadingTokens(false); }
  }, []);

  const getQuote = useCallback(async () => {
    setLoadingQuote(true); setErrQuote(null); setQuote(null); setXdr(null); setSignedXdr(""); setSubmitResult(null); setErrSubmit(null);
    try {
      const result = await api(
        `/api/swap/quote?assetIn=${encodeURIComponent(assetIn)}&assetOut=${encodeURIComponent(assetOut)}&amount=${encodeURIComponent(amount)}&tradeType=${tradeType}`
      );
      if (result?.network) setSwapNetwork(normalizeFreighterNetwork(result.network));
      setQuote(result);
    }
    catch (e: any) { setErrQuote(e.message); }
    finally { setLoadingQuote(false); }
  }, [assetIn, assetOut, amount, tradeType]);

  const buildXdr = useCallback(async () => {
    if (!quote || !senderAddress.trim()) return;
    setLoadingXdr(true); setErrXdr(null); setXdr(null); setSignedXdr(""); setSubmitResult(null); setErrSubmit(null);
    try {
      const result = await api("/api/swap/build", {
        method: "POST",
        body: JSON.stringify({ quote, senderAddress: senderAddress.trim() }),
      });
      if (result?.network) setSwapNetwork(normalizeFreighterNetwork(result.network));
      setXdr(result);
    }
    catch (e: any) { setErrXdr(e.message); }
    finally { setLoadingXdr(false); }
  }, [quote, senderAddress]);

  const connectFreighter = useCallback(async () => {
    setConnectingWallet(true); setErrWallet(null);
    try {
      const freighter = await import("@stellar/freighter-api");
      const connected = await freighter.isConnected();
      const connectedError = freighterError(connected);
      if (connectedError) throw new Error(connectedError);
      if (!connected.isConnected) throw new Error("Freighter extension is not installed in this browser.");

      const access = await freighter.requestAccess();
      const accessError = freighterError(access);
      if (accessError) throw new Error(accessError);
      if (!access.address) throw new Error("Freighter did not return a public key.");

      const network = await freighter.getNetwork();
      const networkError = freighterError(network);
      if (networkError) throw new Error(networkError);

      setWalletAddress(access.address);
      setSenderAddress(access.address);
      setWalletNetwork(network.network || "");
    }
    catch (e: any) { setErrWallet(e.message); }
    finally { setConnectingWallet(false); }
  }, []);

  const signWithFreighter = useCallback(async () => {
    if (!xdr?.xdr) return;
    const address = walletAddress || senderAddress.trim();
    if (!address) {
      setErrWallet("Connect Freighter or enter a Stellar address first.");
      return;
    }

    setSigningXdr(true); setErrSubmit(null); setSignedXdr(""); setSignerAddress(""); setSubmitResult(null);
    try {
      const freighter = await import("@stellar/freighter-api");
      const network = normalizeFreighterNetwork(xdr.network || quote?.network || swapNetwork);
      const result = await freighter.signTransaction(xdr.xdr, {
        networkPassphrase: xdr.networkPassphrase || quote?.networkPassphrase || networkPassphrase(network),
        address,
      });
      const signError = freighterError(result);
      if (signError) throw new Error(signError);
      if (!result.signedTxXdr) throw new Error("Freighter did not return a signed XDR.");

      setSignedXdr(result.signedTxXdr);
      setSignerAddress(result.signerAddress || address);
    }
    catch (e: any) { setErrSubmit(e.message); }
    finally { setSigningXdr(false); }
  }, [quote?.network, senderAddress, swapNetwork, walletAddress, xdr]);

  const submitSignedSwap = useCallback(async () => {
    if (!signedXdr) return;
    setSubmittingSwap(true); setErrSubmit(null); setSubmitResult(null);
    try {
      const result = await api("/api/swap/send", {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      setSubmitResult(result);
    }
    catch (e: any) { setErrSubmit(e.message); }
    finally { setSubmittingSwap(false); }
  }, [signedXdr]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const filteredTokens = tokenSearch
    ? tokens.filter((t) =>
        (t.symbol ?? "").toLowerCase().includes(tokenSearch.toLowerCase()) ||
        (t.name ?? "").toLowerCase().includes(tokenSearch.toLowerCase())
      )
    : tokens;
  const canBuildXdr = Boolean(quote && quote.buildAvailable !== false);
  const activeNetwork = normalizeFreighterNetwork(xdr?.network || quote?.network || swapNetwork);
  const activePassphrase = xdr?.networkPassphrase || quote?.networkPassphrase || networkPassphrase(activeNetwork);
  const walletNetworkMatches = walletNetwork
    ? normalizeFreighterNetwork(walletNetwork) === activeNetwork
    : true;

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
            {quote.source && <Row label="Source" value={quote.source} />}
            {quote.warning && (
              <div className="pt-2 text-xs text-tts-gold">{quote.warning}</div>
            )}
          </div>
        )}
      </div>

      {/* Freighter wallet */}
      <div className="mb-5 rounded border border-tts-border bg-tts-bg p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="h-3.5 w-3.5 text-tts-muted" />
            <p className="text-xs font-semibold text-tts-deep">Freighter Wallet</p>
          </div>
          {walletAddress
            ? <StatusPill tone={walletNetworkMatches ? "confirm" : "gold"}>{walletNetwork || "Connected"}</StatusPill>
            : <StatusPill tone="gold">Not connected</StatusPill>}
        </div>
        <div className="mb-3 space-y-0">
          <Row label="Backend network" value={activeNetwork} />
          <Row label="Wallet" value={walletAddress ? shortAddress(walletAddress) : "Connect before signing"} mono />
          {!walletNetworkMatches && (
            <div className="pt-2 text-xs text-tts-gold">
              Freighter is on {walletNetwork}; switch to {activeNetwork} before signing.
            </div>
          )}
        </div>
        <Button size="sm" className="w-full" onClick={connectFreighter} disabled={connectingWallet}>
          {connectingWallet
            ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Connecting…</>
            : <><Wallet className="mr-1.5 h-3.5 w-3.5" />Connect Freighter</>}
        </Button>
        {errWallet && <div className="mt-2"><Err msg={errWallet} /></div>}
      </div>

      {/* Build XDR */}
      {quote && canBuildXdr && (
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
              <div className="mb-2 space-y-0">
                <Row label="Network" value={xdr.network || activeNetwork} />
                <Row label="Signer" value={senderAddress ? shortAddress(senderAddress) : undefined} mono />
              </div>
              <p className="mb-1 text-xs font-semibold text-tts-deep">Unsigned XDR</p>
              <p className="max-h-24 overflow-y-auto break-all rounded border border-tts-border/60 bg-white/40 p-2 font-mono text-[10px] text-tts-muted">
                {xdr.xdr}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  size="sm"
                  onClick={signWithFreighter}
                  disabled={signingXdr || !walletAddress || !walletNetworkMatches}
                  title="Sign with Freighter"
                  aria-label="Sign with Freighter"
                >
                  {signingXdr
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Wallet className="h-3.5 w-3.5" />}
                </Button>
                <Button
                  size="sm"
                  onClick={submitSignedSwap}
                  disabled={submittingSwap || !signedXdr}
                  title="Submit signed transaction"
                  aria-label="Submit signed transaction"
                >
                  {submittingSwap
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                </Button>
                <a
                  href={stellarLabSignUrl(xdr.xdr, activePassphrase)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in Stellar Lab"
                  aria-label="Open in Stellar Lab"
                  className="inline-flex h-9 items-center justify-center rounded border border-tts-border text-xs font-semibold text-tts-muted transition-colors hover:text-tts-deep"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <span className="text-center text-[10px] font-semibold uppercase text-tts-muted">Sign</span>
                <span className="text-center text-[10px] font-semibold uppercase text-tts-muted">Submit</span>
                <span className="text-center text-[10px] font-semibold uppercase text-tts-muted">Lab</span>
              </div>
              {signedXdr && (
                <div className="mt-3 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-2 text-xs text-tts-deep">
                  Signed by <span className="font-mono">{shortAddress(signerAddress)}</span>
                </div>
              )}
              {errSubmit && <div className="mt-2"><Err msg={errSubmit} /></div>}
              {submitResult && (
                <div className="mt-3 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-3 space-y-0">
                  <Row label="Submitted" value={submitResult.successful ? "Yes" : "No"} />
                  <Row label="Hash" value={submitResult.hash} mono />
                  <Row label="Ledger" value={submitResult.ledger} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {quote && !canBuildXdr && (
        <div className="mb-5 rounded border border-tts-gold/30 bg-tts-gold/10 p-3 text-xs text-tts-gold">
          XDR build unavailable for this fallback quote.
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
        description="Soroswap multi-protocol DEX + Blend v2 lending — connected via Freighter wallet."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <OperationalStat label="Swap" value="Soroswap" detail="4 protocols — soroswap, phoenix, aqua, sdex" />
        <OperationalStat label="Lending" value="Blend v2" detail="USDC/XLM pools — on-chain contracts" />
        <OperationalStat label="Wallet" value="Freighter" detail="Sign and submit XDR" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BlendPanel />
        <SoroswapPanel />
      </div>
    </OperationalPage>
  );
}
