import { PlansPage } from "@/components/pages/PlansPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Planos",
  description:
    "Teste os recursos Premium, escolha uma licença para sua comunidade ou amplie a capacidade da sua rede PaperMC.",
  path: "/plans",
});

export default function Page() {
  return <PlansPage />;
}
