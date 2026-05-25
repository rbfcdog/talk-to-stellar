import { redirect } from "next/navigation";

export const metadata = {
  title: "Yield and balances",
  description: "A simple screen to track balances and prepare yield.",
};

export default function MainnetPage() {
  redirect("/yield");
}
