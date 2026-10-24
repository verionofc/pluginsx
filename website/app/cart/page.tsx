import { CartPage } from "@/components/pages/CartPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Carrinho",
  description:
    "Revise os planos e limites de servidores escolhidos antes de seguir para o pagamento.",
  path: "/cart",
  privatePage: true,
});

export default function Page() {
  return <CartPage />;
}
