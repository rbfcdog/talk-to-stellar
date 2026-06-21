"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Fingerprint,
  Shield,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  Wallet,
  Zap,
} from "lucide-react";
import {
  OperationalCard,
  OperationalHeader,
  OperationalPage,
  StatusPill,
} from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PASSKEY_BASE = "/api/passkey-wallets";

async function runApi(method: string, path: string, body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(p.error || p.message || `HTTP ${r.status}`);
  return p;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}

export default function PasskeyWalletClient() {
  const [email, setEmail] = useState("");
  const [keyIdBase64, setKeyIdBase64] = useState<string | null>(null);
  const [contractId, setContractId] = useState("");

  const [registeredWallet, setRegisteredWallet] = useState<Record<string, unknown> | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [credentialCreated, setCredentialCreated] = useState(false);

  const [lookupAddress, setLookupAddress] = useState("");
  const [balance, setBalance] = useState<{ xlm?: string; usdc?: string } | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [signers, setSigners] = useState<unknown[]>([]);
  const [signersLoading, setSignersLoading] = useState(false);

  const [relayXdr, setRelayXdr] = useState("");
  const [relayResult, setRelayResult] = useState<Record<string, unknown> | null>(null);
  const [relayLoading, setRelayLoading] = useState(false);
  const [relayError, setRelayError] = useState<string | null>(null);

  const [webauthnSupported, setWebauthnSupported] = useState(true);

  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebauthnSupported(window.PublicKeyCredential !== undefined);
    }
  }, []);

  const createCredential = useCallback(async () => {
    setCreateLoading(true);
    setCreateError(null);
    setCredentialCreated(false);
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { id: window.location.hostname, name: "TalkToStellar" },
          user: {
            id: new TextEncoder().encode(email || "user"),
            name: email || "user",
            displayName: email || "user",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },
            { alg: -257, type: "public-key" },
          ],
          authenticatorSelection: {
            userVerification: "required",
            residentKey: "preferred",
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!credential) throw new Error("No credential returned");

      const rawIdBytes = new Uint8Array(credential.rawId);
      const base64url = btoa(String.fromCharCode(...rawIdBytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      setKeyIdBase64(base64url);
      setCredentialCreated(true);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "WebAuthn error");
    } finally {
      setCreateLoading(false);
    }
  }, [email]);

  const registerWallet = useCallback(async () => {
    if (!email || !contractId || !keyIdBase64) return;
    setRegisterLoading(true);
    setRegisterError(null);
    setRegisteredWallet(null);
    try {
      const data = await runApi("POST", `${PASSKEY_BASE}/register`, {
        email,
        contract_id: contractId,
        key_id_base64: keyIdBase64,
        network: "testnet",
        label: email,
      });
      setRegisteredWallet(data);
    } catch (e: unknown) {
      setRegisterError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRegisterLoading(false);
    }
  }, [email, contractId, keyIdBase64]);

  const loadBalance = useCallback(async () => {
    if (!lookupAddress) return;
    setBalanceLoading(true);
    setBalance(null);
    try {
      const data = await runApi("GET", `${PASSKEY_BASE}/${encodeURIComponent(lookupAddress)}/balance`);
      setBalance(data);
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [lookupAddress]);

  const loadSigners = useCallback(async () => {
    if (!lookupAddress) return;
    setSignersLoading(true);
    setSigners([]);
    try {
      const data = await runApi("GET", `${PASSKEY_BASE}/${encodeURIComponent(lookupAddress)}/signers`);
      setSigners(Array.isArray(data) ? data : data.signers ?? []);
    } catch {
      setSigners([]);
    } finally {
      setSignersLoading(false);
    }
  }, [lookupAddress]);

  const relayTx = useCallback(async () => {
    if (!relayXdr) return;
    setRelayLoading(true);
    setRelayError(null);
    setRelayResult(null);
    try {
      const data = await runApi("POST", `${PASSKEY_BASE}/relay`, { xdr: relayXdr });
      setRelayResult(data);
    } catch (e: unknown) {
      setRelayError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRelayLoading(false);
    }
  }, [relayXdr]);

  return (
    <OperationalPage size="xl">
      <OperationalHeader
        eyebrow="Smart Wallets / Passkey"
        title="Passkey Smart Wallet"
        description="Stellar smart wallets secured by Face ID or fingerprint — no seed phrase, no custodian. Powered by PasskeyKit and Launchtube."
        actions={
          <StatusPill tone={webauthnSupported ? "confirm" : "error"}>
            {webauthnSupported ? "WebAuthn Ready" : "WebAuthn Unavailable"}
          </StatusPill>
        }
      />

      {!webauthnSupported && (
        <div className="flex items-start gap-3 rounded border border-tts-error/25 bg-tts-error/10 p-4 text-sm text-tts-error">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            WebAuthn not available in this browser. Use Chrome or Safari on a device with
            Face ID or Touch ID.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Card 1: Create WebAuthn Credential */}
        <OperationalCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
            <Fingerprint className="h-4 w-4 text-tts-gold" />
            Step 1 — Create WebAuthn Credential
          </h2>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Email</p>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <Button
              size="sm"
              onClick={createCredential}
              disabled={!email || createLoading || !webauthnSupported}
              className="w-full"
            >
              {createLoading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Waiting for biometric…</>
              ) : (
                <><Fingerprint className="mr-2 h-3.5 w-3.5" />Create with Face ID / Touch ID</>
              )}
            </Button>

            {createError && (
              <div className="flex items-start gap-2 rounded border border-tts-error/25 bg-tts-error/10 p-3 text-xs text-tts-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {createError}
              </div>
            )}

            {credentialCreated && keyIdBase64 && (
              <div className="rounded border border-tts-confirm/25 bg-tts-confirm/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-tts-confirm" />
                  <span className="text-xs font-bold text-tts-confirm">Credential created!</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 truncate text-xs text-tts-deep">
                    Key ID: {keyIdBase64.slice(0, 20)}…
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 p-0"
                    onClick={async () => {
                      await copyText(keyIdBase64);
                      setKeyCopied(true);
                      setTimeout(() => setKeyCopied(false), 2000);
                    }}
                  >
                    {keyCopied ? (
                      <CheckCircle2 className="h-3 w-3 text-tts-confirm" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-tts-muted">
              In production, PasskeyKit automatically deploys a Soroban contract. For this test,
              enter the contract_id from{" "}
              <a
                href="https://stellarsandbox.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-tts-gold underline"
              >
                stellarsandbox.dev
              </a>{" "}
              in Step 2.
            </p>
          </div>
        </OperationalCard>

        {/* Card 2: Register in DB */}
        <OperationalCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
            <KeyRound className="h-4 w-4 text-tts-gold" />
            Step 2 — Register in DB
          </h2>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Contract ID (C…)</p>
              <Input
                placeholder="C…"
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            {keyIdBase64 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-tts-muted">Key ID (from Step 1)</p>
                <div className="rounded border border-tts-border bg-tts-bg px-2 py-1.5">
                  <code className="block truncate text-xs text-tts-deep">{keyIdBase64.slice(0, 32)}…</code>
                </div>
              </div>
            )}

            <Button
              size="sm"
              onClick={registerWallet}
              disabled={!email || !contractId || !keyIdBase64 || registerLoading}
              className="w-full"
            >
              {registerLoading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Registering…</>
              ) : "Register Wallet"}
            </Button>

            {registerError && (
              <div className="flex items-start gap-2 rounded border border-tts-error/25 bg-tts-error/10 p-3 text-xs text-tts-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {registerError}
              </div>
            )}

            {registeredWallet && (
              <div className="rounded border border-tts-confirm/25 bg-tts-confirm/10 p-3 space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-tts-confirm" />
                  <span className="text-xs font-bold text-tts-confirm">Registered!</span>
                </div>
                {Object.entries(registeredWallet).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-xs font-semibold text-tts-muted w-28 shrink-0">{k}</span>
                    <span className="min-w-0 truncate text-xs text-tts-deep">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </OperationalCard>

        {/* Card 3: Check Wallet Balance */}
        <OperationalCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
            <Wallet className="h-4 w-4 text-tts-gold" />
            Check Wallet Balance
          </h2>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Contract ID or Stellar Address</p>
              <Input
                placeholder="C… or G…"
                value={lookupAddress}
                onChange={(e) => setLookupAddress(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={loadBalance}
                disabled={!lookupAddress || balanceLoading}
                className="flex-1"
              >
                {balanceLoading ? (
                  <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</>
                ) : "Load Balance"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={loadSigners}
                disabled={!lookupAddress || signersLoading}
                className="flex-1"
              >
                {signersLoading ? (
                  <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</>
                ) : "Load Signers"}
              </Button>
            </div>

            {balance && (
              <div className="rounded border border-tts-border bg-tts-bg p-3 space-y-1.5">
                <p className="text-xs font-bold text-tts-deep mb-2">Balances</p>
                <div className="flex justify-between">
                  <span className="text-xs text-tts-muted">XLM</span>
                  <span className="text-xs font-semibold text-tts-deep">{balance.xlm ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-tts-muted">USDC</span>
                  <span className="text-xs font-semibold text-tts-deep">{balance.usdc ?? "—"}</span>
                </div>
              </div>
            )}

            {signers.length > 0 && (
              <div className="rounded border border-tts-border bg-tts-bg p-3 space-y-2">
                <p className="text-xs font-bold text-tts-deep mb-2">Signers ({signers.length})</p>
                {signers.map((signer, i) => {
                  const s = signer as Record<string, unknown>;
                  return (
                    <div key={i} className="rounded border border-tts-border bg-tts-surface p-2 space-y-0.5">
                      {Object.entries(s).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-xs font-semibold text-tts-muted w-20 shrink-0">{k}</span>
                          <span className="min-w-0 truncate text-xs text-tts-deep">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </OperationalCard>

        {/* Card 4: Relay via Launchtube */}
        <OperationalCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
            <Zap className="h-4 w-4 text-tts-gold" />
            Relay Transaction via Launchtube
          </h2>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Signed XDR</p>
              <textarea
                rows={4}
                placeholder="Paste signed transaction XDR here…"
                value={relayXdr}
                onChange={(e) => setRelayXdr(e.target.value)}
                className="w-full resize-none rounded border border-tts-border bg-tts-bg p-2 font-mono text-xs text-tts-deep placeholder:text-tts-muted focus:outline-none focus:ring-1 focus:ring-tts-gold"
              />
            </div>

            <Button
              size="sm"
              onClick={relayTx}
              disabled={!relayXdr || relayLoading}
              className="w-full"
            >
              {relayLoading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Submitting…</>
              ) : (
                <><Zap className="mr-2 h-3.5 w-3.5" />Submit via Launchtube</>
              )}
            </Button>

            {relayError && (
              <div className="flex items-start gap-2 rounded border border-tts-error/25 bg-tts-error/10 p-3 text-xs text-tts-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {relayError}
              </div>
            )}

            {relayResult && (
              <div className="rounded border border-tts-confirm/25 bg-tts-confirm/10 p-3 space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-tts-confirm" />
                  <span className="text-xs font-bold text-tts-confirm">Submitted!</span>
                </div>
                {Object.entries(relayResult).slice(0, 6).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="text-xs font-semibold text-tts-muted w-24 shrink-0">{k}</span>
                    <span className="min-w-0 truncate text-xs text-tts-deep">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-tts-muted">
              <Shield className="mr-1 inline h-3 w-3" />
              Launchtube sponsors transaction fees — no XLM needed in the smart wallet.
            </p>
          </div>
        </OperationalCard>
      </div>

      {/* Card 5: Info box full width */}
      <OperationalCard>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Shield className="h-4 w-4 text-tts-gold" />
          How passkey wallets work
        </h2>
        <ol className="space-y-2">
          {[
            "Browser creates a WebAuthn credential (triggers Face ID / fingerprint on your device).",
            "PasskeyKit deploys a Soroban smart contract — this IS your wallet. No hot key stored anywhere.",
            "Launchtube sponsors all transaction fees, so the smart wallet needs no XLM to operate.",
            "Every payment: Face ID prompt → sign → submit. No seed phrase. No mnemonic. Ever.",
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-tts-muted">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-tts-gold text-xs font-bold text-tts-gold">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </OperationalCard>
    </OperationalPage>
  );
}
