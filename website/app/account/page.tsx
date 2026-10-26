import { AccountPage } from "@/components/pages/AccountPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Central de Mundos",
  description:
    "Recupere suas keys, autorize instalações e acompanhe os pedidos de acesso dos seus servidores.",
  path: "/account",
  privatePage: true,
});

export default function Page() {
  return <AccountPage />;
}
