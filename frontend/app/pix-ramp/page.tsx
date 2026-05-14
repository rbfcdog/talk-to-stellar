import PixRampClient from "./pix-ramp-client";

export const metadata = {
  title: "PIX Ramp",
  description: "On-ramp e off-ramp PIX/TESOURO via Etherfuse sandbox.",
};

export default function PixRampPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }

  return <PixRampClient initialQuery={params.toString()} />;
}
