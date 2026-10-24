import type { Metadata } from "next";
import { PlansPage } from "@/components/pages/PlansPage";

export const metadata: Metadata = {
  title: "Planos",
  description: "Escolha como acessar os recursos Premium e Plus do PluginsX.",
};

export default function Page() {
  return <PlansPage />;
}
