import { Suspense } from "react";
import ChangePinClient from "./change-pin-client";

export default function ChangePinPage() {
  return (
    <Suspense fallback={null}>
      <ChangePinClient />
    </Suspense>
  );
}

