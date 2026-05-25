'use client'

import { motion } from 'framer-motion'

import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'
import { useTypewriter } from '@/hooks/use-typewriter'

interface Segment {
  id: string
  title: string
  flow: string
}

const SEGMENTS: Segment[] = [
  {
    id: 'psp:settlement',
    title: 'PSPs liquidando em USDC',
    flow: 'pix.in → usdc.settle()',
  },
  {
    id: 'marketplace:payout',
    title: 'Marketplaces pagando vendedores',
    flow: "payout({ asset: 'USDC' })",
  },
  {
    id: 'treasury:multi-fx',
    title: 'Tesourarias multi-moeda',
    flow: 'balance.move(BRL → USDC)',
  },
  {
    id: 'exporter:invoice',
    title: 'Exportadores recebendo do exterior',
    flow: 'invoice.settle(USDC)',
  },
]

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, var(--tts-gold) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.08,
}

export function ForWho() {
  return (
    <section
      id="para-quem"
      className="relative overflow-hidden bg-tts-bg pb-20"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={DOT_GRID_STYLE}
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 md:px-8">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex flex-col gap-4"
        >
          <TerminalEyebrow command="tts segments --list --status live" />
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.022em] text-tts-deep md:text-4xl">
            Operações que rodam melhor com Pix → USDC.
          </h2>
        </motion.header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SEGMENTS.map((segment, index) => (
            <SegmentCard key={segment.id} segment={segment} index={index} />
          ))}
        </ul>
      </div>
    </section>
  )
}

function SegmentCard({ segment, index }: { segment: Segment; index: number }) {
  const { ref, typed, done } = useTypewriter({
    text: segment.flow,
    speedMs: 18,
    startDelayMs: 350 + index * 100,
  })

  return (
    <motion.li
      ref={ref as React.RefObject<HTMLLIElement>}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, delay: index * 0.12, ease: 'easeOut' }}
      className="group flex flex-col overflow-hidden rounded-xl border border-tts-deep bg-tts-surface transition-colors hover:border-tts-gold/40"
    >
      <span className="bg-tts-deep px-4 py-2.5 font-mono-financial text-[11px] font-bold tracking-tight text-tts-gold-lt">
        {segment.id}
      </span>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <h3 className="text-base font-bold tracking-[-0.018em] text-tts-deep">
          {segment.title}
        </h3>
        <div className="mt-auto flex items-center gap-2 rounded-md border border-tts-border bg-tts-bg/60 px-3 py-2 font-mono-financial text-[11px] text-tts-gold">
        <span className="text-tts-muted" aria-hidden>
          →
        </span>
        <span className="min-w-0 flex-1 truncate">
          {typed || ' '}
          {!done && (
            <span className="ml-0.5 inline-block h-3 w-[1.5px] animate-caret bg-tts-gold align-middle" />
          )}
        </span>
        </div>
      </div>
    </motion.li>
  )
}
