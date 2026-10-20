import Link from "next/link";
import { TbArrowUpRight, TbBrandGithub, TbCube } from "react-icons/tb";

import { settings } from "@/lib";
import { getPlugins, type PluginCatalogItem } from "@/lib/plugins";

const fallbackPlugin: PluginCatalogItem = {
  name: "SpawnerX",
  slug: "spawnerx",
  platform: "PaperMC",
  latestVersion: "",
  releaseIndex: "SpawnerX/releases.json",
};

export default async function Home() {
  const plugins = await getPlugins();
  const displayedPlugins = plugins.length ? plugins : [fallbackPlugin];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-16 sm:px-6 sm:py-20">
      <section className="flex min-h-[50vh] items-center">
        <div className="max-w-3xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-primary">
            PluginsX · PaperMC
          </p>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Extensões úteis, feitas com cuidado.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-foreground/70">
            Descubra plugins PaperMC, confira compatibilidade por versão do
            Minecraft e baixe os arquivos direto pelo catálogo PluginsX.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="#plugins"
              className="inline-flex items-center gap-2 rounded-xl border border-foreground/15 px-5 py-3 font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <TbCube size={18} aria-hidden /> Explorar plugins
            </Link>
            <Link
              href={settings.links.github}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-white transition-opacity hover:opacity-85"
            >
              Ver no GitHub <TbArrowUpRight size={18} aria-hidden />
            </Link>
            <Link
              href={settings.links.github}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir o GitHub do projeto"
              className="inline-flex size-12 items-center justify-center rounded-xl border border-foreground/15 text-foreground transition-colors hover:bg-foreground/5"
            >
              <TbBrandGithub size={20} aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <section id="plugins" className="scroll-mt-10 py-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Plugins</h2>
            <p className="mt-2 text-sm text-foreground/65">
              Plugins publicados no catálogo PaperMC do PluginsX.
            </p>
          </div>
          <span className="text-xs text-foreground/50">
            {plugins.length
              ? `${plugins.length} disponíveis`
              : "Catálogo em atualização"}
          </span>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedPlugins.map((plugin) => (
            <Link
              key={plugin.slug}
              href={`/plugins/${plugin.slug}`}
              className="group rounded-2xl border border-foreground/10 bg-background/55 p-6 transition-colors hover:border-primary/40 hover:bg-background/80"
            >
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-bold">{plugin.name}</h3>
                <TbArrowUpRight
                  size={18}
                  aria-hidden
                  className="text-foreground/45 transition-colors group-hover:text-primary"
                />
              </div>
              <p className="mt-2 text-sm text-foreground/65">
                Plugin para {plugin.platform}.
              </p>
              {plugin.latestVersion && (
                <p className="mt-5 text-xs text-foreground/50">
                  Versão atual: {plugin.latestVersion}
                </p>
              )}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
