"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getClientSession } from "@/lib/session";
import {
  createCorrelationId,
  evidenceRows,
  payoutEvidenceRows,
  redactSensitive,
  routeEconomics,
  text,
} from "./settlement-console.model";
import type {
  ApiLogEntry,
  ConsoleEvent,
  ConsoleForm,
  JsonRecord,
  PayoutProviderCapability,
  WorkflowSnapshot,
} from "./settlement-console.types";

const INITIAL_FORM: ConsoleForm = {
  brlAmount: "5000",
  senderName: "Origin BR Institution Ltda",
  senderEmail: "ops@origin-institution.example",
  recipientName: "Origin BR Institution Ltda",
  accountHolderType: "business",
  bankName: "Destination USD Banking Partner",
  routingNumber: "021000021",
  accountNumber: "123456789",
  accountType: "checking",
  country: "US",
  providerLabel: "other",
  payoutProvider: "etherfuse",
  mockPix: false,
  runEtherfuseOffRamp: false,
  manualSessionId: "",
  manualSessionToken: "",
  walletPin: "",
  opsSecret: "",
};

export function useSettlementConsole() {
  const opsMocksAllowed = String(process.env.NEXT_PUBLIC_ALLOW_OPS_MOCKS || "").toLowerCase() === "true";
  const [form, setForm] = useState<ConsoleForm>(INITIAL_FORM);
  const [sessionId, setSessionId] = useState("");
  const [correlationId, setCorrelationId] = useState(createCorrelationId);
  const [quote, setQuote] = useState<JsonRecord | null>(null);
  const [transfer, setTransfer] = useState<JsonRecord | null>(null);
  const [reconciliation, setReconciliation] = useState<JsonRecord | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowSnapshot | null>(null);
  const [reviewerEvidence, setReviewerEvidence] = useState<JsonRecord | null>(null);
  const [payoutEvidence, setPayoutEvidence] = useState<JsonRecord | null>(null);
  const [payoutProviders, setPayoutProviders] = useState<PayoutProviderCapability[]>([]);
  const [events, setEvents] = useState<ConsoleEvent[]>([]);
  const [logs, setLogs] = useState<ApiLogEntry[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const updateForm = useCallback(<K extends keyof ConsoleForm>(key: K, value: ConsoleForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const pushEvent = useCallback((
    title: string,
    detail: string,
    state: ConsoleEvent["state"],
    path?: string,
  ) => {
    setEvents((current) => [{
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      title,
      detail,
      state,
      path,
    }, ...current].slice(0, 30));
  }, []);

  const callApi = useCallback(async (
    label: string,
    method: string,
    path: string,
    body?: unknown,
    opsAuthorized = false,
  ) => {
    const started = performance.now();
    const requestId = `${correlationId}_${Date.now().toString(36)}`;
    setBusy(label);
    setError("");
    pushEvent(label, `${method} ${path}`, "running", path);
    try {
      const response = await fetch(path, {
        method,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "x-correlation-id": correlationId,
          ...(opsAuthorized && form.opsSecret
            ? { "x-international-transfer-ops-secret": form.opsSecret }
            : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      const duration = Math.round(performance.now() - started);
      const log: ApiLogEntry = {
        id: `${Date.now()}_${label}`,
        label,
        method,
        path,
        request_id: text(payload?.request_id) || response.headers.get("x-request-id") || requestId,
        correlation_id: text(payload?.correlation_id) || response.headers.get("x-correlation-id") || correlationId,
        status: response.status,
        duration_ms: duration,
        request: redactSensitive(body),
        response: redactSensitive(payload),
      };
      setLogs((current) => [log, ...current].slice(0, 20));
      if (!response.ok || payload?.success === false) {
        const apiError = new Error(payload?.message || `${label} failed with HTTP ${response.status}`) as Error & {
          code?: string;
        };
        apiError.code = payload?.code;
        throw apiError;
      }
      pushEvent(label, `HTTP ${response.status} in ${duration}ms.`, "ok", path);
      return payload as JsonRecord;
    } catch (caught: any) {
      const message = caught?.message || String(caught);
      setError(message);
      pushEvent(label, message, "error", path);
      setLogs((current) => [{
        id: `${Date.now()}_${label}_error`,
        label,
        method,
        path,
        request_id: requestId,
        correlation_id: correlationId,
        duration_ms: Math.round(performance.now() - started),
        request: redactSensitive(body),
        error: message,
      }, ...current].slice(0, 20));
      throw caught;
    } finally {
      setBusy("");
    }
  }, [correlationId, form.opsSecret, pushEvent]);

  const loadArtifacts = useCallback(async (transferId: string, logCalls = true) => {
    const encoded = encodeURIComponent(transferId);
    const read = async (label: string, path: string, opsAuthorized = false) => {
      if (logCalls) return callApi(label, "GET", path, undefined, opsAuthorized);
      const response = await fetch(path, {
        headers: {
          "x-request-id": `${correlationId}_${Date.now().toString(36)}`,
          "x-correlation-id": correlationId,
          ...(opsAuthorized && form.opsSecret
            ? { "x-international-transfer-ops-secret": form.opsSecret }
            : {}),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) throw new Error(payload?.message || `${label} failed.`);
      return payload as JsonRecord;
    };
    const [workflowPayload, evidencePayload, payoutEvidencePayload] = await Promise.all([
      read("Load workflow", `/api/transfers/${encoded}/workflow`),
      read("Load reviewer evidence", `/api/transfers/${encoded}/reviewer-evidence`),
      read("Load payout evidence", `/api/transfers/${encoded}/payout-evidence`),
    ]);
    const reconciliationPayload = form.opsSecret
      ? await read("Load reconciliation", `/api/transfers/${encoded}/reconciliation`, true)
      : { reconciliation: null };
    setWorkflow(workflowPayload.workflow || null);
    setReconciliation(reconciliationPayload.reconciliation || null);
    setReviewerEvidence(evidencePayload.reviewer_evidence || null);
    setPayoutEvidence(payoutEvidencePayload.payout_evidence || null);
    return {
      workflow: workflowPayload.workflow as WorkflowSnapshot,
      reconciliation: reconciliationPayload.reconciliation as JsonRecord,
      reviewerEvidence: evidencePayload.reviewer_evidence as JsonRecord,
      payoutEvidence: payoutEvidencePayload.payout_evidence as JsonRecord,
    };
  }, [callApi, correlationId, form.opsSecret]);

  useEffect(() => {
    void getClientSession().then((session) => setSessionId(session.sessionId || ""));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/transfers/payout-providers", {
      headers: {
        "x-request-id": `${correlationId}_${Date.now().toString(36)}`,
        "x-correlation-id": correlationId,
      },
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) throw new Error(payload?.message || "Unable to load payout providers.");
        if (!cancelled) setPayoutProviders(Array.isArray(payload.providers) ? payload.providers : []);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [correlationId]);

  useEffect(() => {
    const transferId = new URLSearchParams(window.location.search).get("transfer_id")?.trim();
    if (!transferId) return;
    let cancelled = false;
    void loadArtifacts(transferId, false)
      .then(({ reviewerEvidence: evidence, workflow: snapshot }) => {
        if (cancelled) return;
        const record = evidence?.transfer_record || {};
        const value = record.value || {};
        setTransfer({
          transfer_id: record.transfer_id,
          quote_id: record.quote_id,
          status: record.status,
          brl_amount: value.source_amount_brl,
          quoted_usd_amount: value.quoted_destination_usd,
          fx_rate: value.fx_rate_brl_per_usd,
          fees: value.fees,
          pix_status: record.pix_funding?.status,
          stellar_tx_hash: record.stellar_settlement?.transaction_hash,
          stellar_memo: record.stellar_settlement?.memo,
          payout_provider: record.payout?.provider,
          payout_instruction_id: record.payout?.instruction_id,
          payout_status: record.payout?.status,
          same_name_payout_required: record.controls?.same_name_required,
          same_name_match_status: record.controls?.same_name_status,
        });
        setQuote({
          quote_id: record.quote_id,
          brl_amount: value.source_amount_brl,
          estimated_usd_amount: value.quoted_destination_usd,
          estimated_usdc_amount: value.quoted_destination_usd,
          fx_rate: value.fx_rate_brl_per_usd,
          platform_fee: value.fees?.platform_fee,
          estimated_provider_fee: value.fees?.estimated_provider_fee,
          total_fee: value.fees?.total_fee,
          metadata: { reviewer_snapshot: true },
        });
        setForm((current) => ({
          ...current,
          brlAmount: String(value.source_amount_brl || current.brlAmount),
          senderName: "Redacted origin institution",
          senderEmail: "[redacted]",
          recipientName: "Redacted destination institution",
          bankName: record.payout?.destination?.bank_name || "Redacted destination provider",
          routingNumber: record.payout?.destination?.routing_number_last4
            ? `••••${record.payout.destination.routing_number_last4}`
            : "[redacted]",
          accountNumber: record.payout?.destination?.account_number_last4
            ? `••••${record.payout.destination.account_number_last4}`
            : "[redacted]",
          country: record.payout?.destination?.country || "US",
        }));
        setWorkflow(snapshot);
        pushEvent("Reviewer snapshot loaded", `Transfer ${transferId} loaded through the redacted evidence contract.`, "ok");
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught));
      });
    return () => {
      cancelled = true;
    };
  }, [loadArtifacts, pushEvent]);

  const transferPayload = useMemo(() => ({
    quote_id: quote?.quote_id,
    user_id: sessionId || undefined,
    sender_identity: {
      legal_name: form.senderName,
      email: form.senderEmail,
      country: "BR",
      type: form.accountHolderType === "business" ? "institution" : "individual",
    },
    recipient_identity: {
      legal_name: form.recipientName,
      country: form.country,
      type: form.accountHolderType,
    },
    payout_destination: {
      accountHolderName: form.recipientName,
      accountHolderType: form.accountHolderType,
      bankName: form.bankName,
      routingNumber: form.routingNumber,
      accountNumber: form.accountNumber,
      accountType: form.accountType,
      country: form.country,
      providerLabel: form.providerLabel,
    },
    same_name_payout_required: true,
  }), [form, quote?.quote_id, sessionId]);

  const createQuote = useCallback(async () => {
    const payload = await callApi("Create quote", "POST", "/api/quotes/brl-usd", {
      brl_amount: form.brlAmount,
      user_id: sessionId || undefined,
    });
    setQuote(payload.quote || null);
    setTransfer(null);
    setWorkflow(null);
    setReconciliation(null);
    setReviewerEvidence(null);
    setPayoutEvidence(null);
    return payload.quote as JsonRecord;
  }, [callApi, form.brlAmount, sessionId]);

  const createTransfer = useCallback(async (activeQuote?: JsonRecord) => {
    const routeQuote = activeQuote || quote || await createQuote();
    const payload = await callApi("Create transfer", "POST", "/api/transfers", {
      ...transferPayload,
      quote_id: routeQuote.quote_id,
    });
    setQuote(routeQuote);
    setTransfer(payload.transfer || null);
    await loadArtifacts(payload.transfer.transfer_id, false);
    return payload.transfer as JsonRecord;
  }, [callApi, createQuote, loadArtifacts, quote, transferPayload]);

  const createPixIntent = useCallback(async (activeTransfer?: JsonRecord) => {
    const routeTransfer = activeTransfer || transfer;
    if (!routeTransfer?.transfer_id) throw new Error("Create the transfer record first.");
    if (form.mockPix && !opsMocksAllowed) throw new Error("Ops mock PIX funding is disabled.");
    const payload = await callApi(
      "Create PIX intent",
      "POST",
      `/api/transfers/${encodeURIComponent(routeTransfer.transfer_id)}/pix-intent`,
      {
        mock_pix_intent: form.mockPix,
        session_id: form.manualSessionId || sessionId || undefined,
        session_token: form.manualSessionToken || undefined,
        email: form.senderEmail,
      },
      form.mockPix,
    );
    setTransfer(payload.transfer || null);
    await loadArtifacts(routeTransfer.transfer_id, false);
    return payload.transfer as JsonRecord;
  }, [callApi, form, loadArtifacts, opsMocksAllowed, sessionId, transfer]);

  const confirmFunding = useCallback(async () => {
    if (!transfer?.transfer_id) throw new Error("Create the transfer record first.");
    if (!opsMocksAllowed) throw new Error("Funding confirmation must come from the PIX provider event.");
    if (!form.opsSecret) throw new Error("Operator secret is required.");
    const payload = await callApi(
      "Confirm funding",
      "POST",
      `/api/transfers/${encodeURIComponent(transfer.transfer_id)}/funding-confirmation`,
      { status: "completed", event: "pix.received" },
      true,
    );
    setTransfer(payload.transfer || null);
    await loadArtifacts(transfer.transfer_id, false);
  }, [callApi, form.opsSecret, loadArtifacts, opsMocksAllowed, transfer]);

  const settleStellar = useCallback(async () => {
    if (!transfer?.transfer_id) throw new Error("Create the transfer record first.");
    if (!form.opsSecret) throw new Error("Operator secret is required.");
    const payload = await callApi(
      "Settle on Stellar",
      "POST",
      `/api/transfers/${encodeURIComponent(transfer.transfer_id)}/settle-stellar`,
      {},
      true,
    );
    setTransfer(payload.transfer || null);
    await loadArtifacts(transfer.transfer_id, false);
  }, [callApi, form.opsSecret, loadArtifacts, transfer]);

  const createPayout = useCallback(async () => {
    if (!transfer?.transfer_id) throw new Error("Create the transfer record first.");
    if (!form.opsSecret) throw new Error("Operator secret is required.");
    const payload = await callApi(
      "Create payout instruction",
      "POST",
      `/api/transfers/${encodeURIComponent(transfer.transfer_id)}/payout-instruction`,
      {
        provider: form.payoutProvider,
        session_id: form.manualSessionId || sessionId || undefined,
        session_token: form.manualSessionToken || undefined,
        wallet_pin: form.walletPin || undefined,
        run_etherfuse_offramp_test: form.payoutProvider === "etherfuse" && form.runEtherfuseOffRamp,
        target_brl: form.brlAmount,
      },
      true,
    );
    setTransfer(payload.transfer || null);
    await loadArtifacts(transfer.transfer_id, false);
  }, [callApi, form, loadArtifacts, sessionId, transfer]);

  const refreshPayout = useCallback(async () => {
    if (!transfer?.transfer_id) throw new Error("Create the transfer record first.");
    if (!form.opsSecret) throw new Error("Operator secret is required.");
    const payload = await callApi(
      "Refresh payout",
      "POST",
      `/api/transfers/${encodeURIComponent(transfer.transfer_id)}/payout-status-refresh`,
      {},
      true,
    );
    setTransfer(payload.transfer || null);
    await loadArtifacts(transfer.transfer_id, false);
  }, [callApi, form.opsSecret, loadArtifacts, transfer]);

  const runFundingSetup = useCallback(async () => {
    try {
      const createdQuote = await createQuote();
      const createdTransfer = await createTransfer(createdQuote);
      await createPixIntent(createdTransfer);
      pushEvent("Funding setup ready", "Quote, transfer record, and PIX funding intent were created.", "ok");
    } catch {
      // callApi already records the actionable error.
    }
  }, [createPixIntent, createQuote, createTransfer, pushEvent]);

  const refreshEvidence = useCallback(async () => {
    if (!transfer?.transfer_id) throw new Error("Create the transfer record first.");
    await loadArtifacts(transfer.transfer_id);
  }, [loadArtifacts, transfer]);

  const downloadEvidence = useCallback(async () => {
    if (!transfer?.transfer_id) throw new Error("Create the transfer record first.");
    const artifacts = reviewerEvidence && payoutEvidence
      ? { reviewer_evidence: reviewerEvidence, payout_evidence: payoutEvidence }
      : await loadArtifacts(transfer.transfer_id);
    const blob = new Blob([`${JSON.stringify(redactSensitive(artifacts), null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `instawards-${transfer.transfer_id}-reviewer-evidence.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [loadArtifacts, payoutEvidence, reviewerEvidence, transfer]);

  const copyBundle = useCallback(async () => {
    await navigator.clipboard.writeText(JSON.stringify(redactSensitive({
      generated_at: new Date().toISOString(),
      correlation_id: correlationId,
      quote,
      transfer,
      workflow,
      reconciliation,
      reviewer_evidence: reviewerEvidence,
      payout_evidence: payoutEvidence,
      payout_providers: payoutProviders,
      events,
      api_logs: logs,
    }), null, 2));
  }, [correlationId, events, logs, payoutEvidence, payoutProviders, quote, reconciliation, reviewerEvidence, transfer, workflow]);

  const reset = useCallback(() => {
    setForm(INITIAL_FORM);
    setCorrelationId(createCorrelationId());
    setQuote(null);
    setTransfer(null);
    setReconciliation(null);
    setWorkflow(null);
    setReviewerEvidence(null);
    setPayoutEvidence(null);
    setEvents([]);
    setLogs([]);
    setError("");
  }, []);

  const economics = useMemo(
    () => routeEconomics(
      quote || { brl_amount: form.brlAmount },
      transfer,
      reconciliation,
    ),
    [form.brlAmount, quote, reconciliation, transfer],
  );
  const artifacts = useMemo(
    () => evidenceRows(workflow, reviewerEvidence),
    [reviewerEvidence, workflow],
  );
  const payoutArtifacts = useMemo(
    () => payoutEvidenceRows(payoutEvidence),
    [payoutEvidence],
  );

  return {
    opsMocksAllowed,
    form,
    updateForm,
    sessionId,
    correlationId,
    quote,
    transfer,
    reconciliation,
    workflow,
    reviewerEvidence,
    payoutEvidence,
    payoutProviders,
    events,
    logs,
    busy,
    error,
    economics,
    artifacts,
    payoutArtifacts,
    actions: {
      createQuote,
      createTransfer,
      createPixIntent,
      confirmFunding,
      settleStellar,
      createPayout,
      refreshPayout,
      runFundingSetup,
      refreshEvidence,
      downloadEvidence,
      copyBundle,
      reset,
    },
  };
}
