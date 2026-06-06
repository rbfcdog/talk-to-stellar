import { renderRendimentosPage, type RendimentosSearchParams } from "../rendimentos/render-rendimentos-page";

export const metadata = {
  title: "Aplicação e saldos",
  description: "Confira saldos, escolha uma opção, converta moedas, use PIX e confirme com PIN.",
};

export default async function MainnetPage({
  searchParams,
}: {
  searchParams?: RendimentosSearchParams | Promise<RendimentosSearchParams>;
}) {
  return renderRendimentosPage(searchParams);
}
