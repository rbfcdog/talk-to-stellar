import type { Metadata } from "next";
import WireTestClient from "./wire-test-client";

export const metadata: Metadata = {
  title: "USD Wire Payout",
  description: "Operations console for sending USD wire payouts to the linked bank account.",
};

export default function WireTestPage() {
  return <WireTestClient />;
}
