"use client";

import { useSyncExternalStore } from "react";
import {
  appearanceChangeEvent,
  appearanceStorageKey,
  isSiteTheme,
  parseAppearance,
  type SceneMotion,
  type SiteAppearance,
  type SiteTheme,
} from "@/lib/site-themes";

function readAppearance(): SiteAppearance {
  const { siteTheme, sceneMotion } = document.documentElement.dataset;
  return {
    theme: isSiteTheme(siteTheme) ? siteTheme : "default",
    motion: sceneMotion === "off" ? "off" : "auto",
  };
}

function applyAppearance(appearance: SiteAppearance) {
  document.documentElement.dataset.siteTheme = appearance.theme;
  document.documentElement.dataset.sceneMotion = appearance.motion;
}

function subscribe(onChange: () => void) {
  function syncStorage(event: StorageEvent) {
    if (event.storageArea !== window.localStorage) return;
    if (event.key !== appearanceStorageKey && event.key !== null) return;
    applyAppearance(parseAppearance(event.newValue));
    onChange();
  }

  window.addEventListener(appearanceChangeEvent, onChange);
  window.addEventListener("storage", syncStorage);
  return () => {
    window.removeEventListener(appearanceChangeEvent, onChange);
    window.removeEventListener("storage", syncStorage);
  };
}

function getSnapshot() {
  const appearance = readAppearance();
  return `${appearance.theme}:${appearance.motion}`;
}

function getServerSnapshot() {
  return "default:auto";
}

function saveAppearance(update: Partial<SiteAppearance>) {
  const appearance = { ...readAppearance(), ...update };
  applyAppearance(appearance);
  try {
    window.localStorage.setItem(
      appearanceStorageKey,
      JSON.stringify({ version: 3, ...appearance }),
    );
  } catch {
    // A preferência continua aplicada quando o armazenamento está indisponível.
  }
  window.dispatchEvent(new Event(appearanceChangeEvent));
}

function setTheme(theme: SiteTheme) {
  saveAppearance({ theme });
}

function setMotion(motion: SceneMotion) {
  saveAppearance({ motion });
}

export function useSiteAppearance() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [theme, motion] = snapshot.split(":") as [SiteTheme, SceneMotion];
  return { theme, motion, setTheme, setMotion };
}
