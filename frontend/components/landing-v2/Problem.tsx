'use client'

import { motion } from 'framer-motion'

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
      'Entrada, conversão, revisão com APY e retirada normalmente ficam em lugares diferentes, com pouco contexto para decidir.',
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
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex flex-col gap-4"
        >
          <TerminalEyebrow command="tts diagnose --market BRL --segment cross-border" />
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.022em] text-tts-deep md:text-4xl">
            O que trava o ciclo do dinheiro hoje.
          </h2>
        </motion.header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {PROBLEMS.map((card, i) => (
            <ProblemCardView key={card.title} card={card} index={i} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ProblemCardView({ card, index }: { card: ProblemCard; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.45, delay: index * 0.12, ease: 'easeOut' }}
      className="group flex flex-col overflow-hidden rounded-xl border border-tts-deep bg-tts-surface transition-colors hover:border-tts-gold/40"
    >
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{
          duration: 0.5,
          delay: 0.1 + index * 0.12,
          ease: [0.34, 1.56, 0.64, 1],
        }}
        className="flex items-baseline gap-1 bg-tts-deep px-6 py-5 font-mono-financial"
      >
        <span className="text-[40px] font-bold leading-none text-tts-gold-lt">
          {card.figure}
        </span>
        {card.figureSuffix && (
          <span className="text-[20px] font-bold leading-none text-tts-gold-lt/70">
            {card.figureSuffix}
          </span>
        )}
      </motion.div>
      <div className="flex flex-col gap-3 p-6">
        <h3 className="text-base font-bold tracking-[-0.018em] text-tts-deep">
          {card.title}
        </h3>
        <p className="text-sm leading-[1.55] text-tts-muted">
          {card.description}
        </p>
      </div>
    </motion.article>
  )
}
