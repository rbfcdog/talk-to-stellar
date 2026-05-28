'use client'

import { motion } from 'framer-motion'

import { cn } from '@/lib/utils'

interface Step {
  number: string
  title: string
  description: string
  emphasis: boolean
}

const STEPS: Step[] = [
  {
    number: '01',
    title: 'PIX entra',
    description:
      'A pessoa informa valor e moeda pelo chat. A tela abre o PIX de entrada já preenchido e mostra o saldo esperado.',
    emphasis: false,
  },
  {
    number: '02',
    title: 'Moeda escolhida',
    description:
      'Reais podem virar dólares, euros ou outra moeda configurada, sempre com taxa e valor final antes da confirmação.',
    emphasis: true,
  },
  {
    number: '03',
    title: 'Revisão da opção',
    description:
      'O saldo pode ir para uma opção configurada, com revisão e ação de entrada ou saída.',
    emphasis: true,
  },
  {
    number: '04',
    title: 'Saída para PIX',
    description:
      'Na retirada, a chave PIX é digitada dinamicamente e a tela confirma quanto chega em reais antes do PIN.',
    emphasis: false,
  },
]

export function HowItWorks() {
  return (
    <section className="bg-tts-bg py-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 md:px-8">
        <motion.header
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex flex-col gap-3"
        >
          <h2 className="max-w-2xl text-[32px] font-extrabold tracking-[-0.022em] text-tts-deep">
            O ciclo completo em quatro passos.
          </h2>
        </motion.header>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-tts-border bg-tts-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <StepCell key={step.number} step={step} index={index} />
          ))}
        </div>

        <aside className="flex items-center gap-3 rounded-xl border border-tts-border2 bg-tts-deep/[0.06] px-5 py-3 text-sm text-tts-deep">
          <span className="font-mono-financial text-xs font-bold uppercase tracking-[0.14em] text-tts-gold">
            Arquitetura
          </span>
          <span className="text-tts-muted">
            <strong className="font-bold text-tts-deep">Passkey opcional:</strong>{' '}
            a pessoa pode confirmar acesso pelo dispositivo, sem memorizar
            credenciais frágeis.
          </span>
        </aside>
      </div>
    </section>
  )
}

function StepCell({ step, index }: { step: Step; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.4, delay: index * 0.18, ease: 'easeOut' }}
      className={cn(
        'flex flex-col gap-4 p-6',
        step.emphasis ? 'bg-tts-gold/[0.05]' : 'bg-tts-surface',
      )}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{
          duration: 0.45,
          delay: 0.15 + index * 0.18,
          ease: [0.34, 1.56, 0.64, 1],
        }}
        className="relative w-fit"
      >
        {step.emphasis && (
          <span
            className="absolute inset-0 -z-0 animate-ping rounded-full bg-tts-gold/30"
            style={{ animationDuration: '2.4s' }}
            aria-hidden
          />
        )}
        <div
          className={cn(
            'relative inline-flex h-8 items-center rounded-full px-3 font-mono-financial text-[11px] font-bold leading-none',
            step.emphasis
              ? 'bg-tts-gold text-tts-surface'
              : 'bg-tts-deep text-tts-surface',
          )}
        >
          {step.number}
        </div>
      </motion.div>
      <h3
        className={cn(
          'text-base font-bold tracking-[-0.018em]',
          step.emphasis ? 'text-tts-gold' : 'text-tts-deep',
        )}
      >
        {step.title}
      </h3>
      <p className="text-[13px] leading-[1.55] text-tts-muted">
        {step.description}
      </p>
    </motion.div>
  )
}
