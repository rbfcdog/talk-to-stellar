import { Suspense } from "react";
import BridgeClient from "./bridge-client";

export const dynamic = "force-dynamic";

export default async function BridgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams(params as Record<string, string>).toString();
  return (
    <Suspense>
      <BridgeClient initialQuery={query} />
    </Suspense>
  );
}
