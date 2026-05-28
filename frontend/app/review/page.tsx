import RendimentosClient from "../rendimentos/rendimentos-client";

export const metadata = {
  title: "Review and balances",
  description: "Review balances, currencies, options, PIX add, and PIX withdrawal.",
};

type SearchParams = Record<string, string | string[] | undefined>;

async function resolveSearchParams(searchParams?: SearchParams | Promise<SearchParams>) {
  return Promise.resolve(searchParams || {});
}

function serializeSearchParams(searchParams?: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params.toString();
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  return <RendimentosClient initialQuery={serializeSearchParams(resolved)} />;
}
