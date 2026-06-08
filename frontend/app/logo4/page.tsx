import type { Metadata } from "next";
import { StellarLogo } from "@/components/landing-reluca/StellarLogo";

export const metadata: Metadata = {
  title: "Slide 4 | TalkToStellar",
};

export default function Logo4Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div className="pointer-events-none absolute -top-32 -right-48 z-0 opacity-30">
        <StellarLogo className="h-[600px] w-[600px] text-white md:h-[800px] md:w-[800px]" />
      </div>
      <div className="fixed inset-0 bg-gradient-to-l from-transparent via-[#0a0e1a]/30 to-[#0a0e1a]/70" />
    </main>
  );
}
