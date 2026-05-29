import RendimentosClient from "./rendimentos-client";

export const metadata = {
  title: "Current investments",
  description: "Track active options, positions, and current return simulations.",
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

function firstParam(searchParams: SearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function RendimentosPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await Promise.resolve(searchParams || {});
  const viewParam = String(firstParam(resolved, "view") || firstParam(resolved, "screen") || "").toLowerCase();
  const actionParam = String(firstParam(resolved, "action") || "").toLowerCase();
  const applicationViews = new Set(["application", "apply", "aplicar", "investir", "nova"]);
  const resolvedView = applicationViews.has(viewParam) || (viewParam !== "returns" && ["deposit", "withdraw"].includes(actionParam))
    ? "application"
    : "returns";

  return <RendimentosClient initialQuery={serializeSearchParams(resolved)} view={resolvedView} />;
}
