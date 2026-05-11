import type { Metadata } from "next"
import LoginClient from "./login-client"

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entre na sua conta TalkToStellar com PIN ou Passkey.",
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { expired?: string }
}) {
  return <LoginClient expired={searchParams?.expired === "1"} />
}
