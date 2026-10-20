import { cacheLife } from "next/cache";

export type PluginCatalogItem = {
  name: string;
  slug: string;
  platform: "PaperMC";
  latestVersion: string;
  releaseIndex: string;
};

export type PluginRelease = {
  minecraft: string;
  exampleMinecraft: string;
  pluginVersion: string;
  apiVersion: string;
  javaVersion: string;
  paperChannel: "STABLE" | "ALPHA" | "BETA";
  downloadUrl: string;
};

export type PluginReleaseList = {
  plugin: string;
  platform: "PaperMC";
  latestVersion: string;
  versions: PluginRelease[];
};

export function getApiUrl() {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    (process.env.NODE_ENV === "development" ? "http://localhost:3333" : "")
  ).replace(/\/$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parsePlugin(value: unknown): PluginCatalogItem | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.name !== "string" ||
    typeof value.slug !== "string" ||
    value.platform !== "PaperMC" ||
    typeof value.latestVersion !== "string" ||
    typeof value.releaseIndex !== "string"
  ) {
    return null;
  }

  return {
    name: value.name,
    slug: value.slug,
    platform: "PaperMC",
    latestVersion: value.latestVersion,
    releaseIndex: value.releaseIndex,
  };
}

function parseRelease(value: unknown, slug: string): PluginRelease | null {
  if (!isRecord(value)) return null;
  const channel = value.paperChannel;
  if (
    typeof value.minecraft !== "string" ||
    typeof value.exampleMinecraft !== "string" ||
    typeof value.pluginVersion !== "string" ||
    typeof value.apiVersion !== "string" ||
    typeof value.javaVersion !== "string" ||
    (channel !== "STABLE" && channel !== "ALPHA" && channel !== "BETA") ||
    typeof value.downloadUrl !== "string" ||
    !value.downloadUrl.startsWith(`/plugins/${slug}/download?`)
  ) {
    return null;
  }

  return {
    minecraft: value.minecraft,
    exampleMinecraft: value.exampleMinecraft,
    pluginVersion: value.pluginVersion,
    apiVersion: value.apiVersion,
    javaVersion: value.javaVersion,
    paperChannel: channel,
    downloadUrl: value.downloadUrl,
  };
}

async function fetchApiJson(
  apiUrl: string,
  path: string,
): Promise<unknown | null> {
  "use cache";
  cacheLife("hours");
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function getPlugins(): Promise<PluginCatalogItem[]> {
  const apiUrl = getApiUrl();
  if (!apiUrl) return [];
  const payload = await fetchApiJson(apiUrl, "/plugins");
  if (!isRecord(payload) || !Array.isArray(payload.plugins)) return [];
  return payload.plugins.flatMap((item) => {
    const plugin = parsePlugin(item);
    return plugin ? [plugin] : [];
  });
}

export async function getPlugin(
  slug: string,
): Promise<PluginCatalogItem | null> {
  const normalizedSlug = slug.toLowerCase();
  const plugins = await getPlugins();
  return plugins.find((plugin) => plugin.slug === normalizedSlug) ?? null;
}

export async function getPluginReleases(
  slug: string,
): Promise<PluginReleaseList | null> {
  const apiUrl = getApiUrl();
  if (!apiUrl) return null;
  const payload = await fetchApiJson(
    apiUrl,
    `/plugins/${encodeURIComponent(slug)}/versions`,
  );
  if (
    !isRecord(payload) ||
    typeof payload.plugin !== "string" ||
    payload.platform !== "PaperMC" ||
    typeof payload.latestVersion !== "string" ||
    !Array.isArray(payload.versions)
  ) {
    return null;
  }

  const versions = payload.versions.flatMap((item) => {
    const release = parseRelease(item, slug);
    return release ? [release] : [];
  });

  return {
    plugin: payload.plugin,
    platform: "PaperMC",
    latestVersion: payload.latestVersion,
    versions,
  };
}
