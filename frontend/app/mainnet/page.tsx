import RendimentosClient from "../rendimentos/rendimentos-client";

export const metadata = {
  title: "Rendimentos e saldos",
  description: "Tela simples para acompanhar saldos e preparar rendimentos.",
};

export default function MainnetPage() {
  return <RendimentosClient />;
}
