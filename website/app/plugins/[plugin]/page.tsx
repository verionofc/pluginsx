import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CatalogPluginPage } from "@/content/plugins/CatalogPluginPage";
import { SpawnerXPage } from "@/content/plugins/SpawnerX";
import {
  getApiUrl,
  getPlugin,
  getPluginReleases,
  getPlugins,
} from "@/lib/plugins";

type PluginPageProps = {
  params: Promise<{ plugin: string }>;
};

export async function generateStaticParams() {
  const plugins = await getPlugins();
  const params = plugins.map(({ slug }) => ({ plugin: slug }));
  return params.length ? params : [{ plugin: "spawnerx" }];
}

export async function generateMetadata({
  params,
}: PluginPageProps): Promise<Metadata> {
  const { plugin } = await params;
  const slug = plugin.toLowerCase();
  if (slug === "spawnerx") {
    return {
      title: "SpawnerX",
      description: "Gerenciamento de spawners para servidores PaperMC.",
    };
  }

  const catalogPlugin = await getPlugin(slug);
  if (!catalogPlugin) {
    return { title: "Plugin não encontrado" };
  }

  return {
    title: catalogPlugin.name,
    description: `${catalogPlugin.name}: plugin para servidores PaperMC.`,
  };
}

export default async function PluginPage({ params }: PluginPageProps) {
  const { plugin } = await params;
  const slug = plugin.toLowerCase();
  if (slug === "spawnerx") return <SpawnerXPage />;

  const catalogPlugin = await getPlugin(slug);
  if (!catalogPlugin) notFound();

  const releases = await getPluginReleases(catalogPlugin.slug);
  return (
    <CatalogPluginPage
      plugin={catalogPlugin}
      releases={releases}
      apiUrl={getApiUrl()}
    />
  );
}
