"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { motion, useReducedMotion } from "framer-motion";
import { TbPlayerPause, TbPlayerPlay, TbVinyl } from "react-icons/tb";

export function AmbientMusic() {
  const prefersReducedMotion = useReducedMotion();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = 0.24;
    return () => audioRef.current?.pause();
  }, []);

  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
      setError("");
    } catch {
      setError("Não foi possível reproduzir a faixa neste navegador.");
    }
  }

  return (
    <>
      <audio
        ref={audioRef}
        src="/music/minecraft-noises.mp3"
        preload="none"
        loop
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setError("Não foi possível carregar a faixa de áudio.")}
      />

      <motion.aside
        initial={prefersReducedMotion ? false : { opacity: 0, x: -14 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.4 }}
        className="fixed left-3 top-3 z-50 w-[min(20rem,calc(100%-1.5rem))] sm:left-5 sm:top-5"
        aria-label="Música ambiente"
      >
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/70 px-3 py-2.5 text-white shadow-[0_10px_35px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <motion.div
            animate={isPlaying && !prefersReducedMotion ? { rotate: 360 } : { rotate: 0 }}
            transition={isPlaying ? { duration: 8, repeat: Infinity, ease: "linear" } : { duration: 0.2 }}
            className="grid size-9 shrink-0 place-items-center rounded-full border border-[#a6cf74]/30 bg-[#a6cf74]/10 text-[#c6e5a7]"
            aria-hidden="true"
          >
            <TbVinyl size={20} />
          </motion.div>

          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#a6cf74]">
              {isPlaying ? "Tocando agora" : "Faixa ambiente"}
            </p>
            <p className="truncate text-xs font-semibold text-white/90">
              Green Overworld · Minecraft
            </p>
          </div>

          <Button
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={toggleMusic}
            aria-label={isPlaying ? "Pausar música ambiente" : "Tocar música ambiente"}
            className="size-9 min-w-9 rounded-lg border border-white/10 text-white/80 hover:bg-white/10 hover:text-white"
          >
            {isPlaying ? <TbPlayerPause size={17} /> : <TbPlayerPlay size={17} />}
          </Button>
        </div>
        {error && <p role="status" className="mt-1.5 pl-2 text-[11px] text-red-200">{error}</p>}
      </motion.aside>
    </>
  );
}
