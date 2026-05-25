'use client'

import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'
import { useStaggeredTypewriter } from '@/hooks/use-typewriter'
import { cn } from '@/lib/utils'

interface JsonLine {
  key?: string
  value: string
  type: 'string' | 'number' | 'boolean' | 'object-open' | 'object-close'
  indent?: number
}

const RESPONSE: JsonLine[] = [
  { value: '{', type: 'object-open' },
  { key: 'intent', value: 'money_cycle', type: 'string', indent: 1 },
  { key: 'amount', value: '500.00', type: 'number', indent: 1 },
  { key: 'asset', value: 'real', type: 'string', indent: 1 },
  { key: 'frontend_url', value: '/money-cycle?amount=500', type: 'string', indent: 1 },
  { key: 'pix_key_required', value: 'true', type: 'boolean', indent: 1 },
  { key: 'review_before_pin', value: 'true', type: 'boolean', indent: 1 },
  { value: '}', type: 'object-close' },
]

export function ApiShowcase() {
  const fullLines = useMemo(
    () =>
      RESPONSE.map((line) => {
        if (line.type === 'object-open' || line.type === 'object-close') {
          return line.value
        }
        const indent = '  '.repeat(line.indent ?? 0)
        const display =
          line.type === 'string' ? `"${line.value}"` : String(line.value)
        return `${indent}"${line.key}": ${display},`
      }),
    [],
  )

  const { ref, progress } = useStaggeredTypewriter(fullLines, {
    speedMs: 12,
    lineDelayMs: 80,
    startDelayMs: 250,
  })

  const totalChars = fullLines.reduce((sum, line) => sum + line.length, 0)
  const typedChars = progress.reduce((sum, p) => sum + p, 0)
  const done = typedChars >= totalChars

  return (
    <section id="api" className="bg-tts-bg py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 md:px-8 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex flex-col gap-6"
        >
          <TerminalEyebrow command="tts --help" />
          <h2 className="text-[32px] font-extrabold tracking-[-0.022em] text-tts-deep md:text-[40px]">
            Intenção vira interface.
          </h2>
          <p className="max-w-md text-sm leading-[1.65] text-tts-muted">
            O agente identifica o objetivo, chama a ferramenta correta e devolve
            a tela certa: conversão, rendimento, PIX de entrada ou PIX de saída.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="h-11 bg-tts-deep px-5 text-sm text-tts-surface hover:bg-tts-deep/90"
            >
              <a href="/chat">Testar no chat</a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 border-tts-border bg-tts-surface px-5 text-sm text-tts-deep hover:bg-tts-bg"
            >
              <a href="/money-cycle">
                Abrir ciclo
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </div>
        </motion.div>

        <ResponseCard
          containerRef={ref as React.RefObject<HTMLDivElement>}
          progress={progress}
          done={done}
        />
      </div>
    </section>
  )
}

interface ResponseCardProps {
  containerRef: React.RefObject<HTMLDivElement>
  progress: number[]
  done: boolean
}

function ResponseCard({ containerRef, progress, done }: ResponseCardProps) {
  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-tts-deep/30 bg-tts-deep shadow-xl"
    >
      <div className="flex items-center gap-3 bg-tts-deep2 px-4 py-3 font-mono text-[11px]">
        <span className="font-bold text-tts-gold-lt">POST</span>
        <span className="text-white/50">/v1/conversions</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.span
                key="ok"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="inline-flex items-center gap-1.5 text-tts-confirm"
              >
                <PulseDot /> 200 OK · 847ms
              </motion.span>
            ) : (
              <motion.span
                key="pending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="inline-flex items-center gap-1.5 text-white/40"
              >
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white/40" />
                processing…
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </div>

      <pre className="overflow-x-auto px-5 py-5 font-mono text-[11px] leading-relaxed">
        <code>
          {RESPONSE.map((line, i) => (
            <JsonRow key={i} line={line} shown={progress[i] ?? 0} done={done} />
          ))}
        </code>
      </pre>
    </div>
  )
}

function PulseDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tts-confirm opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-tts-confirm" />
    </span>
  )
}

const VALUE_COLOR = {
  string: 'text-tts-gold-lt',
  number: 'text-white',
  boolean: 'text-tts-confirm',
} as const

function JsonRow({
  line,
  shown,
  done,
}: {
  line: JsonLine
  shown: number
  done: boolean
}) {
  if (line.type === 'object-open' || line.type === 'object-close') {
    return (
      <div className="min-h-[1.55em] text-white/60">{line.value.slice(0, shown)}</div>
    )
  }

  const indent = '  '.repeat(line.indent ?? 0)
  const displayValue =
    line.type === 'string' ? `"${line.value}"` : String(line.value)
  const fullKeyPart = `${indent}"${line.key}": `
  const fullLine = `${fullKeyPart}${displayValue},`
  const isTypingThisLine = shown > 0 && shown < fullLine.length

  const visible = fullLine.slice(0, shown)
  const keyEnd = fullKeyPart.length
  const keyVisible = visible.slice(0, Math.min(shown, keyEnd))
  const valueVisible = shown > keyEnd ? visible.slice(keyEnd).replace(/,$/, '') : ''
  const trailingComma = shown >= fullLine.length

  const keyMatch = keyVisible.match(/^(\s*)"([^"]*)"?(:?\s*)$/)
  const indentText = keyMatch?.[1] ?? indent.slice(0, keyVisible.length)
  const keyName = keyMatch?.[2] ?? ''
  const afterKey = keyMatch?.[3] ?? ''

  return (
    <div className="min-h-[1.55em]">
      <span className="text-white/40">{indentText}</span>
      {keyName && (
        <>
          <span className="text-white/70">{`"${keyName}"`}</span>
          <span className="text-white/40">{afterKey}</span>
        </>
      )}
      {valueVisible && (
        <span
          className={cn(
            'font-bold',
            VALUE_COLOR[line.type as keyof typeof VALUE_COLOR],
          )}
        >
          {valueVisible}
        </span>
      )}
      {trailingComma && <span className="text-white/40">,</span>}
      {isTypingThisLine && !done && (
        <span className="ml-0.5 inline-block h-3 w-[1.5px] animate-caret bg-tts-gold-lt align-middle" />
      )}
    </div>
  )
}
