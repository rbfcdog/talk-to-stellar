import type { Metadata } from "next";
import { Suspense } from "react";
import PasskeyTestClient from "./passkey-test-client";

export const metadata: Metadata = {
  title: "OpenZeppelin Passkey Test",
  description: "Test WebAuthn passkey registration, authentication, and OpenZeppelin smart account metadata.",
};

export default function PasskeyTestPage() {
  return (
    <Suspense fallback={null}>
      <PasskeyTestClient />
    </Suspense>
  );
}
