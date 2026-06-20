import type { Metadata } from "next";
import WalletConnectClient from "./wallet-connect-client";

export const metadata: Metadata = {
  title: "Stellar Wallets Kit test",
  description: "Operator screen for testing SEP-10 wallet auth (Freighter, Albedo, xBull, LOBSTR).",
};

export default function WalletConnectPage() {
  return <WalletConnectClient />;
}
