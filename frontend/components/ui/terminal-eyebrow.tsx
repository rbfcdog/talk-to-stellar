import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TerminalEyebrowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  command: string
  showCursor?: boolean
  dark?: boolean
}

export function TerminalEyebrow({
  command,
  showCursor = false,
  dark = false,
  className,
  ...rest
}: TerminalEyebrowProps) {
  const palette = dark
    ? 'text-white/60 border-white/10 bg-white/5'
    : 'text-tts-muted border-tts-border bg-tts-surface'

  const promptColor = dark ? 'text-tts-gold-lt' : 'text-tts-gold'

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] leading-none tracking-tight',
        palette,
        className,
      )}
      {...rest}
    >
      <span className={cn('font-bold', promptColor)} aria-hidden>
        $
      </span>
      <span className="whitespace-nowrap">{command}</span>
      {showCursor && (
        <span
          className={cn(
            'inline-block h-[10px] w-[6px] align-middle animate-pulse',
            dark ? 'bg-tts-gold-lt' : 'bg-tts-gold',
          )}
          aria-hidden
        />
      )}
    </div>
  )
}
