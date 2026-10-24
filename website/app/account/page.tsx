import { AccountPage } from "@/components/pages/AccountPage";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Central de Mundos",
  description:
    "Consulte suas licenças, keys e servidores conectados em um só lugar.",
  path: "/account",
  privatePage: true,
});

export default function Page() {
  return <AccountPage />;
}
