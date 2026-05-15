import type { Metadata } from "next"
import { Suspense } from "react"
import LogoutClient from "./logout-client"

export const metadata: Metadata = {
  title: "Sign Out",
  description: "End your session securely.",
}

export default function LogoutPage() {
  return (
    <Suspense fallback={null}>
      <LogoutClient />
    </Suspense>
  )
}
