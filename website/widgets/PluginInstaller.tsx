"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { TbArrowDown, TbBlocks, TbDownload, TbLoader2 } from "react-icons/tb";

type Plugin = {
  name: string;
  slug: string;
  platform: "PaperMC";
  latestVersion: string;
};

type Release = {
  minecraft: string;
  pluginVersion: string;
  javaVersion: string;
  paperChannel: "STABLE" | "ALPHA" | "BETA";
  downloadUrl: string;
};

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3333" : "")
).replace(/\/$/, "");

const versionCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function preferredRelease(releases: Release[], preferredVersion: string) {
  return (
    releases.find((release) => release.pluginVersion === preferredVersion) ?? releases[0]
  );
}

export function PluginInstaller() {
  const prefersReducedMotion = useReducedMotion();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedMinecraft, setSelectedMinecraft] = useState("");
  const [selectedPluginVersion, setSelectedPluginVersion] = useState("");
  const [isLoadingPlugins, setIsLoadingPlugins] = useState(true);
  const [isLoadingReleases, setIsLoadingReleases] = useState(false);
  const [error, setError] = useState("");

  const selectedPlugin = plugins.find((plugin) => plugin.slug === selectedSlug);
  const minecraftVersions = [...new Set(releases.map((release) => release.minecraft))].sort(
    (a, b) => versionCollator.compare(b, a),
  );
  const releasesForMinecraft = releases.filter(
    (release) => release.minecraft === selectedMinecraft,
  );
  const pluginVersions = [...new Set(releasesForMinecraft.map((release) => release.pluginVersion))];
  const selectedRelease =
    releasesForMinecraft.find((release) => release.pluginVersion === selectedPluginVersion) ??
    (selectedPlugin
      ? preferredRelease(releasesForMinecraft, selectedPlugin.latestVersion)
      : undefined);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPlugins() {
      try {
        if (!apiUrl) throw new Error("A URL da API não está configurada.");

        const response = await fetch(`${apiUrl}/plugins`, { signal: controller.signal });
        if (!response.ok) throw new Error("Não foi possível carregar os plugins.");

        const result = (await response.json()) as { plugins?: Plugin[] };
        if (!Array.isArray(result.plugins)) throw new Error("O catálogo retornou dados inválidos.");

        setPlugins(result.plugins);
        const initialPlugin =
          result.plugins.find((plugin) => plugin.slug === "spawnerx") ?? result.plugins[0];
        setSelectedSlug(initialPlugin?.slug ?? "");
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o catálogo.");
      } finally {
        if (!controller.signal.aborted) setIsLoadingPlugins(false);
      }
    }

    void loadPlugins();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedPlugin) return;
    const plugin = selectedPlugin;

    const controller = new AbortController();

    async function loadReleases() {
      setIsLoadingReleases(true);
      setError("");
      setReleases([]);
      setSelectedMinecraft("");
      setSelectedPluginVersion("");

      try {
        const response = await fetch(
          `${apiUrl}/plugins/${encodeURIComponent(plugin.slug)}/versions?platform=paper`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("Não foi possível carregar as versões deste plugin.");

        const result = (await response.json()) as { versions?: Release[] };
        if (!Array.isArray(result.versions) || result.versions.length === 0) {
          throw new Error("Ainda não há versões publicadas para este plugin.");
        }

        setReleases(result.versions);
        const availableMinecraft = [...new Set(result.versions.map((release) => release.minecraft))]
          .sort((a, b) => versionCollator.compare(b, a));
        const initialMinecraft = availableMinecraft[0];
        setSelectedMinecraft(initialMinecraft);
        const initialRelease = preferredRelease(
          result.versions.filter((release) => release.minecraft === initialMinecraft),
          plugin.latestVersion,
        );
        setSelectedPluginVersion(initialRelease?.pluginVersion ?? "");
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === "AbortError") return;
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar as versões.");
      } finally {
        if (!controller.signal.aborted) setIsLoadingReleases(false);
      }
    }

    void loadReleases();
    return () => controller.abort();
  }, [selectedPlugin]);

  function selectMinecraft(minecraft: string) {
    setSelectedMinecraft(minecraft);
    const nextRelease = preferredRelease(
      releases.filter((release) => release.minecraft === minecraft),
      selectedPlugin?.latestVersion ?? "",
    );
    setSelectedPluginVersion(nextRelease?.pluginVersion ?? "");
  }

  return (
    <section
      aria-labelledby="plugins-heading"
      className="relative flex min-h-screen snap-start flex-col justify-center px-4 py-8 pb-24 sm:px-6 sm:py-12 sm:pb-28"
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: false, amount: 0.2 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.6,
          ease: [0.2, 0.8, 0.2, 1],
        }}
        className="mx-auto w-full max-w-5xl"
      >
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#91b56b]">
              <TbBlocks size={15} aria-hidden="true" /> Catálogo PaperMC
            </p>
            <h2 id="plugins-heading" className="font-minecraft-text text-2xl font-black tracking-tight sm:text-3xl">
              Instalar plugins
            </h2>
          </div>
          <span className="hidden border border-foreground/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground/50 sm:block">
            {plugins.length} {plugins.length === 1 ? "item" : "itens"}
          </span>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-[#8ca878]/25 bg-[#111a16] text-[#eff5df] shadow-[0_24px_70px_-40px_rgba(35,77,45,0.7)] md:grid-cols-[0.8fr_1.2fr]">
          <div className="relative flex min-h-64 flex-col justify-between overflow-hidden border-b border-[#8ca878]/20 bg-[radial-gradient(ellipse_at_20%_20%,rgba(106,160,80,0.2),transparent_60%),linear-gradient(145deg,#1b2c22,#111a16)] p-6 sm:p-8 md:border-r md:border-b-0">
            <div aria-hidden="true" className="absolute -right-8 -bottom-10 size-48 rotate-12 border-18 border-[#8bc34a]/10" />
            <div className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#b9d59b]">
              <span className="size-2 bg-[#8bc34a] shadow-[0_0_12px_#8bc34a]" />
              Baú de downloads
            </div>

            <div className="relative my-8">
              <div className="mb-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-[#91ac7c]">
                <span>Slots disponíveis</span>
                <span>{selectedRelease ? "1 / 1" : "0 / 1"}</span>
              </div>
              <div className="flex size-20 items-center justify-center border-2 border-[#9ab781]/50 bg-[#0c130f] shadow-[inset_0_0_0_4px_rgba(255,255,255,0.025)]">
                {selectedRelease ? (
                  <TbBlocks size={34} className="text-[#a6cf74]" aria-hidden="true" />
                ) : (
                  <span className="size-8 border-2 border-dashed border-[#6f8068]/50" />
                )}
              </div>
              <div className="mt-3 h-1.5 w-36 bg-[#243326]">
                <motion.div
                  className="h-full bg-[#8bc34a]"
                  animate={{ width: selectedRelease ? "100%" : "0%" }}
                  transition={{ duration: 0.35 }}
                />
              </div>
            </div>

            <p className="relative max-w-xs text-xs leading-5 text-[#a8b6a1]">
              {selectedPlugin
                ? `${selectedPlugin.name} · versão mais recente ${selectedPlugin.latestVersion}`
                : "Selecione um plugin para ver os itens disponíveis."}
            </p>
          </div>

          <div className="p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-[#b8c7ae]">
                Plugin
                <select
                  value={selectedSlug}
                  onChange={(event) => setSelectedSlug(event.target.value)}
                  disabled={isLoadingPlugins || plugins.length === 0}
                  className="mt-2 h-11 w-full rounded-lg border border-[#718667]/35 bg-[#0c130f] px-3 text-sm text-[#eff5df] outline-none transition focus:border-[#a6cf74] disabled:opacity-50"
                >
                  {isLoadingPlugins && <option value="">Carregando catálogo...</option>}
                  {!isLoadingPlugins && plugins.length === 0 && <option value="">Sem plugins</option>}
                  {plugins.map((plugin) => (
                    <option key={plugin.slug} value={plugin.slug}>{plugin.name}</option>
                  ))}
                </select>
              </label>

              <label className="block text-xs font-semibold text-[#b8c7ae]">
                Versão do Minecraft
                <select
                  value={selectedMinecraft}
                  onChange={(event) => selectMinecraft(event.target.value)}
                  disabled={isLoadingReleases || minecraftVersions.length === 0}
                  className="mt-2 h-11 w-full rounded-lg border border-[#718667]/35 bg-[#0c130f] px-3 text-sm text-[#eff5df] outline-none transition focus:border-[#a6cf74] disabled:opacity-50"
                >
                  {isLoadingReleases && <option value="">Carregando versões...</option>}
                  {!isLoadingReleases && minecraftVersions.length === 0 && <option value="">Sem versões</option>}
                  {minecraftVersions.map((version) => <option key={version} value={version}>{version}</option>)}
                </select>
              </label>

              <label className="block text-xs font-semibold text-[#b8c7ae] sm:col-span-2">
                Versão do plugin
                <select
                  value={selectedRelease?.pluginVersion ?? ""}
                  onChange={(event) => setSelectedPluginVersion(event.target.value)}
                  disabled={isLoadingReleases || pluginVersions.length === 0}
                  className="mt-2 h-11 w-full rounded-lg border border-[#718667]/35 bg-[#0c130f] px-3 text-sm text-[#eff5df] outline-none transition focus:border-[#a6cf74] disabled:opacity-50"
                >
                  {pluginVersions.map((version) => <option key={version} value={version}>{version}</option>)}
                </select>
              </label>
            </div>

            {selectedRelease && (
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-y border-[#8ca878]/15 py-3 text-[11px] font-medium text-[#9eae96]">
                <span>Minecraft <strong className="text-[#d5e4c8]">{selectedRelease.minecraft}</strong></span>
                <span>Java <strong className="text-[#d5e4c8]">{selectedRelease.javaVersion}</strong></span>
                <span>Canal <strong className="text-[#d5e4c8]">{selectedRelease.paperChannel}</strong></span>
              </div>
            )}

            {error && <p className="mt-4 text-sm text-[#ffb4a8]" role="alert">{error}</p>}

            <a
              href={selectedRelease && apiUrl ? `${apiUrl}${selectedRelease.downloadUrl}` : undefined}
              aria-disabled={!selectedRelease || isLoadingReleases}
              className={`font-minecraft-text mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-b-4 px-5 py-3 text-sm font-bold transition ${selectedRelease && !isLoadingReleases ? "border-[#345d2f] bg-[#5e9b43] text-white shadow-[0_5px_20px_rgba(71,134,55,0.2)] hover:bg-[#6eaa4d]" : "pointer-events-none border-[#394139] bg-[#343d34] text-[#8f9b89]"}`}
            >
              {isLoadingReleases ? <TbLoader2 size={18} className="animate-spin" aria-hidden="true" /> : <TbDownload size={18} aria-hidden="true" />}
              {isLoadingReleases ? "Buscando no baú..." : "Baixar arquivo .jar"}
              {!isLoadingReleases && <TbArrowDown size={16} aria-hidden="true" />}
            </a>

            <p className="mt-3 text-center text-[11px] leading-5 text-[#91a08b]">
              Compatível com PaperMC. Coloque o arquivo na pasta <code className="text-[#c8d5bf]">plugins</code> do servidor e reinicie.
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
