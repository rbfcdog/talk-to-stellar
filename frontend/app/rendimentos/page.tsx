import { renderRendimentosPage, type RendimentosSearchParams } from "./render-rendimentos-page";

export const metadata = {
  title: "Current investments",
  description: "Track active options, positions, and current return simulations.",
};

export default async function RendimentosPage({
  searchParams,
}: {
  searchParams?: RendimentosSearchParams | Promise<RendimentosSearchParams>;
}) {
  return renderRendimentosPage(searchParams);
}
