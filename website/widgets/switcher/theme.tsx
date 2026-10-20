"use client";

import { Button } from "@heroui/react";
import { clsx } from "clsx";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { MdDarkMode, MdLightMode } from "react-icons/md";

const themes = [
  { key: "light", icon: MdLightMode },
  { key: "dark", icon: MdDarkMode },
] as const;

export function Theme() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const active =
    resolvedTheme === "light" || resolvedTheme === "dark"
      ? resolvedTheme
      : "light";

  if (!mounted) return null;

  return (
    <fieldset
      className={clsx(
        "inline-flex items-center rounded-xl relative",
        "border border-default-200/30",
        "bg-background/0 backdrop-blur-xl",
        "p-1 gap-1",
      )}
    >
      <legend className="sr-only">Selecionar tema</legend>
      {themes.map(({ key, icon: Icon }) => (
        <Button
          key={key}
          isIconOnly
          size="sm"
          variant="ghost"
          onPress={() => setTheme(key)}
          aria-pressed={key === active}
          aria-label={`Ativar tema ${key === "light" ? "claro" : "escuro"}`}
          className={clsx(
            "rounded-xl border transition-colors hover:bg-transparent",
            key === active
              ? "border-border bg-background text-foreground shadow-sm"
              : "border-transparent text-foreground/60 hover:border-border/50 hover:text-foreground",
          )}
        >
          <Icon size={16} />
        </Button>
      ))}
    </fieldset>
  );
}
