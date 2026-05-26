import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Chat",
  description: "Chat with TalkToStellar for balances, PIX, conversions, yield, payments, and withdrawals.",
}

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
