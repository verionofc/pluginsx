export type MobHeadEntry = {
  id: string;
  name: string;
  /** MC-Heads accepts these stable vanilla head usernames as identifiers. */
  source: string;
  supportedVersions?: string[];
};

const entries: MobHeadEntry[] = [
  ["zombie", "Zombie", "MHF_Zombie"],
  ["skeleton", "Skeleton", "MHF_Skeleton"],
  ["creeper", "Creeper", "MHF_Creeper"],
  ["enderman", "Enderman", "MHF_Enderman"],
  ["spider", "Spider", "MHF_Spider"],
  ["wither_skeleton", "Wither Skeleton", "MHF_Wither"],
  ["blaze", "Blaze", "MHF_Blaze"],
  ["magma_cube", "Magma Cube", "MHF_MagmaCube"],
  ["slime", "Slime", "MHF_Slime"],
  ["pig", "Pig", "MHF_Pig"],
  ["cow", "Cow", "MHF_Cow"],
  ["chicken", "Chicken", "MHF_Chicken"],
  ["sheep", "Sheep", "MHF_Sheep"],
  ["villager", "Villager", "MHF_Villager"],
  ["iron_golem", "Iron Golem", "MHF_Golem"],
  ["witch", "Witch", "MHF_Witch"],
  ["ghast", "Ghast", "MHF_Ghast"],
  ["guardian", "Guardian", "MHF_Guardian"],
  ["elder_guardian", "Elder Guardian", "MHF_Guardian"],
  ["endermite", "Endermite", "MHF_Endermite"],
  ["silverfish", "Silverfish", "MHF_Silverfish"],
  ["wither", "Wither", "MHF_Wither"],
  ["ender_dragon", "Ender Dragon", "MHF_EnderDragon"],
  ["snow_golem", "Snow Golem", "MHF_SnowGolem"],
  ["rabbit", "Rabbit", "MHF_Rabbit"],
  ["fox", "Fox", "MHF_Fox"],
  ["wolf", "Wolf", "MHF_Wolf"],
  ["cat", "Cat", "MHF_Cat"],
  ["horse", "Horse", "MHF_Horse"],
  ["drowned", "Drowned", "MHF_Drowned"],
  ["husk", "Husk", "MHF_Husk"],
  ["stray", "Stray", "MHF_Stray"],
  ["pillager", "Pillager", "MHF_Pillager"],
  ["piglin", "Piglin", "MHF_Piglin"],
  ["hoglin", "Hoglin", "MHF_Hoglin"],
  ["shulker", "Shulker", "MHF_Shulker"],
  ["phantom", "Phantom", "MHF_Phantom"],
  ["allay", "Allay", "MHF_Allay"],
  ["warden", "Warden", "MHF_Warden"],
].map(([id, name, source]) => ({ id, name, source }));

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
  return entry
    ? `https://mc-heads.net/avatar/${encodeURIComponent(entry.source)}/${size}/nohelm.png`
    : null;
}
