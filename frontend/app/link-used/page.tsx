import { Suspense } from "react"
import LinkUsedClient from "./link-used-client"

export default function LinkUsedPage() {
  return (
    <Suspense fallback={null}>
      <LinkUsedClient />
    </Suspense>
  )
}

