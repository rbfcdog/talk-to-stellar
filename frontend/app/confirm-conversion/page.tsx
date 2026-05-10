import ConfirmConversionClient from "./confirm-conversion-client"

export default async function ConfirmConversionPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''
  return <ConfirmConversionClient initialToken={token} initialValidation={null} />
}

