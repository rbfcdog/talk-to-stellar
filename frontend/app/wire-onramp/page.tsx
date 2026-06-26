import type { Metadata } from "next";
import WireOnrampClient from "./wire-onramp-client";
import { BridgeAuthGate } from "@/components/shared/bridge-auth-gate";

export const metadata: Metadata = {
  title: "Depositar em Dólar | TalkToStellar",
  description: "Traga dólares de um banco americano via wire transfer ou ACH.",
};

type SearchParams = Record<string, string | string[] | undefined>;

async function resolveSearchParams(sp?: SearchParams | Promise<SearchParams>) {
  return Promise.resolve(sp || {});
}

function serializeSearchParams(sp?: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp || {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params.toString();
}

export default async function WireOnrampPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  return (
    <BridgeAuthGate>
      <WireOnrampClient initialQuery={serializeSearchParams(resolved)} />
    </BridgeAuthGate>
  );
}
