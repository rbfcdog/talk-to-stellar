import { renderRendimentosPage, type RendimentosSearchParams } from "../rendimentos/render-rendimentos-page";

export const metadata = {
  title: "Current investments",
  description: "Track active options, positions, and current return simulations.",
};

export default async function RendimentoPage({
  searchParams,
}: {
  searchParams?: RendimentosSearchParams | Promise<RendimentosSearchParams>;
}) {
  return renderRendimentosPage(searchParams);
}
