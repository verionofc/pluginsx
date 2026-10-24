import type { Metadata } from "next";

import { PanelPage } from "@/components/pages/PanelPage";

export const metadata: Metadata = {
  title: "Painel do proprietário",
  description: "Vendas, mensalidades e gerenciamento de planos PluginsX.",
};

export default function Page() {
  return <PanelPage />;
}
