import { NotFoundPage } from "@/components/pages/NotFoundPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Bioma desconhecido",
  description:
    "Esse caminho não existe mais. Volte ao PluginsX e continue explorando o catálogo.",
  privatePage: true,
});

export default function NotFound() {
  return <NotFoundPage />;
}
