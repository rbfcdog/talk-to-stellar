"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Send,
  TrendingUp,
  Vault,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function api(path: string, opts?: RequestInit) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || body.message || `HTTP ${r.status}`);
  return body;
}

function freighterError(result: any): string | null {
  const error = result?.error;
  if (!error) return null;
  return typeof error === "string" ? error : error.message || "Freighter request failed";
}

function normalizeNetwork(network?: string): "TESTNET" | "PUBLIC" {
  return String(network || "").toUpperCase() === "TESTNET" ? "TESTNET" : "PUBLIC";
}

function networkPassphrase(network?: string): string {
  return normalizeNetwork(network) === "TESTNET"
    ? "Test SDF Network ; September 2015"
    : "Public Global Stellar Network ; September 2015";
}

function shortAddr(address?: string): string {
  if (!address) return "";
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}

function stellarLabUrl(xdr: string, passphrase: string): string {
  return `https://lab.stellar.org/transaction/sign?xdr=${encodeURIComponent(xdr)}&networkPassphrase=${encodeURIComponent(passphrase)}`;
}

function Spin({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-3 text-xs text-tts-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {label}
    </div>
  );
}

function Err({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}
    </div>
  );
}

function Ok({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-2 text-xs text-tts-deep">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tts-confirm" /> {msg}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between border-b border-tts-border/40 py-1.5 last:border-0">
      <span className="text-xs text-tts-muted">{label}</span>
      <span className={`text-xs font-semibold text-tts-deep ${mono ? "font-mono" : ""}`}>{String(value)}</span>
    </div>
  );
}

function Step({ n, label, done }: { n: number; label: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-xs text-tts-muted mb-2">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? "bg-tts-confirm text-white" : "bg-tts-border text-tts-muted"}`}>
        {done ? "✓" : n}
      </span>
      <span className={done ? "text-tts-confirm" : ""}>{label}</span>
    </div>
  );
}

// ── Freighter hook ────────────────────────────────────────────────────────────

type FreighterState = {
  address: string;
  network: string;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  signXdr: (xdr: string, passphrase: string) => Promise<string>;
};

function useFreighter(): FreighterState {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const f = await import("@stellar/freighter-api");
      const connected = await f.isConnected();
      const ce = freighterError(connected);
      if (ce) throw new Error(ce);
      if (!connected.isConnected) throw new Error("Freighter extension not installed. Install from freighter.app.");

      const access = await f.requestAccess();
      const ae = freighterError(access);
      if (ae) throw new Error(ae);
      if (!access.address) throw new Error("Freighter did not return a public key.");

      const net = await f.getNetwork();
      const ne = freighterError(net);
      if (ne) throw new Error(ne);

      setAddress(access.address);
      setNetwork(net.network || "");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress("");
    setNetwork("");
    setError(null);
  }, []);

  const signXdr = useCallback(async (xdr: string, passphrase: string): Promise<string> => {
    if (!address) throw new Error("Wallet not connected. Click Connect Freighter first.");
    const f = await import("@stellar/freighter-api");
    const result = await f.signTransaction(xdr, { networkPassphrase: passphrase, address });
    const se = freighterError(result);
    if (se) throw new Error(se);
    if (!result.signedTxXdr) throw new Error("Freighter did not return a signed XDR.");
    return result.signedTxXdr;
  }, [address]);

  return { address, network, connecting, error, connect, disconnect, signXdr };
}

// ── Freighter panel ───────────────────────────────────────────────────────────

function FreighterPanel({ fw }: { fw: FreighterState }) {
  const netMatch = fw.network ? normalizeNetwork(fw.network) === "TESTNET" : true;
  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Wallet className="h-4 w-4 text-tts-gold" /> Freighter Wallet
        </h2>
        {fw.address
          ? <StatusPill tone={netMatch ? "confirm" : "gold"}>{fw.network || "Connected"}</StatusPill>
          : <StatusPill tone="gold">Not connected</StatusPill>}
      </div>
      {fw.address ? (
        <div className="space-y-2">
          <Row label="Network" value={fw.network || "Unknown"} />
          <Row label="Address" value={shortAddr(fw.address)} mono />
          <p className="break-all font-mono text-[10px] text-tts-muted/60">{fw.address}</p>
          {!netMatch && (
            <p className="text-xs text-tts-gold">Switch Freighter to TESTNET to match the backend network.</p>
          )}
          <Button size="sm" variant="outline" className="w-full" onClick={fw.disconnect}>Disconnect</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-tts-muted">
            Connect Freighter once — it powers Soroswap swaps and DeFindex deposits below. Required for signing XDR transactions.
          </p>
          <Button size="sm" className="w-full" onClick={fw.connect} disabled={fw.connecting}>
            {fw.connecting
              ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Connecting…</>
              : <><Wallet className="mr-1.5 h-3.5 w-3.5" />Connect Freighter</>}
          </Button>
          {fw.error && <Err msg={fw.error} />}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Blend panel ───────────────────────────────────────────────────────────────

function BlendPanel() {
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
          <TrendingUp className="h-4 w-4 text-tts-gold" /> Blend v2 Lending
        </h2>
        <div className="flex items-center gap-2">
          {pools.length > 0 && <StatusPill tone="confirm">{pools.length} pools</StatusPill>}
          <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <p className="mb-3 text-xs text-tts-muted">
        Stellar DeFi lending — deposit USDC/XLM into permissionless pools and earn variable APY.
        Track on-chain contracts via StellarExpert.
      </p>
      {loading && !pools.length && <Spin />}
      {error && <Err msg={error} />}
      {pools.length > 0 && (
        <div className="space-y-0">
          {pools.map((p: any, i: number) => (
            <div key={i} className="flex items-center justify-between border-b border-tts-border/40 py-1.5 last:border-0">
              <div className="min-w-0">
                <span className="text-xs font-semibold text-tts-deep">{p.name ?? p.id}</span>
                <span className="ml-2 font-mono text-[10px] text-tts-muted/60">{p.contract?.slice(0, 10)}…</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.assets && <span className="text-[10px] text-tts-muted">{p.assets.join(", ")}</span>}
                <StatusPill tone={p.on_chain ? "confirm" : "gold"}>{p.on_chain ? "on-chain" : "pending"}</StatusPill>
              </div>
            </div>
          ))}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Soroswap panel ────────────────────────────────────────────────────────────

const PAIRS = [
  { from: "XLM", to: "USDC" },
  { from: "USDC", to: "XLM" },
  { from: "USDC", to: "BRZ" },
  { from: "XLM", to: "AQUA" },
];

function SoroswapPanel({ fw }: { fw: FreighterState }) {
  const [tokens, setTokens] = useState<any[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [errTokens, setErrTokens] = useState<string | null>(null);
  const [tokenSearch, setTokenSearch] = useState("");

  const [assetIn, setAssetIn] = useState("XLM");
  const [assetOut, setAssetOut] = useState("USDC");
  const [amount, setAmount] = useState("10");
  const [tradeType, setTradeType] = useState<"EXACT_IN" | "EXACT_OUT">("EXACT_IN");

  const [quote, setQuote] = useState<any>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [errQuote, setErrQuote] = useState<string | null>(null);

  const [backendNetwork, setBackendNetwork] = useState<"TESTNET" | "PUBLIC">("TESTNET");
  const [xdrResult, setXdrResult] = useState<any>(null);
  const [loadingXdr, setLoadingXdr] = useState(false);
  const [errXdr, setErrXdr] = useState<string | null>(null);

  const [signedXdr, setSignedXdr] = useState("");
  const [signing, setSigning] = useState(false);
  const [errSign, setErrSign] = useState<string | null>(null);

  const [submitResult, setSubmitResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errSubmit, setErrSubmit] = useState<string | null>(null);

  const reset = () => {
    setQuote(null); setXdrResult(null); setSignedXdr(""); setSubmitResult(null);
    setErrQuote(null); setErrXdr(null); setErrSign(null); setErrSubmit(null);
  };

  const loadTokens = useCallback(async () => {
    setLoadingTokens(true); setErrTokens(null);
    try {
      const d = await api("/api/swap/tokens");
      if (d?.network) setBackendNetwork(normalizeNetwork(d.network));
      setTokens(Array.isArray(d) ? d : d.tokens ?? []);
    } catch (e: any) { setErrTokens(e.message); }
    finally { setLoadingTokens(false); }
  }, []);

  const getQuote = useCallback(async () => {
    reset();
    setLoadingQuote(true);
    try {
      const d = await api(`/api/swap/quote?assetIn=${encodeURIComponent(assetIn)}&assetOut=${encodeURIComponent(assetOut)}&amount=${encodeURIComponent(amount)}&tradeType=${tradeType}`);
      if (d?.network) setBackendNetwork(normalizeNetwork(d.network));
      setQuote(d);
    } catch (e: any) { setErrQuote(e.message); }
    finally { setLoadingQuote(false); }
  }, [assetIn, assetOut, amount, tradeType]);

  const buildXdr = useCallback(async () => {
    if (!quote || !fw.address) return;
    setLoadingXdr(true); setErrXdr(null); setXdrResult(null); setSignedXdr(""); setSubmitResult(null);
    try {
      const d = await api("/api/swap/build", {
        method: "POST",
        body: JSON.stringify({ quote, senderAddress: fw.address }),
      });
      if (d?.network) setBackendNetwork(normalizeNetwork(d.network));
      setXdrResult(d);
    } catch (e: any) { setErrXdr(e.message); }
    finally { setLoadingXdr(false); }
  }, [quote, fw.address]);

  const signXdr = useCallback(async () => {
    if (!xdrResult?.xdr) return;
    setSigning(true); setErrSign(null); setSignedXdr(""); setSubmitResult(null);
    try {
      const passphrase = xdrResult.networkPassphrase || networkPassphrase(backendNetwork);
      const signed = await fw.signXdr(xdrResult.xdr, passphrase);
      setSignedXdr(signed);
    } catch (e: any) { setErrSign(e.message); }
    finally { setSigning(false); }
  }, [xdrResult, backendNetwork, fw]);

  const submitXdr = useCallback(async () => {
    if (!signedXdr) return;
    setSubmitting(true); setErrSubmit(null); setSubmitResult(null);
    try {
      const d = await api("/api/swap/send", { method: "POST", body: JSON.stringify({ signedXdr }) });
      setSubmitResult(d);
    } catch (e: any) { setErrSubmit(e.message); }
    finally { setSubmitting(false); }
  }, [signedXdr]);

  useEffect(() => { loadTokens(); }, [loadTokens]);

  const filtered = tokenSearch
    ? tokens.filter((t) => (t.symbol ?? "").toLowerCase().includes(tokenSearch.toLowerCase()) || (t.name ?? "").toLowerCase().includes(tokenSearch.toLowerCase()))
    : tokens;

  const pass = xdrResult?.networkPassphrase || networkPassphrase(backendNetwork);
  const walletReady = Boolean(fw.address);
  const netOk = !fw.network || normalizeNetwork(fw.network) === backendNetwork;

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <ArrowRightLeft className="h-4 w-4 text-tts-gold" /> Soroswap — Multi-Protocol DEX
        </h2>
        <div className="flex items-center gap-2">
          {tokens.length > 0 && <StatusPill tone="confirm">{tokens.length} tokens</StatusPill>}
          <Button size="sm" variant="ghost" onClick={loadTokens} disabled={loadingTokens}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingTokens ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Step indicators */}
      <div className="mb-4 grid grid-cols-4 gap-1">
        <Step n={1} label="Quote" done={Boolean(quote)} />
        <Step n={2} label="Build XDR" done={Boolean(xdrResult)} />
        <Step n={3} label="Sign" done={Boolean(signedXdr)} />
        <Step n={4} label="Submit" done={Boolean(submitResult)} />
      </div>

      {/* Pair selector */}
      <div className="mb-3 flex flex-wrap gap-1">
        {PAIRS.map((p) => (
          <button
            key={`${p.from}-${p.to}`}
            onClick={() => { setAssetIn(p.from); setAssetOut(p.to); reset(); }}
            className="rounded border border-tts-border px-2 py-0.5 text-xs text-tts-muted transition-colors hover:border-tts-primary hover:text-tts-deep"
          >
            {p.from}→{p.to}
          </button>
        ))}
      </div>

      {/* Inputs */}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div>
          <p className="mb-1 text-xs text-tts-muted">From</p>
          <Input value={assetIn} onChange={(e) => { setAssetIn(e.target.value); reset(); }} className="text-xs" />
        </div>
        <div>
          <p className="mb-1 text-xs text-tts-muted">To</p>
          <Input value={assetOut} onChange={(e) => { setAssetOut(e.target.value); reset(); }} className="text-xs" />
        </div>
        <div>
          <p className="mb-1 text-xs text-tts-muted">Amount</p>
          <Input type="number" value={amount} onChange={(e) => { setAmount(e.target.value); reset(); }} className="text-xs" />
        </div>
      </div>
      <div className="mb-3 flex gap-2">
        {(["EXACT_IN", "EXACT_OUT"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTradeType(t); reset(); }}
            className={`rounded border px-2 py-0.5 text-xs transition-colors ${tradeType === t ? "border-tts-primary bg-tts-primary/10 text-tts-primary" : "border-tts-border text-tts-muted hover:text-tts-deep"}`}
          >
            {t === "EXACT_IN" ? "Exact in" : "Exact out"}
          </button>
        ))}
      </div>

      {/* Step 1: Quote */}
      <Button size="sm" className="w-full mb-3" onClick={getQuote} disabled={loadingQuote}>
        {loadingQuote ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Getting quote…</> : "1 — Get Quote"}
      </Button>
      {errQuote && <div className="mb-3"><Err msg={errQuote} /></div>}
      {quote && (
        <div className="mb-4 rounded border border-tts-border bg-tts-bg/50 p-3 space-y-0">
          <Row label="You send" value={`${quote.amountIn} ${quote.assetIn}`} />
          <Row label="You receive" value={`${quote.amountOut} ${quote.assetOut}`} />
          <Row label="Price impact" value={`${Number(quote.priceImpact ?? 0).toFixed(4)}%`} />
          <Row label="Protocols" value={quote.protocols?.join(", ")} />
          {quote.warning && <p className="pt-2 text-xs text-tts-gold">{quote.warning}</p>}
        </div>
      )}

      {/* Step 2: Build XDR */}
      {quote && (
        <>
          {!walletReady && (
            <p className="mb-2 text-xs text-tts-gold">↑ Connect Freighter above first to build the transaction.</p>
          )}
          {!netOk && (
            <p className="mb-2 text-xs text-tts-gold">Switch Freighter to {backendNetwork} to match the backend.</p>
          )}
          <Button size="sm" className="w-full mb-3" onClick={buildXdr} disabled={loadingXdr || !walletReady || !netOk}>
            {loadingXdr ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Building…</> : `2 — Build Swap XDR (${shortAddr(fw.address) || "connect wallet"})`}
          </Button>
          {errXdr && <div className="mb-3"><Err msg={errXdr} /></div>}
        </>
      )}

      {/* Step 3: Sign */}
      {xdrResult?.xdr && (
        <>
          <div className="mb-3 rounded border border-tts-border bg-tts-bg/50 p-3">
            <Row label="Network" value={xdrResult.network || backendNetwork} />
            <p className="mt-2 mb-1 text-xs text-tts-muted">Unsigned XDR</p>
            <p className="max-h-16 overflow-y-auto break-all font-mono text-[10px] text-tts-muted/70">{xdrResult.xdr}</p>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={signXdr} disabled={signing || !walletReady}>
              {signing ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Signing…</> : <><Wallet className="mr-1.5 h-3.5 w-3.5" />3 — Sign with Freighter</>}
            </Button>
            <a
              href={stellarLabUrl(xdrResult.xdr, pass)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-tts-border px-3 text-xs font-semibold text-tts-muted hover:text-tts-deep transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Stellar Lab
            </a>
          </div>
          {errSign && <div className="mb-3"><Err msg={errSign} /></div>}
          {signedXdr && <div className="mb-3"><Ok msg={`Signed by ${shortAddr(fw.address)}`} /></div>}
        </>
      )}

      {/* Step 4: Submit */}
      {signedXdr && (
        <>
          <Button size="sm" className="w-full mb-3" onClick={submitXdr} disabled={submitting}>
            {submitting ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Submitting…</> : <><Send className="mr-1.5 h-3.5 w-3.5" />4 — Submit to Stellar</>}
          </Button>
          {errSubmit && <div className="mb-3"><Err msg={errSubmit} /></div>}
          {submitResult && (
            <div className="mb-3 rounded border border-tts-confirm/30 bg-tts-confirm/10 p-3 space-y-0">
              <Row label="Status" value={submitResult.successful ? "✓ Success" : "Failed"} />
              <Row label="Hash" value={submitResult.hash} mono />
              <Row label="Ledger" value={submitResult.ledger} />
              {submitResult.hash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${submitResult.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-tts-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> View on StellarExpert
                </a>
              )}
            </div>
          )}
        </>
      )}

      {/* Token list */}
      {loadingTokens && !tokens.length && <Spin label="Loading tokens…" />}
      {errTokens && <Err msg={errTokens} />}
      {tokens.length > 0 && (
        <div className="mt-2">
          <p className="mb-2 text-xs font-semibold text-tts-muted">Token List ({tokens.length})</p>
          <Input value={tokenSearch} onChange={(e) => setTokenSearch(e.target.value)} placeholder="Search tokens…" className="mb-2 text-xs" />
          <div className="max-h-40 overflow-y-auto space-y-0">
            {filtered.slice(0, 80).map((t: any, i: number) => (
              <div
                key={i}
                className="flex cursor-pointer justify-between border-b border-tts-border/40 py-1.5 last:border-0 hover:bg-tts-bg/60"
                onClick={() => { setAssetIn(t.symbol); reset(); }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-tts-deep">{t.symbol}</span>
                  <span className="text-xs text-tts-muted">{t.name}</span>
                </div>
                <span className="font-mono text-[10px] text-tts-muted">{String(t.address ?? "").slice(0, 10)}…</span>
              </div>
            ))}
            {filtered.length > 80 && <p className="pt-1 text-xs text-tts-muted">+{filtered.length - 80} more</p>}
          </div>
        </div>
      )}
    </OperationalCard>
  );
}

// ── DeFindex panel ────────────────────────────────────────────────────────────

const DEFINDEX_BASE = "/api/defindex";
const STROOPS = 10_000_000; // 1 USDC = 10_000_000 stroops

function DefindexPanel({ fw }: { fw: FreighterState }) {
  const [vaultInfo, setVaultInfo] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [errInfo, setErrInfo] = useState<string | null>(null);

  const [balance, setBalance] = useState<any>(null);
  const [loadingBal, setLoadingBal] = useState(false);
  const [errBal, setErrBal] = useState<string | null>(null);

  const [depositAmt, setDepositAmt] = useState("1");
  const [depositXdr, setDepositXdr] = useState("");
  const [loadingDeposit, setLoadingDeposit] = useState(false);
  const [errDeposit, setErrDeposit] = useState<string | null>(null);

  const [withdrawShares, setWithdrawShares] = useState("");
  const [withdrawXdr, setWithdrawXdr] = useState("");
  const [loadingWithdraw, setLoadingWithdraw] = useState(false);
  const [errWithdraw, setErrWithdraw] = useState<string | null>(null);

  const [signedXdr, setSignedXdr] = useState("");
  const [activeXdr, setActiveXdr] = useState<"deposit" | "withdraw" | null>(null);
  const [signing, setSigning] = useState(false);
  const [errSign, setErrSign] = useState<string | null>(null);

  const [submitResult, setSubmitResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errSubmit, setErrSubmit] = useState<string | null>(null);

  const loadInfo = useCallback(async () => {
    setLoadingInfo(true); setErrInfo(null);
    try {
      const d = await api(`${DEFINDEX_BASE}/vault/info`);
      setVaultInfo(d);
    } catch (e: any) { setErrInfo(e.message); }
    finally { setLoadingInfo(false); }
  }, []);

  const loadBalance = useCallback(async () => {
    if (!fw.address) return;
    setLoadingBal(true); setErrBal(null);
    try {
      const d = await api(`${DEFINDEX_BASE}/vault/balance?address=${encodeURIComponent(fw.address)}`);
      setBalance(d);
    } catch (e: any) { setErrBal(e.message); }
    finally { setLoadingBal(false); }
  }, [fw.address]);

  const buildDeposit = useCallback(async () => {
    if (!fw.address || !depositAmt) return;
    setLoadingDeposit(true); setErrDeposit(null); setDepositXdr(""); setSignedXdr(""); setSubmitResult(null); setErrSign(null); setErrSubmit(null);
    try {
      const amount_stroops = String(Math.round(parseFloat(depositAmt) * STROOPS));
      const d = await api(`${DEFINDEX_BASE}/vault/deposit`, {
        method: "POST",
        body: JSON.stringify({ user_address: fw.address, amount_stroops }),
      });
      setDepositXdr(d.xdr || "");
      setActiveXdr("deposit");
    } catch (e: any) { setErrDeposit(e.message); }
    finally { setLoadingDeposit(false); }
  }, [fw.address, depositAmt]);

  const buildWithdraw = useCallback(async () => {
    if (!fw.address || !withdrawShares) return;
    setLoadingWithdraw(true); setErrWithdraw(null); setWithdrawXdr(""); setSignedXdr(""); setSubmitResult(null); setErrSign(null); setErrSubmit(null);
    try {
      const d = await api(`${DEFINDEX_BASE}/vault/withdraw`, {
        method: "POST",
        body: JSON.stringify({ user_address: fw.address, shares_amount: withdrawShares }),
      });
      setWithdrawXdr(d.xdr || "");
      setActiveXdr("withdraw");
    } catch (e: any) { setErrWithdraw(e.message); }
    finally { setLoadingWithdraw(false); }
  }, [fw.address, withdrawShares]);

  const pendingXdr = activeXdr === "deposit" ? depositXdr : withdrawXdr;

  const signActive = useCallback(async () => {
    if (!pendingXdr) return;
    setSigning(true); setErrSign(null); setSignedXdr(""); setSubmitResult(null);
    try {
      const signed = await fw.signXdr(pendingXdr, networkPassphrase("TESTNET"));
      setSignedXdr(signed);
    } catch (e: any) { setErrSign(e.message); }
    finally { setSigning(false); }
  }, [pendingXdr, fw]);

  const submitActive = useCallback(async () => {
    if (!signedXdr) return;
    setSubmitting(true); setErrSubmit(null); setSubmitResult(null);
    try {
      const d = await api("/api/swap/send", { method: "POST", body: JSON.stringify({ signedXdr }) });
      setSubmitResult(d);
    } catch (e: any) { setErrSubmit(e.message); }
    finally { setSubmitting(false); }
  }, [signedXdr]);

  useEffect(() => { loadInfo(); }, [loadInfo]);
  useEffect(() => { if (fw.address) loadBalance(); }, [fw.address, loadBalance]);

  const apy = vaultInfo?.apy?.apy ?? vaultInfo?.info?.apy;
  const tvl = vaultInfo?.info?.total_assets ?? vaultInfo?.info?.tvl;
  const userBal = balance?.balance;

  return (
    <OperationalCard>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Vault className="h-4 w-4 text-tts-gold" /> DeFindex Yield Vault
        </h2>
        <div className="flex items-center gap-2">
          <StatusPill tone="confirm">USDC</StatusPill>
          <Button size="sm" variant="ghost" onClick={() => { loadInfo(); if (fw.address) loadBalance(); }} disabled={loadingInfo}>
            <RefreshCw className={`h-3.5 w-3.5 ${loadingInfo ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Vault info */}
      {loadingInfo && <Spin label="Loading vault…" />}
      {errInfo && <div className="mb-3"><Err msg={errInfo} /></div>}
      {vaultInfo && (
        <div className="mb-4 rounded border border-tts-border bg-tts-bg/50 p-3 space-y-0">
          {apy != null && <Row label="APY" value={`${Number(apy).toFixed(2)}%`} />}
          {tvl != null && <Row label="TVL" value={String(tvl)} />}
          {vaultInfo.vault && <Row label="Vault" value={shortAddr(vaultInfo.vault)} mono />}
          {vaultInfo.default_vault && <Row label="Default vault" value={shortAddr(vaultInfo.default_vault)} mono />}
        </div>
      )}

      {/* User balance */}
      {!fw.address && (
        <p className="mb-4 text-xs text-tts-gold">↑ Connect Freighter above to check your vault balance and deposit/withdraw.</p>
      )}
      {fw.address && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-tts-muted">Your Vault Position</p>
            <Button size="sm" variant="ghost" onClick={loadBalance} disabled={loadingBal}>
              <RefreshCw className={`h-3 w-3 ${loadingBal ? "animate-spin" : ""}`} />
            </Button>
          </div>
          {loadingBal && <Spin label="Checking balance…" />}
          {errBal && <Err msg={errBal} />}
          {balance && (
            <div className="rounded border border-tts-border bg-tts-bg/50 p-3 space-y-0">
              {userBal != null
                ? <Row label="dfTokens (shares)" value={String(userBal)} mono />
                : <p className="text-xs text-tts-muted">No position yet.</p>}
            </div>
          )}
        </div>
      )}

      {/* Deposit */}
      {fw.address && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-tts-muted">Deposit USDC</p>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <p className="mb-1 text-xs text-tts-muted">Amount (USDC)</p>
              <Input
                type="number"
                min="0.0000001"
                step="any"
                value={depositAmt}
                onChange={(e) => { setDepositAmt(e.target.value); setDepositXdr(""); setSignedXdr(""); setSubmitResult(null); }}
                className="text-xs font-mono"
              />
            </div>
          </div>
          <Button size="sm" className="w-full" onClick={buildDeposit} disabled={loadingDeposit || !depositAmt}>
            {loadingDeposit ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Building deposit…</> : <><Zap className="mr-1.5 h-3.5 w-3.5" />Build Deposit XDR</>}
          </Button>
          {errDeposit && <div className="mt-2"><Err msg={errDeposit} /></div>}
        </div>
      )}

      {/* Withdraw */}
      {fw.address && userBal && (
        <div className="mb-4">
          <p className="mb-2 text-xs font-semibold text-tts-muted">Withdraw (by shares)</p>
          <div className="flex gap-2 mb-2">
            <div className="flex-1">
              <p className="mb-1 text-xs text-tts-muted">Shares (dfTokens)</p>
              <Input
                type="number"
                min="1"
                step="1"
                value={withdrawShares}
                onChange={(e) => { setWithdrawShares(e.target.value); setWithdrawXdr(""); setSignedXdr(""); setSubmitResult(null); }}
                placeholder={String(userBal)}
                className="text-xs font-mono"
              />
            </div>
          </div>
          <Button size="sm" variant="outline" className="w-full" onClick={buildWithdraw} disabled={loadingWithdraw || !withdrawShares}>
            {loadingWithdraw ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Building withdraw…</> : "Build Withdraw XDR"}
          </Button>
          {errWithdraw && <div className="mt-2"><Err msg={errWithdraw} /></div>}
        </div>
      )}

      {/* Sign + Submit */}
      {pendingXdr && (
        <div className="space-y-3">
          <div className="rounded border border-tts-border bg-tts-bg/50 p-3">
            <p className="mb-1 text-xs font-semibold text-tts-muted capitalize">{activeXdr} XDR ready</p>
            <p className="max-h-16 overflow-y-auto break-all font-mono text-[10px] text-tts-muted/70">{pendingXdr}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={signActive} disabled={signing || !fw.address}>
              {signing ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Signing…</> : <><Wallet className="mr-1.5 h-3.5 w-3.5" />Sign with Freighter</>}
            </Button>
            <a
              href={stellarLabUrl(pendingXdr, networkPassphrase("TESTNET"))}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-tts-border px-3 text-xs font-semibold text-tts-muted hover:text-tts-deep transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Stellar Lab
            </a>
          </div>
          {errSign && <Err msg={errSign} />}
          {signedXdr && <Ok msg={`Signed by ${shortAddr(fw.address)}`} />}

          {signedXdr && (
            <>
              <Button size="sm" className="w-full" onClick={submitActive} disabled={submitting}>
                {submitting ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Submitting…</> : <><Send className="mr-1.5 h-3.5 w-3.5" />Submit to Stellar</>}
              </Button>
              {errSubmit && <Err msg={errSubmit} />}
              {submitResult && (
                <div className="rounded border border-tts-confirm/30 bg-tts-confirm/10 p-3 space-y-0">
                  <Row label="Status" value={submitResult.successful ? "✓ Success" : "Failed"} />
                  <Row label="Hash" value={submitResult.hash} mono />
                  <Row label="Ledger" value={submitResult.ledger} />
                  {submitResult.hash && (
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${submitResult.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs text-tts-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" /> View on StellarExpert
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </OperationalCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KeyIntegrationsClient() {
  const fw = useFreighter();
  return (
    <OperationalPage>
      <OperationalHeader
        title="Key Integrations"
        description="Soroswap DEX · Blend v2 Lending · DeFindex Yield · Freighter Wallet — sign and submit on-chain."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <OperationalStat label="Wallet" value="Freighter" detail={fw.address ? shortAddr(fw.address) : "Not connected"} />
        <OperationalStat label="Lending" value="Blend v2" detail="USDC/XLM pools" />
        <OperationalStat label="Swap" value="Soroswap" detail="4 protocols" />
        <OperationalStat label="Yield" value="DeFindex" detail="USDC vault" />
      </div>

      {/* Freighter connect — shared across all panels */}
      <div className="mb-6">
        <FreighterPanel fw={fw} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BlendPanel />
        <SoroswapPanel fw={fw} />
        <DefindexPanel fw={fw} />
      </div>
    </OperationalPage>
  );
}
