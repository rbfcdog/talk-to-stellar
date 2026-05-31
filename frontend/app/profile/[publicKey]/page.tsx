"use client"

import { use } from "react"
import WalletProfileClient from "./wallet-profile-client"

export default function WalletProfilePage({ params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = use(params)
  return <WalletProfileClient publicKey={publicKey} />
}
