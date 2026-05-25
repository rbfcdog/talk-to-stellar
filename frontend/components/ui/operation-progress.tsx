"use client"

import { TypingDots } from "@/components/shared/feedback"

export type OperationProgressStatus = "ready" | "submitting" | "done" | "error"

export type OperationProgressStep = {
  label: string
  detail: string
}

function stateForStep(status: OperationProgressStatus, index: number, activeIndex: number, total: number) {
  if (status === "done") return "done"
  if (status === "error") {
    if (index < Math.max(0, activeIndex - 1)) return "done"
    if (index === Math.max(0, activeIndex - 1)) return "error"
    return "pending"
  }
  if (status === "submitting") {
    if (index < activeIndex) return "done"
    if (index === activeIndex) return "active"
    return "pending"
  }
  return index === 0 && total > 0 ? "active" : "pending"
}

export function OperationProgressPanel({
  status,
  elapsedSeconds,
  title,
  readyMessage,
  runningMessage,
  doneMessage,
  errorMessage,
  steps,
}: {
  status: OperationProgressStatus
  elapsedSeconds: number
  title: string
  readyMessage: string
  runningMessage: string
  doneMessage: string
  errorMessage: string
  steps: OperationProgressStep[]
}) {
  const safeElapsed = Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? Math.floor(elapsedSeconds) : 0
  const activeIndex = status === "submitting"
    ? Math.min(steps.length - 1, Math.max(0, Math.floor(safeElapsed / 4)))
    : status === "done"
      ? steps.length
      : status === "error"
        ? Math.min(steps.length, Math.max(1, Math.ceil(safeElapsed / 4)))
        : 0
  const message = status === "done"
    ? doneMessage
    : status === "error"
      ? errorMessage
      : status === "submitting"
        ? runningMessage
        : readyMessage

  return (
    <div className={`rounded-2xl border p-4 text-sm ${
      status === "error"
        ? "border-tts-error bg-tts-error/10 text-tts-error"
        : status === "done"
          ? "border-tts-confirm bg-tts-confirm/10 text-tts-confirm"
          : "border-tts-gold bg-tts-gold-bg text-tts-gold"
    }`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] opacity-70">{title}</p>
          <p className="mt-1 font-semibold">{message}</p>
        </div>
        {status === "submitting" && (
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-tts-border bg-tts-surface px-3 py-1 text-xs font-black">
            <TypingDots /> {safeElapsed}s
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-2">
        {steps.map((step, index) => {
          const stepState = stateForStep(status, index, activeIndex, steps.length)
          return (
            <div
              key={`${step.label}-${index}`}
              className={`rounded-xl border px-3 py-2 ${
                stepState === "done"
                  ? "border-tts-confirm bg-tts-confirm/10"
                  : stepState === "active"
                    ? "border-tts-gold bg-tts-gold-bg"
                    : stepState === "error"
                      ? "border-tts-error bg-tts-error/10"
                      : "border-tts-border bg-tts-deep/20 opacity-70"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                  stepState === "done"
                    ? "bg-tts-confirm text-tts-deep"
                    : stepState === "active"
                      ? "bg-tts-gold text-tts-deep"
                      : stepState === "error"
                        ? "bg-tts-error text-tts-error"
                        : "bg-tts-surface text-tts-surface/60"
                }`}>
                  {stepState === "done" ? "✓" : index + 1}
                </span>
                <div>
                  <p className="font-black">{step.label}</p>
                  <p className="mt-0.5 text-xs opacity-75">{step.detail}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

