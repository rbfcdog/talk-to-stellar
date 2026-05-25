import { FeatureCard, type SnippetLine } from '@/components/ui/feature-card'

interface Feature {
  title: string
  description: string
  snippetLines: SnippetLine[]
}

const FEATURES: Feature[] = [
  {
    title: 'Liquidação em segundos',
    description:
      'Cada conversão BRL → USDC fecha na Stellar com confirmação em menos de um segundo. Sem janela de risco aberta entre on-ramp e custódia.',
    snippetLines: [
      { key: 'status', value: 'settled', type: 'string' },
      { key: 'latency_ms', value: '847', type: 'number' },
      { key: 'network', value: 'stellar', type: 'string' },
    ],
  },
  {
    title: 'Arquitetura não-custodial',
    description:
      'Chave privada gerada e mantida no dispositivo do cliente via passkey. Nada de seed phrase, nada de chave em nosso servidor.',
    snippetLines: [
      { key: 'custody', value: 'non-custodial', type: 'string' },
      { key: 'auth', value: 'passkey', type: 'string' },
      { key: 'key_on_server', value: 'false', type: 'boolean' },
    ],
  },
  {
    title: 'Canais nativos',
    description:
      'WhatsApp, Telegram, REST API ou dashboard — o cliente final escolhe onde operar. Sem app novo, sem onboarding longo.',
    snippetLines: [
      { key: 'channel', value: 'whatsapp', type: 'string' },
      { key: 'install_required', value: 'false', type: 'boolean' },
      { key: 'onboarding', value: '<2min', type: 'string' },
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
            Três decisões de arquitetura que removem o atrito típico de
            integrações Pix + cripto.
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
