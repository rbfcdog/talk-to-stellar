"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  CircleDot,
  Clipboard,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileJson,
  GitBranch,
  ListChecks,
  Loader2,
  Network,
  Play,
  QrCode,
  RefreshCw,
  RotateCcw,
  Route,
  Send,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  REPOSITORY_URL,
  compact,
  money,
  percent,
  pretty,
  redactSensitive,
} from "./settlement-console.model";
import type {
  ConsoleForm,
  ConsoleTab,
  WorkflowStep,
} from "./settlement-console.types";
import { useSettlementConsole } from "./use-settlement-console";

type Console = ReturnType<typeof useSettlementConsole>;

function Status({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral" | "info";
  children: ReactNode;
}) {
  const classes = {
    success: "border-tts-confirm/40 bg-tts-confirm/10 text-tts-confirm",
    warning: "border-tts-gold/40 bg-tts-gold-bg text-tts-gold",
    danger: "border-tts-error/40 bg-tts-error/10 text-tts-error",
    neutral: "border-tts-border bg-tts-bg text-tts-muted",
    info: "border-tts-deep/20 bg-tts-deep/5 text-tts-deep",
  };
  return (
    <span className={`inline-flex min-h-7 items-center rounded-md border px-2 py-1 text-xs font-bold ${classes[tone]}`}>
      {children}
    </span>
  );
}

function Field<K extends keyof ConsoleForm>({
  field,
  label,
  console,
  type = "text",
  placeholder,
}: {
  field: K;
  label: string;
  console: Console;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold uppercase text-tts-muted">{label}</span>
      <input
        value={String(console.form[field])}
        type={type}
        placeholder={placeholder}
        onChange={(event) => console.updateForm(field, event.target.value as ConsoleForm[K])}
        className="h-10 min-w-0 rounded-md border border-tts-border bg-tts-bg px-3 text-sm font-semibold text-tts-deep outline-none transition focus:border-tts-gold"
      />
    </label>
  );
}

function SelectField<K extends keyof ConsoleForm>({
  field,
  label,
  console,
  options,
}: {
  field: K;
  label: string;
  console: Console;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-bold uppercase text-tts-muted">{label}</span>
      <select
        value={String(console.form[field])}
        onChange={(event) => console.updateForm(field, event.target.value as ConsoleForm[K])}
        className="h-10 min-w-0 rounded-md border border-tts-border bg-tts-bg px-3 text-sm font-semibold text-tts-deep outline-none transition focus:border-tts-gold"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function CommandButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        primary
          ? "border-tts-deep bg-tts-deep text-white hover:bg-tts-deep/90"
          : "border-tts-border bg-tts-surface text-tts-deep hover:border-tts-gold"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function stepTone(step: WorkflowStep) {
  if (step.status === "completed") return "success";
  if (step.status === "current") return "warning";
  if (step.status === "failed") return "danger";
  return "neutral";
}

function stepIcon(step: WorkflowStep) {
  if (step.status === "completed") return <Check className="h-4 w-4" aria-hidden="true" />;
  if (step.status === "failed") return <XCircle className="h-4 w-4" aria-hidden="true" />;
  if (step.status === "current") return <CircleDot className="h-4 w-4" aria-hidden="true" />;
  return <span className="font-mono text-[11px]">{step.index + 1}</span>;
}

function EvidenceStrip({ console }: { console: Console }) {
  const ready = console.artifacts.filter((item) => item.ready).length;
  const payoutReady = console.payoutArtifacts.filter((item) => item.ready).length;
  return (
    <>
      <section
        data-testid="week-one-evidence"
        data-evidence-status={`${ready}/4`}
        className="border-b border-tts-border bg-tts-surface"
      >
        <div className="mx-auto grid w-full max-w-7xl lg:grid-cols-[250px_minmax(0,1fr)]">
          <div className="flex items-center justify-between gap-3 border-b border-tts-border px-4 py-4 lg:border-b-0 lg:border-r sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase text-tts-gold">Week 1 evidence</p>
              <p className="mt-1 text-sm font-black text-tts-deep">{ready}/4 artifacts available</p>
            </div>
            <Status tone={ready === 4 ? "success" : "warning"}>{ready === 4 ? "ready" : "open"}</Status>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            {console.artifacts.map((item, index) => (
              <div
                key={item.id}
                className={`grid min-w-0 grid-cols-[24px_minmax(0,1fr)_18px] items-center gap-2 px-4 py-3 ${
                  index > 0 ? "border-t border-tts-border sm:border-l sm:border-t-0" : ""
                } ${index === 2 ? "sm:border-l-0 sm:border-t xl:border-l xl:border-t-0" : ""}`}
              >
                {item.id === "repository" ? <GitBranch className="h-4 w-4 text-tts-muted" /> :
                  item.id === "dashboard_screenshot" ? <Building2 className="h-4 w-4 text-tts-muted" /> :
                    item.id === "orchestration_logs" ? <ListChecks className="h-4 w-4 text-tts-muted" /> :
                      <FileJson className="h-4 w-4 text-tts-muted" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-tts-deep">{item.label}</p>
                  <p className="truncate font-mono text-xs text-tts-muted">{item.detail}</p>
                </div>
                {item.ready
                  ? <CheckCircle2 className="h-4 w-4 text-tts-confirm" />
                  : <AlertTriangle className="h-4 w-4 text-tts-gold" />}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section
        data-testid="week-two-evidence"
        data-evidence-status={`${payoutReady}/4`}
        className="border-b border-tts-border bg-tts-bg"
      >
        <div className="mx-auto grid w-full max-w-7xl lg:grid-cols-[250px_minmax(0,1fr)]">
          <div className="flex items-center justify-between gap-3 border-b border-tts-border px-4 py-3 lg:border-b-0 lg:border-r sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase text-tts-confirm">Week 2 evidence</p>
              <p className="mt-1 text-sm font-black text-tts-deep">{payoutReady}/4 payout artifacts</p>
            </div>
            <Status tone={payoutReady === 4 ? "success" : "warning"}>{payoutReady === 4 ? "ready" : "open"}</Status>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            {(console.payoutArtifacts.length ? console.payoutArtifacts : [
              { id: "adapter_interface_code", label: "Adapter Interface Code", detail: "available", ready: true },
              { id: "stellar_transaction_hash", label: "Stellar Transaction Hash", detail: "waiting", ready: false },
              { id: "circle_bridge_compatibility", label: "Circle / Bridge Compatibility", detail: "available", ready: true },
              { id: "payout_coordination_record", label: "Payout Coordination Record", detail: "waiting", ready: false },
            ]).map((item, index) => (
              <div key={item.id} className={`grid min-w-0 grid-cols-[24px_minmax(0,1fr)_18px] items-center gap-2 px-4 py-3 ${index ? "border-t border-tts-border sm:border-l sm:border-t-0" : ""}`}>
                {item.id === "adapter_interface_code" ? <Code2 className="h-4 w-4 text-tts-muted" /> :
                  item.id === "stellar_transaction_hash" ? <Network className="h-4 w-4 text-tts-muted" /> :
                    item.id === "circle_bridge_compatibility" ? <GitBranch className="h-4 w-4 text-tts-muted" /> :
                      <FileJson className="h-4 w-4 text-tts-muted" />}
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-tts-deep">{item.label}</p>
                  <p className="truncate font-mono text-xs text-tts-muted">{item.detail}</p>
                </div>
                {item.ready ? <CheckCircle2 className="h-4 w-4 text-tts-confirm" /> : <CircleDot className="h-4 w-4 text-tts-muted" />}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function ConfigurationRail({ console }: { console: Console }) {
  const invoke = (action: () => Promise<unknown> | void) => () => void Promise.resolve(action()).catch(() => undefined);
  return (
    <aside className="border-b border-tts-border bg-tts-surface xl:border-b-0 xl:border-r">
      <div className="grid gap-5 p-4 sm:p-6 xl:sticky xl:top-0 xl:max-h-screen xl:overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-tts-gold">Route configuration</p>
            <h2 className="mt-1 text-lg font-black text-tts-deep">BRL source to USD account</h2>
          </div>
          <Status tone={console.quote ? "success" : "neutral"}>{console.quote ? "quoted" : "draft"}</Status>
        </div>

        <div className="grid gap-3">
          <Field field="brlAmount" label="Source amount (BRL)" console={console} type="number" />
          <Field field="senderName" label="Verified origin name" console={console} />
          <Field field="senderEmail" label="Operations email" console={console} type="email" />
          <Field field="recipientName" label="USD account holder" console={console} />
          <Field field="bankName" label="Destination bank" console={console} />
          <div className="grid grid-cols-2 gap-3">
            <Field field="routingNumber" label="Routing" console={console} />
            <Field field="accountNumber" label="Account" console={console} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              field="accountHolderType"
              label="Owner type"
              console={console}
              options={[
                { value: "individual", label: "Individual" },
                { value: "business", label: "Business" },
              ]}
            />
            <SelectField
              field="accountType"
              label="Account type"
              console={console}
              options={[
                { value: "checking", label: "Checking" },
                { value: "savings", label: "Savings" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field field="country" label="Country" console={console} />
            <SelectField
              field="providerLabel"
              label="Account profile"
              console={console}
              options={[
                { value: "other", label: "Other" },
                { value: "wise", label: "Wise metadata" },
                { value: "mercury", label: "Mercury" },
                { value: "revolut", label: "Revolut" },
              ]}
            />
          </div>
          <SelectField
            field="payoutProvider"
            label="Payout adapter"
            console={console}
            options={[
              { value: "etherfuse", label: "Etherfuse proof" },
              { value: "circle", label: "Circle compatibility" },
              { value: "bridge", label: "Bridge compatibility" },
              ...(console.opsMocksAllowed ? [{ value: "mock", label: "Ops mock" }] : []),
            ]}
          />
        </div>

        <details className="border-y border-tts-border py-3">
          <summary className="cursor-pointer text-sm font-bold text-tts-deep">Execution credentials</summary>
          <div className="mt-3 grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field field="manualSessionId" label="Session ID" console={console} placeholder={console.sessionId || "optional"} />
              <Field field="manualSessionToken" label="Session token" console={console} type="password" />
            </div>
            <Field field="opsSecret" label="Operator secret" console={console} type="password" />
            {console.form.payoutProvider === "etherfuse" && console.form.runEtherfuseOffRamp ? (
              <Field field="walletPin" label="Wallet PIN" console={console} type="password" />
            ) : null}
            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-tts-deep">
              <span>Execute Etherfuse withdrawal proof</span>
              <input
                type="checkbox"
                checked={console.form.runEtherfuseOffRamp}
                onChange={(event) => console.updateForm("runEtherfuseOffRamp", event.target.checked)}
                className="h-4 w-4 accent-current"
              />
            </label>
            {console.opsMocksAllowed ? (
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-tts-deep">
                <span>Use ops mock PIX intent</span>
                <input
                  type="checkbox"
                  checked={console.form.mockPix}
                  onChange={(event) => console.updateForm("mockPix", event.target.checked)}
                  className="h-4 w-4 accent-current"
                />
              </label>
            ) : null}
          </div>
        </details>

        <div className="grid gap-2">
          <CommandButton
            icon={console.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            label="Prepare funding route"
            onClick={invoke(console.actions.runFundingSetup)}
            disabled={Boolean(console.busy)}
            primary
          />
          <div className="grid grid-cols-2 gap-2">
            <CommandButton icon={<Clipboard className="h-4 w-4" />} label="Quote" onClick={invoke(console.actions.createQuote)} disabled={Boolean(console.busy)} />
            <CommandButton icon={<Route className="h-4 w-4" />} label="Transfer" onClick={invoke(() => console.actions.createTransfer())} disabled={Boolean(console.busy)} />
            <CommandButton icon={<QrCode className="h-4 w-4" />} label="PIX intent" onClick={invoke(() => console.actions.createPixIntent())} disabled={Boolean(console.busy || !console.transfer)} />
            <CommandButton icon={<Banknote className="h-4 w-4" />} label="Confirm" onClick={invoke(console.actions.confirmFunding)} disabled={Boolean(console.busy || !console.opsMocksAllowed || !console.transfer)} />
            <CommandButton icon={<Network className="h-4 w-4" />} label="Settle" onClick={invoke(console.actions.settleStellar)} disabled={Boolean(console.busy || !console.transfer)} />
            <CommandButton icon={<Send className="h-4 w-4" />} label="Payout" onClick={invoke(console.actions.createPayout)} disabled={Boolean(console.busy || !console.transfer)} />
            <CommandButton icon={<RefreshCw className="h-4 w-4" />} label="Poll payout" onClick={invoke(console.actions.refreshPayout)} disabled={Boolean(console.busy || !console.transfer?.payout_instruction_id)} />
            <CommandButton icon={<ListChecks className="h-4 w-4" />} label="Refresh proof" onClick={invoke(console.actions.refreshEvidence)} disabled={Boolean(console.busy || !console.transfer)} />
          </div>
        </div>
      </div>
    </aside>
  );
}

function WorkflowTable({ console }: { console: Console }) {
  const steps = console.workflow?.steps || [];
  return (
    <section className="border-b border-tts-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase text-tts-muted">Authoritative workflow</p>
          <h2 className="mt-1 text-lg font-black text-tts-deep">
            {console.workflow?.current_state || "No transfer created"}
          </h2>
        </div>
        <Status tone={console.workflow?.successful ? "success" : console.workflow?.current_state === "FAILED" ? "danger" : console.workflow ? "warning" : "neutral"}>
          {console.workflow ? `${console.workflow.progress.percent}% complete` : "waiting"}
        </Status>
      </div>
      <div className="overflow-x-auto border-t border-tts-border">
        <div className="grid min-w-[900px] grid-cols-9">
          {steps.length ? steps.map((step) => (
            <div key={step.state} className="border-r border-tts-border px-3 py-4 last:border-r-0">
              <div className="flex items-center justify-between gap-2">
                <Status tone={stepTone(step)}>{stepIcon(step)}</Status>
                <span className="font-mono text-[10px] text-tts-muted">{String(step.index + 1).padStart(2, "0")}</span>
              </div>
              <p className="mt-3 text-xs font-black text-tts-deep">{step.label}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase text-tts-muted">{step.phase}</p>
            </div>
          )) : Array.from({ length: 9 }).map((_, index) => (
            <div key={index} className="border-r border-tts-border px-3 py-4 last:border-r-0">
              <Status tone="neutral">{index + 1}</Status>
              <div className="mt-3 h-3 w-20 bg-tts-bg" />
              <div className="mt-2 h-2 w-14 bg-tts-bg" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Overview({ console }: { console: Console }) {
  const economics = console.economics;
  const nextAction = console.workflow?.next_action;
  const settlement = console.reconciliation?.evidence?.stellar_settlement;
  const payout = console.reconciliation?.evidence?.payout_instruction;
  return (
    <>
      {console.error ? (
        <div className="flex items-start gap-3 border-b border-tts-error/40 bg-tts-error/10 px-4 py-3 text-sm font-semibold text-tts-error sm:px-6">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{console.error}</span>
        </div>
      ) : null}

      <section className="grid border-b border-tts-border lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-5 px-4 py-5 sm:px-6">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
            <div>
              <p className="text-xs font-bold uppercase text-tts-muted">PIX source</p>
              <p className="mt-2 text-xl font-black text-tts-deep">{money(economics.sourceBrl, "BRL")}</p>
              <p className="mt-1 text-sm font-semibold text-tts-muted">{console.form.senderName}</p>
            </div>
            <ArrowRight className="hidden h-5 w-5 text-tts-muted md:block" />
            <div className="border-y border-tts-border py-4 md:border-x md:border-y-0 md:px-5 md:py-0">
              <p className="text-xs font-bold uppercase text-tts-gold">Stellar settlement</p>
              <p className="mt-2 text-xl font-black text-tts-deep">{money(economics.grossUsd, "USD")} USDC</p>
              <p className="mt-1 font-mono text-xs text-tts-muted">{compact(console.transfer?.stellar_tx_hash, 24)}</p>
            </div>
            <ArrowRight className="hidden h-5 w-5 text-tts-muted md:block" />
            <div>
              <p className="text-xs font-bold uppercase text-tts-confirm">USD destination</p>
              <p className="mt-2 text-xl font-black text-tts-confirm">{money(economics.destinationUsd, "USD")}</p>
              <p className="mt-1 text-sm font-semibold text-tts-muted">{console.form.bankName}</p>
            </div>
          </div>
        </div>
        <div className="border-t border-tts-border bg-tts-bg px-4 py-5 lg:border-l lg:border-t-0 sm:px-6">
          <p className="text-xs font-bold uppercase text-tts-muted">Next controlled action</p>
          <p className="mt-2 text-base font-black text-tts-deep">{nextAction?.label || "Create a route quote"}</p>
          <p className="mt-2 text-sm leading-6 text-tts-muted">{nextAction?.description || "The workflow begins with a persisted BRL/USD quote."}</p>
          {nextAction?.blocked ? (
            <p className="mt-3 text-xs font-bold text-tts-error">{nextAction.blocked_reason}</p>
          ) : null}
        </div>
      </section>

      <WorkflowTable console={console} />

      <section className="grid border-b border-tts-border lg:grid-cols-4">
        {[
          ["Gross route", money(economics.grossUsd, "USD"), `${money(economics.sourceBrl, "BRL")} @ ${economics.fxRate.toFixed(2)}`],
          ["Charged fees", money(economics.totalFeeUsd, "USD"), `${money(economics.totalFeeBrl, "BRL")} · ${percent(economics.feePct)}`],
          ["Net destination", money(economics.destinationUsd, "USD"), `${percent(economics.retainedPct)} retained`],
          ["Math validation", economics.metricsValid ? "PASS" : "REVIEW", `${money(economics.feeVarianceUsd, "USD")} variance`],
        ].map(([label, value, detail], index) => (
          <div key={label} className={`px-4 py-5 sm:px-6 ${index ? "border-t border-tts-border lg:border-l lg:border-t-0" : ""}`}>
            <p className="text-xs font-bold uppercase text-tts-muted">{label}</p>
            <p className={`mt-2 text-xl font-black ${label === "Net destination" || value === "PASS" ? "text-tts-confirm" : "text-tts-deep"}`}>{value}</p>
            <p className="mt-1 text-sm font-semibold text-tts-muted">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid border-b border-tts-border lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="px-4 py-5 sm:px-6">
          <div className="mb-4 flex items-center gap-2">
            <WalletCards className="h-5 w-5 text-tts-gold" />
            <h2 className="text-base font-black text-tts-deep">Charged fee reconciliation</h2>
          </div>
          <div className="overflow-hidden border-y border-tts-border">
            {[
              ["PIX entry provider", economics.onRampFeeUsd, economics.onRampFeeBrl],
              ["TalkToStellar transaction", economics.platformFeeUsd, economics.platformFeeBrl],
              ["Destination provider", economics.offRampFeeUsd, economics.offRampFeeBrl],
            ].map(([label, usd, brl]) => (
              <div key={String(label)} className="grid grid-cols-[minmax(0,1fr)_120px_120px] items-center border-b border-tts-border py-3 last:border-b-0">
                <span className="text-sm font-bold text-tts-deep">{label}</span>
                <span className="text-right font-mono text-sm text-tts-deep">{money(usd, "USD")}</span>
                <span className="text-right font-mono text-sm text-tts-muted">{money(brl, "BRL")}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-tts-border bg-tts-bg px-4 py-5 lg:border-l lg:border-t-0 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase text-tts-muted">Identity continuity</p>
            <Status tone={console.workflow?.identity_control.payout_allowed ? "success" : console.workflow ? "danger" : "neutral"}>
              {console.workflow?.identity_control.status || "UNKNOWN"}
            </Status>
          </div>
          <p className="mt-3 text-sm font-bold text-tts-deep">
            {console.workflow?.identity_control.required ? "Same-name payout enforced" : "Same-name payout optional"}
          </p>
          <p className="mt-2 text-sm leading-6 text-tts-muted">
            {console.workflow?.identity_control.payout_allowed === false
              ? "Destination instruction is blocked until identity alignment is resolved."
              : "Destination instruction may proceed under the current identity control."}
          </p>
          <div className="mt-5 grid gap-2">
            <p className="text-xs font-bold uppercase text-tts-muted">Evidence modes</p>
            <div className="flex flex-wrap gap-2">
              <Status tone={settlement?.execution_mode === "testnet" ? "success" : "warning"}>
                Stellar: {settlement?.execution_mode || "pending"}
              </Status>
              <Status tone={payout?.metadata?.mode?.includes("mock") ? "warning" : payout ? "info" : "neutral"}>
                Payout: {payout?.metadata?.mode || "pending"}
              </Status>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Evidence({ console }: { console: Console }) {
  const invoke = (action: () => Promise<unknown> | void) => () => void Promise.resolve(action()).catch(() => undefined);
  const evidenceStatus = console.workflow?.evidence;
  return (
    <div className="grid lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="border-b border-tts-border px-4 py-5 lg:border-b-0 lg:border-r sm:px-6">
        <p className="text-xs font-bold uppercase text-tts-gold">Submission packet</p>
        <h2 className="mt-1 text-lg font-black text-tts-deep">Reviewer evidence</h2>
        <div className="mt-5 grid gap-2">
          {[
            ["Quote", evidenceStatus?.quote],
            ["PIX intent", evidenceStatus?.pix_intent],
            ["Funding confirmation", evidenceStatus?.pix_confirmation],
            ["Stellar settlement", evidenceStatus?.stellar_settlement],
            ["Payout instruction", evidenceStatus?.payout_instruction],
            ["Reconciliation", evidenceStatus?.reconciliation],
          ].map(([label, ready]) => (
            <div key={String(label)} className="flex items-center justify-between border-b border-tts-border py-2">
              <span className="text-sm font-semibold text-tts-deep">{label}</span>
              {ready ? <CheckCircle2 className="h-4 w-4 text-tts-confirm" /> : <CircleDot className="h-4 w-4 text-tts-muted" />}
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-2">
          <CommandButton icon={<RefreshCw className="h-4 w-4" />} label="Refresh evidence" onClick={invoke(console.actions.refreshEvidence)} disabled={!console.transfer || Boolean(console.busy)} />
          <CommandButton icon={<Download className="h-4 w-4" />} label="Download JSON" onClick={invoke(console.actions.downloadEvidence)} disabled={!console.transfer || Boolean(console.busy)} />
          <CommandButton icon={<Copy className="h-4 w-4" />} label="Copy redacted bundle" onClick={invoke(console.actions.copyBundle)} disabled={Boolean(console.busy)} />
          <Link
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-tts-border text-sm font-bold text-tts-deep transition hover:border-tts-gold"
          >
            <ExternalLink className="h-4 w-4" />
            Open repository
          </Link>
        </div>
      </section>
      <section className="grid md:grid-cols-2">
        {([
          ["Reviewer contract", console.reviewerEvidence],
          ["Reconciliation", console.reconciliation],
          ["Transfer snapshot", console.transfer],
          ["Quote provenance", console.quote],
        ] as Array<[string, unknown]>).map(([label, value], index) => (
          <div key={String(label)} className={`min-w-0 border-b border-tts-border p-4 sm:p-6 ${index % 2 ? "md:border-l" : ""}`}>
            <div className="mb-3 flex items-center gap-2">
              <Code2 className="h-4 w-4 text-tts-muted" />
              <h3 className="text-sm font-black text-tts-deep">{label}</h3>
            </div>
            <pre className="max-h-[420px] overflow-auto bg-tts-bg p-3 text-xs leading-5 text-tts-deep">
              {pretty(redactSensitive(value))}
            </pre>
          </div>
        ))}
      </section>
    </div>
  );
}

function PayoutCoordination({ console }: { console: Console }) {
  const evidence = console.payoutEvidence;
  const history = Array.isArray(evidence?.status_history) ? evidence.status_history : [];
  return (
    <div>
      <section className="grid border-b border-tts-border lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="px-4 py-5 sm:px-6">
          <p className="text-xs font-bold uppercase text-tts-confirm">USD delivery coordination</p>
          <h2 className="mt-1 text-lg font-black text-tts-deep">{evidence?.provider?.display_name || "Select and create a payout instruction"}</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["Stellar evidence", evidence?.settlement?.stellar_tx_hash ? "attached" : "waiting"],
              ["Same-name control", evidence ? (evidence.identity_control?.payout_allowed ? "pass" : "blocked") : "waiting"],
              ["Payout instruction", evidence?.instruction?.status || "waiting"],
            ].map(([label, value]) => (
              <div key={label} className="border-y border-tts-border py-3">
                <p className="text-xs font-bold uppercase text-tts-muted">{label}</p>
                <p className="mt-2 font-mono text-sm font-black text-tts-deep">{value}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-tts-border bg-tts-bg px-4 py-5 lg:border-l lg:border-t-0 sm:px-6">
          <p className="text-xs font-bold uppercase text-tts-muted">Execution boundary</p>
          <p className="mt-2 text-base font-black text-tts-deep">{evidence?.execution_mode || evidence?.provider?.execution_mode || "not created"}</p>
          <p className="mt-2 text-sm leading-6 text-tts-muted">
            {evidence?.provider?.notes?.[0] || "Provider execution remains disabled until its credentials and execution flag are configured."}
          </p>
        </div>
      </section>

      <section className="border-b border-tts-border">
        <div className="px-4 py-4 sm:px-6">
          <p className="text-xs font-bold uppercase text-tts-muted">Provider readiness</p>
          <h3 className="mt-1 text-base font-black text-tts-deep">Adapter capability matrix</h3>
        </div>
        <div className="overflow-x-auto border-t border-tts-border">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[190px_120px_100px_100px_110px_110px_minmax(180px,1fr)] bg-tts-bg px-4 py-2 text-xs font-bold uppercase text-tts-muted sm:px-6">
              <span>Provider</span><span>Mode</span><span>Configured</span><span>Execution</span><span>Status poll</span><span>Webhook</span><span>Blockers</span>
            </div>
            {console.payoutProviders.map((provider) => (
              <div key={provider.provider_name} className="grid grid-cols-[190px_120px_100px_100px_110px_110px_minmax(180px,1fr)] border-t border-tts-border px-4 py-3 text-sm sm:px-6">
                <span className="font-black text-tts-deep">{provider.display_name}</span>
                <span className="font-mono text-xs text-tts-muted">{provider.execution_mode}</span>
                <span>{provider.configured ? <CheckCircle2 className="h-4 w-4 text-tts-confirm" /> : <CircleDot className="h-4 w-4 text-tts-muted" />}</span>
                <span>{provider.execution_enabled ? <Status tone="success">enabled</Status> : <Status tone="neutral">disabled</Status>}</span>
                <span>{provider.supports.status_polling ? "available" : "not configured"}</span>
                <span>{provider.supports.webhooks ? "signed" : "not configured"}</span>
                <span className="truncate text-xs text-tts-muted">{provider.blockers.join(" ") || "No adapter blockers."}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-tts-border px-4 py-5 lg:border-b-0 lg:border-r sm:px-6">
          <p className="text-xs font-bold uppercase text-tts-muted">Normalized status history</p>
          <div className="mt-4 grid gap-0">
            {history.length ? history.map((item: Record<string, any>, index: number) => (
              <div key={`${item.provider_event_id || item.observed_at}_${index}`} className="grid grid-cols-[92px_110px_minmax(0,1fr)] border-t border-tts-border py-3 text-sm first:border-t-0">
                <span className="font-mono text-xs text-tts-muted">{item.source}</span>
                <span className="font-bold text-tts-deep">{item.status}</span>
                <span className="truncate font-mono text-xs text-tts-muted">{item.observed_at}</span>
              </div>
            )) : <p className="text-sm text-tts-muted">Create a payout instruction to begin the provider event history.</p>}
          </div>
        </div>
        <div className="min-w-0 px-4 py-5 sm:px-6">
          <p className="text-xs font-bold uppercase text-tts-muted">Reviewer-safe coordination record</p>
          <pre className="mt-4 max-h-[460px] overflow-auto bg-tts-bg p-3 text-xs leading-5 text-tts-deep">
            {pretty(redactSensitive(evidence))}
          </pre>
        </div>
      </section>
    </div>
  );
}

function ApiActivity({ console }: { console: Console }) {
  return (
    <div className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <section className="border-b border-tts-border px-4 py-5 lg:border-b-0 lg:border-r sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-tts-muted">Execution stream</p>
            <h2 className="mt-1 text-lg font-black text-tts-deep">Lifecycle events</h2>
          </div>
          <Activity className="h-5 w-5 text-tts-gold" />
        </div>
        <div className="mt-5 grid gap-0">
          {console.events.length ? console.events.map((event, index) => (
            <div key={event.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
              <div className="relative flex justify-center">
                <span className={`mt-1 grid h-6 w-6 place-items-center rounded-full ${
                  event.state === "ok" ? "bg-tts-confirm/15 text-tts-confirm" :
                    event.state === "error" ? "bg-tts-error/10 text-tts-error" :
                      event.state === "running" ? "bg-tts-gold-bg text-tts-gold" :
                        "bg-tts-bg text-tts-muted"
                }`}>
                  {event.state === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
                    event.state === "error" ? <XCircle className="h-3.5 w-3.5" /> :
                      <Check className="h-3.5 w-3.5" />}
                </span>
                {index < console.events.length - 1 ? <span className="absolute top-7 h-full w-px bg-tts-border" /> : null}
              </div>
              <div className="pb-5">
                <p className="text-sm font-black text-tts-deep">{event.title}</p>
                <p className="mt-1 text-sm leading-5 text-tts-muted">{event.detail}</p>
                {event.path ? <p className="mt-1 font-mono text-xs text-tts-muted">{event.path}</p> : null}
              </div>
            </div>
          )) : <p className="text-sm text-tts-muted">No lifecycle calls recorded.</p>}
        </div>
      </section>
      <section className="px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-tts-muted">Correlation</p>
            <p className="mt-1 font-mono text-sm font-bold text-tts-deep">{console.correlationId}</p>
          </div>
          <Status tone={console.logs.some((log) => log.error) ? "danger" : console.logs.length ? "success" : "neutral"}>
            {console.logs.length} calls
          </Status>
        </div>
        <div className="mt-5 grid gap-2">
          {console.logs.length ? console.logs.map((log) => (
            <details key={log.id} className="border-y border-tts-border py-3">
              <summary className="cursor-pointer list-none">
                <div className="grid grid-cols-[64px_minmax(0,1fr)_56px_60px] items-center gap-2">
                  <span className="font-mono text-xs font-black text-tts-deep">{log.method}</span>
                  <span className="truncate font-mono text-xs text-tts-muted">{log.path}</span>
                  <Status tone={log.error ? "danger" : "success"}>{log.status || "ERR"}</Status>
                  <span className="text-right font-mono text-xs text-tts-muted">{log.duration_ms || 0}ms</span>
                </div>
              </summary>
              <pre className="mt-3 max-h-[360px] overflow-auto bg-tts-bg p-3 text-xs leading-5 text-tts-deep">
                {pretty({
                  request_id: log.request_id,
                  correlation_id: log.correlation_id,
                  request: log.request,
                  response: log.response,
                  error: log.error,
                })}
              </pre>
            </details>
          )) : <p className="text-sm text-tts-muted">No API calls recorded.</p>}
        </div>
      </section>
    </div>
  );
}

export default function SettlementConsoleView() {
  const console = useSettlementConsole();
  const [tab, setTab] = useState<ConsoleTab>("overview");
  const invoke = (action: () => Promise<unknown> | void) => () => void Promise.resolve(action()).catch(() => undefined);
  const currentState = console.workflow?.current_state;

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <header className="border-b border-tts-border bg-tts-surface">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 pb-4 pt-14 sm:px-6 lg:py-4 lg:pr-52">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              title="Back"
              aria-label="Back"
              className="grid h-9 w-9 place-items-center rounded-md border border-tts-border text-tts-muted transition hover:border-tts-gold hover:text-tts-gold"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <p className="text-xs font-bold uppercase text-tts-gold">Instawards · USD 5,000 delivery</p>
              <h1 className="mt-0.5 text-xl font-black text-tts-deep">PIX-to-Stellar Transfer Lifecycle Engine</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Status tone={currentState === "PAYOUT_COMPLETED" ? "success" : currentState === "FAILED" ? "danger" : currentState ? "warning" : "neutral"}>
              {currentState || "NOT STARTED"}
            </Status>
            <button
              type="button"
              title="Reset local console"
              aria-label="Reset local console"
              onClick={console.actions.reset}
              className="grid h-9 w-9 place-items-center rounded-md border border-tts-border text-tts-muted transition hover:border-tts-gold hover:text-tts-gold"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <EvidenceStrip console={console} />

      <div className="mx-auto grid w-full max-w-7xl xl:grid-cols-[360px_minmax(0,1fr)]">
        <ConfigurationRail console={console} />
        <div className="min-w-0 bg-tts-surface">
          <nav className="flex items-center justify-between gap-3 border-b border-tts-border px-4 sm:px-6">
            <div className="flex">
              {([
                ["overview", "Overview", Route],
                ["payout", "USD payout", WalletCards],
                ["evidence", "Evidence", ShieldCheck],
                ["api", "API activity", Code2],
              ] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`tab-${value}`}
                  onClick={() => setTab(value)}
                  className={`inline-flex h-12 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-xs font-bold transition sm:gap-2 sm:px-3 sm:text-sm ${
                    tab === value
                      ? "border-tts-gold text-tts-deep"
                      : "border-transparent text-tts-muted hover:text-tts-deep"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={invoke(console.actions.copyBundle)}
              title="Copy redacted evidence bundle"
              aria-label="Copy redacted evidence bundle"
              className="grid h-9 w-9 place-items-center rounded-md border border-tts-border text-tts-muted transition hover:border-tts-gold hover:text-tts-gold"
            >
              <Copy className="h-4 w-4" />
            </button>
          </nav>

          {tab === "overview" ? <Overview console={console} /> : null}
          {tab === "payout" ? <div data-testid="payout-coordination-panel"><PayoutCoordination console={console} /></div> : null}
          {tab === "evidence" ? <Evidence console={console} /> : null}
          {tab === "api" ? <ApiActivity console={console} /> : null}

          <footer className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs font-semibold text-tts-muted sm:px-6">
            <span>Testnet/sandbox orchestration unless the evidence record explicitly states otherwise.</span>
            <span className="font-mono">{compact(console.transfer?.transfer_id, 32)}</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
