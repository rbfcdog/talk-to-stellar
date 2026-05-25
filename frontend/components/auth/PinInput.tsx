'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface PinInputProps {
  length: number
  value: string
  onChange: (next: string) => void
  onComplete?: (value: string) => void
  autoFocus?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
  mask?: boolean
}

export function PinInput({
  length,
  value,
  onChange,
  onComplete,
  autoFocus = false,
  disabled = false,
  ariaLabel = 'PIN',
  className,
  mask = true,
}: PinInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([])
  const digits = React.useMemo(() => normalize(value, length), [value, length])

  React.useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  const update = (next: string) => {
    onChange(next)
    if (next.length === length) onComplete?.(next)
  }

  const handleChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, '').slice(0, length)
    if (!cleaned) {
      const dropped = digits.slice(0, index).join('')
      update(dropped)
      return
    }

    if (cleaned.length > 1) {
      const merged = (digits.slice(0, index).join('') + cleaned).slice(0, length)
      update(merged)
      const nextIndex = Math.min(merged.length, length - 1)
      refs.current[nextIndex]?.focus()
      return
    }

    const nextDigits = [...digits]
    nextDigits[index] = cleaned
    const merged = nextDigits.join('').slice(0, length)
    update(merged)
    if (index < length - 1) refs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      e.preventDefault()
      const trimmed = digits.slice(0, index - 1).join('')
      update(trimmed)
      refs.current[index - 1]?.focus()
      return
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      refs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault()
      refs.current[index + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    e.preventDefault()
    update(pasted)
    const nextIndex = Math.min(pasted.length, length - 1)
    refs.current[nextIndex]?.focus()
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex w-full justify-center gap-2', className)}
    >
      {Array.from({ length }).map((_, i) => {
        const filled = Boolean(digits[i])
        return (
          <input
            key={i}
            ref={(node) => {
              refs.current[i] = node
            }}
            inputMode="numeric"
            type={mask ? 'password' : 'text'}
            maxLength={1}
            value={digits[i] ?? ''}
            disabled={disabled}
            aria-label={`${ariaLabel} ${i + 1}`}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={cn(
              'h-12 w-12 rounded-lg border text-center text-lg font-bold tracking-widest transition-colors',
              'border-tts-border bg-tts-bg text-tts-deep',
              'focus:border-tts-gold focus:outline-none focus:ring-2 focus:ring-tts-gold/20',
              filled && 'border-tts-deep bg-tts-deep text-tts-surface',
              disabled && 'opacity-50',
            )}
          />
        )
      })}
    </div>
  )
}

function normalize(value: string, length: number): string[] {
  const cleaned = String(value || '').replace(/\D/g, '').slice(0, length).split('')
  return cleaned.concat(Array(Math.max(0, length - cleaned.length)).fill(''))
}
