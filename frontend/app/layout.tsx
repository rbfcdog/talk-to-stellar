import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import { Suspense } from 'react'
import { LanguageToggle } from '@/components/language-toggle'
import { LanguageProvider } from '@/lib/i18n'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'TalkToStellar',
    template: '%s | TalkToStellar',
  },
  description: 'Global account to send, receive, and convert money with TalkToStellar.',
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
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <Suspense fallback={null}>
          <LanguageProvider>
            <LanguageToggle />
            {children}
          </LanguageProvider>
        </Suspense>
        <Analytics />
      </body>
    </html>
  )
}
