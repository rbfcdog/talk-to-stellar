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
        'inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] leading-none tracking-tight',
        palette,
        className,
      )}
      {...rest}
    >
      <span className={cn('font-bold', promptColor)} aria-hidden>
        $
      </span>
      <span className="truncate">{command}</span>
      {showCursor && (
        <span
          className={cn(
            'inline-block h-[12px] w-[1.5px] align-middle animate-caret',
            dark ? 'bg-tts-gold-lt' : 'bg-tts-deep',
          )}
          aria-hidden
        />
      )}
    </div>
  )
}
