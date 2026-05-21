import PixRampClient from "../pix-ramp/pix-ramp-client";

export const metadata = {
  title: "Send to PIX",
  description: "Send balance to your PIX through TalkToStellar.",
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
  params.set("mode", "offramp");
  return params.toString();
}

export default async function PixOffPage({
  searchParams,
}: {
  searchParams?: SearchParams | Promise<SearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  return <PixRampClient initialQuery={serializeSearchParams(resolved)} lockedMode="offramp" />;
}
