import PixRampClient from "../pix-ramp/pix-ramp-client";

export const metadata = {
  title: "PIX On-Ramp",
  description: "Add money with PIX and receive R$ or US$ in your TalkToStellar account.",
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
  params.set("mode", "onramp");
  return params.toString();
}

export default async function PixOnPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  return <PixRampClient initialQuery={serializeSearchParams(resolved)} lockedMode="onramp" />;
}
