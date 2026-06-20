import type { Metadata } from "next";
import AnchorTestClient from "./anchor-test-client";

export const metadata: Metadata = {
  title: "SEP-24 Anchor test",
  description: "Operator screen for testing MoneyGram and other SEP-24 anchors.",
};

export default function AnchorTestPage() {
  return <AnchorTestClient />;
}
