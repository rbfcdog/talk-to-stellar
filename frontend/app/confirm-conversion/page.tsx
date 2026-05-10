import type { Metadata } from "next"
import ConfirmConversionClient from "./confirm-conversion-client"

export const metadata: Metadata = {
  title: "Confirmar Conversão",
  description: "Confirme a conversão de ativos da sua carteira com PIN.",
}

export default async function ConfirmConversionPage({
  searchParams,
}: {
  searchParams: { token?: string }
}) {
  const token = searchParams?.token || ''
  return <ConfirmConversionClient initialToken={token} initialValidation={null} />
}
