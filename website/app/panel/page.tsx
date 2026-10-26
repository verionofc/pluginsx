import { PanelPage } from "@/components/pages/PanelPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Painel do proprietário",
  description:
    "Painel administrativo com receita confirmada, cobranças, compras por conta e gestão de acessos.",
  path: "/panel",
  privatePage: true,
});

export default function Page() {
  return <PanelPage />;
}
