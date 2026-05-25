'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.04,
}

export function FinalCta() {
  return (
    <section
      id="comecar"
      className="relative overflow-hidden bg-tts-deep py-20 text-white"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={DOT_GRID_STYLE}
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-8 px-4 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex flex-col items-start gap-8"
        >
          <TerminalEyebrow
            command="tts onboarding --start --channel sandbox"
            dark
            showCursor
          />

          <h2 className="max-w-3xl text-[34px] font-extrabold leading-[1.05] tracking-[-0.025em] md:text-[48px]">
            Comece pelo canal{' '}
            <span className="text-tts-gold-lt">que sua operação já usa.</span>
          </h2>

          <p className="max-w-xl text-sm leading-[1.65] text-white/55 md:text-base">
            Sandbox em minutos, API key na mesma chamada e suporte direto via
            WhatsApp ou Telegram para a equipe de integração. Mainnet quando
            estiver pronto — sem troca de payload.
          </p>
        </motion.div>

        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            className="h-12 bg-tts-gold px-6 text-sm text-tts-deep hover:bg-tts-gold-lt"
          >
            <a href="/chat">
              Abrir chat
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-12 border-white/20 bg-white/5 px-6 text-sm text-white hover:bg-white/10"
          >
            <a href="/money-cycle">
              Ver ciclo completo
              <ArrowRight className="ml-1 h-4 w-4" />
            </a>
          </Button>
        </div>

        <dl className="mt-4 grid w-full grid-cols-1 gap-px overflow-hidden border-t border-white/10 sm:grid-cols-3">
          {[
            { value: '<7d', label: 'Time to first conversion' },
            { value: '24/7', label: 'Suporte técnico' },
            { value: 'BCB+', label: 'Compliance Pix · KYC · KYB' },
          ].map(({ value, label }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.5 }}
              transition={{ duration: 0.4, delay: i * 0.1, ease: 'easeOut' }}
              className="flex flex-col gap-1 border-b border-white/10 py-5 sm:border-b-0 sm:px-6"
            >
              <dt className="font-mono-financial text-[22px] font-bold text-tts-gold-lt">
                {value}
              </dt>
              <dd className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/45">
                {label}
              </dd>
            </motion.div>
          ))}
        </dl>
      </div>
    </section>
  )
}
