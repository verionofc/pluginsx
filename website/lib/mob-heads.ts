export type MobHeadEntry = {
  id: string;
  name: string;
  /** A verified MC-Heads identifier. Unsupported mobs intentionally stay empty. */
  source?: string;
  verified: boolean;
};

const entries: MobHeadEntry[] = [
  ["zombie", "Zombie", "MHF_Zombie"],
  ["skeleton", "Skeleton", "MHF_Skeleton"],
  ["creeper", "Creeper", "MHF_Creeper"],
  ["enderman", "Enderman", "MHF_Enderman"],
  ["spider", "Spider", "MHF_Spider"],
  ["wither_skeleton", "Wither Skeleton", "MHF_WSkeleton"],
  ["blaze", "Blaze", "MHF_Blaze"],
  ["magma_cube", "Magma Cube", "MHF_LavaSlime"],
  ["slime", "Slime", "MHF_Slime"],
  ["pig", "Pig", "MHF_Pig"],
  ["cow", "Cow", "MHF_Cow"],
  ["chicken", "Chicken", "MHF_Chicken"],
  ["sheep", "Sheep", "MHF_Sheep"],
  ["villager", "Villager", "MHF_Villager"],
  ["iron_golem", "Iron Golem", "MHF_Golem"],
  ["witch", "Witch", "MHF_Witch"],
  ["ghast", "Ghast", "MHF_Ghast"],
  ["guardian", "Guardian"],
  ["elder_guardian", "Elder Guardian"],
  ["endermite", "Endermite"],
  ["silverfish", "Silverfish"],
  ["wither", "Wither", "MHF_Wither"],
  ["ender_dragon", "Ender Dragon"],
  ["snow_golem", "Snow Golem"],
  ["rabbit", "Rabbit"],
  ["fox", "Fox"],
  ["wolf", "Wolf", "MHF_Wolf"],
  ["cat", "Cat"],
  ["horse", "Horse"],
  ["drowned", "Drowned"],
  ["husk", "Husk"],
  ["stray", "Stray", "MHF_Stray"],
  ["pillager", "Pillager"],
  ["piglin", "Piglin"],
  ["hoglin", "Hoglin"],
  ["shulker", "Shulker", "MHF_Shulker"],
  ["phantom", "Phantom"],
  ["allay", "Allay"],
  ["warden", "Warden"],
].map(([id, name, source]) => ({
  id,
  name,
  ...(source ? { source, verified: true } : { verified: false }),
}));

export const mobHeadCatalog = Object.freeze(entries);
const byId = new Map(mobHeadCatalog.map((entry) => [entry.id, entry]));

export function normalizeMobId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^minecraft:/, "");
}

export function getMobHead(value: string) {
  return byId.get(normalizeMobId(value));
}

export function mobDisplayName(value: string) {
  return (
    getMobHead(value)?.name ??
    value
      .replace(/^minecraft:/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

export function mobHeadUrl(value: string, size = 128) {
  const entry = getMobHead(value);
  return entry?.verified && entry.source
    ? `https://mc-heads.net/avatar/${encodeURIComponent(entry.source)}/${size}/nohelm.png`
    : null;
}
