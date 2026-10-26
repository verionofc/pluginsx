export const siteThemes = [
  {
    id: "default",
    name: "Padrão",
    world: "Overworld",
    description: "Floresta noturna, terra e tons de esmeralda.",
  },
  {
    id: "the-end",
    name: "The End",
    world: "O vazio",
    description: "Obsidiana, ilhas suspensas e ametista.",
  },
  {
    id: "aether",
    name: "Aether",
    world: "Acima das nuvens",
    description: "Horizonte azul, ilhas celestes e detalhes dourados.",
  },
] as const;

export type SiteTheme = (typeof siteThemes)[number]["id"];
export type SceneMotion = "auto" | "off";
export type SiteAppearance = {
  theme: SiteTheme;
  motion: SceneMotion;
};

export const appearanceStorageKey = "pluginsx:appearance:v3";
export const appearanceChangeEvent = "pluginsx:appearance-change";
export const defaultAppearance: SiteAppearance = {
  theme: "default",
  motion: "auto",
};

export function isSiteTheme(value: unknown): value is SiteTheme {
  return siteThemes.some((theme) => theme.id === value);
}

export function parseAppearance(value: string | null): SiteAppearance {
  if (!value) return { ...defaultAppearance };
  try {
    const saved: unknown = JSON.parse(value);
    if (
      !saved ||
      typeof saved !== "object" ||
      !("version" in saved) ||
      saved.version !== 3
    ) {
      return { ...defaultAppearance };
    }
    return {
      theme:
        "theme" in saved && isSiteTheme(saved.theme) ? saved.theme : "default",
      motion: "motion" in saved && saved.motion === "off" ? "off" : "auto",
    };
  } catch {
    return { ...defaultAppearance };
  }
}

/** Executado no head antes da pintura; só valores conhecidos chegam aos atributos. */
export const appearanceBootstrap = `(()=>{const root=document.documentElement;let theme="default",motion="auto";try{const raw=localStorage.getItem(${JSON.stringify(appearanceStorageKey)});if(raw){const saved=JSON.parse(raw);if(saved&&saved.version===3){if(${JSON.stringify(siteThemes.map((theme) => theme.id))}.includes(saved.theme))theme=saved.theme;if(saved.motion==="off")motion="off";}}else{const legacy=localStorage.getItem("pluginsx:site-theme:v2");if(${JSON.stringify(siteThemes.map((theme) => theme.id))}.includes(legacy))theme=legacy;}}catch{}root.dataset.siteTheme=theme;root.dataset.sceneMotion=motion;})()`;
