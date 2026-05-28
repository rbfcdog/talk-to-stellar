import type { Metadata } from "next"
import SendExternalClient from "./send-external-client"

export const metadata: Metadata = {
  title: "Enviar para carteira externa",
  description: "Revise e confirme um envio para uma public key externa.",
}

type SearchParams = Record<string, string | string[] | undefined>

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || ""
}

export default async function SendExternalPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>
}) {
  const params = await Promise.resolve(searchParams || {})

  return (
    <SendExternalClient
      initialParams={{
        lang: firstParam(params.lang || params.language),
        destination: firstParam(params.destination || params.public_key || params.destination_public_key),
        amount: firstParam(params.amount),
        asset: firstParam(params.asset || params.asset_code),
      }}
    />
  )
}
