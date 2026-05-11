import { Suspense } from "react"
import PayAnyoneClient from "./pay-anyone-client"

export default function PayAnyonePage() {
  return (
    <Suspense fallback={null}>
      <PayAnyoneClient />
    </Suspense>
  )
}
