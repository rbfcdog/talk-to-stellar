import RendimentosClient from "../rendimentos/rendimentos-client";

export const metadata = {
  title: "Yield and balances",
  description: "A simple screen to track balances and prepare yield.",
};

export default function YieldPage() {
  return <RendimentosClient initialLanguage="en" />;
}
