import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'

const METRICS = [
  { value: '3', label: 'moedas principais' },
  { value: '24/7', label: 'PIX entrada e saída' },
  { value: '1', label: 'chat para todo o ciclo' },
]

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, var(--tts-gold) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.08,
}

export function Hero() {
  return (
    <section
      id="produto"
      className="relative overflow-hidden bg-tts-bg pt-16 pb-8 md:pt-20 md:pb-10"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={DOT_GRID_STYLE}
        aria-hidden
      />

      <HeroAccent />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-8 md:gap-10">
        <div className="flex flex-col items-start gap-6">
          <TerminalEyebrow
            command='chat "entrar, render e sair para meu PIX"'
            showCursor
          />

          <h1 className="max-w-3xl text-[36px] font-extrabold leading-[1.04] tracking-[-0.025em] text-tts-deep md:text-[56px]">
            TalkToStellar.
            <br />
            <span className="text-tts-gold">PIX, rendimento e saída.</span>
          </h1>

          <p className="max-w-lg text-sm leading-[1.65] text-tts-muted">
            Uma conta por conversa para colocar dinheiro com PIX, converter
            entre reais, dólares e euros, deixar rendendo e retirar para uma
            chave PIX informada na hora.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              className="h-11 bg-tts-deep px-5 text-sm text-tts-surface hover:bg-tts-deep/90"
            >
              <a href="/chat">Abrir chat</a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 border-tts-border bg-tts-surface px-5 text-sm text-tts-deep hover:bg-tts-bg"
            >
              <a href="/yield">
                Ver rendimento
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        <HeroMetrics />
      </div>
    </section>
  )
}

function HeroMetrics() {
  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden border-t border-tts-border sm:grid-cols-3">
      {METRICS.map(({ value, label }) => (
        <div
          key={label}
          className="flex flex-col gap-1 border-b border-tts-border px-1 py-5 sm:border-b-0 sm:px-6"
        >
          <dt className="font-mono-financial text-[22px] font-bold text-tts-deep">
            <ColoredMetric value={value} />
          </dt>
          <dd className="text-[11px] font-medium uppercase tracking-[0.12em] text-tts-muted">
            {label}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function ColoredMetric({ value }: { value: string }) {
  const parts = value.split(/(\d+(?:\.\d+)?)/g)
  return (
    <>
      {parts.map((part, i) =>
        /\d/.test(part) ? (
          <span key={i} className="text-tts-gold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

function HeroAccent() {
  return (
    <div
      className="pointer-events-none absolute -right-24 -top-24 hidden h-[360px] w-[360px] md:block"
      aria-hidden
    >
      <div
        className="absolute inset-0 origin-center rotate-[28deg] rounded-2xl bg-tts-gold"
        style={{ opacity: 0.05 }}
      />
      <div
        className="absolute inset-12 origin-center rotate-[28deg] rounded-2xl bg-tts-deep"
        style={{ opacity: 0.04 }}
      />
    </div>
  )
}
