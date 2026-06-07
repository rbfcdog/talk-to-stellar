import type { Metadata } from "next";
import { StellarLogo } from "@/components/landing-reluca/StellarLogo";

export const metadata: Metadata = {
  title: "Background | TalkToStellar",
  description: "TalkToStellar landing-page background.",
};

export default function LogoPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080808] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div
        className="pointer-events-none absolute top-1/2 -left-64 z-0 -translate-y-1/2 opacity-[0.02] md:-left-48"
        aria-hidden="true"
      >
        <StellarLogo className="h-[600px] w-[600px] text-white md:h-[900px] md:w-[900px]" />
      </div>
      <div
        className="fixed inset-0 bg-gradient-to-b from-transparent via-[#080808]/70 to-[#080808]"
        aria-hidden="true"
      />
    </main>
  );
}
