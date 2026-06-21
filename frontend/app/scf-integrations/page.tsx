import type { Metadata } from "next";
import ScfClient from "./scf-client";

export const metadata: Metadata = {
  title: "SCF Integration Suite",
  description: "Live status dashboard for all SCF Build Integration Track integrations.",
};

export default function ScfIntegrationsPage() {
  return <ScfClient />;
}
