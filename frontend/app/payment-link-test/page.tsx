import type { Metadata } from "next";
import PaymentLinkClient from "./payment-link-client";

export const metadata: Metadata = {
  title: "SEP-7 Payment Links",
  description: "Generate and share Stellar payment links via WhatsApp",
};

export default function PaymentLinkPage() {
  return <PaymentLinkClient />;
}
