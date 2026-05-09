import ConfirmPaymentClient from "./confirm-payment-client"

export default async function ConfirmPaymentPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''
  return <ConfirmPaymentClient initialToken={token} initialValidation={null} />
}
