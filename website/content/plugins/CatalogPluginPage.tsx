import Link from "next/link";
import { TbArrowLeft, TbDownload } from "react-icons/tb";

import { ReleaseSearch } from "@/content/plugins/ReleaseSearch";
import type { PluginCatalogItem, PluginReleaseList } from "@/lib/plugins";

type CatalogPluginPageProps = {
  plugin: PluginCatalogItem;
  releases: PluginReleaseList | null;
  apiUrl: string;
};

export function CatalogPluginPage({
  plugin,
  releases,
  apiUrl,
}: CatalogPluginPageProps) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-foreground/65 transition-colors hover:text-foreground"
      >
        <TbArrowLeft size={17} aria-hidden /> Voltar ao início
      </Link>

      <section className="mt-8 rounded-3xl border border-foreground/10 bg-background/60 p-6 shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Plugin PaperMC
        </p>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
          {plugin.name}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-foreground/70">
          Download e compatibilidade com versões do Minecraft publicados no
          catálogo PluginsX.
        </p>
        <p className="mt-8 border-t border-foreground/10 pt-5 text-sm text-foreground/65">
          Plataforma:{" "}
          <strong className="text-foreground">{plugin.platform}</strong>
          <span aria-hidden> · </span>
          Versão mais recente: {releases?.latestVersion ?? plugin.latestVersion}
        </p>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              Versões e downloads
            </h2>
            <p className="mt-2 text-sm text-foreground/65">
              Filtre por Minecraft, Java e versão do plugin.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 text-sm text-foreground/60">
            <TbDownload size={17} aria-hidden /> Arquivos PaperMC
          </span>
        </div>

        {releases && apiUrl ? (
          <ReleaseSearch
            releases={releases.versions}
            apiUrl={apiUrl}
            pluginName={plugin.name}
          />
        ) : (
          <p className="mt-5 rounded-2xl border border-foreground/10 bg-background/45 p-5 text-sm text-foreground/65">
            Não foi possível carregar as versões. Tente novamente mais tarde.
          </p>
        )}
      </section>
    </main>
  );
}
