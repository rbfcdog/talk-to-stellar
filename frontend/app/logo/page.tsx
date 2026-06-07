import type { Metadata } from "next";
import { Logo } from "@/components/shared/logo";

export const metadata: Metadata = {
  title: "Logo | TalkToStellar",
  description: "TalkToStellar logo on black.",
};

export default function LogoPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-black text-white">
      <Logo className="h-40 w-40 sm:h-56 sm:w-56" />
    </main>
  );
}
