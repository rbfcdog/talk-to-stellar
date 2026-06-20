import type { Metadata } from "next";
import PasskeyWalletClient from "./passkey-wallet-client";
export const metadata: Metadata = { title: "Passkey Smart Wallet", description: "Stellar smart wallets secured by Face ID — no seed phrase" };
export default function PasskeyWalletPage() { return <PasskeyWalletClient />; }
