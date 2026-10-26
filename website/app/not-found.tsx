import { NotFoundPage } from "@/components/pages/NotFoundPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Bioma desconhecido",
  description:
    "O endereço informado não corresponde a uma página disponível no PluginsX.",
  privatePage: true,
});

export default function NotFound() {
  return <NotFoundPage />;
}
