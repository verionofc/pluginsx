"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TbAlertTriangle, TbArrowLeft } from "react-icons/tb";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <section className="w-full px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-6xl items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.2, 0.9, 0.2, 1] }}
          className="w-full max-w-2xl rounded-3xl border border-foreground/10 bg-background/45 p-6 text-center shadow-sm backdrop-blur-md sm:p-8"
        >
          <span className="mx-auto inline-flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <TbAlertTriangle size={34} aria-hidden />
          </span>

          <p className="mt-6 text-sm font-medium uppercase tracking-[0.22em] text-foreground/55">
            Erro 404
          </p>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Página não encontrada
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-foreground/75 sm:text-base">
            O caminho solicitado não existe:
          </p>

          <code className="mt-3 inline-block max-w-full rounded-xl border border-foreground/15 bg-background/70 px-4 py-2 text-sm text-foreground/80">
            {pathname}
          </code>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:border-primary/45 hover:bg-primary/15"
            >
              <TbArrowLeft size={16} aria-hidden />
              Voltar para início
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
