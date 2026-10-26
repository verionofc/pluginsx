"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TbArrowLeft, TbBlocks, TbPick } from "react-icons/tb";

export function NotFoundPage() {
  const pathname = usePathname();

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-3 py-8 pb-28 text-white sm:px-5 sm:py-12 sm:pb-12">
      <motion.section
        aria-labelledby="not-found-title"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-xl border-2 border-outline/35 bg-surface/95 p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8 lg:p-10"
      >
        <div className="mx-auto grid size-16 place-items-center border-2 border-outline-strong/60 bg-surface-raised text-accent-soft shadow-[inset_0_0_0_4px_rgba(0,0,0,0.18)]">
          <TbBlocks size={34} aria-hidden="true" />
        </div>

        <p className="font-minecraft-text mt-6 text-xs font-bold uppercase tracking-[0.24em] text-accent">
          Bioma desconhecido
        </p>
        <h1
          id="not-found-title"
          className="font-minecraft-text mt-3 text-2xl font-black leading-tight text-foreground sm:text-3xl"
        >
          Página não encontrada
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">
          O endereço não corresponde a uma página disponível.
        </p>

        <div className="mx-auto mt-6 max-w-full border border-outline/30 bg-surface-deep px-4 py-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Coordenadas
          </p>
          <code className="block break-all text-sm text-accent-soft">
            {pathname}
          </code>
        </div>

        <Link
          href="/"
          className="font-minecraft-text mt-7 inline-flex min-h-12 max-w-full items-center justify-center gap-2 border-b-4 border-accent-edge bg-accent-strong px-4 py-3 text-xs sm:px-5 font-bold text-white transition sm:text-sm hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-outline-strong"
        >
          <TbArrowLeft size={18} aria-hidden="true" />
          <TbPick size={18} aria-hidden="true" />
          Voltar ao início
        </Link>
      </motion.section>
    </main>
  );
}
