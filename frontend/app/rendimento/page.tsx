import { redirect } from "next/navigation";

export const metadata = {
  title: "Rendimentos e saldos",
  description: "Tela simples para acompanhar saldos e preparar rendimentos.",
};

export default function RendimentoPage() {
  redirect("/rendimentos");
}
