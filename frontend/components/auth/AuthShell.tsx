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

export function AuthShell({
  title,
  description,
  children,
  footer,
  className,
}: AuthShellProps) {
  return (
    <main className="tts-auth-page flex items-center justify-center overflow-hidden px-4 py-10">
      <section
        className={cn(
          'tts-auth-card relative w-full max-w-sm border border-tts-border bg-tts-surface/95 p-6 shadow-sm sm:p-8',
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
