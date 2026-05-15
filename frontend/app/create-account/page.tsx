import type { Metadata } from "next"
import CreateAccountClient from "./create-account-client"

export const metadata: Metadata = {
  title: "Finish Account",
  description: "Finish your TalkToStellar signup with name, email, and PIN.",
}

export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''
  return <CreateAccountClient initialToken={token} initialValidation={null} />
}
