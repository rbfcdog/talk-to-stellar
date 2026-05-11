import type { Metadata } from "next"
import { Suspense } from "react"
import LogoutClient from "./logout-client"

export const metadata: Metadata = {
  title: "Sair da Conta",
  description: "Encerre sua sessão com segurança.",
}

export default function LogoutPage() {
  return (
    <Suspense fallback={null}>
      <LogoutClient />
    </Suspense>
  )
}
