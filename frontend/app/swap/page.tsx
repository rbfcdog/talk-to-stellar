import type { Metadata } from "next";
import SwapClient from "./swap-client";

export const metadata: Metadata = {
  title: "Swap de Tokens | TalkToStellar",
  description: "Troque tokens diretamente via DEX com a melhor rota disponível.",
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

export default async function SwapPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  return <SwapClient initialQuery={serializeSearchParams(resolved)} />;
}
