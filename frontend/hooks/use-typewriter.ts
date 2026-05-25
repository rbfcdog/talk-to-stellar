'use client'

import { useEffect, useRef, useState } from 'react'
import { useInView, useReducedMotion } from 'framer-motion'

interface UseTypewriterOptions {
  text: string
  speedMs?: number
  startDelayMs?: number
  enabled?: boolean
}

export function useTypewriter({
  text,
  speedMs = 24,
  startDelayMs = 0,
  enabled = true,
}: UseTypewriterOptions) {
  const ref = useRef<HTMLElement | null>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const reduceMotion = useReducedMotion()
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (!enabled || !inView) return
    if (reduceMotion) {
      setTyped(text)
      return
    }

    let cancelled = false
    let i = 0
    const tick = () => {
      if (cancelled) return
      i += 1
      setTyped(text.slice(0, i))
      if (i < text.length) {
        window.setTimeout(tick, speedMs)
      }
    }

    setTyped('')
    const start = window.setTimeout(tick, startDelayMs)
    return () => {
      cancelled = true
      window.clearTimeout(start)
    }
  }, [enabled, inView, reduceMotion, speedMs, startDelayMs, text])

  return { ref, typed, done: typed === text }
}

export function useStaggeredTypewriter(
  lines: string[],
  options: { speedMs?: number; lineDelayMs?: number; startDelayMs?: number } = {},
) {
  const { speedMs = 18, lineDelayMs = 220, startDelayMs = 0 } = options
  const ref = useRef<HTMLElement | null>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const reduceMotion = useReducedMotion()
  const [progress, setProgress] = useState<number[]>(() => lines.map(() => 0))

  useEffect(() => {
    if (!inView) return
    if (reduceMotion) {
      setProgress(lines.map((line) => line.length))
      return
    }

    let cancelled = false
    const timers: number[] = []

    setProgress(lines.map(() => 0))

    lines.forEach((line, lineIndex) => {
      const lineStart = startDelayMs + lineIndex * lineDelayMs
      for (let charIndex = 1; charIndex <= line.length; charIndex++) {
        const t = window.setTimeout(() => {
          if (cancelled) return
          setProgress((prev) => {
            const next = [...prev]
            next[lineIndex] = charIndex
            return next
          })
        }, lineStart + charIndex * speedMs)
        timers.push(t)
      }
    })

    return () => {
      cancelled = true
      timers.forEach(window.clearTimeout)
    }
  }, [inView, reduceMotion, lines, speedMs, lineDelayMs, startDelayMs])

  return { ref, progress }
}
