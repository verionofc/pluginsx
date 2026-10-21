import Image from "next/image";
import Link from "next/link";
import { TbArrowUpRight, TbBrandGithub } from "react-icons/tb";

import { settings } from "@/lib";
import { Icon } from "@/widgets/Icon";
import { Theme } from "@/widgets/switcher/theme";

export function MiniFooter() {
  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-3 z-50 px-3">
      <div className="pointer-events-auto mx-auto flex h-14 w-full max-w-4xl items-center justify-between rounded-xl border border-white/10 bg-[#080b09]/85 px-3 shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:px-5">
        <Icon isOpen />

        <div className="hidden items-center gap-2 text-[11px] text-white/45 sm:flex">
          <span className="size-1.5 bg-[#769a50]" />
          <span>PaperMC</span>
          <span className="text-white/20">·</span>
          <span>v{settings.version}</span>
        </div>

        <a
          href={settings.links.pluginsx.github}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-white/75 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
          aria-label="Abrir PluginsX no GitHub"
        >
          <TbBrandGithub size={16} aria-hidden="true" />
          <span>GitHub</span>
          <TbArrowUpRight size={13} aria-hidden="true" className="text-white/45" />
        </a>
      </div>
    </footer>
  );
}
