import { redirect } from "next/navigation";

export const metadata = {
  title: "Aplicação",
  description: "Escolha uma opção e confirme com PIN.",
};

type SearchParams = Record<string, string | string[] | undefined>;

async function resolveSearchParams(searchParams?: SearchParams | Promise<SearchParams>) {
  return Promise.resolve(searchParams || {});
}

function reviewUrl(searchParams?: SearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (key === "cycle") continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query ? `/rendimentos?${query}` : "/rendimentos";
}

export default async function MoneyCyclePage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  redirect(reviewUrl(resolved));
}
