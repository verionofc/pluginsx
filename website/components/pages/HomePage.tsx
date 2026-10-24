"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TbArrowDown, TbBlocks, TbCheck, TbChevronDown, TbChevronUp, TbCopy, TbDownload, TbEye, TbEyeOff, TbLoader2, TbPick, TbPlayerPause, TbPlayerPlay, TbSparkles, TbVinyl } from "react-icons/tb";

import { authClient } from "@/lib/auth-client";
import { SiteLoadingScreen } from "@/components/ui/SiteLoadingScreen";
import { useLoadingDelay } from "@/hooks/useLoadingDelay";
import { useHydrated } from "@/hooks/useHydrated";

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

type LicenseResponse = {
  code: string;
  created?: true;
};

type PremiumLicenseResponse = {
  code: string | null;
  tier: "plus";
  valid: boolean;
  created?: boolean;
};

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3333" : "")
).replace(/\/$/, "");

const versionCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function preferredRelease(releases: Release[], preferredVersion: string) {
  return releases.find((release) => release.pluginVersion === preferredVersion) ?? releases[0];
}

export function HomePage() {
  const [pluginsReady, setPluginsReady] = useState(false);
  const [licenseReady, setLicenseReady] = useState(false);
  const markPluginsReady = useCallback(() => setPluginsReady(true), []);
  const markLicenseReady = useCallback(() => setLicenseReady(true), []);
  const isLoading = !pluginsReady || !licenseReady;
  const showLoading = useLoadingDelay(isLoading);

  return (
    <div className="relative min-h-dvh">
      {showLoading && <SiteLoadingScreen detail="Buscando plugins, versões e dados da sua licença." stage="CATÁLOGO · VERSÕES · LICENÇA" />}
      <div aria-hidden={showLoading} className={showLoading ? "invisible" : ""}>
        <AmbientMusic />
        <main
          tabIndex={0}
          className="relative z-10 h-dvh snap-y snap-proximity sm:snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth"
        >
          <LicenseGenerator onInitialReady={markLicenseReady} />
          <PluginInstaller onInitialReady={markPluginsReady} />
        </main>
      </div>
    </div>
  );
}


export function PluginInstaller({ onInitialReady }: { onInitialReady: () => void }) {
  const prefersReducedMotion = useReducedMotion();
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [releases, setReleases] = useState<Release[]>([]);
  const [selectedMinecraft, setSelectedMinecraft] = useState("");
  const [selectedPluginVersion, setSelectedPluginVersion] = useState("");
  const [isLoadingPlugins, setIsLoadingPlugins] = useState(true);
  const [isLoadingReleases, setIsLoadingReleases] = useState(true);
  const [error, setError] = useState("");
  const [initialDataSettled, setInitialDataSettled] = useState(false);

  const selectedPlugin = plugins.find((plugin) => plugin.slug === selectedSlug);
  const minecraftVersions = [...new Set(releases.map((release) => release.minecraft))].sort(
    (a, b) => versionCollator.compare(b, a),
  );
  const releasesForMinecraft = releases.filter(
    (release) => release.minecraft === selectedMinecraft,
  );
  const pluginVersions = [...new Set(releasesForMinecraft.map((release) => release.pluginVersion))];
  const latestVersionIndex = pluginVersions.indexOf(selectedPlugin?.latestVersion ?? "");
  if (latestVersionIndex > 0) {
    pluginVersions.unshift(pluginVersions.splice(latestVersionIndex, 1)[0]);
  }
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
    if (!isLoadingPlugins && !selectedPlugin) setIsLoadingReleases(false);
  }, [isLoadingPlugins, selectedPlugin]);

  useEffect(() => {
    if (isLoadingPlugins || isLoadingReleases || initialDataSettled) return;
    setInitialDataSettled(true);
    onInitialReady();
  }, [initialDataSettled, isLoadingPlugins, isLoadingReleases, onInitialReady]);

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
      className="relative flex min-h-dvh snap-start flex-col justify-center px-3 py-8 pb-28 sm:px-5 sm:py-12 sm:pb-28 lg:px-6"
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
        <div className="mb-4 flex items-end justify-between gap-3 sm:mb-5 sm:gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em] text-[#91b56b]">
              <TbBlocks size={15} aria-hidden="true" /> Catálogo PaperMC
            </p>
            <h2 id="plugins-heading" className="font-minecraft-text text-2xl font-black tracking-tight sm:text-3xl">
              Instalar plugins
            </h2>
          </div>
          <span className="hidden shrink-0 border border-foreground/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-foreground/50 md:block">
            {plugins.length} {plugins.length === 1 ? "item" : "itens"}
          </span>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-[#8ca878]/25 bg-[#111a16] text-[#eff5df] shadow-[0_24px_70px_-40px_rgba(35,77,45,0.7)] lg:grid-cols-[0.8fr_1.2fr]">
          <div className="relative flex min-h-56 flex-col justify-between overflow-hidden border-b border-[#8ca878]/20 bg-[radial-gradient(ellipse_at_20%_20%,rgba(106,160,80,0.2),transparent_60%),linear-gradient(145deg,#1b2c22,#111a16)] p-4 sm:p-6 lg:border-r lg:border-b-0 lg:p-8">
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

          <div className="p-4 sm:p-6 lg:p-8">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-semibold text-[#b8c7ae]">
                Plugin
                <select
                  value={selectedSlug}
                  onChange={(event) => setSelectedSlug(event.target.value)}
                  disabled={isLoadingPlugins || plugins.length === 0}
                  className="mt-2 h-12 min-w-0 w-full rounded-lg border border-[#718667]/35 bg-[#0c130f] px-3 text-sm text-[#eff5df] outline-none transition focus:border-[#a6cf74] disabled:opacity-50"
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
                  className="mt-2 h-12 min-w-0 w-full rounded-lg border border-[#718667]/35 bg-[#0c130f] px-3 text-sm text-[#eff5df] outline-none transition focus:border-[#a6cf74] disabled:opacity-50"
                >
                  {isLoadingReleases && <option value="">Carregando versões...</option>}
                  {!isLoadingReleases && minecraftVersions.length === 0 && <option value="">Sem versões</option>}
                  {minecraftVersions.map((version) => <option key={version} value={version}>{version}</option>)}
                </select>
              </label>

              <label className="block text-xs font-semibold text-[#b8c7ae] md:col-span-2">
                Versão do plugin
                <select
                  value={selectedRelease?.pluginVersion ?? ""}
                  onChange={(event) => setSelectedPluginVersion(event.target.value)}
                  disabled={isLoadingReleases || pluginVersions.length === 0}
                  className="mt-2 h-12 min-w-0 w-full rounded-lg border border-[#718667]/35 bg-[#0c130f] px-3 text-sm text-[#eff5df] outline-none transition focus:border-[#a6cf74] disabled:opacity-50"
                >
                  {pluginVersions.map((version) => (
                    <option key={version} value={version}>
                      {version}{version === selectedPlugin?.latestVersion ? " (mais recente)" : ""}
                    </option>
                  ))}
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
              className={`font-minecraft-text mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border-b-4 px-3 py-3 text-xs font-bold transition sm:px-5 sm:text-sm ${selectedRelease && !isLoadingReleases ? "border-[#345d2f] bg-[#5e9b43] text-white shadow-[0_5px_20px_rgba(71,134,55,0.2)] hover:bg-[#6eaa4d]" : "pointer-events-none border-[#394139] bg-[#343d34] text-[#8f9b89]"}`}
            >
              {isLoadingReleases ? <TbLoader2 size={18} className="animate-spin" aria-hidden="true" /> : <TbDownload size={18} aria-hidden="true" />}
              {isLoadingReleases ? "Buscando no baú..." : "Baixar arquivo .jar"}
              {!isLoadingReleases && <TbArrowDown size={16} aria-hidden="true" />}
            </a>

            <p className="mt-3 text-center text-[11px] leading-5 text-[#91a08b]">
              Compatível apenas com PaperMC. Coloque o arquivo na pasta <code className="text-[#c8d5bf]">plugins</code> do servidor e reinicie.
            </p>
          </div>
        </div>
      </motion.div>
    </section>
  );
}


export function LicenseGenerator({ onInitialReady }: { onInitialReady: () => void }) {
  const router = useRouter();
  const [license, setLicense] = useState<string>();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [premiumLicense, setPremiumLicense] = useState<string>();
  const [isPremiumLicenseVisible, setIsPremiumLicenseVisible] = useState(false);
  const [premiumMessage, setPremiumMessage] = useState("");
  const [isPremiumLoading, setIsPremiumLoading] = useState(false);
  const [isPremiumStatusLoading, setIsPremiumStatusLoading] = useState(true);
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const hasHydrated = useHydrated();
  const isSessionReady = hasHydrated && !isSessionPending;
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    setPremiumLicense(undefined);
    if (!isSessionReady) return;
    if (!session) {
      setIsPremiumStatusLoading(false);
      onInitialReady();
      return;
    }
    if (!apiUrl) {
      setIsPremiumStatusLoading(false);
      onInitialReady();
      return;
    }

    const controller = new AbortController();
    setIsPremiumStatusLoading(true);
    void fetch("/license/premium", {
      credentials: "include",
      signal: controller.signal,
    }).then(async (response) => {
      if (response.status === 401) return;
      if (!response.ok) throw new Error("Não foi possível consultar sua key Premium.");
      const result = (await response.json()) as PremiumLicenseResponse;
      if (result.tier === "plus" && result.code && result.valid) setPremiumLicense(result.code);
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name !== "AbortError") {
        setPremiumMessage("Não foi possível consultar sua key Premium agora.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        setIsPremiumStatusLoading(false);
        onInitialReady();
      }
    });
    return () => controller.abort();
  }, [isSessionReady, onInitialReady, session]);

  async function generateLicense() {
    setIsLoading(true);
    setMessage("");

    try {
      if (!apiUrl) {
        throw new Error("A URL da API não está configurada.");
      }

      const response = await fetch("/license/generate", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Não foi possível gerar a key agora.");
      }

      const result = (await response.json()) as LicenseResponse;
      if (typeof result.code !== "string" || !result.code) {
        throw new Error("A API retornou uma key inválida.");
      }

      setLicense(result.code);
      setMessage(
        result.created
          ? "Key gerada com sucesso."
          : "Essa key já foi gerada; esta é a key existente.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível gerar a key.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyLicense() {
    if (!license) return;

    try {
      await navigator.clipboard.writeText(license);
      setMessage("Key copiada.");
    } catch {
      setMessage("Não foi possível copiar. Selecione e copie a key acima.");
    }
  }

  async function generatePremiumLicense() {
    setPremiumMessage("");

    if (!session) {
      router.push(`/account?returnTo=${encodeURIComponent("/#license")}&notice=premium-key`);
      return;
    }

    if (!apiUrl) {
      setPremiumMessage("A URL da API não está configurada.");
      return;
    }

    setIsPremiumLoading(true);
    try {
      const response = await fetch("/license/premium/generate", {
        method: "POST",
        credentials: "include",
      });

      if (response.status === 401) {
        router.push(`/account?returnTo=${encodeURIComponent("/#license")}&notice=premium-key`);
        return;
      }

      const result = (await response.json()) as PremiumLicenseResponse & {
        message?: string;
      };
      if (!response.ok) {
        if (response.status === 403) {
          router.push(`/plans?returnTo=${encodeURIComponent("/#license")}`);
          return;
        }
        throw new Error(result.message ?? "Não foi possível gerar sua key Premium.");
      }
      if (result.tier !== "plus" || !result.code || !result.valid) {
        throw new Error("A API retornou uma key Premium inválida.");
      }

      setPremiumLicense(result.code);
      setPremiumMessage(
        result.created
          ? "Portal aberto. Sua key Premium foi vinculada à conta."
          : "Sua key Premium existente foi recuperada.",
      );
    } catch (error) {
      setPremiumMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar sua key Premium.",
      );
    } finally {
      setIsPremiumLoading(false);
    }
  }

  async function copyPremiumLicense() {
    if (!premiumLicense) return;

    try {
      await navigator.clipboard.writeText(premiumLicense);
      setPremiumMessage("Key Premium copiada para o inventário.");
    } catch {
      setPremiumMessage("Não foi possível copiar. Selecione e copie a key acima.");
    }
  }

  return (
    <motion.section
      id="license"
      aria-labelledby="license-heading"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative isolate flex min-h-dvh snap-start items-center justify-center overflow-hidden px-2.5 py-6 pb-24 sm:px-5 sm:py-12 sm:pb-28 lg:px-6 lg:py-16"
    >
      <motion.section
        initial={prefersReducedMotion ? false : { opacity: 0, y: 22, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-5xl overflow-hidden rounded-xl border border-[#8ca878]/30 border-t-4 border-t-[#8bc34a] bg-[#111a16] text-[#eff5df] shadow-[0_30px_100px_-36px_rgba(35,77,45,0.75)] sm:rounded-[1.75rem]"
      >
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-3 overflow-hidden border-b border-[#8ca878]/20 bg-[radial-gradient(ellipse_at_50%_25%,rgba(106,160,80,0.28),transparent_65%),linear-gradient(145deg,#1d3427,#111a16_78%)] p-4 sm:flex sm:min-h-64 sm:flex-col sm:justify-between sm:p-8 lg:border-r lg:border-b-0 lg:p-10">
            <div className="absolute inset-0 opacity-30 bg-[linear-gradient(45deg,rgba(255,255,255,0.05)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.05)_75%)] bg-size-[18px_18px]" />
            <div className="relative col-span-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#b9d59b] sm:col-span-1 sm:text-[11px] sm:tracking-[0.22em]">
              <span className="size-2 bg-[#8bc34a] shadow-[0_0_12px_#8bc34a]" />
              Bancada de licenças
            </div>

            <div className="relative min-w-0 sm:hidden">
              <p className="font-minecraft-text text-sm font-bold text-white">SpawnerX</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aaf91]">Key de acesso · 01</p>
            </div>

            <motion.div
              aria-hidden="true"
              animate={prefersReducedMotion ? undefined : { y: [0, -8, 0], rotate: [0, -2, 2, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative col-start-2 row-start-2 mx-1 my-0 grid size-24 place-items-center border-4 border-[#b5d58a]/70 bg-[linear-gradient(135deg,#85b94e_0_34%,#4b8739_34%_67%,#714c32_67%)] shadow-[inset_0_0_0_5px_rgba(20,40,24,0.25),8px_9px_0_rgba(5,12,8,0.3),0_0_40px_rgba(116,183,74,0.25)] sm:mx-auto sm:my-8 sm:size-36 sm:shadow-[inset_0_0_0_5px_rgba(20,40,24,0.25),12px_14px_0_rgba(5,12,8,0.3),0_0_55px_rgba(116,183,74,0.25)]"
            >
              <div className="absolute inset-3 border border-white/15" />
              <TbPick size={48} strokeWidth={1.5} className="drop-shadow-[3px_4px_0_rgba(0,0,0,0.4)] text-[#f0dfaa] sm:hidden" />
              <TbPick size={58} strokeWidth={1.5} className="hidden drop-shadow-[3px_4px_0_rgba(0,0,0,0.4)] text-[#f0dfaa] sm:block" />
              <span className="absolute -right-3 -bottom-3 border-2 border-[#111a16] bg-[#8bc34a] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#172315]">
                API
              </span>
            </motion.div>

            <div className="relative col-span-2 flex items-center justify-between border-t border-[#b5d58a]/20 pt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#9aaf91] sm:col-span-1 sm:pt-4 sm:text-[10px] sm:tracking-[0.18em]">
              <span>Licença PluginsX</span>
              <span>Slot 01 / 01</span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-center p-4 sm:p-8 lg:p-12">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a6cf74] sm:text-xs sm:tracking-[0.24em]">
              SpawnerX · licença do servidor
            </p>
            <h1 id="license-heading" className="font-minecraft-text mt-2 text-2xl font-black leading-tight tracking-tight sm:mt-3 sm:text-3xl lg:text-4xl">
              Acesso ao seu servidor
            </h1>
            <p className="mt-2 max-w-md text-[13px] leading-5 text-[#b3c0ad] sm:mt-3 sm:text-sm sm:leading-6">
              Gere sua key para usar os plugins. Se já tiver uma, recuperamos a mesma para você.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2 sm:mt-7" aria-hidden="true">
              {["#769a50", "#4e703a", "#769a50"].map((color, index) => (
                <motion.div
                  key={index}
                  animate={prefersReducedMotion ? undefined : { opacity: [0.55, 1, 0.55] }}
                  transition={{ duration: 2.4, delay: index * 0.25, repeat: Infinity }}
                  className="h-1.5"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <div className="mt-5 grid gap-3 min-[430px]:grid-cols-2 sm:mt-6 sm:grid-cols-2">
              <motion.div
                whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                <Button
                  size="lg"
                  variant="primary"
                  onPress={generateLicense}
                  isDisabled={isLoading}
                  className="font-minecraft-text h-12 w-full whitespace-nowrap rounded-lg border-b-4 border-[#345d2f] bg-[#5e9b43] px-2 text-xs font-bold text-[#f7ffe9] shadow-[0_5px_20px_rgba(71,134,55,0.2)] hover:bg-[#6eaa4d] sm:px-4 sm:text-sm"
                >
                  <TbPick size={19} aria-hidden="true" />
                  {isLoading ? "Verificando..." : "Gerar minha key"}
                </Button>
              </motion.div>

              <motion.div
                whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group relative isolate"
              >
                <Button
                  size="lg"
                  variant="primary"
                  onPress={generatePremiumLicense}
                  isDisabled={isPremiumLoading || isPremiumStatusLoading || !isSessionReady}
                  className="font-minecraft-text relative h-12 w-full whitespace-nowrap overflow-hidden rounded-lg border-b-4 border-[#581c87] bg-[#6d28d9] px-2 text-xs font-bold text-white shadow-[0_5px_24px_rgba(147,51,234,0.38)] hover:bg-[#7c3aed] sm:px-4 sm:text-sm"
                >
                  <motion.span
                    aria-hidden="true"
                    animate={prefersReducedMotion ? undefined : { opacity: [0.35, 0.7, 0.35] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(236,72,153,0.8),transparent_65%),linear-gradient(110deg,rgba(126,34,206,0.4),rgba(30,10,55,0.3),rgba(168,85,247,0.5))]"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-[27%] -top-8 h-16 rounded-full border border-fuchsia-200/55 shadow-[0_0_24px_rgba(217,70,239,0.85),inset_0_0_20px_rgba(168,85,247,0.55)]"
                  />
                  {[0, 1, 2, 3, 4, 5, 6].map((particle) => (
                    <motion.span
                      key={particle}
                      aria-hidden="true"
                      className={`pointer-events-none absolute z-10 ${particle % 3 === 0 ? "size-1.5 bg-fuchsia-100" : particle % 3 === 1 ? "size-1 bg-violet-200" : "size-1.5 bg-purple-300"} shadow-[2px_0_#c084fc,-2px_0_#7e22ce,0_2px_#9333ea]`}
                      style={{ left: `${8 + particle * 13}%`, top: particle % 2 ? "24%" : "68%" }}
                      animate={prefersReducedMotion ? undefined : {
                        y: [0, -5, -10, -15 - (particle % 2) * 5],
                        x: [0, particle % 2 ? 3 : -3, 0],
                        opacity: [0, 1, 0],
                      }}
                      transition={{
                        duration: 1.5 + particle * 0.12,
                        delay: particle * 0.2,
                        repeat: Infinity,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                  <TbSparkles className="relative z-20" size={19} aria-hidden="true" />
                  <span className="relative z-20">
                    {isPremiumLoading
                      ? "Abrindo portal..."
                      : !isSessionReady
                        ? "Aguarde..."
                        : isPremiumStatusLoading
                          ? "Verificando..."
                        : premiumLicense
                          ? "Ver key premium"
                          : "Gerar key premium"}
                  </span>
                </Button>
              </motion.div>
            </div>

            {license && (
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 border border-[#839d6b]/30 bg-[#0c130f] p-4"
              >
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-[#91ac7c]">
                  <span>Slot de inventário</span>
                  <span className="flex items-center gap-1 text-[#b9d59b]"><TbCheck size={13} /> obtido</span>
                </div>
                <code className="block break-all rounded bg-[#17231a] px-3 py-3 text-left text-sm font-semibold text-[#d9f2bd]">
                  {license}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={copyLicense}
                  className="mt-3 -ml-2 text-[#b9d59b] hover:bg-[#b9d59b]/10"
                >
                  <TbCopy size={15} aria-hidden="true" />
                  Copiar para o inventário
                </Button>
              </motion.div>
            )}

            {premiumMessage && (
              <div
                className="mt-5 border-l-2 border-fuchsia-400 bg-fuchsia-950/20 py-2 pl-3 text-sm text-fuchsia-100/85"
                role="status"
              >
                <p>{premiumMessage}</p>
              </div>
            )}

            {premiumLicense && isSessionReady && session && (
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative mt-4 overflow-hidden border border-fuchsia-400/25 bg-[#12091b] p-4 shadow-[0_0_32px_rgba(147,51,234,0.12)]"
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full border border-fuchsia-300/20 shadow-[0_0_35px_rgba(168,85,247,0.2)]"
                />
                <div className="relative mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-200/75">
                  <span className="font-minecraft-text">Portal Nether · Premium</span>
                  <span className="flex items-center gap-2 text-fuchsia-100">
                    <span className="flex items-center gap-1">
                      <TbCheck size={13} aria-hidden="true" />
                      Vinculada
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPremiumLicenseVisible((visible) => !visible)}
                      aria-label={isPremiumLicenseVisible ? "Ocultar key Premium" : "Mostrar key Premium"}
                      aria-pressed={isPremiumLicenseVisible}
                      title={isPremiumLicenseVisible ? "Ocultar key" : "Mostrar key"}
                      className="grid size-8 place-items-center rounded-md border border-fuchsia-200/15 text-fuchsia-100/75 transition-colors hover:bg-fuchsia-300/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fuchsia-200"
                    >
                      {isPremiumLicenseVisible ? <TbEyeOff size={16} aria-hidden="true" /> : <TbEye size={16} aria-hidden="true" />}
                    </button>
                  </span>
                </div>
                <code className="relative block break-all rounded bg-purple-950/55 px-3 py-3 text-left text-sm font-semibold text-fuchsia-100 ring-1 ring-fuchsia-300/10">
                  {isPremiumLicenseVisible ? premiumLicense : "••••••••••••••••••••••••••••••••"}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={copyPremiumLicense}
                  className="relative mt-3 -ml-2 text-fuchsia-200 hover:bg-fuchsia-300/10"
                >
                  <TbCopy size={15} aria-hidden="true" />
                  Copiar key premium
                </Button>
              </motion.div>
            )}

            {message && (
              <p className="mt-4 border-l-2 border-[#8bc34a] pl-3 text-sm text-[#c8d5bf]" role="status">
                {message}
              </p>
            )}
          </div>
        </div>
      </motion.section>
    </motion.section>
  );
}


export function AmbientMusic() {
  const prefersReducedMotion = useReducedMotion();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = 0.24;
    return () => audioRef.current?.pause();
  }, []);

  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
      setError("");
    } catch {
      setError("Não foi possível reproduzir a faixa neste navegador.");
    }
  }

  return (
    <>
      <audio
        ref={audioRef}
        src="/music/minecraft-noises.mp3"
        preload="none"
        loop
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setError("Não foi possível carregar a faixa de áudio.")}
      />

      <motion.aside
        initial={prefersReducedMotion ? false : { opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.35 }}
        className="fixed left-2 top-2 z-50 sm:hidden"
        aria-label="Música ambiente"
      >
        <Button
          isIconOnly
          size="md"
          variant="ghost"
          onPress={toggleMusic}
          aria-label={isPlaying ? "Pausar música ambiente" : "Tocar música ambiente"}
          className="size-11 min-w-11 rounded-xl border border-[#a6cf74]/25 bg-black/80 text-[#c6e5a7] shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-xl hover:border-[#a6cf74]/50 hover:bg-black"
        >
          {isPlaying ? <TbPlayerPause size={18} aria-hidden="true" /> : <TbPlayerPlay size={18} aria-hidden="true" />}
        </Button>
      </motion.aside>

      <motion.aside
        initial={prefersReducedMotion ? false : { opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
        className="fixed left-2 top-2 z-50 hidden sm:left-5 sm:top-5 sm:block"
        aria-label="Música ambiente"
      >
        <motion.div
          layout
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 420, damping: 34, mass: 0.8 }
          }
        >
          <AnimatePresence initial={false} mode="popLayout">
            {isMinimized ? (
              <motion.div
                key="compact"
                layout
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.78, x: -12 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.86, x: -8 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 460, damping: 30 }
                }
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/75 p-2 text-white shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-xl"
              >
                <motion.div
                  animate={isPlaying && !prefersReducedMotion ? { rotate: 360 } : { rotate: 0 }}
                  transition={isPlaying ? { duration: 8, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
                  className="grid size-9 place-items-center rounded-full border border-[#a6cf74]/30 bg-[#a6cf74]/10 text-[#c6e5a7]"
                  aria-hidden="true"
                >
                  <TbVinyl size={20} />
                </motion.div>
                <motion.div whileHover={prefersReducedMotion ? undefined : { scale: 1.06 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    onPress={() => setIsMinimized(false)}
                    aria-label="Restaurar controle de música"
                    className="size-11 min-w-11 rounded-lg border border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    <TbChevronDown size={18} aria-hidden="true" />
                  </Button>
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="expanded"
                layout
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.97, y: -4 }}
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 420, damping: 32 }
                }
                className="flex w-[min(20rem,calc(100vw-1rem))] items-center gap-2 rounded-xl border border-white/10 bg-black/70 px-2.5 py-2 text-white shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:gap-3 sm:px-3 sm:py-2.5"
              >
                <motion.div
                  animate={isPlaying && !prefersReducedMotion ? { rotate: 360 } : { rotate: 0 }}
                  transition={isPlaying ? { duration: 8, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
                  className="grid size-9 shrink-0 place-items-center rounded-full border border-[#a6cf74]/30 bg-[#a6cf74]/10 text-[#c6e5a7] sm:size-10"
                  aria-hidden="true"
                >
                  <TbVinyl size={20} />
                </motion.div>

                <motion.div
                  initial={prefersReducedMotion ? false : { opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: prefersReducedMotion ? 0 : 0.08, duration: prefersReducedMotion ? 0 : 0.2 }}
                  className="min-w-0 flex-1"
                >
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a6cf74]">
                    {isPlaying ? "Tocando agora" : "Faixa ambiente"}
                  </p>
                  <p className="truncate text-xs font-semibold text-white/90">
                    Green Overworld · Minecraft
                  </p>
                </motion.div>

                <motion.div whileHover={prefersReducedMotion ? undefined : { scale: 1.06 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    onPress={toggleMusic}
                    aria-label={isPlaying ? "Pausar música ambiente" : "Tocar música ambiente"}
                    className="size-11 min-w-11 shrink-0 rounded-lg border border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    {isPlaying ? <TbPlayerPause size={17} /> : <TbPlayerPlay size={17} />}
                  </Button>
                </motion.div>
                <motion.div whileHover={prefersReducedMotion ? undefined : { scale: 1.06 }} whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="ghost"
                    onPress={() => setIsMinimized(true)}
                    aria-label="Minimizar controle de música"
                    className="size-11 min-w-11 shrink-0 rounded-lg border border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    <TbChevronUp size={18} aria-hidden="true" />
                  </Button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        {!isMinimized && error && <p role="status" className="mt-1.5 pl-2 text-[11px] text-red-200">{error}</p>}
      </motion.aside>
    </>
  );
}
