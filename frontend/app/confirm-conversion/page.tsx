import type { Metadata } from "next"
import ConfirmConversionClient from "./confirm-conversion-client"

export const metadata: Metadata = {
  title: "Confirm Conversion",
  description: "Confirm your account conversion with your PIN.",
}

export default async function ConfirmConversionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const token = resolvedSearchParams?.token || ''
  return <ConfirmConversionClient initialToken={token} initialValidation={null} />
}
