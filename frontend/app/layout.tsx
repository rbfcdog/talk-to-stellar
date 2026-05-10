import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'TalkToStellar',
    template: '%s | TalkToStellar',
  },
  description: 'Carteira digital para enviar, receber e converter ativos na Stellar.',
  generator: 'v0.app',
  icons: {
    icon: '/talktostellar.png',
    shortcut: '/talktostellar.png',
    apple: '/talktostellar.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
