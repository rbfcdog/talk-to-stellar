"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Globe,
  Key,
  Loader2,
  RefreshCw,
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

// ── Types ─────────────────────────────────────────────────────────────────────

type IntegStatus = "ok" | "degraded" | "unavailable" | "needs_key" | "frontend_sdk" | "self_hosted";

interface Integration {
  id: string;
  name: string;
  category: string;
  description: string;
  docs: string;
  scf_track: boolean;
  status: IntegStatus;
  latency_ms?: number;
  data?: any;
  error?: string;
  note?: string;
}

interface ScfResponse {
  timestamp: string;
  elapsed_ms: number;
  summary: {
    total: number;
    ok: number;
    degraded: number;
    unavailable: number;
    needs_key: number;
    self_hosted: number;
  };
  integrations: Integration[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  on_off_ramp: "On/Off-Ramp",
  defi: "DeFi",
  cross_chain: "Cross-Chain",
  payments: "Payments",
  wallet: "Wallet Integration",
  oracle: "Oracle",
  infrastructure: "Infrastructure",
};

const CATEGORY_ICON: Record<string, React.ReactNode> = {
  on_off_ramp: <ArrowRightLeft className="h-3.5 w-3.5" />,
  defi: <TrendingUp className="h-3.5 w-3.5" />,
  cross_chain: <Globe className="h-3.5 w-3.5" />,
  payments: <Zap className="h-3.5 w-3.5" />,
  wallet: <Wallet className="h-3.5 w-3.5" />,
  oracle: <Activity className="h-3.5 w-3.5" />,
  infrastructure: <Server className="h-3.5 w-3.5" />,
};

function statusTone(s: IntegStatus): "confirm" | "error" | "gold" | "default" {
  if (s === "ok") return "confirm";
  if (s === "degraded") return "error";
  if (s === "needs_key") return "gold";
  return "default";
}

function statusLabel(s: IntegStatus) {
  if (s === "ok") return "Live";
  if (s === "degraded") return "Degraded";
  if (s === "unavailable") return "Unavailable";
  if (s === "needs_key") return "Needs Key";
  if (s === "frontend_sdk") return "Frontend SDK";
  if (s === "self_hosted") return "Self-Hosted";
  return s;
}

function StatusIcon({ status }: { status: IntegStatus }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-tts-confirm" />;
  if (status === "degraded") return <AlertTriangle className="h-4 w-4 text-tts-error" />;
  if (status === "needs_key") return <Key className="h-4 w-4 text-tts-gold" />;
  if (status === "self_hosted") return <Server className="h-4 w-4 text-tts-muted" />;
  return <Shield className="h-4 w-4 text-tts-muted" />;
}

function DataPreview({ data }: { data: any }) {
  if (!data || typeof data !== "object") return null;
  const entries = Object.entries(data).slice(0, 4);
  return (
    <div className="mt-2 space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-2 text-[10px]">
          <span className="text-tts-muted truncate">{k.replace(/_/g, " ")}</span>
          <span className="font-mono font-semibold text-tts-deep truncate max-w-[140px]">
            {Array.isArray(v) ? `[${(v as any[]).slice(0, 3).join(", ")}${(v as any[]).length > 3 ? "…" : ""}]` : String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Integration Card ──────────────────────────────────────────────────────────

function IntegCard({ integ, onRetest }: { integ: Integration; onRetest: (id: string) => void }) {
  const [testing, setTesting] = useState(false);

  const retest = useCallback(async () => {
    setTesting(true);
    try { await onRetest(integ.id); } finally { setTesting(false); }
  }, [integ.id, onRetest]);

  return (
    <div className={`rounded-md border bg-tts-bg/40 p-3 transition-colors ${
      integ.status === "ok"
        ? "border-tts-confirm/30"
        : integ.status === "degraded"
        ? "border-tts-error/30"
        : integ.status === "needs_key"
        ? "border-tts-gold/30"
        : "border-tts-border"
    }`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={integ.status} />
          <div className="min-w-0">
            <p className="text-xs font-bold text-tts-deep truncate">{integ.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="flex items-center gap-0.5 text-[10px] text-tts-muted">
                {CATEGORY_ICON[integ.category]}
                {CATEGORY_LABELS[integ.category] ?? integ.category}
              </span>
              {integ.scf_track && (
                <span className="rounded bg-tts-gold/15 px-1 py-0.5 text-[9px] font-bold uppercase text-tts-gold">SCF</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusPill tone={statusTone(integ.status)}>{statusLabel(integ.status)}</StatusPill>
          {integ.latency_ms && (
            <span className="flex items-center gap-0.5 text-[10px] text-tts-muted">
              <Clock className="h-2.5 w-2.5" />{integ.latency_ms}ms
            </span>
          )}
          <button
            onClick={retest}
            disabled={testing}
            className="rounded p-0.5 text-tts-muted hover:text-tts-deep disabled:opacity-40"
          >
            <RefreshCw className={`h-3 w-3 ${testing ? "animate-spin" : ""}`} />
          </button>
          <a href={integ.docs} target="_blank" rel="noopener noreferrer" className="text-tts-muted hover:text-tts-confirm">
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Description */}
      <p className="mt-2 text-[11px] text-tts-muted leading-relaxed">{integ.description}</p>

      {/* Live data */}
      {integ.data && <DataPreview data={integ.data} />}

      {/* Error */}
      {integ.error && (
        <p className="mt-2 text-[10px] text-tts-error font-mono truncate">{integ.error}</p>
      )}

      {/* Note (static integrations) */}
      {integ.note && !integ.data && (
        <p className="mt-2 text-[10px] text-tts-muted italic">{integ.note}</p>
      )}
    </div>
  );
}

// ── Category Section ──────────────────────────────────────────────────────────

function CategorySection({
  category,
  integrations,
  onRetest,
}: {
  category: string;
  integrations: Integration[];
  onRetest: (id: string) => void;
}) {
  const liveCount = integrations.filter((i) => i.status === "ok").length;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-tts-gold">{CATEGORY_ICON[category]}</span>
        <h2 className="text-sm font-bold text-tts-deep">{CATEGORY_LABELS[category] ?? category}</h2>
        <StatusPill tone={liveCount === integrations.length ? "confirm" : liveCount > 0 ? "gold" : "default"}>
          {liveCount}/{integrations.length}
        </StatusPill>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {integrations.map((integ) => (
          <IntegCard key={integ.id} integ={integ} onRetest={onRetest} />
        ))}
      </div>
    </div>
  );
}

// ── Main Client ───────────────────────────────────────────────────────────────

export default function ScfClient() {
  const [data, setData] = useState<ScfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setRetesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scf");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const retest = useCallback(async (id: string) => {
    setRetesting(id);
    try {
      const res = await fetch(`/api/scf/${id}`);
      if (!res.ok) return;
      const fresh = await res.json();
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          integrations: prev.integrations.map((i) =>
            i.id === id ? { ...i, ...fresh } : i
          ),
        };
      });
    } finally {
      setRetesting(null);
    }
  }, []);

  // Group by category
  const CATEGORY_ORDER: string[] = [
    "on_off_ramp", "defi", "cross_chain", "payments", "wallet", "oracle", "infrastructure",
  ];

  const byCategory = (data?.integrations ?? []).reduce<Record<string, Integration[]>>((acc, i) => {
    if (!acc[i.category]) acc[i.category] = [];
    acc[i.category].push(i);
    return acc;
  }, {});

  const summary = data?.summary;
  const ok = summary?.ok ?? 0;
  const total = summary?.total ?? 0;
  const needsKey = summary?.needs_key ?? 0;
  const selfHosted = summary?.self_hosted ?? 0;

  return (
    <OperationalPage size="xl">
      <OperationalHeader
        eyebrow="SCF Integration Track"
        title="Full Integration Suite"
        description="Live status for all 16 SCF Build Integration Track integrations — DeFi, cross-chain, payments, wallets, and infrastructure. One endpoint: GET /api/scf"
        actions={
          <div className="flex items-center gap-2">
            {data && (
              <StatusPill tone={ok >= total - needsKey - selfHosted ? "confirm" : "gold"}>
                {ok} live / {total} total
              </StatusPill>
            )}
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh all
            </Button>
          </div>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <OperationalStat
          label="Live"
          value={loading ? "—" : String(ok)}
          detail="integrations responding"
          tone="confirm"
        />
        <OperationalStat
          label="Needs Key"
          value={loading ? "—" : String(needsKey)}
          detail="API key required"
          tone="gold"
        />
        <OperationalStat
          label="Self-Hosted"
          value={loading ? "—" : String(selfHosted)}
          detail="deploy yourself"
        />
        <OperationalStat
          label="Probe time"
          value={data ? `${data.elapsed_ms}ms` : "—"}
          detail="parallel fetch"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-2 rounded border border-tts-error/30 bg-tts-error/10 p-3 text-xs text-tts-error">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="flex items-center gap-2 text-xs text-tts-muted py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          Probing all integrations in parallel…
        </div>
      )}

      {/* Integration grid by category */}
      {data && (
        <div className="space-y-8">
          {CATEGORY_ORDER.filter((cat) => byCategory[cat]?.length).map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              integrations={byCategory[cat]}
              onRetest={retest}
            />
          ))}
        </div>
      )}

      {/* Endpoint reference */}
      <OperationalCard>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-tts-deep">
          <ChevronRight className="h-4 w-4 text-tts-gold" />
          Master Endpoint
        </h2>
        <div className="space-y-2">
          {[
            ["GET", "/api/scf", "All 16 integrations — status + live data in one parallel call"],
            ["GET", "/api/scf/list", "List all integration IDs and categories"],
            ["GET", "/api/scf/:id", "Re-probe a single integration (e.g. /api/scf/blend_v2)"],
          ].map(([method, path, desc]) => (
            <div key={path} className="flex flex-wrap items-center gap-x-3 border-b border-tts-border/40 py-2 last:border-0">
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                method === "GET" ? "bg-tts-confirm/15 text-tts-confirm" : "bg-tts-gold/15 text-tts-gold"
              }`}>{method}</span>
              <span className="font-mono text-xs text-tts-deep">{path}</span>
              <span className="text-xs text-tts-muted">{desc}</span>
            </div>
          ))}
        </div>
        {data && (
          <div className="mt-4 rounded border border-tts-border bg-tts-bg p-3">
            <p className="mb-1 text-[10px] font-bold uppercase text-tts-muted">Last response metadata</p>
            <div className="space-y-0.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-tts-muted">Timestamp</span>
                <span className="font-mono text-tts-deep">{data.timestamp}</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-tts-muted">Elapsed</span>
                <span className="font-mono text-tts-deep">{data.elapsed_ms}ms</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-tts-muted">Total integrations</span>
                <span className="font-mono text-tts-deep">{data.summary.total}</span>
              </div>
            </div>
          </div>
        )}
      </OperationalCard>
    </OperationalPage>
  );
}
