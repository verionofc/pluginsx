"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TbArrowLeft, TbBlocks, TbPick } from "react-icons/tb";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-3 py-8 pb-28 text-white sm:px-5 sm:py-12 sm:pb-12">
      <motion.section
        aria-labelledby="not-found-title"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-xl border-2 border-[#8ca878]/35 bg-[#111a16]/95 p-5 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8 lg:p-10"
      >
        <div className="mx-auto grid size-16 place-items-center border-2 border-[#b5d58a]/60 bg-[#263c28] text-[#c6e5a7] shadow-[inset_0_0_0_4px_rgba(0,0,0,0.18)]">
          <TbBlocks size={34} aria-hidden="true" />
        </div>

        <p className="font-minecraft-text mt-6 text-xs font-bold uppercase tracking-[0.24em] text-[#a6cf74]">
          Bioma desconhecido
        </p>
        <h1
          id="not-found-title"
          className="font-minecraft-text mt-3 text-2xl font-black leading-tight text-[#eff5df] sm:text-3xl"
        >
          Página não encontrada
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#b3c0ad]">
          Parece que você se perdeu neste mundo. Este caminho não existe ou foi removido.
        </p>

        <div className="mx-auto mt-6 max-w-full border border-[#839d6b]/30 bg-[#0c130f] px-4 py-3">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#91ac7c]">
            Coordenadas
          </p>
          <code className="block break-all text-sm text-[#d9f2bd]">{pathname}</code>
        </div>

        <Link
          href="/"
          className="font-minecraft-text mt-7 inline-flex min-h-12 max-w-full items-center justify-center gap-2 border-b-4 border-[#345d2f] bg-[#5e9b43] px-4 py-3 text-xs sm:px-5 font-bold text-white transition sm:text-sm hover:bg-[#6eaa4d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b9d59b]"
        >
          <TbArrowLeft size={18} aria-hidden="true" />
          <TbPick size={18} aria-hidden="true" />
          Voltar ao início
        </Link>
      </motion.section>
    </main>
  );
}
