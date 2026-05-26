import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'
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
  return (
    <section id="api" className="bg-tts-bg py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 md:px-8 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <TerminalEyebrow command='tool_call "abrir ciclo do dinheiro"' />
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
        </div>

        <ResponseCard />
      </div>
    </section>
  )
}

function ResponseCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-tts-deep/30 bg-tts-deep shadow-xl">
      <div className="flex items-center gap-3 bg-tts-deep2 px-4 py-3 font-mono text-[11px]">
        <span className="font-bold text-tts-gold-lt">POST</span>
        <span className="text-white/50">/api/agent/query</span>
        <span className="ml-auto text-tts-confirm">200 OK · 847ms</span>
      </div>

      <pre className="overflow-x-auto px-5 py-5 font-mono text-[11px] leading-relaxed">
        <code>
          {RESPONSE.map((line, i) => (
            <JsonRow key={i} line={line} />
          ))}
        </code>
      </pre>
    </div>
  )
}

const VALUE_COLOR = {
  string: 'text-tts-gold-lt',
  number: 'text-white',
  boolean: 'text-tts-confirm',
} as const

function JsonRow({ line }: { line: JsonLine }) {
  if (line.type === 'object-open' || line.type === 'object-close') {
    return <div className="text-white/60">{line.value}</div>
  }

  const indent = '  '.repeat(line.indent ?? 0)
  const displayValue =
    line.type === 'string' ? `"${line.value}"` : line.value

  return (
    <div>
      <span className="text-white/40">{indent}</span>
      <span className="text-white/70">{`"${line.key}"`}</span>
      <span className="text-white/40">: </span>
      <span
        className={cn(
          'font-bold',
          VALUE_COLOR[line.type as keyof typeof VALUE_COLOR],
        )}
      >
        {displayValue}
      </span>
      <span className="text-white/40">,</span>
    </div>
  )
}
