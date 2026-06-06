import type { Metadata } from "next"
import SetupPasskeyClient from "./setup-passkey-client"

export const metadata: Metadata = {
  title: "Set Up Biometrics",
  description: "Enable Passkey access for your TalkToStellar account.",
}

export default function SetupPasskeyPage() {
  return <SetupPasskeyClient />
}
