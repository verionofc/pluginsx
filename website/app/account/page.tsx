import type { Metadata } from "next";

import { AccountPage } from "@/components/pages/AccountPage";

export const metadata: Metadata = {
  title: "Central de Mundos",
  description: "Gerencie suas licenças e os servidores conectados ao PluginsX.",
};

export default function Page() {
  return <AccountPage />;
}
