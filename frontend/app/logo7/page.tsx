import type { Metadata } from "next";
import { StellarLogo } from "@/components/landing-reluca/StellarLogo";

export const metadata: Metadata = {
  title: "Slide 7 | TalkToStellar",
};

export default function Logo7Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div className="pointer-events-none absolute top-0 -left-24 z-0 opacity-[0.09]">
        <StellarLogo className="h-[450px] w-[450px] text-white" />
      </div>
      <div className="pointer-events-none absolute top-1/3 -right-36 z-0 opacity-[0.07]">
        <StellarLogo className="h-[550px] w-[550px] text-white" />
      </div>
      <div className="pointer-events-none absolute -bottom-28 left-1/2 z-0 -translate-x-1/2 opacity-[0.06]">
        <StellarLogo className="h-[700px] w-[700px] text-white md:h-[1000px] md:w-[1000px]" />
      </div>
      <div className="fixed inset-0 bg-gradient-to-b from-[#0a0e1a]/50 via-transparent to-[#0a0e1a]/60" />
    </main>
  );
}
