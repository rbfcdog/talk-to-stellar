'use client'

import { useState } from 'react'
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
      'Você pode pedir saldo, colocar dinheiro com PIX, converter entre moedas, deixar saldo rendendo, retirar para uma chave PIX e ver comprovantes.',
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
    question: 'Como funciona o rendimento?',
    answer:
      'O usuário vê opções disponíveis por moeda, gráfico estimado e uma revisão antes de guardar ou resgatar. Retornos variam e não são prometidos como garantidos.',
  },
  {
    question: 'Dá para fazer tudo em um fluxo?',
    answer:
      'Sim. Peça algo como “injetar 500 reais, deixar rendendo e sair para meu PIX”. O agente abre a interface consolidada do ciclo do dinheiro.',
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
        <header className="flex flex-col gap-4">
          <TerminalEyebrow command='chat "ajuda"' />
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.022em] text-tts-deep md:text-4xl">
            Perguntas comuns antes de usar.
          </h2>
        </header>

        <ul className="flex flex-col gap-2">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index
            return (
              <li
                key={faq.question}
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
                  <span
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
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-tts-border px-5 py-4 text-sm leading-[1.65] text-tts-muted">
                    {faq.answer}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
