import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] leading-none',
  {
    variants: {
      variant: {
        default: 'bg-tts-gold-bg text-tts-gold border border-tts-gold-br',
        success:
          'bg-tts-confirm/10 text-tts-confirm border border-tts-confirm/30',
        neutral: 'bg-tts-deep/8 text-tts-deep border border-tts-border',
        muted: 'bg-tts-border/40 text-tts-muted border border-tts-border',
        onDark: 'bg-white/8 text-white/70 border border-white/10',
        onDarkSuccess:
          'bg-tts-confirm/15 text-tts-confirm border border-tts-confirm/30',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  )
}

export { badgeVariants }
