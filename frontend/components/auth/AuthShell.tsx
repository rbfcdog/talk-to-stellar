import * as React from 'react'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/logo'

interface AuthShellProps {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, var(--tts-gold) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.06,
}

export function AuthShell({
  title,
  description,
  children,
  footer,
  className,
}: AuthShellProps) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-tts-bg px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0"
        style={DOT_GRID_STYLE}
        aria-hidden
      />

      <section
        className={cn(
          'relative w-full max-w-sm rounded-2xl border border-tts-border bg-tts-surface p-8 shadow-sm',
          className,
        )}
      >
        <div className="mb-8 flex flex-col items-center gap-2 text-tts-deep">
          <Logo size={40} />
          <span className="text-sm font-extrabold tracking-[-0.018em] text-tts-deep">
            TalkToStellar
          </span>
        </div>

        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-xl font-bold tracking-tight text-tts-deep">
            {title}
          </h1>
          {description && (
            <div className="text-sm leading-relaxed text-tts-muted">
              {description}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-4">{children}</div>

        {footer && (
          <div className="mt-6 flex flex-col items-center gap-2 border-t border-tts-border pt-5 text-center">
            {footer}
          </div>
        )}
      </section>
    </main>
  )
}
