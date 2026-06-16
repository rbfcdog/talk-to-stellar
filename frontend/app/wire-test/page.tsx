import type { Metadata } from "next";
import WireTestClient from "./wire-test-client";

export const metadata: Metadata = {
  title: "Wire payout test",
  description: "Operator screen for validating Circle wire payout coordination.",
};

export default function WireTestPage() {
  return <WireTestClient />;
}
