import type { Metadata } from "next"
import ConfirmConversionClient from "./confirm-conversion-client"

export const metadata: Metadata = {
  title: "Confirm Conversion",
  description: "Confirm your wallet asset conversion with your PIN.",
}

export default async function ConfirmConversionPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''
  return <ConfirmConversionClient initialToken={token} initialValidation={null} />
}
