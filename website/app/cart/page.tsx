import type { Metadata } from "next";

import { CartPage } from "@/components/pages/CartPage";

export const metadata: Metadata = {
  title: "Carrinho",
  description: "Revise seus planos e vagas extras antes de finalizar a compra.",
};

export default function Page() {
  return <CartPage />;
}
