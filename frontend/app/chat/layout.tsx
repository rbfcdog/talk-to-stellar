import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Chat",
  description: "Chat with TalkToStellar for contacts, balances, PIX, conversions, applications, payments, and withdrawals.",
}

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
