"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TrendingUp,
  Loader2,
  Copy,
  AlertTriangle,
  Info,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  DollarSign,
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

const DEFINDEX_BASE = "/api/defindex";
const ANNUAL_APY = 8.6;

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

export default function YieldClient() {
  // Vault info
  const [vaultInfo, setVaultInfo] = useState<Record<string, unknown> | null>(null);
  const [vaultInfoLoading, setVaultInfoLoading] = useState(false);
  const [vaultInfoError, setVaultInfoError] = useState<string | null>(null);

  // User address
  const [userAddress, setUserAddress] = useState("");

  // Balance
  const [balanceResult, setBalanceResult] = useState<Record<string, unknown> | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Deposit
  const [depositAmount, setDepositAmount] = useState("");
  const [depositXdr, setDepositXdr] = useState<string | null>(null);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositCopied, setDepositCopied] = useState(false);

  // Withdraw
  const [withdrawShares, setWithdrawShares] = useState("");
  const [withdrawXdr, setWithdrawXdr] = useState<string | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawCopied, setWithdrawCopied] = useState(false);

  // Load vault info on mount
  useEffect(() => {
    setVaultInfoLoading(true);
    runApi("GET", `${DEFINDEX_BASE}/vault/info`)
      .then((data) => setVaultInfo(data))
      .catch((e) => setVaultInfoError(e.message))
      .finally(() => setVaultInfoLoading(false));
  }, []);

  const loadBalance = useCallback(async () => {
    if (!userAddress) return;
    setBalanceLoading(true);
    setBalanceError(null);
    setBalanceResult(null);
    try {
      const data = await runApi("GET", `${DEFINDEX_BASE}/vault/balance?address=${encodeURIComponent(userAddress)}`);
      setBalanceResult(data);
    } catch (e: unknown) {
      setBalanceError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBalanceLoading(false);
    }
  }, [userAddress]);

  const buildDeposit = useCallback(async () => {
    if (!userAddress || !depositAmount) return;
    setDepositLoading(true);
    setDepositError(null);
    setDepositXdr(null);
    try {
      const stroops = String(Math.round(parseFloat(depositAmount) * 10_000_000));
      const data = await runApi("POST", `${DEFINDEX_BASE}/vault/deposit`, {
        user_address: userAddress,
        amount_stroops: stroops,
      });
      setDepositXdr(data.xdr || data.transaction_xdr || JSON.stringify(data));
    } catch (e: unknown) {
      setDepositError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDepositLoading(false);
    }
  }, [userAddress, depositAmount]);

  const buildWithdraw = useCallback(async () => {
    if (!userAddress || !withdrawShares) return;
    setWithdrawLoading(true);
    setWithdrawError(null);
    setWithdrawXdr(null);
    try {
      const data = await runApi("POST", `${DEFINDEX_BASE}/vault/withdraw`, {
        user_address: userAddress,
        shares_amount: withdrawShares,
      });
      setWithdrawXdr(data.xdr || data.transaction_xdr || JSON.stringify(data));
    } catch (e: unknown) {
      setWithdrawError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setWithdrawLoading(false);
    }
  }, [userAddress, withdrawShares]);

  const dailyEarnings =
    balanceResult && depositAmount
      ? (parseFloat(depositAmount) * ANNUAL_APY / 100 / 365).toFixed(4)
      : null;

  const vaultAddress = vaultInfo
    ? ((vaultInfo.vault_address || vaultInfo.vault || vaultInfo.address) as string | undefined)
    : null;

  return (
    <OperationalPage size="xl">
      <OperationalHeader
        eyebrow="DeFi / Yield"
        title="DeFindex Yield Vault"
        description="Earn 8.6% APY on idle USDC via DeFindex and Blend Protocol on Stellar Testnet. Deposits are non-custodial — you sign with your own wallet."
        actions={
          <StatusPill tone={vaultInfo ? "confirm" : "default"}>
            {vaultInfo ? "Vault Online" : "Loading…"}
          </StatusPill>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <OperationalStat
          label="APY"
          value="8.6%"
          detail="USDC annual yield"
          tone="gold"
        />
        <OperationalStat
          label="Protocol"
          value="Blend v2"
          detail="Overcollateralized lending"
        />
        <OperationalStat
          label="TVL Source"
          value="DeFindex"
          detail="Yield routing layer"
        />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

        {/* Card 1: Vault Info */}
        <OperationalCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
            <TrendingUp className="h-4 w-4 text-tts-gold" />
            Vault Info
          </h2>

          {vaultInfoLoading && (
            <div className="flex items-center gap-2 text-sm text-tts-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading vault info…
            </div>
          )}

          {vaultInfoError && (
            <div className="flex items-start gap-2 rounded border border-tts-error/25 bg-tts-error/10 p-3 text-xs text-tts-error">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {vaultInfoError}
            </div>
          )}

          {vaultInfo && !vaultInfoLoading && (
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs font-semibold text-tts-muted">Vault Contract</p>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 truncate rounded bg-tts-bg px-2 py-1 text-xs text-tts-deep">
                    {vaultAddress
                      ? `${vaultAddress.slice(0, 12)}…${vaultAddress.slice(-8)}`
                      : "—"}
                  </code>
                  {vaultAddress && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 p-0"
                      onClick={() => copyText(vaultAddress)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-tts-muted">Status</p>
                <StatusPill tone="confirm">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Active
                </StatusPill>
              </div>
              {Object.entries(vaultInfo)
                .filter(([k]) => !["vault_address", "vault", "address"].includes(k))
                .slice(0, 4)
                .map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs font-semibold text-tts-muted">{k}</p>
                    <p className="mt-0.5 text-xs text-tts-deep">{String(v)}</p>
                  </div>
                ))}
            </div>
          )}
        </OperationalCard>

        {/* Card 2: My Position */}
        <OperationalCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
            <DollarSign className="h-4 w-4 text-tts-gold" />
            My Position
          </h2>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Your Stellar Address</p>
              <Input
                placeholder="G…"
                value={userAddress}
                onChange={(e) => setUserAddress(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <Button
              size="sm"
              onClick={loadBalance}
              disabled={!userAddress || balanceLoading}
              className="w-full"
            >
              {balanceLoading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</>
              ) : "Load Balance"}
            </Button>

            {balanceError && (
              <div className="flex items-start gap-2 rounded border border-tts-error/25 bg-tts-error/10 p-3 text-xs text-tts-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {balanceError}
              </div>
            )}

            {balanceResult && (
              <div className="rounded border border-tts-confirm/25 bg-tts-confirm/10 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-tts-confirm" />
                  <span className="text-sm font-bold text-tts-deep">
                    {String(balanceResult.balance ?? balanceResult.usdc_balance ?? "—")} USDC
                  </span>
                </div>
                {dailyEarnings && (
                  <p className="text-xs text-tts-muted">
                    Voce ganha ~{dailyEarnings} USDC por dia (aprox. R$0,65/dia) a 8.6% APY
                  </p>
                )}
                <p className="text-xs text-tts-muted italic">
                  Exemplo: 500 USDC a 8.6% APY = ~0.1178 USDC por dia (R$0,65/dia aprox.)
                </p>
              </div>
            )}
          </div>
        </OperationalCard>

        {/* Card 3: Deposit */}
        <OperationalCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
            <ArrowDown className="h-4 w-4 text-tts-confirm" />
            Deposit USDC
          </h2>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Amount (USDC)</p>
              <Input
                type="number"
                min="0"
                step="any"
                placeholder="100.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>

            <Button
              size="sm"
              onClick={buildDeposit}
              disabled={!userAddress || !depositAmount || depositLoading}
              className="w-full"
            >
              {depositLoading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Building…</>
              ) : "Build Deposit XDR"}
            </Button>

            {depositError && (
              <div className="flex items-start gap-2 rounded border border-tts-error/25 bg-tts-error/10 p-3 text-xs text-tts-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {depositError}
              </div>
            )}

            {depositXdr && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-tts-muted">Transaction XDR</p>
                <textarea
                  readOnly
                  rows={4}
                  value={depositXdr}
                  className="w-full resize-none rounded border border-tts-border bg-tts-bg p-2 font-mono text-xs text-tts-deep focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    await copyText(depositXdr);
                    setDepositCopied(true);
                    setTimeout(() => setDepositCopied(false), 2000);
                  }}
                >
                  {depositCopied ? (
                    <><CheckCircle2 className="mr-2 h-3.5 w-3.5 text-tts-confirm" />Copied!</>
                  ) : (
                    <><Copy className="mr-2 h-3.5 w-3.5" />Copy XDR</>
                  )}
                </Button>
                <ol className="space-y-0.5 text-xs text-tts-muted">
                  <li>1. Copy this XDR</li>
                  <li>2. Sign in your Stellar wallet (Freighter, Stellar Lab)</li>
                  <li>3. Submit to network</li>
                </ol>
                <a
                  href="https://laboratory.stellar.org/#txsigner"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-tts-gold underline"
                >
                  Sign on Stellar Lab →
                </a>
              </div>
            )}
          </div>
        </OperationalCard>

        {/* Card 4: Withdraw */}
        <OperationalCard>
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-tts-deep">
            <ArrowUp className="h-4 w-4 text-tts-error" />
            Withdraw
          </h2>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-semibold text-tts-muted">Shares Amount</p>
              <Input
                type="text"
                placeholder="e.g. 1000000"
                value={withdrawShares}
                onChange={(e) => setWithdrawShares(e.target.value)}
                className="font-mono text-xs"
              />
            </div>

            <Button
              size="sm"
              onClick={buildWithdraw}
              disabled={!userAddress || !withdrawShares || withdrawLoading}
              className="w-full"
            >
              {withdrawLoading ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Building…</>
              ) : "Build Withdraw XDR"}
            </Button>

            {withdrawError && (
              <div className="flex items-start gap-2 rounded border border-tts-error/25 bg-tts-error/10 p-3 text-xs text-tts-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {withdrawError}
              </div>
            )}

            {withdrawXdr && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-tts-muted">Transaction XDR</p>
                <textarea
                  readOnly
                  rows={4}
                  value={withdrawXdr}
                  className="w-full resize-none rounded border border-tts-border bg-tts-bg p-2 font-mono text-xs text-tts-deep focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    await copyText(withdrawXdr);
                    setWithdrawCopied(true);
                    setTimeout(() => setWithdrawCopied(false), 2000);
                  }}
                >
                  {withdrawCopied ? (
                    <><CheckCircle2 className="mr-2 h-3.5 w-3.5 text-tts-confirm" />Copied!</>
                  ) : (
                    <><Copy className="mr-2 h-3.5 w-3.5" />Copy XDR</>
                  )}
                </Button>
                <ol className="space-y-0.5 text-xs text-tts-muted">
                  <li>1. Copy this XDR</li>
                  <li>2. Sign in your Stellar wallet (Freighter, Stellar Lab)</li>
                  <li>3. Submit to network</li>
                </ol>
                <a
                  href="https://laboratory.stellar.org/#txsigner"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-tts-gold underline"
                >
                  Sign on Stellar Lab →
                </a>
              </div>
            )}
          </div>
        </OperationalCard>
      </div>

      {/* Card 5: Info box full width */}
      <OperationalCard>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-tts-deep">
          <Info className="h-4 w-4 text-tts-gold" />
          What is DeFindex?
        </h2>
        <p className="text-sm leading-relaxed text-tts-muted">
          DeFindex is a yield-routing layer built on Blend Protocol. Your USDC earns approximately{" "}
          <strong className="text-tts-deep">8.6% APY</strong> — above Coinbase (~4%) and competitive
          with top DeFi protocols. The Meru wallet integrated DeFindex and saw users keep larger
          balances on-chain rather than off-ramping.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-tts-muted">
          Deposits generate a transaction XDR you sign with your own wallet (Freighter or Stellar
          Lab). Your funds are{" "}
          <strong className="text-tts-deep">non-custodial</strong> — TalkToStellar never holds
          them. The yield flows directly from Blend Protocol borrowers to your vault position.
        </p>
      </OperationalCard>
    </OperationalPage>
  );
}
