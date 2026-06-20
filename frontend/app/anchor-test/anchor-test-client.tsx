"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  Search,
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

// ── Constants ─────────────────────────────────────────────────────────

const SEP24_BASE = "/api/sep24";

const DEFAULT_ANCHORS = [
  { name: "MoneyGram", domain: "stellar.moneygram.com" },
  { name: "Vibrant", domain: "vibrant.io" },
  { name: "Anclap", domain: "www.anclap.com" },
];

// ── Types ─────────────────────────────────────────────────────────────

type Anchor = { name: string; domain: string; description?: string; assets?: string[] };

type TomlData = {
  TRANSFER_SERVER_SEP0024?: string;
  WEB_AUTH_ENDPOINT?: string;
  SIGNING_KEY?: string;
  CURRENCIES?: Array<{ code: string; deposit?: boolean; withdraw?: boolean }>;
};

type InfoData = {
  deposit?: Record<string, { enabled: boolean; fee_fixed?: number; min_amount?: number; max_amount?: number }>;
  withdraw?: Record<string, { enabled: boolean; fee_fixed?: number; min_amount?: number; max_amount?: number }>;
};

type Sep24Tx = {
  id?: string;
  kind?: string;
  status?: string;
  amount_in?: string;
  amount_out?: string;
  amount_fee?: string;
  stellar_transaction_id?: string;
  more_info_url?: string;
  started_at?: string;
  completed_at?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────

async function runApi(method: string, path: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(payload.error || payload.message || `HTTP ${r.status}`);
  }
  return payload;
}

function statusColor(status?: string): "success" | "warning" | "error" | "info" | "neutral" {
  if (!status) return "neutral";
  if (status === "completed") return "success";
  if (status === "error" || status === "expired") return "error";
  if (status === "pending_stellar" || status === "pending_anchor" || status === "pending_external") return "warning";
  return "info";
}

// ── Component ─────────────────────────────────────────────────────────

export default function AnchorTestClient() {
  const [anchors, setAnchors] = useState<Anchor[]>(DEFAULT_ANCHORS);
  const [selectedDomain, setSelectedDomain] = useState("stellar.moneygram.com");
  const [customDomain, setCustomDomain] = useState("");

  const [toml, setToml] = useState<TomlData | null>(null);
  const [info, setInfo] = useState<InfoData | null>(null);
  const [loadingToml, setLoadingToml] = useState(false);
  const [tomlError, setTomlError] = useState("");

  const [userPublicKey, setUserPublicKey] = useState("");
  const [userSecret, setUserSecret] = useState("");
  const [jwt, setJwt] = useState("");
  const [jwtExpiry, setJwtExpiry] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const [assetCode, setAssetCode] = useState("USDC");
  const [amount, setAmount] = useState("");
  const [interactiveUrl, setInteractiveUrl] = useState("");
  const [interactiveTxId, setInteractiveTxId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const [transactions, setTransactions] = useState<Sep24Tx[]>([]);
  const [txsLoading, setTxsLoading] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState("");
  const [txDetail, setTxDetail] = useState<Sep24Tx | null>(null);

  const activeDomain = customDomain.trim() || selectedDomain;

  // Load anchors list from server
  useEffect(() => {
    runApi("GET", `${SEP24_BASE}/anchors`)
      .then((p) => { if (p.anchors?.length) setAnchors(p.anchors); })
      .catch(() => {});
  }, []);

  // ── TOML + Info fetch ─────────────────────────────────────────────

  const fetchTomlAndInfo = useCallback(async () => {
    setLoadingToml(true);
    setTomlError("");
    setToml(null);
    setInfo(null);
    try {
      const p = await runApi("GET", `${SEP24_BASE}/anchors/${encodeURIComponent(activeDomain)}/info`);
      setToml(p.toml ?? null);
      setInfo(p.info ?? null);
      // Pre-fill asset from TOML currencies
      const currencies = p.toml?.CURRENCIES;
      if (currencies?.length) setAssetCode(currencies[0].code || "USDC");
    } catch (e: unknown) {
      setTomlError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingToml(false);
    }
  }, [activeDomain]);

  // ── SEP-10 Auth ───────────────────────────────────────────────────

  const authenticate = useCallback(async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const p = await runApi("POST", `${SEP24_BASE}/auth`, {
        domain: activeDomain,
        user_public_key: userPublicKey,
        user_secret: userSecret,
      });
      setJwt(p.token || "");
      setJwtExpiry(p.expiresAt || "");
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthLoading(false);
    }
  }, [activeDomain, userPublicKey, userSecret]);

  // ── SEP-24 Deposit ────────────────────────────────────────────────

  const startDeposit = useCallback(async () => {
    setActionLoading(true);
    setActionError("");
    setInteractiveUrl("");
    setInteractiveTxId("");
    try {
      const p = await runApi("POST", `${SEP24_BASE}/deposit`, {
        domain: activeDomain,
        jwt,
        asset_code: assetCode,
        account: userPublicKey || undefined,
        amount: amount || undefined,
      });
      setInteractiveUrl(p.url || "");
      setInteractiveTxId(p.id || "");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(false);
    }
  }, [activeDomain, jwt, assetCode, userPublicKey, amount]);

  // ── SEP-24 Withdraw ───────────────────────────────────────────────

  const startWithdrawal = useCallback(async () => {
    setActionLoading(true);
    setActionError("");
    setInteractiveUrl("");
    setInteractiveTxId("");
    try {
      const p = await runApi("POST", `${SEP24_BASE}/withdraw`, {
        domain: activeDomain,
        jwt,
        asset_code: assetCode,
        account: userPublicKey || undefined,
        amount: amount || undefined,
      });
      setInteractiveUrl(p.url || "");
      setInteractiveTxId(p.id || "");
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(false);
    }
  }, [activeDomain, jwt, assetCode, userPublicKey, amount]);

  // ── Transaction list ──────────────────────────────────────────────

  const loadTransactions = useCallback(async () => {
    if (!jwt) return;
    setTxsLoading(true);
    try {
      const p = await runApi(
        "GET",
        `${SEP24_BASE}/transactions?domain=${encodeURIComponent(activeDomain)}&jwt=${encodeURIComponent(jwt)}&asset_code=${assetCode}&limit=20`,
      );
      setTransactions(p.transactions || []);
    } catch {
      setTransactions([]);
    } finally {
      setTxsLoading(false);
    }
  }, [activeDomain, jwt, assetCode]);

  const loadTxDetail = useCallback(async () => {
    if (!jwt || !selectedTxId) return;
    try {
      const p = await runApi(
        "GET",
        `${SEP24_BASE}/transactions/${encodeURIComponent(selectedTxId)}?domain=${encodeURIComponent(activeDomain)}&jwt=${encodeURIComponent(jwt)}`,
      );
      setTxDetail(p.transaction ?? null);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  }, [activeDomain, jwt, selectedTxId]);

  // ── Render ────────────────────────────────────────────────────────

  return (
    <OperationalPage>
      <OperationalHeader
        title="SEP-24 Anchor test"
        subtitle="MoneyGram, Vibrant, Anclap — interactive deposit/withdrawal"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Step 1: Anchor selection ─────────────────────────────── */}
        <OperationalCard title="1. Select anchor">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {anchors.map((a) => (
                <button
                  key={a.domain}
                  onClick={() => { setSelectedDomain(a.domain); setCustomDomain(""); setToml(null); setInfo(null); setJwt(""); }}
                  className={`rounded border px-3 py-2 text-left text-xs transition-colors ${
                    activeDomain === a.domain && !customDomain
                      ? "border-tts-gold bg-tts-gold/10 text-tts-deep"
                      : "border-tts-border text-tts-muted hover:border-tts-gold/50"
                  }`}
                >
                  <div className="font-semibold">{a.name}</div>
                  <div className="truncate opacity-70">{a.domain}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Custom domain (e.g. myanchor.io)"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="text-sm"
              />
            </div>

            <div className="text-xs text-tts-muted">
              Active: <span className="font-mono text-tts-deep">{activeDomain}</span>
            </div>

            <Button
              onClick={fetchTomlAndInfo}
              disabled={loadingToml}
              variant="outline"
              size="sm"
              className="w-full gap-2"
            >
              {loadingToml ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Fetch TOML + Info
            </Button>

            {tomlError && <p className="text-xs text-tts-error">{tomlError}</p>}

            {toml && (
              <div className="space-y-2 rounded border border-tts-border bg-tts-bg p-3 text-xs">
                <div><span className="text-tts-muted">Transfer server:</span> <span className="font-mono text-tts-deep break-all">{toml.TRANSFER_SERVER_SEP0024 || "—"}</span></div>
                <div><span className="text-tts-muted">Web auth:</span> <span className="font-mono text-tts-deep break-all">{toml.WEB_AUTH_ENDPOINT || "—"}</span></div>
                <div><span className="text-tts-muted">Signing key:</span> <span className="font-mono text-tts-deep break-all">{toml.SIGNING_KEY?.slice(0, 10)}...</span></div>
                {toml.CURRENCIES && (
                  <div className="flex flex-wrap gap-1">
                    {toml.CURRENCIES.map((c) => (
                      <span key={c.code} className="rounded bg-tts-gold/10 px-2 py-0.5 text-tts-gold text-xs font-mono">{c.code}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {info && (
              <div className="space-y-1 rounded border border-tts-border bg-tts-bg p-3 text-xs">
                <div className="font-semibold text-tts-deep mb-1">Deposit assets</div>
                {Object.entries(info.deposit || {}).map(([code, d]) => (
                  <div key={code} className="flex items-center justify-between">
                    <span className="font-mono">{code}</span>
                    <StatusPill status={d.enabled ? "success" : "error"} label={d.enabled ? "enabled" : "disabled"} />
                    {d.fee_fixed != null && <span className="text-tts-muted">${d.fee_fixed} fee</span>}
                    {d.min_amount != null && <span className="text-tts-muted">min ${d.min_amount}</span>}
                  </div>
                ))}
                <div className="font-semibold text-tts-deep mt-2 mb-1">Withdraw assets</div>
                {Object.entries(info.withdraw || {}).map(([code, d]) => (
                  <div key={code} className="flex items-center justify-between">
                    <span className="font-mono">{code}</span>
                    <StatusPill status={d.enabled ? "success" : "error"} label={d.enabled ? "enabled" : "disabled"} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </OperationalCard>

        {/* ── Step 2: SEP-10 Auth ──────────────────────────────────── */}
        <OperationalCard title="2. SEP-10 Authentication">
          <div className="space-y-3">
            <p className="text-xs text-tts-muted">
              The anchor issues a challenge tx — we sign it with the user secret and get a JWT.
              In production the wallet signs client-side (no secret needed here).
            </p>
            <Input
              placeholder="Stellar public key (G...)"
              value={userPublicKey}
              onChange={(e) => setUserPublicKey(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              placeholder="Stellar secret key (S...) — test only"
              value={userSecret}
              onChange={(e) => setUserSecret(e.target.value)}
              type="password"
              className="font-mono text-xs"
            />
            <Button
              onClick={authenticate}
              disabled={authLoading || !userPublicKey || !userSecret}
              size="sm"
              className="w-full gap-2"
            >
              {authLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
              Authenticate
            </Button>
            {authError && <p className="text-xs text-tts-error">{authError}</p>}
            {jwt && (
              <div className="rounded border border-tts-confirm bg-tts-confirm/5 p-3 space-y-1">
                <div className="flex items-center gap-2 text-tts-confirm text-xs font-semibold">
                  <CheckCircle2 className="h-3 w-3" /> Authenticated
                </div>
                <div className="text-xs text-tts-muted">Expires: {jwtExpiry ? new Date(jwtExpiry).toLocaleString() : "—"}</div>
                <div className="font-mono text-xs text-tts-muted break-all">{jwt.slice(0, 40)}...</div>
              </div>
            )}
          </div>
        </OperationalCard>

        {/* ── Step 3: Deposit / Withdraw ───────────────────────────── */}
        <OperationalCard title="3. Deposit / Withdraw">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-tts-muted mb-1 block">Asset</label>
                <Input
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
                  placeholder="USDC"
                  className="text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs text-tts-muted mb-1 block">Amount (optional)</label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 50"
                  className="text-sm"
                />
              </div>
            </div>

            {!jwt && (
              <p className="text-xs text-tts-muted italic">Complete SEP-10 auth first to get a JWT.</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={startDeposit}
                disabled={actionLoading || !jwt}
                size="sm"
                className="gap-2"
              >
                {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Deposit
              </Button>
              <Button
                onClick={startWithdrawal}
                disabled={actionLoading || !jwt}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                {actionLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Withdraw
              </Button>
            </div>

            {actionError && <p className="text-xs text-tts-error">{actionError}</p>}

            {interactiveUrl && (
              <div className="rounded border border-tts-confirm bg-tts-confirm/5 p-3 space-y-2">
                <div className="text-xs font-semibold text-tts-confirm">Interactive flow started</div>
                <div className="text-xs text-tts-muted">Transaction ID: <span className="font-mono">{interactiveTxId}</span></div>
                <a
                  href={interactiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-tts-gold underline"
                >
                  Open anchor UI <ExternalLink className="h-3 w-3" />
                </a>
                <Button
                  onClick={() => { setSelectedTxId(interactiveTxId); loadTxDetail(); }}
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                >
                  <RefreshCw className="h-3 w-3" /> Check status
                </Button>
              </div>
            )}
          </div>
        </OperationalCard>

        {/* ── Step 4: Transaction history ──────────────────────────── */}
        <OperationalCard title="4. Transaction history">
          <div className="space-y-3">
            <Button
              onClick={loadTransactions}
              disabled={txsLoading || !jwt}
              variant="outline"
              size="sm"
              className="w-full gap-2"
            >
              {txsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Load transactions
            </Button>

            {transactions.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {transactions.map((tx) => (
                  <button
                    key={tx.id}
                    onClick={() => { setSelectedTxId(tx.id || ""); setTxDetail(tx); }}
                    className="w-full rounded border border-tts-border p-2 text-left text-xs hover:border-tts-gold/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-tts-deep">{tx.id?.slice(0, 12)}...</span>
                      <StatusPill status={statusColor(tx.status)} label={tx.status || "unknown"} />
                    </div>
                    <div className="text-tts-muted mt-1 flex gap-3">
                      <span>{tx.kind}</span>
                      {tx.amount_in && <span>in: {tx.amount_in}</span>}
                      {tx.amount_out && <span>out: {tx.amount_out}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {txDetail && (
              <div className="rounded border border-tts-border bg-tts-bg p-3 text-xs space-y-1">
                <div className="font-semibold text-tts-deep">Detail</div>
                <div><span className="text-tts-muted">ID:</span> <span className="font-mono">{txDetail.id}</span></div>
                <div><span className="text-tts-muted">Status:</span> <StatusPill status={statusColor(txDetail.status)} label={txDetail.status || "—"} /></div>
                <div><span className="text-tts-muted">Kind:</span> {txDetail.kind}</div>
                {txDetail.amount_in && <div><span className="text-tts-muted">Amount in:</span> {txDetail.amount_in}</div>}
                {txDetail.amount_out && <div><span className="text-tts-muted">Amount out:</span> {txDetail.amount_out}</div>}
                {txDetail.amount_fee && <div><span className="text-tts-muted">Fee:</span> {txDetail.amount_fee}</div>}
                {txDetail.stellar_transaction_id && <div><span className="text-tts-muted">Stellar tx:</span> <span className="font-mono break-all">{txDetail.stellar_transaction_id}</span></div>}
                {txDetail.more_info_url && (
                  <a href={txDetail.more_info_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-tts-gold underline">
                    View on anchor <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </OperationalCard>
      </div>
    </OperationalPage>
  );
}
