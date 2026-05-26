import { redirect } from "next/navigation";

export const metadata = {
  title: "Yield and balances",
  description: "Review balances, currencies, earning options, PIX add, and PIX withdrawal.",
};

export default function RendimentosPage() {
  redirect("/yield");
}
