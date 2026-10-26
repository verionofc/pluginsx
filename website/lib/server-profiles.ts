export const serverIcons = [
  { id: "grass", label: "Grama" },
  { id: "chest", label: "Baú" },
  { id: "diamond", label: "Diamante" },
  { id: "redstone", label: "Redstone" },
  { id: "crafting", label: "Bancada" },
  { id: "sword", label: "Espada" },
  { id: "beacon", label: "Beacon" },
  { id: "portal", label: "Portal" },
] as const;
export type ServerIconId = (typeof serverIcons)[number]["id"];
export type ServerProfileFields = {
  displayName?: string;
  tags?: string[];
  icon?: ServerIconId;
  pinned?: boolean;
};
export type ServerProfilePatch = Partial<ServerProfileFields>;
export function isServerIcon(value: unknown): value is ServerIconId {
  return serverIcons.some((icon) => icon.id === value);
}
export function serverDisplayName(server: {
  name: string;
  displayName?: string;
}) {
  return server.displayName?.trim() || server.name;
}
export function orderServers<T extends { state: string; pinned?: boolean }>(
  servers: T[],
): T[] {
  return [...servers].sort(
    (a, b) =>
      Number(b.state === "ACTIVE" && Boolean(b.pinned)) -
      Number(a.state === "ACTIVE" && Boolean(a.pinned)),
  );
}

export function normalizeServerTags(value: string): string[] {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
