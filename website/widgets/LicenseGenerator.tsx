"use client";

import { useState } from "react";
import { Button } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";
import { TbCheck, TbCopy, TbPick } from "react-icons/tb";

type LicenseResponse = {
  code: string;
  created?: true;
};

const apiUrl = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3333" : "")
).replace(/\/$/, "");

export function LicenseGenerator() {
  const [license, setLicense] = useState<string>();
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  async function generateLicense() {
    setIsLoading(true);
    setMessage("");

    try {
      if (!apiUrl) {
        throw new Error("A URL da API não está configurada.");
      }

      const response = await fetch(`${apiUrl}/license/generate`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Não foi possível gerar a key agora.");
      }

      const result = (await response.json()) as LicenseResponse;
      if (typeof result.code !== "string" || !result.code) {
        throw new Error("A API retornou uma key inválida.");
      }

      setLicense(result.code);
      setMessage(
        result.created
          ? "Key gerada com sucesso."
          : "Essa key já foi gerada; esta é a key existente.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível gerar a key.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyLicense() {
    if (!license) return;

    try {
      await navigator.clipboard.writeText(license);
      setMessage("Key copiada.");
    } catch {
      setMessage("Não foi possível copiar. Selecione e copie a key acima.");
    }
  }

  return (
    <motion.section
      aria-labelledby="license-heading"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: false, amount: 0.2 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.55, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative isolate flex min-h-screen snap-start items-center justify-center overflow-hidden px-4 py-14 pb-24 sm:py-20 sm:pb-28"
    >
      <motion.section
        initial={prefersReducedMotion ? false : { opacity: 0, y: 22, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-[#8ca878]/25 bg-[#111a16] text-[#eff5df] shadow-[0_30px_100px_-36px_rgba(35,77,45,0.75)]"
      >
        <div className="grid md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative flex min-h-64 flex-col justify-between overflow-hidden border-b border-[#8ca878]/20 bg-[radial-gradient(ellipse_at_50%_25%,rgba(106,160,80,0.28),transparent_65%),linear-gradient(145deg,#1d3427,#111a16_78%)] p-7 sm:p-10 md:border-r md:border-b-0">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(45deg,rgba(255,255,255,0.05)_25%,transparent_25%,transparent_75%,rgba(255,255,255,0.05)_75%)] [background-size:18px_18px]" />
            <div className="relative flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#b9d59b]">
              <span className="size-2 bg-[#8bc34a] shadow-[0_0_12px_#8bc34a]" />
              Estação de criação
            </div>

            <motion.div
              aria-hidden="true"
              animate={prefersReducedMotion ? undefined : { y: [0, -8, 0], rotate: [0, -2, 2, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative mx-auto my-8 grid size-36 place-items-center border-4 border-[#b5d58a]/70 bg-[linear-gradient(135deg,#85b94e_0_34%,#4b8739_34%_67%,#714c32_67%)] shadow-[inset_0_0_0_5px_rgba(20,40,24,0.25),12px_14px_0_rgba(5,12,8,0.3),0_0_55px_rgba(116,183,74,0.25)] sm:size-40"
            >
              <div className="absolute inset-3 border border-white/15" />
              <TbPick size={58} strokeWidth={1.5} className="drop-shadow-[3px_4px_0_rgba(0,0,0,0.4)] text-[#f0dfaa]" />
              <span className="absolute -right-3 -bottom-3 border-2 border-[#111a16] bg-[#8bc34a] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#172315]">
                API
              </span>
            </motion.div>

            <div className="relative flex items-center justify-between border-t border-[#b5d58a]/20 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9aaf91]">
              <span>Crafting table</span>
              <span>01 / 01</span>
            </div>
          </div>

          <div className="flex flex-col justify-center p-7 sm:p-10 md:p-12">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#a6cf74]">
              PluginsX · item especial
            </p>
            <h1 id="license-heading" className="font-minecraft-text mt-3 text-3xl font-black leading-tight tracking-tight sm:text-4xl">
              Sua chave de acesso
            </h1>
            <p className="mt-3 max-w-md text-sm leading-6 text-[#b3c0ad]">
              Gere a key e leve seu acesso no inventário. Se ela já existir, a
              estação recupera a mesma para você.
            </p>

            <div className="mt-7 grid grid-cols-3 gap-2" aria-hidden="true">
              {["#769a50", "#4e703a", "#769a50"].map((color, index) => (
                <motion.div
                  key={index}
                  animate={prefersReducedMotion ? undefined : { opacity: [0.55, 1, 0.55] }}
                  transition={{ duration: 2.4, delay: index * 0.25, repeat: Infinity }}
                  className="h-1.5"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <motion.div whileHover={prefersReducedMotion ? undefined : { y: -2 }} whileTap={{ scale: 0.98 }} className="mt-6">
              <Button
                size="lg"
                variant="primary"
                onPress={generateLicense}
                isDisabled={isLoading}
                className="font-minecraft-text h-12 w-full rounded-lg border-b-4 border-[#345d2f] bg-[#5e9b43] font-bold text-[#f7ffe9] shadow-[0_5px_20px_rgba(71,134,55,0.2)] hover:bg-[#6eaa4d]"
              >
                <TbPick size={19} aria-hidden="true" />
                {isLoading ? "Verificando inventário..." : "Gerar minha key"}
              </Button>
            </motion.div>

            {license && (
              <motion.div
                initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 border border-[#839d6b]/30 bg-[#0c130f] p-4"
              >
                <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-[#91ac7c]">
                  <span>Slot de inventário</span>
                  <span className="flex items-center gap-1 text-[#b9d59b]"><TbCheck size={13} /> obtido</span>
                </div>
                <code className="block break-all rounded bg-[#17231a] px-3 py-3 text-left text-sm font-semibold text-[#d9f2bd]">
                  {license}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={copyLicense}
                  className="mt-3 -ml-2 text-[#b9d59b] hover:bg-[#b9d59b]/10"
                >
                  <TbCopy size={15} aria-hidden="true" />
                  Copiar para o inventário
                </Button>
              </motion.div>
            )}

            {message && (
              <p className="mt-4 border-l-2 border-[#8bc34a] pl-3 text-sm text-[#c8d5bf]" role="status">
                {message}
              </p>
            )}
          </div>
        </div>
      </motion.section>
    </motion.section>
  );
}
