import type { Metadata } from "next";
import DollarsClient from "./dollars-client";

export const metadata: Metadata = {
  title: "Dólar | TalkToStellar",
  description: "Receba ou envie dólares para uma conta bancária nos EUA — numa única tela.",
};

type SearchParams = Record<string, string | string[] | undefined>;

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

export default async function DollarsPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await Promise.resolve(searchParams || {});
  const modeParam = String((resolved as SearchParams).mode || "").toLowerCase();
  const initialMode = modeParam === "send" ? "send" : "receive";
  return <DollarsClient initialQuery={serializeSearchParams(resolved)} initialMode={initialMode} />;
}
