'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Plus } from 'lucide-react'

import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'
import { cn } from '@/lib/utils'

interface FaqItem {
  question: string
  answer: string
}

const FAQS: FaqItem[] = [
  {
    question: 'O que posso pedir no chat?',
    answer:
      'Você pode pedir saldo, colocar dinheiro com PIX, converter entre moedas, revisar APY por saldo, retirar para uma chave PIX e ver comprovantes.',
  },
  {
    question: 'A chave PIX de saída é fixa?',
    answer:
      'Não. Na retirada, a pessoa pode digitar a chave PIX no momento da saída. A tela mostra quanto sai da conta e quanto chega em reais antes do PIN.',
  },
  {
    question: 'Quais moedas aparecem para o usuário?',
    answer:
      'A experiência mostra reais, dólares, euros e as moedas extras configuradas no ambiente. Reais são tratados como reais na UX.',
  },
  {
    question: 'Como funciona a revisão com APY?',
    answer:
      'O usuário vê opções disponíveis por moeda, gráfico estimado e uma revisão antes de guardar ou resgatar. Retornos variam e não são prometidos como garantidos.',
  },
  {
    question: 'Dá para fazer tudo em um fluxo?',
    answer:
      'Sim. Peça algo como “injetar 500 reais, revisar APY e sair para meu PIX”. O agente abre a interface consolidada do ciclo do dinheiro.',
  },
  {
    question: 'Preciso baixar app novo?',
    answer:
      'Não. A pessoa pode começar pelo chat web, WhatsApp ou Telegram, e confirmar operações em telas seguras quando necessário.',
  },
]

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    'radial-gradient(circle, var(--tts-gold) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.06,
}

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section
      id="faq"
      className="relative overflow-hidden bg-tts-bg py-20"
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
          <TerminalEyebrow command="tts faq --segment b2b" />
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.022em] text-tts-deep md:text-4xl">
            Perguntas comuns antes de usar.
          </h2>
        </motion.header>

        <ul className="flex flex-col gap-2">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index
            return (
              <motion.li
                key={faq.question}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
                className="overflow-hidden rounded-xl border border-tts-border bg-tts-surface"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-tts-bg/40"
                >
                  <span className="text-sm font-bold tracking-[-0.018em] text-tts-deep md:text-base">
                    {faq.question}
                  </span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.25, ease: 'easeOut' }}
                    className={cn(
                      'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                      isOpen
                        ? 'border-tts-gold bg-tts-gold text-tts-surface'
                        : 'border-tts-border text-tts-muted',
                    )}
                    aria-hidden
                  >
                    {isOpen ? (
                      <Minus className="h-3.5 w-3.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-tts-border px-5 py-4 text-sm leading-[1.65] text-tts-muted">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
