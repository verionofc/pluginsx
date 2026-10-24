import { PlansPage } from "@/components/pages/PlansPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Planos",
  description:
    "Compare os planos PluginsX, escolha seus limites de servidores e encontre o acesso certo para sua rede PaperMC.",
  path: "/plans",
});

export default function Page() {
  return <PlansPage />;
}
