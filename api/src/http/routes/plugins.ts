import { Elysia } from "elysia";
import { z } from "zod";

const RELEASES_BASE_URL =
  "https://raw.githubusercontent.com/verionofc/pluginsx/main/builds";
const CATALOG_URL = `${RELEASES_BASE_URL}/releases.json`;
const CACHE_TTL_MS = 5 * 60_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;

const pluginSchema = z.object({
  name: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  platform: z.literal("PaperMC"),
  latestVersion: z.string().min(1),
  releaseIndex: z.string().min(1),
});

const catalogSchema = z.object({
  schemaVersion: z.literal(1),
  plugins: z.array(pluginSchema),
});

const releaseSchema = z.object({
  minecraft: z.string().min(1),
  exampleMinecraft: z.string().min(1),
  pluginVersion: z.string().min(1),
  apiVersion: z.string().min(1),
  javaVersion: z.string().min(1),
  paperChannel: z.enum(["STABLE", "ALPHA", "BETA"]),
  fileName: z.string().min(1),
  repositoryPath: z.string().min(1),
});

const releaseIndexSchema = z.object({
  plugin: z.string().min(1),
  platform: z.literal("PaperMC"),
  latestVersion: z.string().min(1),
  versions: z.array(releaseSchema).min(1),
});

type Plugin = z.infer<typeof pluginSchema>;
type Catalog = z.infer<typeof catalogSchema>;
type Release = z.infer<typeof releaseSchema>;
type ReleaseIndex = z.infer<typeof releaseIndexSchema>;
type Cached<T> = { expiresAt: number; value: T };

let catalogCache: Cached<Catalog> | undefined;
let catalogRequest: Promise<Catalog | undefined> | undefined;
const releaseIndexCache = new Map<string, Cached<ReleaseIndex>>();
const releaseIndexRequests = new Map<string, Promise<ReleaseIndex | undefined>>();

const fetchJson = async (url: string): Promise<unknown | undefined> => {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "PluginsX-API" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
};

const getCatalog = async (): Promise<Catalog | undefined> => {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;
  if (catalogRequest) return catalogRequest;

  catalogRequest = (async () => {
    try {
      const parsed = catalogSchema.safeParse(await fetchJson(CATALOG_URL));
      if (!parsed.success) return catalogCache?.value;

      const slugs = parsed.data.plugins.map((plugin) => plugin.slug);
      const duplicateSlugs = new Set(slugs).size !== slugs.length;
      const unsafeEntries = parsed.data.plugins.some(
        (plugin) =>
          plugin.slug !== slugify(plugin.name) ||
          plugin.releaseIndex !== `${plugin.name}/releases.json` ||
          !/^[A-Za-z0-9._+-]+$/.test(plugin.name),
      );
      if (duplicateSlugs || unsafeEntries) return catalogCache?.value;

      catalogCache = { value: parsed.data, expiresAt: Date.now() + CACHE_TTL_MS };
      return parsed.data;
    } finally {
      catalogRequest = undefined;
    }
  })();

  return catalogRequest;
};

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const getPlugin = async (slug: string) => {
  const catalog = await getCatalog();
  if (!catalog) return { error: "catalog" as const };
  const plugin = catalog.plugins.find((item) => item.slug === slug.toLowerCase());
  return plugin ? { plugin } : { error: "plugin" as const };
};

const isSafeRelease = (plugin: Plugin, release: Release) => {
  const pathParts = release.repositoryPath.split("/");
  const validParts = pathParts.every(
    (part) => /^[A-Za-z0-9._+-]+$/.test(part) && part !== "." && part !== "..",
  );

  return (
    pathParts.length === 4 &&
    validParts &&
    release.fileName === `${plugin.name}-${release.pluginVersion}+mc${release.minecraft}.jar` &&
    pathParts[0] === plugin.name &&
    pathParts[1] === release.pluginVersion &&
    pathParts[2] === release.minecraft &&
    pathParts[3] === release.fileName
  );
};

const getPluginReleaseIndex = async (plugin: Plugin): Promise<ReleaseIndex | undefined> => {
  const cached = releaseIndexCache.get(plugin.slug);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = releaseIndexRequests.get(plugin.slug);
  if (pending) return pending;

  const request = (async () => {
    try {
      const path = plugin.releaseIndex.split("/").map(encodeURIComponent).join("/");
      const parsed = releaseIndexSchema.safeParse(
        await fetchJson(`${RELEASES_BASE_URL}/${path}`),
      );
      if (
        !parsed.success ||
        parsed.data.plugin !== plugin.name ||
        parsed.data.platform !== plugin.platform ||
        parsed.data.latestVersion !== plugin.latestVersion
      ) {
        return cached?.value;
      }

      const releases = parsed.data.versions;
      const keys = releases.map((release) => `${release.pluginVersion}/${release.minecraft}`);
      if (
        new Set(keys).size !== keys.length ||
        releases.some((release) => !isSafeRelease(plugin, release))
      ) {
        return cached?.value;
      }

      releaseIndexCache.set(plugin.slug, {
        value: parsed.data,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return parsed.data;
    } finally {
      releaseIndexRequests.delete(plugin.slug);
    }
  })();

  releaseIndexRequests.set(plugin.slug, request);
  return request;
};

const searchQuery = z.object({
  minecraft: z.string().trim().min(1).optional(),
  pluginVersion: z.string().trim().min(1).optional(),
  java: z.string().trim().regex(/^\d+\+?$/).optional(),
  paperChannel: z.enum(["STABLE", "ALPHA", "BETA"]).optional(),
  q: z.string().trim().max(80).optional(),
  platform: z.string().trim().default("paper"),
});

const downloadQuery = z.object({
  minecraft: z.string().trim().min(1),
  pluginVersion: z.string().trim().min(1).optional(),
  platform: z.string().trim().default("paper"),
});

const errorSchema = z.object({
  message: z.string(),
  supportedMinecraftVersions: z.array(z.string()).optional(),
});

const releaseResponseSchema = z.object({
  minecraft: z.string(),
  exampleMinecraft: z.string(),
  pluginVersion: z.string(),
  apiVersion: z.string(),
  javaVersion: z.string(),
  paperChannel: z.enum(["STABLE", "ALPHA", "BETA"]),
  downloadUrl: z.string(),
});

const downloadUrlFor = (plugin: Plugin, release: Release) => {
  const query = new URLSearchParams({ minecraft: release.minecraft, platform: "paper" });
  query.set("pluginVersion", release.pluginVersion);
  return `/plugins/${plugin.slug}/download?${query.toString()}`;
};

const findRelease = (releases: Release[], minecraft: string, pluginVersion?: string) =>
  releases.find(
    (release) =>
      release.minecraft === minecraft &&
      (!pluginVersion || release.pluginVersion === pluginVersion),
  );

const searchReleases = (plugin: Plugin, releases: Release[], query: z.infer<typeof searchQuery>) => {
  const searchText = query.q?.toLowerCase();
  const java = query.java?.replace(/\+$/, "");

  return releases.filter((release) => {
    if (query.minecraft && release.minecraft !== query.minecraft) return false;
    if (query.pluginVersion && release.pluginVersion !== query.pluginVersion) return false;
    if (query.paperChannel && release.paperChannel !== query.paperChannel) return false;
    if (java && release.javaVersion.replace(/\+$/, "") !== java) return false;
    if (
      searchText &&
      ![
        plugin.name,
        release.minecraft,
        release.exampleMinecraft,
        release.pluginVersion,
        release.apiVersion,
        release.javaVersion,
        release.paperChannel,
      ].some((value) => value.toLowerCase().includes(searchText))
    ) {
      return false;
    }
    return true;
  });
};

const toReleaseResponse = (plugin: Plugin, release: Release) => ({
  minecraft: release.minecraft,
  exampleMinecraft: release.exampleMinecraft,
  pluginVersion: release.pluginVersion,
  apiVersion: release.apiVersion,
  javaVersion: release.javaVersion,
  paperChannel: release.paperChannel,
  downloadUrl: downloadUrlFor(plugin, release),
});

const encodeRepositoryPath = (repositoryPath: string) =>
  repositoryPath.split("/").map(encodeURIComponent).join("/");

export const pluginRoutes = new Elysia({ prefix: "/plugins" })
  .get(
    "/",
    async ({ status }) => {
      const catalog = await getCatalog();
      if (!catalog) return status(503, { message: "plugin catalog is temporarily unavailable" });
      return { plugins: catalog.plugins };
    },
    {
      detail: {
        summary: "List available PaperMC plugins",
        description: "Lista plugins e índices de release publicados no catálogo do PluginsX.",
        tags: ["Plugins"],
      },
      response: {
        200: z.object({ plugins: z.array(pluginSchema) }),
        503: errorSchema,
      },
    },
  )
  .get(
    "/:plugin/versions",
    async ({ params, query, status }) => {
      if (query.platform.toLowerCase() !== "paper") {
        return status(400, { message: "this API supports PaperMC only" });
      }

      const lookup = await getPlugin(params.plugin);
      if ("error" in lookup) {
        return lookup.error === "plugin"
          ? status(404, { message: "plugin not found" })
          : status(503, { message: "plugin catalog is temporarily unavailable" });
      }

      const { plugin } = lookup;
      const releaseIndex = await getPluginReleaseIndex(plugin);
      if (!releaseIndex) {
        return status(503, { message: "plugin release index is temporarily unavailable" });
      }

      const matches = searchReleases(plugin, releaseIndex.versions, query);
      if (query.minecraft && !matches.length) {
        return status(404, {
          message: `no ${plugin.name} release is available for the selected filters`,
          supportedMinecraftVersions: releaseIndex.versions.map((release) => release.minecraft),
        });
      }

      if (
        query.minecraft &&
        !query.pluginVersion &&
        !query.java &&
        !query.paperChannel &&
        !query.q
      ) {
        const release =
          matches.find((item) => item.pluginVersion === releaseIndex.latestVersion) ?? matches[0];
        if (!release) return status(404, { message: "plugin release not found" });
        return {
          plugin: plugin.name,
          platform: plugin.platform,
          latestVersion: releaseIndex.latestVersion,
          requestedMinecraft: query.minecraft,
          ...toReleaseResponse(plugin, release),
        };
      }

      return {
        plugin: plugin.name,
        platform: plugin.platform,
        latestVersion: releaseIndex.latestVersion,
        total: matches.length,
        versions: matches.map((release) => toReleaseResponse(plugin, release)),
      };
    },
    {
      params: z.object({ plugin: z.string().min(1) }),
      query: searchQuery,
      detail: {
        summary: "Search plugin releases for PaperMC",
        description:
          "Lista e filtra releases por Minecraft, versão do plugin, Java e canal PaperMC. Esta API oferece suporte exclusivamente a PaperMC.",
        tags: ["Plugins"],
      },
      response: {
        200: z.object({
          plugin: z.string(),
          platform: z.literal("PaperMC"),
          latestVersion: z.string(),
          total: z.number().optional(),
          versions: z.array(releaseResponseSchema).optional(),
          minecraft: z.string().optional(),
          exampleMinecraft: z.string().optional(),
          requestedMinecraft: z.string().optional(),
          pluginVersion: z.string().optional(),
          apiVersion: z.string().optional(),
          javaVersion: z.string().optional(),
          paperChannel: z.enum(["STABLE", "ALPHA", "BETA"]).optional(),
          downloadUrl: z.string().optional(),
        }),
        400: errorSchema,
        404: errorSchema,
        503: errorSchema,
      },
    },
  )
  .get(
    "/:plugin/download",
    async ({ params, query, status }) => {
      if (query.platform.toLowerCase() !== "paper") {
        return status(400, { message: "this API supports PaperMC only" });
      }

      const lookup = await getPlugin(params.plugin);
      if ("error" in lookup) {
        return lookup.error === "plugin"
          ? status(404, { message: "plugin not found" })
          : status(503, { message: "plugin catalog is temporarily unavailable" });
      }

      const { plugin } = lookup;
      const releaseIndex = await getPluginReleaseIndex(plugin);
      if (!releaseIndex) {
        return status(503, { message: "plugin release index is temporarily unavailable" });
      }

      const release = findRelease(releaseIndex.versions, query.minecraft, query.pluginVersion);
      if (!release) {
        return status(404, {
          message: `no ${plugin.name} release is available for the selected Minecraft and plugin versions`,
          supportedMinecraftVersions: releaseIndex.versions.map((item) => item.minecraft),
        });
      }

      let artifact: Response;
      try {
        artifact = await fetch(
          `${RELEASES_BASE_URL}/${encodeRepositoryPath(release.repositoryPath)}`,
          {
            headers: { Accept: "application/octet-stream", "User-Agent": "PluginsX-API" },
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
          },
        );
      } catch {
        return status(503, { message: "plugin artifact is temporarily unavailable" });
      }

      if (!artifact.ok || !artifact.body) {
        return status(503, { message: "plugin artifact is temporarily unavailable" });
      }

      const headers = new Headers({
        "Content-Type": "application/java-archive",
        "Content-Disposition": `attachment; filename="${release.fileName}"`,
        "Cache-Control": "public, max-age=3600",
        "X-Plugin-Name": plugin.name,
        "X-Plugin-Version": release.pluginVersion,
        "X-Minecraft-Version": release.minecraft,
        "X-Server-Platform": plugin.platform,
        "X-Java-Version": release.javaVersion,
        "X-Paper-Channel": release.paperChannel,
      });
      const contentLength = artifact.headers.get("content-length");
      if (contentLength) headers.set("Content-Length", contentLength);

      return new Response(artifact.body, { headers });
    },
    {
      params: z.object({ plugin: z.string().min(1) }),
      query: downloadQuery,
      detail: {
        summary: "Download a PaperMC-compatible plugin release",
        description:
          "Seleciona o JAR publicado para uma versão Minecraft e, opcionalmente, uma versão do plugin. Somente PaperMC é suportado.",
        tags: ["Plugins"],
      },
      response: {
        200: z.any(),
        400: errorSchema,
        404: errorSchema,
        503: errorSchema,
      },
    },
  );
