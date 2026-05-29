import { Logo } from './Logo'

const NAV_GROUPS = [
  {
    title: 'Produto',
    links: [
      { label: 'Visão geral', href: '#produto' },
      { label: 'Como funciona', href: '#como-funciona' },
      { label: 'Canais', href: '#canais' },
      { label: 'Intents', href: '#api' },
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Começar', href: '/chat' },
      { label: 'Entrar', href: '/login' },
    ],
  },
]

export function Footer() {
  return (
    <footer id="empresa" className="bg-tts-deep text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-14 md:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Logo size={28} />
              <span className="text-base font-extrabold tracking-[-0.018em]">
                TalkToStellar
              </span>
            </div>
            <p className="max-w-xs text-sm leading-[1.65] text-white/55">
              Conta por conversa para PIX, conversão multi-moeda, aplicação e
              retirada para sua chave PIX.
            </p>
          </div>

          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/45">
                {group.title}
              </span>
              <ul className="flex flex-col gap-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm text-white/75 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-white/[0.07] pt-6 text-xs md:flex-row md:items-center md:justify-between">
          <span className="font-mono-financial text-white/45">
            © 2026 TalkToStellar
          </span>
          <a
            href="mailto:team.talktostellar@gmail.com"
            className="font-mono-financial text-tts-gold/60 hover:text-tts-gold-lt"
          >
            team.talktostellar@gmail.com
          </a>
        </div>
      </div>
    </footer>
  )
}
