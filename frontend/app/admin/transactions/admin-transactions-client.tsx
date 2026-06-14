"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Filter,
  KeyRound,
  Loader2,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import Link from "next/link";
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

type TransferState =
  | "CREATED"
  | "QUOTED"
  | "PIX_CHARGE_ISSUED"
  | "PIX_FUNDED"
  | "CONVERTING"
  | "STELLAR_SETTLED"
  | "PAYOUT_ROUTING"
  | "PAYOUT_INSTRUCTED"
  | "RECONCILED"
  | "QUOTE_EXPIRED"
  | "PIX_EXPIRED"
  | "FAILED"
  | "REFUND_REQUIRED";

type TransferActor =
  | "whatsapp_bot"
  | "telegram_bot"
  | "api"
  | "system"
  | "webhook:etherfuse"
  | "poller:stellar"
  | "dashboard";

type EndpointJson = Record<string, string | number | boolean | null | undefined>;

type FeeItem = {
  label?: string;
  amount?: string;
  currency?: string;
  bps?: number;
};

type TransferRecord = {
  id: string;
  public_ref: string;
  state: TransferState;
  state_version: number;
  source_endpoint: EndpointJson | null;
  destination_endpoint: EndpointJson | null;
  amount_brl_in: string | null;
  amount_usdc_settled: string | null;
  amount_usd_out_expected: string | null;
  quote: {
    rate?: string;
    fee_breakdown?: FeeItem[];
    expires_at?: string;
    quoted_at?: string;
    source?: string;
  } | null;
  pix: {
    charge_id?: string;
    e2e_id?: string;
    txid?: string;
    paid_at?: string;
    payer_masked?: string;
    provider?: string;
  } | null;
  stellar: {
    tx_hash?: string;
    ledger?: number;
    network?: "testnet" | "mainnet";
    settled_at?: string;
    source_account_masked?: string;
    asset?: string;
    path_used?: string[];
  } | null;
  payout: {
    routing_status?: string;
    provider_hint?: string;
    reference_id?: string | null;
    same_name_check?: {
      expected?: string;
      provided?: string;
      passed?: boolean;
    };
  } | null;
  reconciliation: {
    amounts_match?: boolean;
    fees_total?: FeeItem[];
    discrepancies?: string[];
    reconciled_at?: string;
    reconciled_by?: "system" | "manual";
  } | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

type TransferEvent = {
  id: string;
  transfer_id: string;
  from_state: TransferState | null;
  to_state: TransferState;
  event_type: string;
  payload: Record<string, unknown>;
  actor: TransferActor;
  correlation_id: string | null;
  created_at: string;
};

type ListResponse = {
  success: boolean;
  total: number;
  count: number;
  transfers: TransferRecord[];
  error?: string;
};

type DetailResponse = {
  success: boolean;
  transfer: TransferRecord;
  events: TransferEvent[];
  error?: string;
};

const STORAGE_KEY = "tts-admin-transfer-token";

const STATES: TransferState[] = [
  "CREATED",
  "QUOTED",
  "PIX_CHARGE_ISSUED",
  "PIX_FUNDED",
  "CONVERTING",
  "STELLAR_SETTLED",
  "PAYOUT_ROUTING",
  "PAYOUT_INSTRUCTED",
  "RECONCILED",
  "QUOTE_EXPIRED",
  "PIX_EXPIRED",
  "FAILED",
  "REFUND_REQUIRED",
];

const PRIMARY_STAGES: TransferState[] = [
  "CREATED",
  "QUOTED",
  "PIX_CHARGE_ISSUED",
  "PIX_FUNDED",
  "CONVERTING",
  "STELLAR_SETTLED",
  "PAYOUT_ROUTING",
  "PAYOUT_INSTRUCTED",
  "RECONCILED",
];

const FAILURE_STATES: TransferState[] = [
  "QUOTE_EXPIRED",
  "PIX_EXPIRED",
  "FAILED",
  "REFUND_REQUIRED",
];

const STATE_LABELS: Record<TransferState, string> = {
  CREATED: "Created",
  QUOTED: "Quoted",
  PIX_CHARGE_ISSUED: "PIX issued",
  PIX_FUNDED: "PIX funded",
  CONVERTING: "Converting",
  STELLAR_SETTLED: "Stellar settled",
  PAYOUT_ROUTING: "Routing",
  PAYOUT_INSTRUCTED: "Payout instructed",
  RECONCILED: "Reconciled",
  QUOTE_EXPIRED: "Quote expired",
  PIX_EXPIRED: "PIX expired",
  FAILED: "Failed",
  REFUND_REQUIRED: "Refund required",
};

function stateTone(state: TransferState): "default" | "gold" | "confirm" | "error" {
  if (state === "RECONCILED" || state === "STELLAR_SETTLED" || state === "PIX_FUNDED") return "confirm";
  if (state === "CONVERTING" || state === "PAYOUT_ROUTING" || state === "PAYOUT_INSTRUCTED") return "gold";
  if (FAILURE_STATES.includes(state)) return "error";
  return "default";
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatLongDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function toNumber(value?: string | null) {
  const parsed = Number(String(value || "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value?: string | null, currency = "") {
  const text = String(value || "").trim();
  if (!text) return "-";
  return currency ? `${currency} ${text}` : text;
}

function shortHash(value?: string | null, left = 8, right = 6) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= left + right + 3) return text;
  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

function endpointLabel(endpoint?: EndpointJson | null, fallback = "-") {
  if (!endpoint) return fallback;
  return String(
    endpoint.institution_type ||
      endpoint.provider_type ||
      endpoint.type ||
      endpoint.provider ||
      fallback,
  );
}

function endpointDetail(endpoint?: EndpointJson | null) {
  if (!endpoint) return "";
  return String(
    endpoint.masked_identifier ||
      endpoint.masked_account ||
      endpoint.country ||
      endpoint.account_holder_name ||
      "",
  );
}

function buildApiUrl(path: string, token: string, state: string) {
  const params = new URLSearchParams({ limit: "150" });
  if (token) params.set("token", token);
  if (state !== "ALL") params.set("state", state);
  return `${path}?${params.toString()}`;
}

function buildDetailUrl(id: string, token: string) {
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  const qs = params.toString();
  return `/api/transfers/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
}

function stellarExpertUrl(transfer: TransferRecord) {
  const txHash = transfer.stellar?.tx_hash;
  if (!txHash) return "";
  const network = transfer.stellar?.network === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/tx/${encodeURIComponent(txHash)}`;
}

function hasEvidence(transfer: TransferRecord) {
  return Boolean(
    transfer.pix?.charge_id &&
      transfer.pix?.paid_at &&
      transfer.stellar?.tx_hash &&
      transfer.payout?.routing_status,
  );
}

function JsonBlock({ value }: { value: unknown }) {
  const [copied, setCopied] = useState(false);

  async function copyRecord() {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-tts-border bg-tts-bg/70">
      <div className="flex items-center justify-between gap-3 border-b border-tts-border px-4 py-3">
        <p className="text-xs font-bold uppercase text-tts-muted">Transfer record</p>
        <Button size="sm" variant="outline" onClick={copyRecord}>
          <Copy className="mr-2 h-4 w-4" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="max-h-[30rem] overflow-auto p-4 font-mono text-xs leading-5 text-tts-deep">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function StatePill({ state }: { state: TransferState }) {
  return <StatusPill tone={stateTone(state)}>{STATE_LABELS[state]}</StatusPill>;
}

function TimelineRail({ state }: { state: TransferState }) {
  const activeIndex = PRIMARY_STAGES.indexOf(state);
  const failed = FAILURE_STATES.includes(state);

  return (
    <div className="grid grid-cols-9 gap-1" aria-label="Transfer lifecycle state">
      {PRIMARY_STAGES.map((stage, index) => {
        const isDone = !failed && activeIndex >= 0 && index < activeIndex;
        const isActive = !failed && index === activeIndex;
        return (
          <div
            key={stage}
            title={STATE_LABELS[stage]}
            className={cn(
              "h-2 rounded-sm bg-tts-bg/80",
              isDone && "bg-tts-confirm",
              isActive && "bg-tts-gold",
              failed && index === 0 && "bg-tts-error",
            )}
          />
        );
      })}
    </div>
  );
}

function TokenGate({
  tokenInput,
  setTokenInput,
  onSubmit,
  busy,
  error,
}: {
  tokenInput: string;
  setTokenInput: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <OperationalCard className="mx-auto w-full max-w-2xl">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-tts-border bg-tts-bg/70 text-tts-gold">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-tts-deep">Admin access</h2>
          <p className="mt-1 text-sm text-tts-muted">Enter the ops or transfer API token.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Input
              type="password"
              autoComplete="off"
              placeholder="OPS_DASHBOARD_TOKEN"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSubmit();
              }}
            />
            <Button onClick={onSubmit} disabled={busy || !tokenInput.trim()} className="sm:w-36">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Open
            </Button>
          </div>
          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-tts-error/25 bg-tts-error/10 px-3 py-2 text-sm text-tts-error">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </div>
    </OperationalCard>
  );
}

function TransferTable({
  transfers,
  selectedId,
  onSelect,
}: {
  transfers: TransferRecord[];
  selectedId: string;
  onSelect: (transfer: TransferRecord) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[72rem] table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b border-tts-border text-[11px] font-bold uppercase text-tts-muted">
            <th className="w-44 px-4 py-3">Reference</th>
            <th className="w-40 px-4 py-3">State</th>
            <th className="w-52 px-4 py-3">Route</th>
            <th className="w-40 px-4 py-3">Amount</th>
            <th className="w-52 px-4 py-3">PIX</th>
            <th className="w-52 px-4 py-3">Stellar</th>
            <th className="w-44 px-4 py-3">Payout</th>
            <th className="w-36 px-4 py-3">Updated</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((transfer) => {
            const active = transfer.id === selectedId;
            return (
              <tr
                key={transfer.id}
                className={cn(
                  "cursor-pointer border-b border-tts-border/70 text-sm transition-colors hover:bg-tts-bg/60",
                  active && "bg-tts-gold-bg",
                )}
                onClick={() => onSelect(transfer)}
              >
                <td className="px-4 py-4 align-top">
                  <p className="font-mono text-sm font-bold text-tts-deep">{transfer.public_ref}</p>
                  <p className="mt-1 font-mono text-[11px] text-tts-muted">{shortHash(transfer.id, 10, 4)}</p>
                </td>
                <td className="px-4 py-4 align-top">
                  <StatePill state={transfer.state} />
                  {transfer.failure_reason ? (
                    <p className="mt-2 line-clamp-2 text-xs text-tts-error">{transfer.failure_reason}</p>
                  ) : null}
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="font-semibold text-tts-deep">
                    {endpointLabel(transfer.source_endpoint, "PIX")} {"->"} {endpointLabel(transfer.destination_endpoint, "USD")}
                  </p>
                  <p className="mt-1 text-xs text-tts-muted">
                    {endpointDetail(transfer.source_endpoint) || "source masked"} /{" "}
                    {endpointDetail(transfer.destination_endpoint) || "destination masked"}
                  </p>
                </td>
                <td className="px-4 py-4 align-top font-mono text-xs">
                  <p className="text-tts-deep">{formatMoney(transfer.amount_brl_in, "BRL")}</p>
                  <p className="mt-1 text-tts-muted">{formatMoney(transfer.amount_usdc_settled || transfer.amount_usd_out_expected, "USDC")}</p>
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="font-mono text-xs text-tts-deep">{shortHash(transfer.pix?.charge_id, 12, 4)}</p>
                  <p className="mt-1 text-xs text-tts-muted">{transfer.pix?.provider || "etherfuse"} / {formatDate(transfer.pix?.paid_at)}</p>
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="font-mono text-xs text-tts-deep">{shortHash(transfer.stellar?.tx_hash, 10, 6)}</p>
                  <p className="mt-1 text-xs text-tts-muted">
                    {transfer.stellar?.network || "testnet"} / ledger {transfer.stellar?.ledger || "-"}
                  </p>
                </td>
                <td className="px-4 py-4 align-top">
                  <p className="text-sm font-semibold text-tts-deep">{transfer.payout?.routing_status || "-"}</p>
                  <p className="mt-1 text-xs text-tts-muted">{transfer.payout?.provider_hint || "adapter pending"}</p>
                </td>
                <td className="px-4 py-4 align-top text-xs text-tts-muted">{formatDate(transfer.updated_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailSection({
  detail,
  loading,
}: {
  detail: DetailResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <OperationalCard className="flex min-h-72 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-tts-gold" />
      </OperationalCard>
    );
  }

  if (!detail) {
    return (
      <OperationalCard className="min-h-72">
        <div className="flex h-full min-h-60 flex-col items-center justify-center text-center">
          <Database className="h-8 w-8 text-tts-muted" />
          <p className="mt-3 text-sm font-semibold text-tts-deep">Select a transfer</p>
          <p className="mt-1 text-sm text-tts-muted">Lifecycle, reconciliation, and raw record appear here.</p>
        </div>
      </OperationalCard>
    );
  }

  const transfer = detail.transfer;
  const txUrl = stellarExpertUrl(transfer);
  const fees = transfer.reconciliation?.fees_total || transfer.quote?.fee_breakdown || [];
  const discrepancies = transfer.reconciliation?.discrepancies || [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]">
      <OperationalCard>
        <div className="flex flex-col gap-4 border-b border-tts-border pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-tts-muted">Selected transfer</p>
            <h2 className="mt-1 font-mono text-xl font-bold text-tts-deep">{transfer.public_ref}</h2>
            <p className="mt-1 font-mono text-xs text-tts-muted">{transfer.id}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatePill state={transfer.state} />
            {txUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={txUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Stellar
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-5">
          <TimelineRail state={transfer.state} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-tts-border bg-tts-bg/55 p-3">
              <p className="text-xs font-semibold text-tts-muted">PIX intake</p>
              <p className="mt-2 font-mono text-xs text-tts-deep">{shortHash(transfer.pix?.e2e_id || transfer.pix?.txid || transfer.pix?.charge_id, 12, 5)}</p>
              <p className="mt-1 text-xs text-tts-muted">{formatLongDate(transfer.pix?.paid_at)}</p>
            </div>
            <div className="rounded-lg border border-tts-border bg-tts-bg/55 p-3">
              <p className="text-xs font-semibold text-tts-muted">Conversion</p>
              <p className="mt-2 font-mono text-xs text-tts-deep">{formatMoney(transfer.amount_usdc_settled, "USDC")}</p>
              <p className="mt-1 text-xs text-tts-muted">rate {transfer.quote?.rate || "-"}</p>
            </div>
            <div className="rounded-lg border border-tts-border bg-tts-bg/55 p-3">
              <p className="text-xs font-semibold text-tts-muted">Payout route</p>
              <p className="mt-2 text-sm font-semibold text-tts-deep">{transfer.payout?.routing_status || "-"}</p>
              <p className="mt-1 text-xs text-tts-muted">{transfer.payout?.reference_id || transfer.payout?.provider_hint || "-"}</p>
            </div>
            <div className="rounded-lg border border-tts-border bg-tts-bg/55 p-3">
              <p className="text-xs font-semibold text-tts-muted">Reconciliation</p>
              <p className="mt-2 text-sm font-semibold text-tts-deep">
                {transfer.reconciliation?.amounts_match ? "Matched" : "Pending"}
              </p>
              <p className="mt-1 text-xs text-tts-muted">{formatLongDate(transfer.reconciliation?.reconciled_at)}</p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-tts-gold" />
            <h3 className="text-sm font-bold text-tts-deep">Lifecycle timeline</h3>
          </div>
          <div className="grid gap-2">
            {detail.events.map((event) => (
              <div
                key={event.id}
                className="grid gap-3 rounded-lg border border-tts-border bg-tts-bg/55 p-3 md:grid-cols-[10rem_minmax(0,1fr)_11rem]"
              >
                <p className="font-mono text-xs text-tts-muted">{formatLongDate(event.created_at)}</p>
                <div className="min-w-0">
                  <p className="font-mono text-xs font-bold text-tts-deep">{event.event_type}</p>
                  <p className="mt-1 text-xs text-tts-muted">
                    {event.from_state || "START"} {"->"} {event.to_state}
                  </p>
                </div>
                <div className="min-w-0 text-xs text-tts-muted">
                  <p>{event.actor}</p>
                  {event.correlation_id ? <p className="mt-1 font-mono">{shortHash(event.correlation_id, 9, 4)}</p> : null}
                </div>
              </div>
            ))}
            {detail.events.length === 0 ? (
              <div className="rounded-lg border border-tts-border bg-tts-bg/55 p-6 text-center text-sm text-tts-muted">
                No lifecycle events recorded.
              </div>
            ) : null}
          </div>
        </div>
      </OperationalCard>

      <div className="grid gap-5">
        <OperationalCard>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-tts-muted">Reconciliation</p>
              <h3 className="mt-1 text-lg font-bold text-tts-deep">
                {transfer.reconciliation?.amounts_match ? "Amounts match" : "Review needed"}
              </h3>
            </div>
            {transfer.reconciliation?.amounts_match ? (
              <CheckCircle2 className="h-6 w-6 text-tts-confirm" />
            ) : (
              <AlertTriangle className="h-6 w-6 text-tts-error" />
            )}
          </div>
          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex items-start justify-between gap-4 border-b border-tts-border pb-3">
              <dt className="text-tts-muted">Evidence complete</dt>
              <dd className="font-semibold text-tts-deep">{hasEvidence(transfer) ? "Yes" : "No"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-tts-border pb-3">
              <dt className="text-tts-muted">Reconciled by</dt>
              <dd className="font-semibold text-tts-deep">{transfer.reconciliation?.reconciled_by || "-"}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 border-b border-tts-border pb-3">
              <dt className="text-tts-muted">Fees</dt>
              <dd className="max-w-56 text-right font-mono text-xs text-tts-deep">
                {fees.length ? fees.map((fee) => `${fee.label || "fee"} ${fee.amount || "-"} ${fee.currency || ""}`).join(" / ") : "-"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-tts-muted">Discrepancies</dt>
              <dd className="max-w-56 text-right text-xs font-semibold text-tts-deep">
                {discrepancies.length ? discrepancies.join(" / ") : "None"}
              </dd>
            </div>
          </dl>
        </OperationalCard>

        <JsonBlock value={{ transfer, events: detail.events }} />
      </div>
    </div>
  );
}

export default function AdminTransactionsClient() {
  const [token, setToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState("");

  useEffect(() => {
    const fromEnv = process.env.NEXT_PUBLIC_OPS_DASHBOARD_TOKEN || process.env.NEXT_PUBLIC_TRANSFER_API_TOKEN || "";
    const fromStorage = window.sessionStorage.getItem(STORAGE_KEY) || "";
    const initialToken = fromEnv || fromStorage;
    if (initialToken) {
      setToken(initialToken);
      setTokenInput(initialToken);
    }
  }, []);

  async function loadTransfers(nextState = stateFilter, nextToken = token) {
    if (!nextToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl("/api/transfers", nextToken, nextState), {
        headers: {
          Authorization: `Bearer ${nextToken}`,
          "X-Ops-Token": nextToken,
        },
        cache: "no-store",
      });
      const data = (await response.json()) as ListResponse;
      if (!response.ok || !data.success) throw new Error(data.error || `Request failed with ${response.status}`);
      setTransfers(data.transfers || []);
      setTotal(data.total || data.transfers?.length || 0);
      setLastLoadedAt(new Date().toISOString());
      const stillVisible = data.transfers.some((transfer) => transfer.id === selectedId);
      const nextSelected = stillVisible ? selectedId : data.transfers[0]?.id || "";
      setSelectedId(nextSelected);
      if (nextSelected) {
        await loadDetail(nextSelected, nextToken);
      } else {
        setDetail(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load transfers";
      setError(message);
      if (message.toLowerCase().includes("unauthorized")) {
        setToken("");
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string, nextToken = token) {
    if (!id || !nextToken) return;
    setDetailLoading(true);
    try {
      const response = await fetch(buildDetailUrl(id, nextToken), {
        headers: {
          Authorization: `Bearer ${nextToken}`,
          "X-Ops-Token": nextToken,
        },
        cache: "no-store",
      });
      const data = (await response.json()) as DetailResponse;
      if (!response.ok || !data.success) throw new Error(data.error || `Detail failed with ${response.status}`);
      setDetail(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load transfer detail");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void loadTransfers(stateFilter, token);
  }, [token, stateFilter]);

  useEffect(() => {
    if (!token || !autoRefresh) return;
    const id = window.setInterval(() => {
      void loadTransfers(stateFilter, token);
    }, 15000);
    return () => window.clearInterval(id);
  }, [token, stateFilter, autoRefresh]);

  const filteredTransfers = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return transfers;
    return transfers.filter((transfer) => {
      const haystack = [
        transfer.public_ref,
        transfer.id,
        transfer.state,
        transfer.pix?.charge_id,
        transfer.pix?.e2e_id,
        transfer.pix?.txid,
        transfer.stellar?.tx_hash,
        transfer.payout?.reference_id,
        endpointLabel(transfer.source_endpoint, ""),
        endpointLabel(transfer.destination_endpoint, ""),
        endpointDetail(transfer.source_endpoint),
        endpointDetail(transfer.destination_endpoint),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(text);
    });
  }, [query, transfers]);

  const metrics = useMemo(() => {
    const active = transfers.filter((transfer) => !["RECONCILED", ...FAILURE_STATES].includes(transfer.state)).length;
    const reconciled = transfers.filter((transfer) => transfer.state === "RECONCILED").length;
    const failed = transfers.filter((transfer) => FAILURE_STATES.includes(transfer.state)).length;
    const brl = transfers.reduce((sum, transfer) => sum + toNumber(transfer.amount_brl_in), 0);
    const usdc = transfers.reduce((sum, transfer) => sum + toNumber(transfer.amount_usdc_settled), 0);
    return { active, reconciled, failed, brl, usdc };
  }, [transfers]);

  function submitToken() {
    const nextToken = tokenInput.trim();
    if (!nextToken) return;
    window.sessionStorage.setItem(STORAGE_KEY, nextToken);
    setToken(nextToken);
  }

  function clearToken() {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setToken("");
    setTokenInput("");
    setTransfers([]);
    setDetail(null);
    setSelectedId("");
  }

  function selectTransfer(transfer: TransferRecord) {
    setSelectedId(transfer.id);
    void loadDetail(transfer.id);
  }

  return (
    <OperationalPage size="xl" frameClassName="max-w-[92rem]">
      <OperationalHeader
        eyebrow="Admin / transaction lifecycle"
        title="Transaction Control"
        description="Database-backed PIX intake, Stellar settlement, payout routing, and reconciliation queue."
        actions={
          token ? (
            <>
              <StatusPill tone="confirm">Authenticated</StatusPill>
              <Button variant="outline" size="sm" onClick={() => void loadTransfers()}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={clearToken}>
                Lock
              </Button>
            </>
          ) : (
            <StatusPill>Token required</StatusPill>
          )
        }
      />

      {!token ? (
        <TokenGate
          tokenInput={tokenInput}
          setTokenInput={setTokenInput}
          onSubmit={submitToken}
          busy={loading}
          error={error}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <OperationalStat
              label="Visible"
              value={filteredTransfers.length}
              detail={`${total} in backend filter`}
              tone="default"
            />
            <OperationalStat label="Active" value={metrics.active} detail="Not terminal" tone="gold" />
            <OperationalStat label="Reconciled" value={metrics.reconciled} detail="Matched records" tone="confirm" />
            <OperationalStat label="Failures" value={metrics.failed} detail="Expired, failed, refund" tone="error" />
            <OperationalStat
              label="Volume"
              value={`BRL ${metrics.brl.toFixed(2)}`}
              detail={`USDC ${metrics.usdc.toFixed(2)} settled`}
              tone="default"
            />
          </div>

          <OperationalCard>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_12rem] lg:w-[34rem]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tts-muted" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search ref, PIX, Stellar, payout"
                    className="pl-9"
                  />
                </label>
                <label className="relative block">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tts-muted" />
                  <select
                    value={stateFilter}
                    onChange={(event) => setStateFilter(event.target.value)}
                    className="h-11 w-full appearance-none rounded-md border border-tts-border bg-tts-surface pl-9 pr-3 text-sm font-semibold text-tts-deep"
                  >
                    <option value="ALL">All states</option>
                    {STATES.map((state) => (
                      <option key={state} value={state}>
                        {STATE_LABELS[state]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-tts-muted">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAutoRefresh((value) => !value)}
                  aria-pressed={autoRefresh}
                >
                  {autoRefresh ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <XCircle className="mr-2 h-4 w-4" />}
                  Auto refresh
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/api/transfers${token ? `?token=${encodeURIComponent(token)}` : ""}`} target="_blank">
                    <Database className="mr-2 h-4 w-4" />
                    API
                  </Link>
                </Button>
                <span>{lastLoadedAt ? `Loaded ${formatDate(lastLoadedAt)}` : "Loading"}</span>
              </div>
            </div>
          </OperationalCard>

          {error ? (
            <OperationalCard className="border-tts-error/30 bg-tts-error/10">
              <div className="flex items-start gap-3 text-tts-error">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm font-semibold">{error}</p>
              </div>
            </OperationalCard>
          ) : null}

          <OperationalCard className="p-0">
            <div className="flex flex-col gap-4 border-b border-tts-border p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-tts-muted">Transactions</p>
                <h2 className="mt-1 text-lg font-bold text-tts-deep">Transfer records</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone="default">
                  <Banknote className="mr-2 h-3.5 w-3.5" />
                  PIX
                </StatusPill>
                <StatusPill tone="gold">
                  <Route className="mr-2 h-3.5 w-3.5" />
                  Stellar
                </StatusPill>
                <StatusPill tone="confirm">
                  <WalletCards className="mr-2 h-3.5 w-3.5" />
                  Payout
                </StatusPill>
              </div>
            </div>
            {loading && transfers.length === 0 ? (
              <div className="flex min-h-72 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-tts-gold" />
              </div>
            ) : filteredTransfers.length ? (
              <TransferTable transfers={filteredTransfers} selectedId={selectedId} onSelect={selectTransfer} />
            ) : (
              <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
                <Database className="h-8 w-8 text-tts-muted" />
                <p className="mt-3 text-sm font-semibold text-tts-deep">No transfers found</p>
                <p className="mt-1 text-sm text-tts-muted">Change the state filter or search text.</p>
              </div>
            )}
          </OperationalCard>

          <DetailSection detail={detail} loading={detailLoading} />
        </>
      )}
    </OperationalPage>
  );
}
