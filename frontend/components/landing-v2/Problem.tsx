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
    figure: '3',
    figureSuffix: ' telas',
    title: 'Dinheiro espalhado',
    description:
      'Entrada, conversão, rendimento e retirada normalmente ficam em lugares diferentes, com pouco contexto para decidir.',
  },
  {
    figure: '1',
    figureSuffix: ' chave',
    title: 'PIX precisa ser dinâmico',
    description:
      'Na hora de sair, a pessoa deve informar a chave PIX correta naquele momento, revisar o valor e confirmar com segurança.',
  },
  {
    figure: '4',
    figureSuffix: ' moedas',
    title: 'Multi-moeda sem confusão',
    description:
      'Reais, dólares, euros e outras moedas precisam aparecer em linguagem simples, sem expor infraestrutura para o usuário.',
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
          <TerminalEyebrow command='chat "o que consigo fazer com meu saldo?"' />
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.022em] text-tts-deep md:text-4xl">
            O que trava o ciclo do dinheiro hoje.
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
