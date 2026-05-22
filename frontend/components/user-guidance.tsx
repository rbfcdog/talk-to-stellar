"use client"

import { CheckCircle2, type LucideIcon } from "lucide-react"

export type GuidanceStep = {
  title: string
  body: string
}

export type GuidanceAction = {
  label: string
  href?: string
  onClick?: () => void
}

export function UserGuidance({
  eyebrow,
  title,
  body,
  steps,
  actions = [],
  icon: Icon = CheckCircle2,
  className = "",
}: {
  eyebrow?: string
  title: string
  body: string
  steps: GuidanceStep[]
  actions?: GuidanceAction[]
  icon?: LucideIcon
  className?: string
}) {
  return (
    <section className={`rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-slate-200 ${className}`}>
      {eyebrow && (
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
          {eyebrow}
        </p>
      )}
      <div className="mt-2 flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-300/15 text-cyan-100">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <p className="mt-1 leading-6 text-slate-300">{body}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={`${step.title}-${index}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
              {String(index + 1).padStart(2, "0")}
            </p>
            <p className="mt-1 font-semibold text-white">{step.title}</p>
            <p className="mt-1 leading-5 text-slate-400">{step.body}</p>
          </div>
        ))}
      </div>

      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action) => {
            const classes = "rounded-lg border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-cyan-50 transition hover:bg-cyan-300/20"
            if (action.href) {
              return (
                <a key={action.label} href={action.href} className={classes}>
                  {action.label}
                </a>
              )
            }
            return (
              <button key={action.label} type="button" onClick={action.onClick} className={classes}>
                {action.label}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
