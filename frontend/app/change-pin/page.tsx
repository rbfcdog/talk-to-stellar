import type { Metadata } from "next";
import { Suspense } from "react";
import ChangePinClient from "./change-pin-client";

export const metadata: Metadata = {
  title: "Alterar PIN",
  description: "Defina um novo PIN para sua conta TalkToStellar.",
};

export default function ChangePinPage() {
  return (
    <Suspense fallback={null}>
      <ChangePinClient />
    </Suspense>
  );
}
