import RendimentosClient from "./rendimentos-client";

export type RendimentosSearchParams = Record<string, string | string[] | undefined>;

function serializeSearchParams(searchParams?: RendimentosSearchParams) {
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

function firstParam(searchParams: RendimentosSearchParams, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

export async function renderRendimentosPage(searchParams?: RendimentosSearchParams | Promise<RendimentosSearchParams>) {
  const resolved = await Promise.resolve(searchParams || {});
  const viewParam = String(firstParam(resolved, "view") || firstParam(resolved, "screen") || "").toLowerCase();
  const actionParam = String(firstParam(resolved, "action") || "").toLowerCase();
  const applicationViews = new Set(["application", "apply", "aplicar", "investir", "nova"]);
  const resolvedView = applicationViews.has(viewParam) || (viewParam !== "returns" && ["deposit", "withdraw"].includes(actionParam))
    ? "application"
    : "returns";

  return <RendimentosClient initialQuery={serializeSearchParams(resolved)} view={resolvedView} />;
}
