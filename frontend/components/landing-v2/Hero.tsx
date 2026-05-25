'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'

const HERO_COMMAND = 'tts convert --from BRL --to USDC --channel whatsapp'
const TYPE_INTERVAL_MS = 28

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, var(--tts-gold) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.08,
}

export function Hero() {
  const reduceMotion = useReducedMotion()
  const [typed, setTyped] = useState(reduceMotion ? HERO_COMMAND : '')

  useEffect(() => {
    if (reduceMotion) {
      setTyped(HERO_COMMAND)
      return
    }

    let cancelled = false
    let i = 0

    const tick = () => {
      if (cancelled) return
      i += 1
      setTyped(HERO_COMMAND.slice(0, i))
      if (i < HERO_COMMAND.length) {
        window.setTimeout(tick, TYPE_INTERVAL_MS)
      }
    }

    setTyped('')
    const start = window.setTimeout(tick, 250)

    return () => {
      cancelled = true
      window.clearTimeout(start)
    }
  }, [reduceMotion])

  return (
    <section
      id="produto"
      className="relative overflow-hidden bg-tts-bg pt-20 pb-16 md:pt-28 md:pb-24"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={DOT_GRID_STYLE}
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 text-center md:gap-8 md:px-8">
        <TerminalEyebrow command={typed || ' '} showCursor />

        <h1 className="text-[40px] font-extrabold leading-[1.04] tracking-[-0.025em] text-tts-deep md:text-[64px]">
          Pix <span className="text-tts-gold">/</span> USDC.
          <br />
          Via API ou mensagem.
        </h1>

        <p className="max-w-xl text-sm leading-[1.65] text-tts-muted md:text-base">
          Infraestrutura de pagamentos que conecta Pix ao Stellar Network.
          Liquidação em segundos, custódia das chaves no cliente, integração por
          API ou pelos canais de mensagem que sua operação já usa.
        </p>

        <div className="mt-2 flex flex-wrap justify-center gap-3">
          <Button
            asChild
            className="h-11 bg-tts-deep px-5 text-sm text-tts-surface hover:bg-tts-deep/90"
          >
            <a href="#comecar">Falar com o time</a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-11 border-tts-border bg-tts-surface px-5 text-sm text-tts-deep hover:bg-tts-bg"
          >
            <a href="#api">
              Ver documentação
              <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  )
}
