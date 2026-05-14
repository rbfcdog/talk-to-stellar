import PixRampClient from "./pix-ramp-client";

export const metadata = {
  title: "PIX Ramp",
  description: "On-ramp e off-ramp PIX/TESOURO via Etherfuse sandbox.",
};

export default function PixRampPage() {
  return <PixRampClient />;
}
