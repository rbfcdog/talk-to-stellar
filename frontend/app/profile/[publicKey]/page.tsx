"use client"

import WalletProfileClient from "./wallet-profile-client"

export default function WalletProfilePage({ params }: { params: { publicKey: string } }) {
  return <WalletProfileClient publicKey={params.publicKey} />
}

