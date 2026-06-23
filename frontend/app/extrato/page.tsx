import { Suspense } from "react";
import ExtratoClient from "./extrato-client";

export const metadata = { title: "Extrato | TalkToStellar" };

export default function ExtratoPage() {
  return (
    <Suspense fallback={null}>
      <ExtratoClient />
    </Suspense>
  );
}
