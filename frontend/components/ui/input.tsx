import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-foreground placeholder:text-tts-muted selection:bg-tts-gold selection:text-tts-surface border-tts-border flex h-10 w-full min-w-0 rounded-md border bg-tts-surface px-3 py-2 text-sm text-tts-deep shadow-sm transition-[border-color,color,box-shadow,background-color] duration-200 outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:border-tts-gold focus-visible:ring-tts-gold/20 focus-visible:ring-2',
        'aria-invalid:ring-tts-error/20 aria-invalid:border-tts-error',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
