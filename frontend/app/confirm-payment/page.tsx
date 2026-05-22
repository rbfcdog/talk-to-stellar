import type { Metadata } from "next"
import ConfirmPaymentClient from "./confirm-payment-client"

export const metadata: Metadata = {
  title: "Confirm Payment",
  description: "Confirm the payment securely with your PIN.",
}

export default async function ConfirmPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const token = resolvedSearchParams?.token || ''
  return <ConfirmPaymentClient initialToken={token} initialValidation={null} />
}
