import { FeatureCard, type SnippetLine } from '@/components/ui/feature-card'

interface Feature {
  title: string
  description: string
  snippetLines: SnippetLine[]
}

const FEATURES: Feature[] = [
  {
    title: 'Conversão multi-moeda',
    description:
      'O chat entende reais, dólares, euros e moedas configuradas, abre a interface certa e mostra a revisão antes do PIN.',
    snippetLines: [
      { key: 'intent', value: 'convert', type: 'string' },
      { key: 'from', value: 'R$', type: 'string' },
      { key: 'to', value: '€', type: 'string' },
    ],
  },
  {
    title: 'Rendimento guiado',
    description:
      'A experiência mostra opções por moeda, gráfico de rendimento e ação de guardar ou resgatar sem termos técnicos.',
    snippetLines: [
      { key: 'intent', value: 'yield', type: 'string' },
      { key: 'asset', value: 'euro', type: 'string' },
      { key: 'review_required', value: 'true', type: 'boolean' },
    ],
  },
  {
    title: 'PIX entra e sai',
    description:
      'Entrada por PIX, retirada para uma chave PIX digitada na hora e comprovante no mesmo fluxo de chat.',
    snippetLines: [
      { key: 'intent', value: 'money_cycle', type: 'string' },
      { key: 'pix_key_dynamic', value: 'true', type: 'boolean' },
      { key: 'receipt', value: 'chat', type: 'string' },
    ],
  },
]

export function Features() {
  return (
    <section id="como-funciona" className="bg-tts-surface py-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 md:px-8">
        <header className="flex flex-col gap-3">
          <h2 className="text-[32px] font-extrabold tracking-[-0.022em] text-tts-deep">
            Por que TalkToStellar
          </h2>
          <p className="max-w-xl text-sm leading-[1.65] text-tts-muted">
            Três fluxos essenciais para o usuário entrar, converter, render e
            sair sem trocar de contexto.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {FEATURES.map((feature) => (
            <FeatureCard
              key={feature.title}
              snippetLines={feature.snippetLines}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
