import { redirect } from "next/navigation";

export const metadata = {
  title: "Aplicação e saldos",
  description: "Confira saldos, escolha uma opção, converta moedas, use PIX e confirme com PIN.",
};

type SearchParams = Record<string, string | string[] | undefined>;

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

export default async function MainnetPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const query = serializeSearchParams(await Promise.resolve(searchParams || {}));
  redirect(query ? `/review?${query}` : "/review");
}
