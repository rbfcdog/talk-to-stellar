import { renderRendimentosPage, type RendimentosSearchParams } from "../rendimentos/render-rendimentos-page";

export const metadata = {
  title: "Aplicação",
  description: "Escolha uma opção e confirme com PIN.",
};

async function resolveSearchParams(searchParams?: RendimentosSearchParams | Promise<RendimentosSearchParams>) {
  const resolved = await Promise.resolve(searchParams || {});
  const { cycle, ...withoutCycle } = resolved;
  void cycle;
  return withoutCycle;
}

export default async function MoneyCyclePage({
  searchParams,
}: {
  searchParams?: RendimentosSearchParams | Promise<RendimentosSearchParams>;
}) {
  const resolved = await resolveSearchParams(searchParams);
  return renderRendimentosPage(resolved);
}
