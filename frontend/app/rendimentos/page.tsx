import RendimentosClient from "./rendimentos-client";

export const metadata = {
  title: "Rendimentos e saldos",
  description: "Tela simples para acompanhar saldos e preparar rendimentos.",
};

export default function RendimentosPage() {
  return <RendimentosClient />;
}
