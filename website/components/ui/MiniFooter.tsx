"use client";

import Link from "next/link";
import {
  TbArrowUpRight,
  TbBlocks,
  TbBrandGithub,
  TbShoppingCart,
} from "react-icons/tb";
import { useCart } from "@/components/cart/CartProvider";
import { SiteAppearanceDialog } from "@/components/theme/SiteAppearanceDialog";
import { settings } from "@/lib";

export function MiniFooter() {
  const { itemCount } = useCart();

  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-50 px-2 sm:px-3">
      <div className="pointer-events-auto relative mx-auto flex h-[58px] w-full max-w-5xl items-center justify-between gap-2 border border-outline bg-canvas/95 px-2.5 pt-0.5 shadow-[0_12px_42px_rgba(0,0,0,0.7)] backdrop-blur-xl sm:h-16 sm:px-5">
        <div
          aria-hidden="true"
          className="absolute inset-x-3 top-0 flex h-[2px] gap-1"
        >
          <span className="w-10 bg-accent" />
          <span className="w-5 bg-accent-strong" />
          <span className="w-2 bg-accent-soft" />
          <span className="flex-1 bg-white/[0.04]" />
          <span className="w-8 bg-disabled" />
        </div>

        <Link
          href="/"
          aria-label="PluginsX, voltar ao início"
          className="flex min-w-0 shrink items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong"
        >
          <span className="grid size-8 shrink-0 place-items-center border border-outline/70 bg-surface-raised text-accent-soft shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)] sm:size-9">
            <TbBlocks size={19} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="font-minecraft-text block truncate text-[15px] font-black leading-tight tracking-[-0.06em] text-white sm:text-base">
              Plugins<span className="text-accent">X</span>
            </span>
            <span className="hidden text-[8px] font-bold uppercase tracking-[0.16em] text-white/40 min-[360px]:block sm:text-[9px]">
              Catálogo de plugins
            </span>
          </span>
        </Link>

        <div className="hidden min-w-0 items-center gap-2 border-l border-white/10 pl-4 text-[10px] text-white/40 md:flex">
          <span className="size-1.5 shrink-0 bg-accent" aria-hidden="true" />
          <span className="truncate">feito por</span>
          <Link
            href={settings.links.github}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-white/65 underline decoration-white/20 underline-offset-2 hover:text-white"
          >
            {settings.author}
          </Link>
          <span className="shrink-0 text-white/20">/</span>
          <span className="shrink-0">v{settings.version}</span>
        </div>

        <nav
          aria-label="Navegação do site"
          className="flex shrink-0 items-center gap-1.5 sm:gap-2"
        >
          <SiteAppearanceDialog />
          <Link
            href="/cart"
            aria-label={`Abrir carrinho, ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 border border-outline-strong/45 bg-surface-raised px-2 text-xs font-semibold text-accent-soft transition-colors hover:border-outline-strong hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-outline-strong sm:h-10 sm:px-3"
          >
            <TbShoppingCart size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Carrinho</span>
            <span className="grid min-w-5 place-items-center border border-outline-strong/30 bg-accent px-1 py-0.5 text-[10px] font-bold leading-none text-on-accent">
              {itemCount}
            </span>
          </Link>

          <a
            href={settings.links.pluginsx.github}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex size-10 shrink-0 items-center justify-center gap-1.5 border border-white/15 bg-white/[0.025] px-2 text-xs font-semibold text-white/75 transition-colors hover:border-white/30 hover:bg-white/[0.07] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto sm:px-3"
            aria-label="Abrir PluginsX no GitHub"
            title="PluginsX no GitHub"
          >
            <TbBrandGithub size={16} aria-hidden="true" />
            <span className="hidden sm:inline">GitHub</span>
            <TbArrowUpRight
              size={13}
              aria-hidden="true"
              className="hidden text-white/45 sm:block"
            />
          </a>
        </nav>
      </div>
    </footer>
  );
}
