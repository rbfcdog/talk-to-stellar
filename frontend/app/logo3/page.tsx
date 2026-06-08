import type { Metadata } from "next";
import { StellarLogo } from "@/components/landing-reluca/StellarLogo";

export const metadata: Metadata = {
  title: "Slide 3 | TalkToStellar",
};

export default function Logo3Page() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0e1a] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div className="pointer-events-none absolute top-1/4 -left-32 z-0 opacity-[0.12]">
        <StellarLogo className="h-[500px] w-[500px] text-white" />
      </div>
      <div className="pointer-events-none absolute bottom-0 -right-48 z-0 opacity-[0.10]">
        <StellarLogo className="h-[650px] w-[650px] text-white" />
      </div>
      <div className="fixed inset-0 bg-gradient-to-t from-[#0a0e1a] via-transparent to-[#0a0e1a]/40" />
    </main>
  );
}
