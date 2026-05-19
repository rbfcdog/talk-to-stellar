import GlobalTransferClient from "./global-transfer-client"

export const metadata = {
  title: "BRL to USD Transfer Lab",
  description: "Mock sandbox for a PIX to Stellar USDC to USD payout flow.",
}

export default function GlobalTransferPage() {
  return <GlobalTransferClient />
}
