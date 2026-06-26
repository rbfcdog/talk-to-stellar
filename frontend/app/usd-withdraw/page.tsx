import type { Metadata } from "next";
import UsdWithdrawClient from "./usd-withdraw-client";

export const metadata: Metadata = {
  title: "Sacar em Dólar | TalkToStellar",
  description: "Saque seus dólares para uma conta bancária nos EUA via ACH ou wire.",
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

export default async function UsdWithdrawPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await Promise.resolve(searchParams || {});
  return <UsdWithdrawClient initialQuery={serializeSearchParams(resolved)} />;
}
