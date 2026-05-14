import PixRampClient from "../pix-ramp/pix-ramp-client";

export const metadata = {
  title: "PIX Off-Ramp",
  description: "Retirar TESOURO para uma conta PIX testnet na TalkToStellar.",
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
  params.set("mode", "offramp");
  return params.toString();
}

export default function PixOffPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  return <PixRampClient initialQuery={serializeSearchParams(searchParams)} lockedMode="offramp" />;
}
