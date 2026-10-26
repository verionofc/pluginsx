import { CartPage } from "@/components/pages/CartPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Carrinho",
  description:
    "Confira os itens e valores do pedido antes de concluir o pagamento.",
  path: "/cart",
  privatePage: true,
});

export default function Page() {
  return <CartPage />;
}
