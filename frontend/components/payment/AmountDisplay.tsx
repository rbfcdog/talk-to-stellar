import * as React from 'react'
import { cn } from '@/lib/utils'

interface AmountDisplayProps {
  brlAmount?: string
  usdcAmount?: string
  usdcUnit?: string
  rateLine?: React.ReactNode
  variant?: 'default' | 'compact'
  className?: string
}

export function AmountDisplay({
  brlAmount,
  usdcAmount,
  usdcUnit = 'USDC',
  rateLine,
  variant = 'default',
  className,
}: AmountDisplayProps) {
  const size = variant === 'compact' ? 'text-xl' : 'text-3xl'

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {brlAmount && (
          <span className={cn(size, 'font-bold text-tts-deep')}>
            R$ {brlAmount}
          </span>
        )}

        {brlAmount && usdcAmount && (
          <span className="text-tts-muted" aria-hidden>
            →
          </span>
        )}

        {usdcAmount && (
          <span
            className={cn(
              size,
              'font-mono-financial font-bold text-tts-deep',
            )}
          >
            {usdcAmount}
            <span className="ml-1 text-tts-gold">{usdcUnit}</span>
          </span>
        )}
      </div>

      {rateLine && (
        <p className="font-mono-financial text-[11px] text-tts-muted">
          {rateLine}
        </p>
      )}
    </div>
  )
}
