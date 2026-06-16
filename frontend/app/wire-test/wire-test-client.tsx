"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, KeyRound, Loader2, Send } from "lucide-react";
import { OperationalCard, OperationalHeader, OperationalPage, OperationalStat, StatusPill } from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const OPS_SECRET_STORAGE_KEY = "tts-wire-test-ops-secret";

type JsonRecord = Record<string, unknown>;

type WirePayoutResult = {
  id?: string | null;
  status?: string;
  amount?: string;
  currency?: string;
  destination_id?: string;
  destination_tail?: string;
  source_wallet_id?: string;
  idempotency_key?: string;
};

type WireResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  error?: string;
  payout?: WirePayoutResult;
  circle_raw?: JsonRecord;
  circle_http_status?: number;
  backend_http_status?: number;
  backend_url?: string;
  attempts?: Array<Record<string, unknown>>;
};

type LastResult = { label: string; status: number; at: string };

function isoTime(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

function wireErrorMessage(label: string, status: number, payload: WireResponse) {
  const detail = payload.message || payload.error || payload.code || payload.circle_raw?.message || payload.circle_raw?.error;
  const backendStatus = payload.backend_http_status ? ` backend ${payload.backend_http_status}` : "";
  return detail
    ? `${label} failed: ${String(detail)} (HTTP ${status}${backendStatus})`
    : `${label} failed with HTTP ${status}${backendStatus}`;
}

export default function WireTestClient() {
  const [opsSecret, setOpsSecret] = useState("");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const [wireResult, setWireResult] = useState<WireResponse | null>(null);
  const [wireSent, setWireSent] = useState(false);

  const wireSendPath = "/api/wire-test/send";

  const runApi = useCallback(
    async (label: string, path: string, body: Record<string, unknown>) => {
      setBusy(label);
      setError("");
      const started = Date.now();
      const secret = opsSecret.trim();

      try {
        const r = await fetch(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-international-transfer-ops-secret": secret,
            "x-ops-token": secret,
            authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        const payload: WireResponse = await r.json().catch(() => ({}));
        setLastResult({ label, status: r.status, at: new Date(started).toISOString() });
        if (!r.ok || payload.success === false) {
          const error = new Error(wireErrorMessage(label, r.status, payload)) as Error & { payload?: WireResponse };
          error.payload = payload;
          throw error;
        }
        return payload;
      } catch (e: any) {
        const msg = e?.message || String(e);
        setError(msg);
        throw e;
      } finally {
        setBusy("");
      }
    },
    [opsSecret],
  );

  function updateOpsSecret(v: string) {
    setOpsSecret(v);
    if (v.trim()) sessionStorage.setItem(OPS_SECRET_STORAGE_KEY, v);
    else sessionStorage.removeItem(OPS_SECRET_STORAGE_KEY);
  }

  async function sendWire() {
    const amt = amount || "10";
    setWireResult(null);
    try {
      const result = await runApi(`Send wire $${amt}`, wireSendPath, { amount: amt });
      setWireResult(result);
      if (result?.success && result?.payout?.id) setWireSent(true);
    } catch (err: any) {
      const payload = err?.payload as WireResponse | undefined;
      setWireResult({
        success: false,
        payout: { id: null, status: err.message || String(err), amount: amt, destination_tail: "-" },
        circle_raw: payload || { error: err.message || String(err) },
        backend_http_status: payload?.backend_http_status,
        backend_url: payload?.backend_url,
        attempts: payload?.attempts,
      });
    }
  }

  return (
    <OperationalPage size="xl" frameClassName="max-w-3xl">
      <OperationalHeader
        eyebrow="Circle sandbox"
        title="Wire payout test"
        description="Send a USD wire payout via Circle Mint sandbox. Credentials are hardcoded — just enter the ops secret and amount."
        actions={
          <StatusPill tone={wireSent ? "confirm" : "default"}>
            {wireSent ? "Wire sent" : "Ready"}
          </StatusPill>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <OperationalStat label="Destination" value="BANK OF AMERICA" detail="****1098 · wire" tone="confirm" />
        <OperationalStat
          label="Last result"
          value={lastResult ? `HTTP ${lastResult.status}` : "Idle"}
          detail={lastResult ? isoTime(lastResult.at) : "Enter amount and send"}
          tone={lastResult ? (lastResult.status < 400 ? "confirm" : "error") : "default"}
        />
        <OperationalStat
          label={wireResult?.success ? "Payout ID" : "Status"}
          value={wireResult?.payout?.id?.slice(0, 12) || (wireResult ? "Failed" : "-")}
          detail={wireResult?.payout?.status || "Pending"}
          tone={wireResult?.success ? "confirm" : wireResult ? "error" : "default"}
        />
      </div>

      <OperationalCard>
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-3">
            <div>
              <p className="text-xs font-bold uppercase text-tts-gold">Send wire</p>
              <p className="text-sm text-tts-muted">Destination: BANK OF AMERICA, NA ****1098</p>
            </div>
            <label className="grid gap-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase text-tts-muted">
                <KeyRound className="h-4 w-4" />
                Ops secret
              </span>
              <Input
                type="password"
                value={opsSecret}
                onChange={(e) => updateOpsSecret(e.target.value)}
                placeholder="Paste ops token"
                spellCheck={false}
              />
            </label>
          </div>
          <div className="flex flex-col justify-end gap-3 sm:w-48">
            <label className="grid gap-1">
              <span className="text-xs font-bold uppercase text-tts-muted">Amount (USD)</span>
              <Input
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10 w-full font-mono-financial text-lg"
              />
            </label>
            <Button
              type="button"
              size="lg"
              className="w-full"
              onClick={sendWire}
              disabled={Boolean(busy) || !opsSecret.trim()}
            >
              {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
              Send
            </Button>
          </div>
        </div>
        {error ? (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-tts-error/25 bg-tts-error/10 p-4 text-tts-error">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-semibold">{error}</p>
          </div>
        ) : null}
      </OperationalCard>

      {wireResult ? (
        <OperationalCard>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-tts-muted">Result</p>
            <h2 className="mt-1 text-lg font-bold text-tts-deep">
              {wireResult.success ? "Wire sent" : "Wire failed"}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
              <p className="text-xs font-bold uppercase text-tts-muted">Payout ID</p>
              <p className="mt-1 font-mono-financial text-xs text-tts-deep break-all">
                {String(wireResult.payout?.id || "-")}
              </p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
              <p className="text-xs font-bold uppercase text-tts-muted">Status</p>
              <StatusPill tone={String(wireResult.payout?.status || "").includes("error") ? "error" : wireResult.success ? "confirm" : "gold"}>
                {String(wireResult.payout?.status || "unknown")}
              </StatusPill>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
              <p className="text-xs font-bold uppercase text-tts-muted">Amount</p>
              <p className="mt-1 font-mono-financial text-sm text-tts-deep">
                ${String(wireResult.payout?.amount || "-")}
              </p>
            </div>
            <div className="rounded-md border border-tts-border bg-tts-bg/50 p-3">
              <p className="text-xs font-bold uppercase text-tts-muted">Destination</p>
              <p className="mt-1 font-mono-financial text-xs text-tts-deep">
                ****{String(wireResult.payout?.destination_tail || "-")}
              </p>
            </div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-bold text-tts-gold">
              Raw Circle response
            </summary>
            <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-tts-border bg-tts-bg p-3 text-xs leading-5 text-tts-deep">
              {JSON.stringify(wireResult.circle_raw, null, 2)}
            </pre>
          </details>
        </OperationalCard>
      ) : null}
    </OperationalPage>
  );
}
