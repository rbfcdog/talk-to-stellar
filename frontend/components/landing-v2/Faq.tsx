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
    question: 'Em quanto tempo o TalkToStellar fica integrado à nossa stack?',
    answer:
      'API REST com payloads versionados, sandbox imediato, idempotency keys nativas e webhooks idempotentes. Equipes integram a primeira conversão em menos de uma semana usando a coleção Postman e o SDK Node.',
  },
  {
    question: 'Quem custodia as chaves dos usuários finais?',
    answer:
      'Ninguém além do próprio cliente final. A chave Stellar é gerada no dispositivo e protegida por passkey. Nada de seed phrase, nada de chave em servidor nosso. Operações exigem assinatura local.',
  },
  {
    question: 'Qual é o SLA e o tempo médio de liquidação?',
    answer:
      'Liquidação média abaixo de 60 segundos do confirm Pix até o USDC creditado na Stellar. SLA de uptime 99.9% mensal com créditos contratuais em caso de descumprimento.',
  },
  {
    question: 'Qual é a fee total para BRL → USDC?',
    answer:
      'Spread de 0,5% sobre a cotação interbancária, sem taxa de wire, sem IOF de remessa. Network fee Stellar é incluída no quote final. O custo total é exibido na resposta da API antes do confirm.',
  },
  {
    question: 'Vocês são autorizados a operar com Pix e câmbio no Brasil?',
    answer:
      'Operamos via PSP licenciado pelo BCB para o trilho Pix e parceiro corretor para a etapa de câmbio. KYC/KYB, listas restritivas e travel rule integrados ao onboarding.',
  },
  {
    question: 'Funciona em testnet antes de habilitar mainnet?',
    answer:
      'Sim. Sandbox espelha o contrato de produção com a Stellar Testnet e Pix mock. Migração para mainnet é uma troca de chave de API — nenhuma alteração de payload é necessária.',
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
          <TerminalEyebrow command="tts faq --segment b2b" />
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-[-0.022em] text-tts-deep md:text-4xl">
            O que times técnicos perguntam antes de integrar.
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
