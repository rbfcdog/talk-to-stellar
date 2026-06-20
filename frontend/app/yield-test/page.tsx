import type { Metadata } from "next";
import YieldClient from "./yield-client";
export const metadata: Metadata = { title: "DeFindex Yield", description: "Earn yield on idle USDC via DeFindex/Blend on Stellar" };
export default function YieldPage() { return <YieldClient />; }
