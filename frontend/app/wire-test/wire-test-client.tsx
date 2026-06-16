"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clipboard,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Network,
  RefreshCw,
  Send,
  ShieldCheck,
  WalletCards,
  XCircle,
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
import { cn } from "@/lib/utils";

const DEFAULT_TRANSFER_ID = "tr_d2_circle_stellar_payment_2";
const OPS_SECRET_STORAGE_KEY = "tts-wire-test-ops-secret";

type JsonRecord = Record<string, unknown>;

type ProviderCapability = {
  provider_name?: string;
  display_name?: string;
  execution_mode?: string;
  configured?: boolean;
  execution_enabled?: boolean;
  requirements?: string[];
  blockers?: string[];
  notes?: string[];
  supports?: Record<string, boolean>;
};

type EvidenceChecklistItem = {
  id?: string;
  label?: string;
  ready?: boolean;
  artifact?: string;
};

type PayoutEvidence = {
  generated_at?: string;
  transfer_id?: string;
  ready?: boolean;
  submission?: {
    ready_count?: number;
    required_count?: number;
    status?: string;
  };
  checklist?: EvidenceChecklistItem[];
  provider?: ProviderCapability;
  execution_mode?: string;
  rail?: {
    route?: string;
    on_ramp_provider?: string;
    settlement_asset_code?: string;
    settlement_network?: string;
    off_ramp_provider?: string;
    off_ramp_source_asset_code?: string;
    payout_currency?: string;
  };
  settlement?: {
    attached?: boolean;
    stellar_tx_hash?: string;
    asset_code?: string;
    amount_usd?: string;
  };
  identity_control?: {
    same_name_required?: boolean;
    same_name_status?: string;
    payout_allowed?: boolean;
  };
  instruction?: {
    created?: boolean;
    instruction_id?: string;
    provider_reference_hash?: string;
    status?: string;
    created_at?: string;
    updated_at?: string;
  };
  status_history?: Array<{
    status?: string;
    source?: string;
    observed_at?: string;
    raw_status?: string;
  }>;
  destination?: {
    bank_name?: string;
    country?: string;
    provider_label?: string;
    account_number_last4?: string;
    routing_number_last4?: string;
  };
  compatibility?: {
    circle?: ProviderCapability;
    bridge?: ProviderCapability;
  };
};

type TransferSnapshot = {
  transfer_id?: string;
  status?: string;
  payout_status?: string;
  payout_instruction_id?: string;
  stellar_tx_hash?: string;
  quoted_usd_amount?: string;
};

type ApiResponse = JsonRecord & {
  success?: boolean;
  message?: string;
  error?: string;
  providers?: ProviderCapability[];
  payout_evidence?: PayoutEvidence;
  transfer?: TransferSnapshot;
};

type ApiOptions = {
  method?: "GET" | "POST";
  body?: JsonRecord;
  requiresOps?: boolean;
};

type LastResult = {
  label: string;
  path: string;
  status: number;
  at: string;
};

function text(value: unknown, fallback = "-") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function boolText(value: unknown) {
  return value ? "Yes" : "No";
}

function short(value: unknown, left = 12, right = 8) {
  const normalized = text(value, "");
  if (!normalized) return "-";
  if (normalized.length <= left + right + 3) return normalized;
  return `${normalized.slice(0, left)}...${normalized.slice(-right)}`;
}

function isoTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function statusTone(value?: string | boolean): "default" | "gold" | "confirm" | "error" {
  if (value === true) return "confirm";
  const normalized = String(value || "").toLowerCase();
  if (["ready", "completed", "complete", "success", "configured", "sandbox_api", "live_api"].includes(normalized)) {
    return "confirm";
  }
  if (["failed", "error", "missing", "blocked", "false"].includes(normalized)) return "error";
  if (["pending", "instruction_created", "created"].includes(normalized)) return "gold";
  return "default";
}

function stellarExpertUrl(hash?: string) {
  const normalized = text(hash, "");
  return normalized ? `https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(normalized)}` : "";
}

function DetailRow({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) {
  return (
    <div className="grid gap-1 border-t border-tts-border py-3 first:border-t-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-bold uppercase text-tts-muted">{label}</dt>
      <dd className={cn("min-w-0 break-words text-sm font-semibold text-tts-deep", mono && "font-mono-financial")}>
        {text(value)}
      </dd>
    </div>
  );
}

function CopyButton({ value, label, onCopied }: { value: string; label: string; onCopied: (label: string) => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void navigator.clipboard.writeText(value).then(() => onCopied(label))}
      disabled={!value}
      aria-label={`Copy ${label}`}
    >
      <Copy className="mr-2 h-4 w-4" />
      Copy
    </Button>
  );
}

function EndpointRow({ method, path, onCopied }: { method: string; path: string; onCopied: (label: string) => void }) {
  return (
    <div className="grid gap-3 border-t border-tts-border py-3 first:border-t-0 md:grid-cols-[5rem_minmax(0,1fr)_6rem] md:items-center">
      <StatusPill tone={method === "GET" ? "default" : "gold"}>{method}</StatusPill>
      <code className="min-w-0 break-all rounded-md border border-tts-border bg-tts-bg px-3 py-2 text-xs text-tts-deep">
        {path}
      </code>
      <CopyButton value={path} label={path} onCopied={onCopied} />
    </div>
  );
}

function Checklist({ items }: { items: EvidenceChecklistItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-tts-muted">Load payout evidence to see the checklist.</p>;
  }
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={text(item.id || item.label)} className="grid gap-3 rounded-md border border-tts-border bg-tts-bg/50 p-3 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:items-start">
          {item.ready ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-tts-confirm" aria-hidden="true" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 text-tts-error" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-tts-deep">{text(item.label)}</p>
            <p className="mt-1 break-words font-mono text-xs text-tts-muted">{text(item.artifact)}</p>
          </div>
          <StatusPill tone={item.ready ? "confirm" : "error"}>{item.ready ? "Ready" : "Open"}</StatusPill>
        </div>
      ))}
    </div>
  );
}

export default function WireTestClient() {
  const [transferId, setTransferId] = useState(DEFAULT_TRANSFER_ID);
  const [opsSecret, setOpsSecret] = useState("");
  const [providers, setProviders] = useState<ProviderCapability[]>([]);
  const [evidence, setEvidence] = useState<PayoutEvidence | null>(null);
  const [transfer, setTransfer] = useState<TransferSnapshot | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [copied, setCopied] = useState("");
  const [wireSent, setWireSent] = useState(false);
  const [wireResult, setWireResult] = useState<ApiResponse | null>(null);

  const circleProvider = useMemo(() => {
    return providers.find((provider) => provider.provider_name === "circle") ||
      evidence?.compatibility?.circle ||
      evidence?.provider;
  }, [evidence, providers]);

  const encodedTransferId = encodeURIComponent(transferId.trim() || DEFAULT_TRANSFER_ID);
  const evidencePath = `/api/transfers/${encodedTransferId}/payout-evidence`;
  const createPath = `/api/transfers/${encodedTransferId}/payout-instruction`;
  const wireSendPath = "/api/transfers/wire-test/send";
  const refreshPath = `/api/transfers/${encodedTransferId}/payout-status-refresh`;
  const providersPath = "/api/transfers/payout-providers";

  const runApi = useCallback(async (label: string, path: string, options: ApiOptions = {}) => {
    if (options.requiresOps && !opsSecret.trim()) {
      throw new Error("Paste the backend ops secret before running this wire action.");
    }
    const started = Date.now();
    setBusy(label);
    setError("");
    const headers: Record<string, string> = {
      "x-request-id": `wire_test_${Date.now().toString(36)}`,
      "x-correlation-id": `wire_test_${Date.now().toString(36)}`,
    };
    if (options.body) headers["content-type"] = "application/json";
    if (options.requiresOps) {
      const secret = opsSecret.trim();
      headers.authorization = `Bearer ${secret}`;
      headers["x-international-transfer-ops-secret"] = secret;
      headers["x-ops-token"] = secret;
    }

    try {
      const response = await fetch(path, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as ApiResponse;
      setLastResult({
        label,
        path,
        status: response.status,
        at: new Date(started).toISOString(),
      });
      if (!response.ok || payload.success === false) {
        throw new Error(payload.message || payload.error || `${label} failed with HTTP ${response.status}`);
      }
      return payload;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      throw caught;
    } finally {
      setBusy("");
    }
  }, [opsSecret]);

  const loadProviders = useCallback(async () => {
    const payload = await runApi("Load Circle readiness", providersPath);
    setProviders(Array.isArray(payload.providers) ? payload.providers : []);
  }, [providersPath, runApi]);

  const loadEvidence = useCallback(async () => {
    const payload = await runApi("Load payout evidence", evidencePath);
    setEvidence(payload.payout_evidence || null);
  }, [evidencePath, runApi]);

  const loadAll = useCallback(async () => {
    await loadProviders();
    await loadEvidence();
  }, [loadEvidence, loadProviders]);

  useEffect(() => {
    const storedSecret = window.sessionStorage.getItem(OPS_SECRET_STORAGE_KEY);
    if (storedSecret) setOpsSecret(storedSecret);
    void loadAll().catch(() => undefined);
  }, [loadAll]);

  function updateOpsSecret(value: string) {
    setOpsSecret(value);
    if (value.trim()) {
      window.sessionStorage.setItem(OPS_SECRET_STORAGE_KEY, value);
    } else {
      window.sessionStorage.removeItem(OPS_SECRET_STORAGE_KEY);
    }
  }

  async function createWireInstruction() {
    const payload = await runApi("Create Circle wire instruction", createPath, {
      method: "POST",
      body: { provider: "circle" },
      requiresOps: true,
    });
    setTransfer(payload.transfer || null);
    setWireSent(true);
    await loadEvidence();
  }

  async function refreshWireStatus() {
    const payload = await runApi("Refresh Circle wire status", refreshPath, {
      method: "POST",
      body: {},
      requiresOps: true,
    });
    setTransfer(payload.transfer || null);
    await loadEvidence();
  }

  function handleCopied(label: string) {
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  const readyCount = evidence?.submission?.ready_count ?? 0;
  const requiredCount = evidence?.submission?.required_count ?? 4;
  const providerStatus = circleProvider?.configured && circleProvider?.execution_enabled
    ? "Ready"
    : circleProvider?.configured
      ? "Configured"
      : "Missing";
  const payoutStatus = evidence?.instruction?.status || transfer?.payout_status || transfer?.status || "Not loaded";
  const stellarUrl = stellarExpertUrl(evidence?.settlement?.stellar_tx_hash || transfer?.stellar_tx_hash);
  const endpointRows = [
    { method: "GET", path: providersPath },
    { method: "GET", path: evidencePath },
    { method: "POST", path: createPath },
    { method: "POST", path: refreshPath },
  ];

  const redactedPreview = useMemo(() => ({
    transfer_id: evidence?.transfer_id,
    generated_at: evidence?.generated_at,
    ready: evidence?.ready,
    submission: evidence?.submission,
    provider: evidence?.provider,
    rail: evidence?.rail,
    settlement: evidence?.settlement,
    instruction: evidence?.instruction,
    status_history: evidence?.status_history,
    destination: evidence?.destination,
  }), [evidence]);

  return (
    <OperationalPage size="xl" frameClassName="max-w-6xl">
      <OperationalHeader
        eyebrow="Circle sandbox / USD wire"
        title="Wire payout test"
        description="Validate the USDC-to-USD wire payout path for one transfer from the frontend proxy. Circle credentials stay on the backend."
        actions={
          <>
            <StatusPill tone={statusTone(providerStatus)}>
              {text(circleProvider?.execution_mode || providerStatus)}
            </StatusPill>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadAll().catch(() => undefined)} disabled={Boolean(busy)}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Reload
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OperationalStat
          label="Transfer"
          value={<span className="font-mono-financial text-sm">{short(transferId, 10, 6)}</span>}
          detail="Selected wire payout record"
        />
        <OperationalStat
          label="Circle"
          value={providerStatus}
          detail={text(circleProvider?.display_name || "Circle Mint")}
          tone={statusTone(providerStatus)}
        />
        <OperationalStat
          label="Payout status"
          value={text(payoutStatus)}
          detail={text(evidence?.execution_mode || circleProvider?.execution_mode || "Execution mode pending")}
          tone={statusTone(payoutStatus)}
        />
        <OperationalStat
          label="Evidence"
          value={`${readyCount}/${requiredCount}`}
          detail={evidence?.ready ? "Submission checklist ready" : "Load or refresh evidence"}
          tone={evidence?.ready ? "confirm" : "gold"}
        />
      </div>

      <OperationalCard>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
          <div className="grid gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-tts-gold">Test controls</p>
              <h2 className="mt-1 text-lg font-bold text-tts-deep">Circle wire action</h2>
            </div>
            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase text-tts-muted">Transfer ID</span>
              <Input
                value={transferId}
                onChange={(event) => setTransferId(event.target.value)}
                className="font-mono-financial"
                spellCheck={false}
              />
            </label>
            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase text-tts-muted">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Ops secret
              </span>
              <Input
                type="password"
                value={opsSecret}
                onChange={(event) => updateOpsSecret(event.target.value)}
                placeholder="Paste INTERNATIONAL_TRANSFER_OPS_SECRET"
                spellCheck={false}
              />
            </label>
          </div>
           <div className="grid content-end gap-3">
            <Button type="button" variant="outline" onClick={() => void loadAll().catch(() => undefined)} disabled={Boolean(busy)}>
              {busy === "Load payout evidence" || busy === "Load Circle readiness"
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Clipboard className="mr-2 h-4 w-4" />}
              Load evidence
            </Button>
            <Button type="button" onClick={() => void createWireInstruction().catch(() => undefined)} disabled={Boolean(busy) || !opsSecret.trim()}>
              {busy === "Create Circle wire instruction"
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Send className="mr-2 h-4 w-4" />}
              Create wire instruction
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshWireStatus().catch(() => undefined)} disabled={Boolean(busy) || !opsSecret.trim()}>
              {busy === "Refresh Circle wire status"
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh wire status
            </Button>
            <div className="border-t border-tts-border pt-3">
              <p className="mb-2 text-xs font-bold uppercase text-tts-muted">Direct Circle sandbox wire</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-tts-muted">$</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  defaultValue="10"
                  id="wire-amount"
                  className="h-9 w-24 font-mono-financial text-sm"
                />
                <Button
                  type="button"
                  className="flex-1"
                  onClick={async () => {
                    const amount = (document.getElementById("wire-amount") as HTMLInputElement)?.value || "10";
                    setWireResult(null);
                    try {
                      const result = await runApi(`Send wire $${amount}`, wireSendPath, {
                        method: "POST",
                        body: { amount },
                        requiresOps: true,
                      });
                      setWireResult(result);
                      if (result?.success && result?.payout?.id) {
                        setWireSent(true);
                      }
                    } catch (err: any) {
                      setWireResult({ success: false, payout: { id: null, status: err.message || String(err), amount, destination_tail: '-' }, circle_raw: { error: err.message || String(err) } });
                    }
                  }}
                  disabled={Boolean(busy) || !opsSecret.trim()}
                >
                  {busy?.startsWith("Send wire")
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Banknote className="mr-2 h-4 w-4" />}
                  Send wire
                </Button>
              </div>
            </div>
          </div>
        </div>
        {error ? (
          <div className="mt-5 flex items-start gap-3 rounded-md border border-tts-error/25 bg-tts-error/10 p-4 text-tts-error">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : null}
        {copied ? (
          <div className="mt-5 rounded-md border border-tts-confirm/25 bg-tts-confirm/10 p-3 text-sm font-semibold text-tts-confirm">
            Copied {copied}
          </div>
        ) : null}
      </OperationalCard>

      {wireResult ? (
        <OperationalCard>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-tts-muted">Circle API response</p>
            <h2 className="mt-1 text-lg font-bold text-tts-deep">
              {wireResult.success ? "Wire payout created" : "Wire result"}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
              <p className="text-xs font-bold uppercase text-tts-muted">Payout ID</p>
              <p className="mt-1 font-mono-financial text-sm text-tts-deep break-all">{String(wireResult.payout?.id || '-')}</p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
              <p className="text-xs font-bold uppercase text-tts-muted">Status</p>
              <StatusPill tone={String(wireResult.payout?.status || '').includes('error') ? 'error' : wireResult.payout?.status === 'pending' ? 'gold' : 'confirm'}>
                {String(wireResult.payout?.status || '-')}
              </StatusPill>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
              <p className="text-xs font-bold uppercase text-tts-muted">Amount</p>
              <p className="mt-1 font-mono-financial text-sm text-tts-deep">${String(wireResult.payout?.amount || '-')}</p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
              <p className="text-xs font-bold uppercase text-tts-muted">Destination</p>
              <p className="mt-1 font-mono-financial text-sm text-tts-deep">{String(wireResult.payout?.destination_tail || wireResult.payout?.destinationId || '-')}</p>
            </div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-bold text-tts-gold">Raw Circle response</summary>
            <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-tts-border bg-tts-bg p-3 text-xs leading-5 text-tts-deep">
              {JSON.stringify(wireResult.circle_raw, null, 2)}
            </pre>
          </details>
        </OperationalCard>
      ) : null}

      {wireSent ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
          <OperationalCard>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-tts-muted">Wire evidence</p>
                <h2 className="mt-1 text-lg font-bold text-tts-deep">USDC rail to USD wire</h2>
              </div>
              <StatusPill tone={evidence?.ready ? "confirm" : "gold"}>
                {evidence?.submission?.status || "Completed"}
              </StatusPill>
            </div>
            <dl>
              <DetailRow label="Route" value={evidence?.rail?.route} mono />
              <DetailRow label="On-ramp" value={evidence?.rail?.on_ramp_provider} />
              <DetailRow label="Settlement" value={`${text(evidence?.rail?.settlement_asset_code)} on ${text(evidence?.rail?.settlement_network)}`} />
              <DetailRow label="Off-ramp" value={evidence?.rail?.off_ramp_provider} />
              <DetailRow label="Amount" value={`${text(evidence?.settlement?.amount_usd)} ${text(evidence?.rail?.payout_currency || "USD")}`} mono />
              <DetailRow label="Instruction" value={evidence?.instruction?.instruction_id} mono />
              <DetailRow label="Provider ref" value={evidence?.instruction?.provider_reference_hash} mono />
              <DetailRow label="Destination" value={`${text(evidence?.destination?.bank_name)} · ${text(evidence?.destination?.country)} · ****${text(evidence?.destination?.account_number_last4, "")}`} />
            </dl>
            {stellarUrl ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={stellarUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Stellar testnet tx
                  </a>
                </Button>
                <CopyButton value={text(evidence?.settlement?.stellar_tx_hash || transfer?.stellar_tx_hash, "")} label="Stellar tx hash" onCopied={handleCopied} />
              </div>
            ) : null}
          </OperationalCard>

          <OperationalCard>
            <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase text-tts-muted">Provider</p>
                <h2 className="mt-1 text-lg font-bold text-tts-deep">Circle readiness</h2>
              </div>
              <StatusPill tone={statusTone(providerStatus)}>{providerStatus}</StatusPill>
            </div>
            <dl>
              <DetailRow label="Mode" value={circleProvider?.execution_mode} mono />
              <DetailRow label="Configured" value={boolText(circleProvider?.configured)} />
              <DetailRow label="Execution" value={boolText(circleProvider?.execution_enabled)} />
              <DetailRow label="Same-name check" value={evidence?.identity_control?.same_name_status} />
              <DetailRow label="Payout allowed" value={boolText(evidence?.identity_control?.payout_allowed)} />
              <DetailRow label="Last result" value={lastResult ? `${lastResult.label} · HTTP ${lastResult.status} · ${isoTime(lastResult.at)}` : "-"} />
            </dl>
            {circleProvider?.blockers?.length ? (
              <div className="mt-5 rounded-md border border-tts-error/25 bg-tts-error/10 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-tts-error">
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Blockers
                </p>
                <ul className="grid gap-1 text-sm text-tts-error">
                  {circleProvider.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              </div>
            ) : null}
          </OperationalCard>
        </div>
      ) : null}

      <OperationalCard>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-tts-muted">Checklist</p>
            <h2 className="mt-1 text-lg font-bold text-tts-deep">Deliverable 2 proof</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone="default">
              <Banknote className="mr-2 h-3.5 w-3.5" />
              PIX
            </StatusPill>
            <StatusPill tone="gold">
              <Network className="mr-2 h-3.5 w-3.5" />
              Stellar
            </StatusPill>
            <StatusPill tone="confirm">
              <WalletCards className="mr-2 h-3.5 w-3.5" />
              Wire
            </StatusPill>
          </div>
        </div>
        <Checklist items={evidence?.checklist || []} />
      </OperationalCard>

      <OperationalCard>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-tts-muted">Endpoints</p>
            <h2 className="mt-1 text-lg font-bold text-tts-deep">Frontend proxy calls</h2>
          </div>
          <StatusPill tone="default">
            <ShieldCheck className="mr-2 h-3.5 w-3.5" />
            Same origin
          </StatusPill>
        </div>
        {endpointRows.map((row) => (
          <EndpointRow key={`${row.method}:${row.path}`} method={row.method} path={row.path} onCopied={handleCopied} />
        ))}
      </OperationalCard>

      {evidence ? (
        <OperationalCard>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-tts-muted">Redacted evidence JSON</p>
            <h2 className="mt-1 text-lg font-bold text-tts-deep">Current payout record</h2>
          </div>
          <pre className="max-h-[28rem] overflow-auto rounded-md border border-tts-border bg-tts-bg p-4 text-xs leading-5 text-tts-deep">
            {JSON.stringify(redactedPreview, null, 2)}
          </pre>
        </OperationalCard>
      ) : null}
    </OperationalPage>
  );
}
