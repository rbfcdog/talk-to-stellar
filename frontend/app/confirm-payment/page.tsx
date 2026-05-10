import type { Metadata } from "next"
import ConfirmPaymentClient from "./confirm-payment-client"

export const metadata: Metadata = {
  title: "Confirmar Pagamento",
  description: "Confirme o pagamento com segurança usando seu PIN.",
}

export default async function ConfirmPaymentPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''
  return <ConfirmPaymentClient initialToken={token} initialValidation={null} />
}
