import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'

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
        <header className="flex flex-col gap-4">
          <TerminalEyebrow command="tts segments --list --status live" />
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.022em] text-tts-deep md:text-4xl">
            Operações que rodam melhor com Pix → USDC.
          </h2>
        </header>

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SEGMENTS.map((segment) => (
            <li
              key={segment.id}
              className="flex flex-col gap-4 rounded-xl border border-tts-border bg-tts-surface p-5"
            >
              <span className="font-mono-financial text-[11px] font-bold tracking-tight text-tts-muted">
                {segment.id}
              </span>
              <h3 className="text-base font-bold tracking-[-0.018em] text-tts-deep">
                {segment.title}
              </h3>
              <div className="mt-auto flex items-center gap-2 rounded-md border border-tts-border bg-tts-bg/60 px-3 py-2 font-mono-financial text-[11px] text-tts-gold">
                <span className="text-tts-muted" aria-hidden>
                  →
                </span>
                <span className="truncate">{segment.flow}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
