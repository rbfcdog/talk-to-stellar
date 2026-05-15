import { Suspense } from "react"
import SendExternalClient from "./send-external-client"

export default function SendExternalPage() {
  return (
    <Suspense fallback={null}>
      <SendExternalClient />
    </Suspense>
  )
}
