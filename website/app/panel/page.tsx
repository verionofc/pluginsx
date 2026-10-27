import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PanelPage } from "@/components/pages/PanelPage";
import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Painel do proprietário",
  description:
    "Painel administrativo com receita confirmada, cobranças, compras por conta e gestão de acessos.",
  path: "/panel",
  privatePage: true,
});

async function OwnerPanel() {
  const requestHeaders = await headers();
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3333" : "");
  if (!apiUrl)
    return (
      <p role="alert" className="mx-auto mt-24 max-w-xl p-6 text-foreground">
        Configure a origem da API para validar o acesso ao painel.
      </p>
    );
  let session: { user?: { role?: string } } | null = null;
  try {
    const response = await fetch(
      `${apiUrl.replace(/\/$/, "")}/auth/get-session`,
      {
        headers: { cookie: requestHeaders.get("cookie") ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (response.ok) session = await response.json();
  } catch {
    return (
      <p role="alert" className="mx-auto mt-24 max-w-xl p-6 text-foreground">
        A autenticação está temporariamente indisponível. Tente novamente.
      </p>
    );
  }
  if (!session?.user) redirect("/account?returnTo=%2Fpanel");
  if (session.user.role !== "owner") redirect("/account?panel=forbidden");
  return <PanelPage />;
}
export default function Page() {
  return (
    <Suspense
      fallback={
        <SiteLoadingScreen
          detail="Verificando o acesso ao painel."
          stage="SESSÃO · PROPRIETÁRIO"
        />
      }
    >
      <OwnerPanel />
    </Suspense>
  );
}
