import type { Metadata } from "next"
import LoginClient from "./login-client"

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your TalkToStellar account with PIN or Passkey.",
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { expired?: string }
}) {
  return <LoginClient expired={searchParams?.expired === "1"} />
}
