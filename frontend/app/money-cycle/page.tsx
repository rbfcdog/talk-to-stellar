import RendimentosClient from "../rendimentos/rendimentos-client";

export const metadata = {
  title: "Money cycle",
  description: "Add money with PIX, keep it earning, and send it out to PIX.",
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
  params.set("cycle", "1");
  return params.toString();
}

export default async function MoneyCyclePage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  return <RendimentosClient initialLanguage="en" initialQuery={serializeSearchParams(resolved)} />;
}
