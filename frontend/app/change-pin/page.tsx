import type { Metadata } from "next";
import { Suspense } from "react";
import ChangePinClient from "./change-pin-client";

export const metadata: Metadata = {
  title: "Change PIN",
  description: "Set a new PIN for your TalkToStellar account.",
};

export default function ChangePinPage() {
  return (
    <Suspense fallback={null}>
      <ChangePinClient />
    </Suspense>
  );
}
