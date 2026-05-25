import * as React from 'react'
import { cn } from '@/lib/utils'

export type PaymentStatus = 'pending' | 'confirmed' | 'error' | 'idle'

interface PaymentStepCardProps {
  status?: PaymentStatus
  eyebrow?: React.ReactNode
  title?: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  badge?: React.ReactNode
  className?: string
}

const STATUS_ACCENT: Record<PaymentStatus, string> = {
  idle: 'border-l-tts-border',
  pending: 'border-l-tts-gold',
  confirmed: 'border-l-tts-confirm',
  error: 'border-l-tts-error',
}

export function PaymentStepCard({
  status = 'idle',
  eyebrow,
  title,
  description,
  children,
  footer,
  badge,
  className,
}: PaymentStepCardProps) {
  return (
    <article
      className={cn(
        'mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-tts-border bg-tts-surface shadow-sm',
        'border-l-4',
        STATUS_ACCENT[status],
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        {(eyebrow || badge) && (
          <div className="flex items-center justify-between gap-3">
            {eyebrow ? (
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-tts-muted">
                {eyebrow}
              </div>
            ) : <span aria-hidden />}
            {badge}
          </div>
        )}

        {title && (
          <h2 className="text-lg font-bold tracking-tight text-tts-deep">
            {title}
          </h2>
        )}

        {description && (
          <div className="text-sm leading-relaxed text-tts-muted">
            {description}
          </div>
        )}

        {children && <div className="flex flex-col gap-4">{children}</div>}
      </div>

      {footer && (
        <div className="border-t border-tts-border bg-tts-bg/60 px-6 py-4">
          {footer}
        </div>
      )}
    </article>
  )
}
