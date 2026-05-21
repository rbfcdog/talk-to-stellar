import PixRampClient from "./pix-ramp-client";

export const metadata = {
  title: "PIX Ramp",
  description: "Add and withdraw balance through PIX.",
};

type SearchParams = Record<string, string | string[] | undefined>;

async function resolveSearchParams(searchParams?: SearchParams | Promise<SearchParams>) {
  return Promise.resolve(searchParams || {});
}

export default async function PixRampPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }

  return <PixRampClient initialQuery={params.toString()} />;
}
