import type { Metadata } from "next";
import KeyIntegrationsClient from "./key-integrations-client";

export const metadata: Metadata = {
  title: "Key Integrations",
  description: "Interactive test panel for Abroad Finance, Reflector Oracle, Fraud Screening, and Soroswap.",
};

export default function KeyIntegrationsPage() {
  return <KeyIntegrationsClient />;
}
