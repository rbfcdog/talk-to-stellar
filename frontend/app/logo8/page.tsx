import type { Metadata } from "next";
import { StellarLogo } from "@/components/landing-reluca/StellarLogo";

export const metadata: Metadata = {
  title: "Slide 8 | TalkToStellar",
};

export default function Logo8Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div className="pointer-events-none absolute top-1/2 -left-56 z-0 -translate-y-1/2 opacity-25 rotate-[-8deg] md:-left-40">
        <StellarLogo className="h-[650px] w-[650px] text-white md:h-[950px] md:w-[950px]" />
      </div>
      <div className="fixed inset-0 bg-gradient-to-r from-[#0a0e1a]/60 via-transparent to-[#0a0e1a]/10" />
    </main>
  );
}
