import type { Metadata } from "next";
import BridgeTestClient from "./bridge-test-client";

export const metadata: Metadata = {
  title: "Bridge.xyz test",
  description: "Operator screen for testing Bridge.xyz PIX on/off-ramp flows.",
};

export default function BridgeTestPage() {
  return <BridgeTestClient />;
}
