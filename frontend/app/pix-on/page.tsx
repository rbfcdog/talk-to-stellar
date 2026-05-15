import PixRampClient from "../pix-ramp/pix-ramp-client";

export const metadata = {
  title: "PIX On-Ramp",
  description: "Add money with PIX and receive BRL or USDC in your TalkToStellar account.",
};

function serializeSearchParams(searchParams?: Record<string, string | string[] | undefined>) {
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

export default function PixOnPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return <PixRampClient initialQuery={serializeSearchParams(searchParams)} lockedMode="onramp" />;
}
