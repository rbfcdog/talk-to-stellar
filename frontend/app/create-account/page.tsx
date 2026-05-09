import CreateAccountClient from "./create-account-client"

export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''
  return <CreateAccountClient initialToken={token} initialValidation={null} />
}
