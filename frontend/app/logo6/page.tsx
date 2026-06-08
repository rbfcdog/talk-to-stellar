import type { Metadata } from "next";
import { StellarLogo } from "@/components/landing-reluca/StellarLogo";

export const metadata: Metadata = {
  title: "Slide 6 | TalkToStellar",
};

export default function Logo6Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-0 -translate-x-1/2 -translate-y-1/2 opacity-[0.08]">
        <StellarLogo className="h-[900px] w-[900px] text-white md:h-[1400px] md:w-[1400px]" />
      </div>
      <div className="fixed inset-0 bg-gradient-to-b from-[#0a0e1a]/40 via-transparent to-[#0a0e1a]/40" />
    </main>
  );
}
