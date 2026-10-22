import type { Metadata } from "next";

import { AccountPage } from "@/components/pages/AccountPage";

export const metadata: Metadata = {
  title: "Minha conta",
  description: "Entre ou gerencie sua conta PluginsX.",
};

export default function Page() {
  return <AccountPage />;
}
