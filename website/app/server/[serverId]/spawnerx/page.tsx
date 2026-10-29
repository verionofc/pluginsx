import type { Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { RemoteServerBoundary } from "@/components/remote/RemoteServerBoundary";
import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { createPageMetadata } from "@/lib/seo";

const baseMetadata = createPageMetadata({
  title: "Bancada do SpawnerX",
  description:
    "Configure sua instalação autorizada e acompanhe operações remotas confirmadas pelo plugin.",
  privatePage: true,
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ serverId: string }>;
}): Promise<Metadata> {
  const { serverId } = await params;
  const api = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
  if (!api || !/^[a-f0-9-]{36}$/i.test(serverId)) return baseMetadata;
  try {
    const response = await fetch(`${api}/remote/spawnerx/servers/${serverId}`, {
      headers: { cookie: (await headers()).get("cookie") ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return baseMetadata;
    const state = (await response.json()) as {
      server?: { name?: string; iconData?: string | null };
    };
    const name = state.server?.name?.trim();
    const icon = state.server?.iconData?.startsWith("data:image/png;base64,")
      ? state.server.iconData
      : "/favicon.ico";
    return name
      ? {
          ...baseMetadata,
          title: `${name} | SpawnerX`,
          description: `Painel de configuração do SpawnerX para ${name}`,
          icons: { icon, shortcut: icon, apple: icon },
        }
      : baseMetadata;
  } catch {
    return baseMetadata;
  }
}

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
