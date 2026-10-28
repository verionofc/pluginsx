import { Suspense } from "react";
import { RemoteServerBoundary } from "@/components/remote/RemoteServerBoundary";
import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { createPageMetadata } from "@/lib/seo";

export const metadata = {
  ...createPageMetadata({
    title: "Conectar SpawnerX",
    description:
      "Autorize uma conexão privada entre sua conta e o servidor Minecraft.",
    privatePage: true,
  }),
  referrer: "no-referrer" as const,
};

export default function Page({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <SiteLoadingScreen
          detail="Preparando a confirmação segura da conexão."
          stage="SPAWNERX · CONEXÃO"
        />
      }
    >
      <Connection params={params} />
    </Suspense>
  );
}
async function Connection({
  params,
}: {
  params: Promise<{ serverId: string }>;
}) {
  const { serverId } = await params;
  return <RemoteServerBoundary serverId={serverId} connect />;
}
