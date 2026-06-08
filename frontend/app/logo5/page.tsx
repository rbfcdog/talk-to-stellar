import type { Metadata } from "next";
import { StellarLogo } from "@/components/landing-reluca/StellarLogo";

export const metadata: Metadata = {
  title: "Slide 5 | TalkToStellar",
};

export default function Logo5Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 -left-32 z-0 opacity-20 rotate-12">
        <StellarLogo className="h-[700px] w-[700px] text-white md:h-[900px] md:w-[900px]" />
      </div>
      <div className="fixed inset-0 bg-gradient-to-tr from-[#0a0e1a]/80 via-transparent to-[#0a0e1a]/20" />
    </main>
  );
}
