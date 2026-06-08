import type { Metadata } from "next";
import { StellarLogo } from "@/components/landing-reluca/StellarLogo";

export const metadata: Metadata = {
  title: "Slide 2 | TalkToStellar",
};

export default function Logo2Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div className="pointer-events-none absolute top-1/2 -right-72 z-0 -translate-y-1/2 opacity-20 md:-right-64">
        <StellarLogo className="h-[800px] w-[800px] text-white md:h-[1100px] md:w-[1100px]" />
      </div>
      <div className="fixed inset-0 bg-gradient-to-br from-transparent via-[#0a0e1a]/20 to-[#0a0e1a]/60" />
    </main>
  );
}
