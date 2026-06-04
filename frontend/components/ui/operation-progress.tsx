"use client"

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
    <div className={`tts-stage-panel p-4 text-sm ${
      status === "error"
        ? "text-tts-error"
      : status === "done"
          ? "text-tts-gold"
          : status === "submitting"
            ? "text-tts-deep"
            : "text-tts-muted"
    }`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-normal opacity-70">{title}</p>
          <p className="mt-1 text-sm font-semibold leading-5">{message}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        {steps.map((step, index) => {
          const stepState = stateForStep(status, index, activeIndex, steps.length)
          return (
            <div
              key={`${step.label}-${index}`}
              className={`rounded-xl border px-3 py-2 ${
                stepState === "done"
                    ? "border-tts-border bg-tts-bg/60"
                  : stepState === "active"
                    ? "border-tts-border bg-tts-bg/60"
                    : stepState === "error"
                      ? "border-tts-border bg-tts-bg/60"
                      : "border-tts-border bg-tts-bg/60 opacity-80"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                  stepState === "done"
                    ? "bg-tts-deep text-tts-bg"
                    : stepState === "active"
                      ? "bg-tts-gold text-tts-bg"
                      : stepState === "error"
                        ? "bg-tts-error text-tts-bg"
                        : "bg-tts-surface text-tts-muted"
                }`}>
                  {stepState === "done" ? "✓" : index + 1}
                </span>
                <div>
                  <p className="text-sm font-black">{step.label}</p>
                  <p className="mt-0.5 text-xs leading-4 opacity-70">{step.detail}</p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
