import type { Metadata } from "next";
import EcosystemClient from "./ecosystem-client";

export const metadata: Metadata = {
  title: "Stellar Ecosystem Dashboard",
  description: "Live test panel for all TalkToStellar integrations: network stats, oracle prices, Aquarius DeFi, Abroad Finance PIX, Soroswap, CCTP, and ecosystem overview.",
};

export default function EcosystemTestPage() {
  return <EcosystemClient />;
}
