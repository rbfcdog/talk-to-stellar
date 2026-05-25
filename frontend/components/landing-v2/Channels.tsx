import { Badge } from '@/components/ui/badge'
import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'

interface Channel {
  name: string
  status: 'active' | 'soon'
}

const CHANNELS: Channel[] = [
  { name: 'WhatsApp', status: 'active' },
  { name: 'Telegram', status: 'active' },
  { name: 'REST API', status: 'active' },
  { name: 'Dashboard', status: 'soon' },
]

const DOT_GRID_STYLE: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
  backgroundSize: '28px 28px',
  opacity: 0.04,
}

export function Channels() {
  return (
    <section
      id="canais"
      className="relative overflow-hidden bg-tts-deep py-20 text-white"
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={DOT_GRID_STYLE}
        aria-hidden
      />

      <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 md:px-8">
        <TerminalEyebrow
          command="tts channels --list --status active"
          dark
          showCursor
        />

        <header className="flex flex-col gap-4">
          <h2 className="max-w-2xl text-[32px] font-extrabold leading-[1.08] tracking-[-0.022em] md:text-[42px]">
            Seu cliente opera onde{' '}
            <span className="text-tts-gold-lt">já está.</span>
          </h2>
          <p className="max-w-xl text-sm leading-[1.65] text-white/40">
            Mesmo SDK por trás, canais distintos na ponta. Comece pela API ou
            ative o WhatsApp em horas — sem app novo para o cliente final.
          </p>
        </header>

        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((channel) => (
            <ChannelPill key={channel.name} channel={channel} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ChannelPill({ channel }: { channel: Channel }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2">
      <span className="text-sm font-medium text-white">{channel.name}</span>
      <Badge variant={channel.status === 'active' ? 'onDarkSuccess' : 'onDark'}>
        {channel.status === 'active' ? 'Ativo' : 'Em breve'}
      </Badge>
    </div>
  )
}
