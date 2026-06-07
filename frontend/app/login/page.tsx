import type { Metadata } from "next"
import LoginClient from "./login-client"

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your TalkToStellar account with password.",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>
}) {
  const resolvedSearchParams = await searchParams
  return <LoginClient expired={resolvedSearchParams?.expired === "1"} />
}
