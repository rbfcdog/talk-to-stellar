import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, var(--tts-gold) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.08,
}

interface ProblemCard {
  figure: string
  figureSuffix?: string
  title: string
  description: string
}

const PROBLEMS: ProblemCard[] = [
  {
    figure: '4–6',
    figureSuffix: '%',
    title: 'Custo efetivo alto',
    description:
      'Spreads, IOF e taxas de wire corroem qualquer operação cross-border que dependa do trilho bancário tradicional.',
  },
  {
    figure: '3',
    figureSuffix: ' etapas',
    title: 'Barreira da Web3',
    description:
      'Criar carteira, salvar seed phrase, escolher rede. Cada etapa derruba a conversão do cliente final.',
  },
  {
    figure: '4',
    figureSuffix: '×',
    title: 'Ferramentas fragmentadas',
    description:
      'PSP, on-ramp, custódia e mensageria em fornecedores diferentes — cada um com SLA, contrato e console próprios.',
  },
]

export function Problem() {
  return (
    <section className="relative overflow-hidden bg-tts-bg pt-8 pb-20 md:pt-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={DOT_GRID_STYLE}
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-4 md:px-8">
        <header className="flex flex-col gap-4">
          <TerminalEyebrow command="tts diagnose --market BRL --segment cross-border" />
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.022em] text-tts-deep md:text-4xl">
            O que trava operações BRL → USDC hoje.
          </h2>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PROBLEMS.map((card) => (
            <ProblemCardView key={card.title} card={card} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ProblemCardView({ card }: { card: ProblemCard }) {
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-tts-border bg-tts-surface p-6">
      <div className="font-mono-financial">
        <span className="text-[40px] font-bold leading-none text-tts-gold">
          {card.figure}
        </span>
        {card.figureSuffix && (
          <span className="text-[22px] font-bold leading-none text-tts-gold/70">
            {card.figureSuffix}
          </span>
        )}
      </div>
      <h3 className="text-base font-bold tracking-[-0.018em] text-tts-deep">
        {card.title}
      </h3>
      <p className="text-sm leading-[1.55] text-tts-muted">
        {card.description}
      </p>
    </article>
  )
}
