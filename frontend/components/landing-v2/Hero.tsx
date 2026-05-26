'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'
import { Logo } from '@/components/shared/logo'

const HERO_COMMAND = 'tts convert --from BRL --to USDC --channel whatsapp'
const TYPE_INTERVAL_MS = 8

// Three value-focused phrases. Each one frames an outcome the customer
// gets, not what the platform does internally.
const PHRASES = [
  'Real -> dólar em millisegundos.',
  'Receba do mundo, direto no Pix.',
  'Cross-border sem wire bancário.',
]

const PHRASE_TYPE_MS = 12 // per char while typing
const PHRASE_ERASE_MS = 12 // per char while erasing (same speed)
const PHRASE_HOLD_MS = 10000 // hold a fully-typed phrase
const PHRASE_GAP_MS = 50 // pause after erase before next phrase

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, var(--tts-gold) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.08,
}

export function Hero() {
  const reduceMotion = useReducedMotion()
  const [commandTyped, setCommandTyped] = useState(HERO_COMMAND)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [phraseTyped, setPhraseTyped] = useState(PHRASES[0])

  // Terminal eyebrow typewriter
  useEffect(() => {
    if (reduceMotion) {
      setCommandTyped(HERO_COMMAND)
      return
    }
    let cancelled = false
    let i = 0
    const tick = () => {
      if (cancelled) return
      i += 1
      setCommandTyped(HERO_COMMAND.slice(0, i))
      if (i < HERO_COMMAND.length) {
        window.setTimeout(tick, TYPE_INTERVAL_MS)
      }
    }
    setCommandTyped('')
    const start = window.setTimeout(tick, 250)
    return () => {
      cancelled = true
      window.clearTimeout(start)
    }
  }, [reduceMotion])

  // Rotating phrase typewriter — types, holds, erases, advances
  useEffect(() => {
    if (reduceMotion) {
      setPhraseTyped(PHRASES[phraseIndex])
      return
    }

    let cancelled = false
    const timers: number[] = []

    const target = PHRASES[phraseIndex]

    // Phase 1: type out
    const type = (i: number) => {
      if (cancelled) return
      setPhraseTyped(target.slice(0, i))
      if (i < target.length) {
        timers.push(window.setTimeout(() => type(i + 1), PHRASE_TYPE_MS))
      } else {
        // Phase 2: hold
        timers.push(window.setTimeout(() => erase(target.length), PHRASE_HOLD_MS))
      }
    }

    // Phase 3: erase
    const erase = (i: number) => {
      if (cancelled) return
      setPhraseTyped(target.slice(0, i))
      if (i > 0) {
        timers.push(window.setTimeout(() => erase(i - 1), PHRASE_ERASE_MS))
      } else {
        // Phase 4: advance
        timers.push(
          window.setTimeout(
            () => setPhraseIndex((prev) => (prev + 1) % PHRASES.length),
            PHRASE_GAP_MS,
          ),
        )
      }
    }

    type(1)

    return () => {
      cancelled = true
      timers.forEach(window.clearTimeout)
    }
  }, [phraseIndex, reduceMotion])

  return (
    <section
      id="produto"
      className="relative flex min-h-svh flex-col justify-center overflow-hidden bg-tts-bg px-4 py-24 md:px-8"
    >
      {/* dot grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={DOT_GRID_STYLE}
        aria-hidden
      />

      {/* ambient gold orb */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, var(--tts-gold-bg) 0%, transparent 65%)',
          animation: 'hero-orb 8s ease-in-out infinite',
          opacity: 0.55,
        }}
        aria-hidden
      />

      {/* giant faint Stellar mark */}
      <div
        className="pointer-events-none absolute -bottom-32 -right-32 text-tts-deep md:-bottom-40 md:-right-20"
        style={{ opacity: 0.05 }}
        aria-hidden
      >
        <Logo size={520} />
      </div>

      {/* mono coordinate ticks — top-left */}
      <div
        className="pointer-events-none absolute left-6 top-28 hidden font-mono-financial text-[10px] uppercase tracking-[0.18em] text-tts-muted md:block"
        aria-hidden
      >
        <span className="block opacity-50">stellar:mainnet</span>
        <span className="block opacity-30">pix.in → usdc.settle</span>
      </div>

      {/* mono coordinate ticks — bottom-right */}
      <div
        className="pointer-events-none absolute bottom-8 right-8 hidden text-right font-mono-financial text-[10px] uppercase tracking-[0.18em] text-tts-muted md:block"
        aria-hidden
      >
        <span className="block opacity-50">v1 · live</span>
        <span className="block opacity-30">lat 847ms</span>
      </div>

      <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-10 text-center">
        <TerminalEyebrow command={commandTyped || ' '} showCursor />

        <h1
          className="w-full max-w-[10em] text-center text-[44px] font-extrabold leading-[1.08] tracking-[-0.028em] text-tts-deep md:text-[72px] lg:text-[80px]"
          style={{ overflowWrap: 'normal', minHeight: '2.16em' }}
          aria-label={PHRASES[phraseIndex]}
        >
          {phraseTyped}
        </h1>
      </div>
    </section>
  )
}
