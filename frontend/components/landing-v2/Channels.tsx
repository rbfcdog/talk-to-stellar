'use client'

import { motion } from 'framer-motion'
import { MessageCircle, Send } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { TerminalEyebrow } from '@/components/ui/terminal-eyebrow'

interface Channel {
  name: string
  status: 'active' | 'soon'
}

const CHANNELS: Channel[] = [
  { name: 'WhatsApp', status: 'active' },
  { name: 'Telegram', status: 'active' },
  { name: 'Chat web', status: 'active' },
  { name: 'Modo avançado', status: 'active' },
]

const WHATSAPP_URL =
  'https://wa.me/5519981808102?text=Oi%2C%20quero%20usar%20o%20TalkToStellar.'
const TELEGRAM_URL = 'https://t.me/TalkToStellarTLBot'

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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="flex flex-col gap-8"
        >
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
        </motion.div>

        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((channel, i) => (
            <ChannelPill key={channel.name} channel={channel} index={i} />
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ChannelAction
            href={TELEGRAM_URL}
            icon={<Send className="h-5 w-5" aria-hidden="true" />}
            title="TalkToStellar Telegram Bot"
            handle="@TalkToStellarTLBot"
            body="Abra o bot no Telegram para pedir saldo, converter e confirmar operações em telas seguras."
            cta="Abrir Telegram"
          />
          <ChannelAction
            href={WHATSAPP_URL}
            icon={<MessageCircle className="h-5 w-5" aria-hidden="true" />}
            title="WhatsApp TalkToStellar"
            handle="+55 19 98180-8102"
            body="Chame no WhatsApp e continue pelo canal que você já usa, com links de confirmação antes do PIN."
            cta="Abrir WhatsApp"
          />
        </div>
      </div>
    </section>
  )
}

function ChannelPill({ channel, index }: { channel: Channel; index: number }) {
  const isActive = channel.status === 'active'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.35, delay: index * 0.08, ease: 'easeOut' }}
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-2"
    >
      {isActive && (
        <span className="relative inline-flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-tts-confirm opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-tts-confirm" />
        </span>
      )}
      <span className="text-sm font-medium text-white">{channel.name}</span>
      <Badge variant={isActive ? 'onDarkSuccess' : 'onDark'}>
        {isActive ? 'Ativo' : 'Em breve'}
      </Badge>
    </motion.div>
  )
}

function ChannelAction({
  href,
  icon,
  title,
  handle,
  body,
  cta,
}: {
  href: string
  icon: React.ReactNode
  title: string
  handle: string
  body: string
  cta: string
}) {
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="group grid min-h-[180px] gap-5 rounded-lg border border-white/10 bg-white/[0.06] p-5 transition hover:border-tts-gold/60 hover:bg-white/[0.09] md:grid-cols-[1fr_auto]"
    >
      <span className="flex flex-col gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-tts-gold-lt">
          {icon}
        </span>
        <span>
          <span className="block text-lg font-black text-white">{title}</span>
          <span className="mt-1 block font-mono-financial text-xs font-bold text-tts-gold-lt">
            {handle}
          </span>
        </span>
        <span className="block max-w-lg text-sm leading-6 text-white/50">
          {body}
        </span>
      </span>
      <span className="inline-flex h-11 items-center justify-center self-end rounded-lg bg-tts-gold px-4 text-sm font-black text-tts-deep transition group-hover:bg-tts-gold-lt">
        {cta}
      </span>
    </motion.a>
  )
}
