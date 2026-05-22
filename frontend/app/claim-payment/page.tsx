import ClaimPaymentClient from "./claim-payment-client"

export default async function ClaimPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const resolvedSearchParams = await searchParams
  return <ClaimPaymentClient initialToken={resolvedSearchParams?.token || ""} />
}
