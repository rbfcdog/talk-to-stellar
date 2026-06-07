import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Background | TalkToStellar",
  description: "TalkToStellar landing-page background.",
};

export default function LogoPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080808] text-white">
      <div className="absolute inset-0 bg-grid-pattern" aria-hidden="true" />
      <div
        className="fixed inset-0 bg-gradient-to-b from-transparent via-[#080808]/70 to-[#080808]"
        aria-hidden="true"
      />
    </main>
  );
}
