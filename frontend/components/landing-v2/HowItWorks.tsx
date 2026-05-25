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
    title: 'Pix entra',
    description:
      'Cliente paga via Pix QR ou copia-cola. O fluxo de cobrança usa PSP licenciado, com webhook de confirmação.',
    emphasis: false,
  },
  {
    number: '02',
    title: 'BRL vira USDC',
    description:
      'Conversão executada na Stellar com spread de 0,5%, sem hop por exchange centralizada nem janela de risco.',
    emphasis: true,
  },
  {
    number: '03',
    title: 'Custódia no cliente',
    description:
      'Saldo USDC é registrado em uma conta Stellar controlada pela chave que vive no dispositivo do usuário.',
    emphasis: true,
  },
  {
    number: '04',
    title: 'Saída para qualquer lugar',
    description:
      'On-chain, Pix de volta, conta internacional via parceiro — a saída do USDC fica desacoplada da entrada.',
    emphasis: false,
  },
]

export function HowItWorks() {
  return (
    <section className="bg-tts-bg py-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 md:px-8">
        <header className="flex flex-col gap-3">
          <h2 className="max-w-2xl text-[32px] font-extrabold tracking-[-0.022em] text-tts-deep">
            Fricção zero do BRL ao USDC.
          </h2>
        </header>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-tts-border bg-tts-border sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <StepCell key={step.number} step={step} />
          ))}
        </div>

        <aside className="flex items-center gap-3 rounded-xl border border-tts-border2 bg-tts-deep/[0.06] px-5 py-3 text-sm text-tts-deep">
          <span className="font-mono-financial text-xs font-bold uppercase tracking-[0.14em] text-tts-gold">
            Arquitetura
          </span>
          <span className="text-tts-muted">
            <strong className="font-bold text-tts-deep">Não-Custodial:</strong>{' '}
            as chaves privadas nunca tocam nossos servidores.
          </span>
        </aside>
      </div>
    </section>
  )
}

function StepCell({ step }: { step: Step }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 p-6',
        step.emphasis ? 'bg-tts-gold/[0.05]' : 'bg-tts-surface',
      )}
    >
      <div
        className={cn(
          'inline-flex h-8 w-fit items-center rounded-full px-3 font-mono-financial text-[11px] font-bold leading-none',
          step.emphasis
            ? 'bg-tts-gold text-tts-surface'
            : 'bg-tts-deep text-tts-surface',
        )}
      >
        {step.number}
      </div>
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
    </div>
  )
}
