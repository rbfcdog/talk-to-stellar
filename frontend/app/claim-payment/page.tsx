import ClaimPaymentClient from "./claim-payment-client"

export default function ClaimPaymentPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  return <ClaimPaymentClient initialToken={searchParams?.token || ""} />
}
