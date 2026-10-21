"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { IconType } from "react-icons";
import { TbHome } from "react-icons/tb";

import { settings } from "@/lib";
import { Icon } from "@/widgets/Icon";

type FooterItem = {
  icon: IconType;
  label: string;
  href: string;
};

const footerItems: FooterItem[] = [
  { icon: TbHome, label: "Início", href: "/" },
];

export function Footer() {
  const pathname = usePathname();
  const [year, setYear] = useState<number>();

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="w-full border-t border-foreground/10 bg-background/55 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Icon isOpen />
            <p className="pt-2 text-xs text-foreground/60">
              Plugins e ferramentas do projeto.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-foreground/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {footerItems.map((item) => {
              const ItemIcon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={clsx(
                      "inline-flex items-center gap-1.5 text-xs transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-foreground/70 hover:text-foreground",
                    )}
                  >
                    <ItemIcon size={14} aria-hidden />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <p className="text-[11px] text-foreground/55">
            © {year ?? ""} {settings.author} · v{settings.version}
          </p>
        </div>
      </div>
    </footer>
  );
}
