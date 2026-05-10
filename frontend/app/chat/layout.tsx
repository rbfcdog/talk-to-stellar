import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Chat",
  description: "Converse com a TalkToStellar para saldo, contatos, pagamentos e conversões.",
}

export default function ChatLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}

