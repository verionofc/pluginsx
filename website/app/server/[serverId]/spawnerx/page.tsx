import { Suspense } from "react";
import { RemoteServerBoundary } from "@/components/remote/RemoteServerBoundary";
import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { createPageMetadata } from "@/lib/seo";

export const metadata = createPageMetadata({
  title: "Bancada do SpawnerX",
  description:
    "Configure sua instalação autorizada e acompanhe operações remotas confirmadas pelo plugin.",
  privatePage: true,
});

export default function Page({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <SiteLoadingScreen
          detail="Verificando a instalação e a autorização da sua conta."
          stage="SPAWNERX · GERENCIAMENTO"
        />
      }
    >
      <Server params={params} />
    </Suspense>
  );
}
async function Server({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = await params;
  return <RemoteServerBoundary serverId={serverId} />;
}
