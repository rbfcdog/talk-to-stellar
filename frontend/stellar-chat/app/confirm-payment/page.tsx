import ConfirmPaymentClient from "./confirm-payment-client"

type ValidationResult = {
  success?: boolean
  valid?: boolean
  payload?: any
  message?: string
}

export default async function ConfirmPaymentPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''

  let validation: ValidationResult = { success: false, valid: false }

  if (token) {
    const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'
    const backendBase = backend.replace(/\/api\/agent\/query$/, '').replace(/\/$/, '')
    try {
      const res = await fetch(
        `${backendBase}/api/external/validate-token?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' }
      )
      validation = await res.json()
    } catch (err) {
      validation = { success: false, valid: false, message: String(err) }
    }
  }

  return <ConfirmPaymentClient initialToken={token} initialValidation={validation} />
}