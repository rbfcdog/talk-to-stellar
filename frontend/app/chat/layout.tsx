import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Chat",
  description: "Chat with TalkToStellar for balances, contacts, payments, and conversions.",
}

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
