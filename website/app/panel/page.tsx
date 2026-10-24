import { PanelPage } from "@/components/pages/PanelPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Painel do proprietário",
  description:
    "Área privada para acompanhar vendas, pagamentos, receita e acessos da operação PluginsX.",
  path: "/panel",
  privatePage: true,
});

export default function Page() {
  return <PanelPage />;
}
