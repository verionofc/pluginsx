"use client";

import { useState } from "react";
import { TbArrowDown, TbSearch } from "react-icons/tb";
import type { PluginRelease } from "@/lib/plugins";

type ReleaseFilters = {
  minecraft: string;
  java: string;
  plugin: string;
  paperApi: string;
  paperChannel: string;
  search: string;
};

type ReleaseSearchProps = {
  releases: PluginRelease[];
  apiUrl: string;
  pluginName: string;
};

const emptyFilters: ReleaseFilters = {
  minecraft: "all",
  java: "all",
  plugin: "all",
  paperApi: "all",
  paperChannel: "all",
  search: "",
};

export function ReleaseSearch({
  releases,
  apiUrl,
  pluginName,
}: ReleaseSearchProps) {
  const [filters, setFilters] = useState(emptyFilters);
  const minecraftVersions = [
    ...new Set(releases.map((release) => release.minecraft)),
  ];
  const javaVersions = [
    ...new Set(releases.map((release) => release.javaVersion)),
  ];
  const pluginVersions = [
    ...new Set(releases.map((release) => release.pluginVersion)),
  ];
  const paperApiVersions = [
    ...new Set(releases.map((release) => release.apiVersion)),
  ];
  const paperChannels = [
    ...new Set(releases.map((release) => release.paperChannel)),
  ];
  const search = filters.search.trim().toLowerCase();
  const visibleReleases = releases.filter((release) => {
    const matchesMinecraft =
      filters.minecraft === "all" || release.minecraft === filters.minecraft;
    const matchesJava =
      filters.java === "all" || release.javaVersion === filters.java;
    const matchesPlugin =
      filters.plugin === "all" || release.pluginVersion === filters.plugin;
    const matchesPaperApi =
      filters.paperApi === "all" || release.apiVersion === filters.paperApi;
    const matchesPaperChannel =
      filters.paperChannel === "all" ||
      release.paperChannel === filters.paperChannel;
    const matchesSearch =
      !search ||
      [
        release.minecraft,
        release.exampleMinecraft,
        release.apiVersion,
        `java ${release.javaVersion}`,
        release.javaVersion,
        release.paperChannel,
        release.pluginVersion,
        "papermc paper",
      ].some((value) => value.toLowerCase().includes(search));

    return (
      matchesMinecraft &&
      matchesJava &&
      matchesPlugin &&
      matchesPaperApi &&
      matchesPaperChannel &&
      matchesSearch
    );
  });

  function updateFilter<Key extends keyof ReleaseFilters>(
    key: Key,
    value: ReleaseFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="mt-5">
      <fieldset className="rounded-2xl border border-foreground/10 bg-background/45 p-5">
        <legend className="px-2 text-sm font-semibold">
          Filtros de versão
        </legend>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-2 text-xs font-medium text-foreground/65">
            Minecraft / PaperMC
            <select
              value={filters.minecraft}
              onChange={(event) =>
                updateFilter("minecraft", event.target.value)
              }
              className="rounded-lg border border-foreground/15 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">Todas as versões</option>
              {minecraftVersions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs font-medium text-foreground/65">
            Java
            <select
              value={filters.java}
              onChange={(event) => updateFilter("java", event.target.value)}
              className="rounded-lg border border-foreground/15 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">Todas as versões</option>
              {javaVersions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs font-medium text-foreground/65">
            API PaperMC
            <select
              value={filters.paperApi}
              onChange={(event) => updateFilter("paperApi", event.target.value)}
              className="rounded-lg border border-foreground/15 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">Todas as versões</option>
              {paperApiVersions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs font-medium text-foreground/65">
            Versão do {pluginName}
            <select
              value={filters.plugin}
              onChange={(event) => updateFilter("plugin", event.target.value)}
              className="rounded-lg border border-foreground/15 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">Todas as versões</option>
              {pluginVersions.map((version) => (
                <option key={version} value={version}>
                  {version}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs font-medium text-foreground/65">
            Canal PaperMC
            <select
              value={filters.paperChannel}
              onChange={(event) =>
                updateFilter("paperChannel", event.target.value)
              }
              className="rounded-lg border border-foreground/15 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="all">Todos os canais</option>
              {paperChannels.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2 text-xs font-medium text-foreground/65">
            Busca livre
            <span className="relative">
              <TbSearch
                size={16}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-foreground/45"
              />
              <input
                type="search"
                value={filters.search}
                onChange={(event) => updateFilter("search", event.target.value)}
                placeholder="Ex.: 26.2, Java 25, 1.0.0-beta.1"
                className="w-full rounded-lg border border-foreground/15 bg-background py-2.5 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-foreground/40 focus-visible:ring-2 focus-visible:ring-primary"
              />
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 pt-4">
          <p className="text-xs text-foreground/55">
            Plataforma:{" "}
            <span className="font-semibold text-foreground/75">PaperMC</span>
          </p>
          <div className="flex items-center gap-3">
            <output className="text-xs text-foreground/55" aria-live="polite">
              {visibleReleases.length} de {releases.length} versões
            </output>
            <button
              type="button"
              onClick={() => setFilters(emptyFilters)}
              disabled={
                filters.minecraft === "all" &&
                filters.java === "all" &&
                filters.plugin === "all" &&
                filters.paperApi === "all" &&
                filters.paperChannel === "all" &&
                filters.search === ""
              }
              className="rounded-lg border border-foreground/15 px-3 py-2 text-xs font-semibold text-foreground/75 transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </fieldset>

      {visibleReleases.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleReleases.map((release) => (
            <article
              key={`${release.minecraft}-${release.pluginVersion}`}
              className="rounded-2xl border border-foreground/10 bg-background/45 p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                Minecraft {release.minecraft}
              </p>
              <p className="mt-2 text-sm text-foreground/65">
                {pluginName} {release.pluginVersion}
              </p>
              <p className="mt-1 text-xs text-foreground/55">
                Java {release.javaVersion} · API PaperMC {release.apiVersion} ·{" "}
                {release.paperChannel}
              </p>
              <a
                href={`${apiUrl}${release.downloadUrl}`}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-85"
              >
                Baixar JAR <TbArrowDown size={17} aria-hidden />
              </a>
              <p className="mt-3 text-xs text-foreground/50">
                A API selecionou este JAR para Minecraft{" "}
                {release.exampleMinecraft}.
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-foreground/10 bg-background/45 p-5 text-sm text-foreground/65">
          Nenhuma versão corresponde aos filtros selecionados.
        </p>
      )}
    </div>
  );
}
