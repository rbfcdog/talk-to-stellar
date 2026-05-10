import type { Metadata } from "next"
import CreateAccountClient from "./create-account-client"

export const metadata: Metadata = {
  title: "Finalizar Conta",
  description: "Finalize seu cadastro na TalkToStellar com nome, e-mail e PIN.",
}

export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''
  return <CreateAccountClient initialToken={token} initialValidation={null} />
}
