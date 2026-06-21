"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Shield,
  Wallet,
} from "lucide-react";
import {
  OperationalCard,
  OperationalHeader,
  OperationalPage,
} from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Constants ─────────────────────────────────────────────────────────

const WALLET_AUTH_BASE = "/api/wallet-auth";

const WALLET_TYPES = [
  { id: "freighter", label: "Freighter", desc: "Stellar browser extension" },
  { id: "albedo", label: "Albedo", desc: "Web-based, no extension" },
  { id: "xbull", label: "xBull", desc: "Browser extension + mobile" },
  { id: "lobstr", label: "LOBSTR", desc: "Mobile + browser" },
  { id: "walletconnect", label: "WalletConnect", desc: "QR-based multi-wallet" },
];

// ── Helpers ───────────────────────────────────────────────────────────

async function runApi(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(payload.error || payload.message || `HTTP ${r.status}`);
  return payload;
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); } catch {}
}

// ── Component ─────────────────────────────────────────────────────────

export default function WalletConnectClient() {
  const [selectedWallet, setSelectedWallet] = useState("freighter");

  // Challenge step
  const [stellarAddress, setStellarAddress] = useState("");
  const [challengeXdr, setChallengeXdr] = useState("");
  const [networkPassphrase, setNetworkPassphrase] = useState("");
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState("");

  // Verify step
  const [signedXdr, setSignedXdr] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Session
  const [token, setToken] = useState("");
  const [tokenExpiry, setTokenExpiry] = useState("");
  const [sessionAddress, setSessionAddress] = useState("");

  // Validate step
  const [validateResult, setValidateResult] = useState<{ valid: boolean; stellar_address?: string; wallet_type?: string } | null>(null);
  const [validateLoading, setValidateLoading] = useState(false);

  // ── Step 1: Get challenge ─────────────────────────────────────────

  const getChallenge = useCallback(async () => {
    if (!stellarAddress) return;
    setChallengeLoading(true);
    setChallengeError("");
    setChallengeXdr("");
    try {
      const p = await runApi("GET", `${WALLET_AUTH_BASE}/challenge?account=${encodeURIComponent(stellarAddress)}`);
      setChallengeXdr(p.transaction || "");
      setNetworkPassphrase(p.network_passphrase || "");
    } catch (e: unknown) {
      setChallengeError(e instanceof Error ? e.message : String(e));
    } finally {
      setChallengeLoading(false);
    }
  }, [stellarAddress]);

  // ── Step 2: Verify signed challenge ──────────────────────────────

  const verifySigned = useCallback(async () => {
    if (!signedXdr || !stellarAddress) return;
    setVerifyLoading(true);
    setVerifyError("");
    try {
      const p = await runApi("POST", `${WALLET_AUTH_BASE}/verify`, {
        transaction: signedXdr,
        stellar_address: stellarAddress,
        wallet_type: selectedWallet,
      });
      setToken(p.token || "");
      setTokenExpiry(p.expires_at || "");
      setSessionAddress(p.stellar_address || stellarAddress);
    } catch (e: unknown) {
      setVerifyError(e instanceof Error ? e.message : String(e));
    } finally {
      setVerifyLoading(false);
    }
  }, [signedXdr, stellarAddress, selectedWallet]);

  // ── Step 3: Validate token ────────────────────────────────────────

  const validateToken = useCallback(async () => {
    if (!token) return;
    setValidateLoading(true);
    setValidateResult(null);
    try {
      const p = await runApi("POST", `${WALLET_AUTH_BASE}/validate`, { token });
      setValidateResult(p);
    } catch {
      setValidateResult({ valid: false });
    } finally {
      setValidateLoading(false);
    }
  }, [token]);

  const clearSession = () => {
    setToken("");
    setTokenExpiry("");
    setSessionAddress("");
    setChallengeXdr("");
    setSignedXdr("");
    setValidateResult(null);
  };

  // ── Render ────────────────────────────────────────────────────────

  return (
    <OperationalPage>
      <OperationalHeader
        title="Stellar Wallets Kit — SEP-10 Auth"
        description="Challenge/verify flow for Freighter, Albedo, xBull, LOBSTR, WalletConnect"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Wallet selector ──────────────────────────────────────── */}
        <OperationalCard>
          <h2 className="mb-3 text-sm font-bold text-tts-deep">Select wallet type</h2>
          <div className="space-y-2">
            {WALLET_TYPES.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedWallet(w.id)}
                className={`w-full rounded border px-3 py-2 text-left text-sm transition-colors ${
                  selectedWallet === w.id
                    ? "border-tts-gold bg-tts-gold/10 text-tts-deep"
                    : "border-tts-border text-tts-muted hover:border-tts-gold/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4" />
                  <span className="font-semibold">{w.label}</span>
                  <span className="text-xs opacity-70">{w.desc}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded border border-tts-border bg-tts-bg p-3 text-xs text-tts-muted space-y-1">
            <div className="font-semibold text-tts-deep">How SEP-10 works</div>
            <ol className="list-decimal list-inside space-y-1">
              <li>Server builds a challenge transaction (signed by server key)</li>
              <li>Wallet signs it with the user's Stellar secret key</li>
              <li>Server verifies both signatures → issues JWT</li>
              <li>JWT used as auth token for SEP-24 and other APIs</li>
            </ol>
            <p className="mt-2 italic">In this test UI, paste the signed XDR manually (from your wallet or Stellar Lab).</p>
          </div>
        </OperationalCard>

        {/* ── Step 1: Challenge ────────────────────────────────────── */}
        <OperationalCard>
          <h2 className="mb-3 text-sm font-bold text-tts-deep">1. Get challenge</h2>
          <div className="space-y-3">
            <Input
              placeholder="Your Stellar address (G...)"
              value={stellarAddress}
              onChange={(e) => setStellarAddress(e.target.value)}
              className="font-mono text-xs"
            />
            <Button
              onClick={getChallenge}
              disabled={challengeLoading || !stellarAddress}
              size="sm"
              className="w-full gap-2"
            >
              {challengeLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <KeyRound className="h-3 w-3" />}
              Get challenge transaction
            </Button>
            {challengeError && <p className="text-xs text-tts-error">{challengeError}</p>}
            {challengeXdr && (
              <div className="space-y-2">
                <div className="text-xs text-tts-muted">Network: <span className="font-mono">{networkPassphrase}</span></div>
                <div className="relative rounded border border-tts-border bg-tts-bg p-2">
                  <p className="font-mono text-xs break-all text-tts-muted pr-8">{challengeXdr.slice(0, 100)}...</p>
                  <button
                    onClick={() => copyText(challengeXdr)}
                    className="absolute right-2 top-2 text-tts-muted hover:text-tts-deep"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs text-tts-muted italic">
                  Copy this XDR → sign in your wallet (or Stellar Lab) → paste signed XDR below.
                </p>
                <a
                  href={`https://laboratory.stellar.org/#txsigner?xdr=${encodeURIComponent(challengeXdr)}&network=test`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-tts-gold underline"
                >
                  Open in Stellar Lab →
                </a>
              </div>
            )}
          </div>
        </OperationalCard>

        {/* ── Step 2: Verify ───────────────────────────────────────── */}
        <OperationalCard>
          <h2 className="mb-3 text-sm font-bold text-tts-deep">2. Verify signed transaction</h2>
          <div className="space-y-3">
            <p className="text-xs text-tts-muted">Paste the XDR after you signed it with your wallet.</p>
            <textarea
              value={signedXdr}
              onChange={(e) => setSignedXdr(e.target.value)}
              placeholder="Signed XDR (base64)..."
              className="w-full rounded border border-tts-border bg-tts-bg p-2 font-mono text-xs text-tts-deep resize-none min-h-[80px] focus:outline-none focus:border-tts-gold"
            />
            <Button
              onClick={verifySigned}
              disabled={verifyLoading || !signedXdr || !stellarAddress}
              size="sm"
              className="w-full gap-2"
            >
              {verifyLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
              Verify & get token
            </Button>
            {verifyError && <p className="text-xs text-tts-error">{verifyError}</p>}
          </div>
        </OperationalCard>

        {/* ── Session / Token ──────────────────────────────────────── */}
        <OperationalCard>
          <h2 className="mb-3 text-sm font-bold text-tts-deep">Session</h2>
          {token ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-tts-confirm text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Authenticated
              </div>
              <div className="text-xs space-y-1">
                <div><span className="text-tts-muted">Address:</span> <span className="font-mono">{sessionAddress}</span></div>
                <div><span className="text-tts-muted">Wallet:</span> {selectedWallet}</div>
                <div><span className="text-tts-muted">Expires:</span> {tokenExpiry ? new Date(tokenExpiry).toLocaleString() : "—"}</div>
              </div>
              <div className="relative rounded border border-tts-border bg-tts-bg p-2">
                <p className="font-mono text-xs break-all text-tts-muted pr-8">{token.slice(0, 60)}...</p>
                <button onClick={() => copyText(token)} className="absolute right-2 top-2 text-tts-muted hover:text-tts-deep">
                  <Copy className="h-3 w-3" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={validateToken} disabled={validateLoading} variant="outline" size="sm" className="gap-2">
                  {validateLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                  Validate token
                </Button>
                <Button onClick={clearSession} variant="outline" size="sm" className="gap-2">
                  <LogOut className="h-3 w-3" /> Clear session
                </Button>
              </div>

              {validateResult && (
                <div className={`rounded border p-2 text-xs ${validateResult.valid ? "border-tts-confirm bg-tts-confirm/5 text-tts-confirm" : "border-tts-error bg-tts-error/5 text-tts-error"}`}>
                  {validateResult.valid
                    ? `Valid — ${validateResult.stellar_address} (${validateResult.wallet_type})`
                    : "Invalid or expired token"}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-tts-muted italic py-4 text-center">
              Complete steps 1 and 2 to get a session token.
            </div>
          )}
        </OperationalCard>
      </div>
    </OperationalPage>
  );
}
