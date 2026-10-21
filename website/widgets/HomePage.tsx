"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";

import { LicenseGenerator } from "@/widgets/LicenseGenerator";
import { PluginInstaller } from "@/widgets/PluginInstaller";
import { AmbientMusic } from "@/widgets/AmbientMusic";

export function HomePage() {
  const prefersReducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 55, damping: 18, mass: 0.7 });
  const smoothY = useSpring(pointerY, { stiffness: 55, damping: 18, mass: 0.7 });
  const rotateY = useTransform(smoothX, [-0.5, 0.5], [-2.8, 2.8]);
  const rotateX = useTransform(smoothY, [-0.5, 0.5], [2.2, -2.2]);
  const offsetX = useTransform(smoothX, [-0.5, 0.5], [10, -10]);
  const offsetY = useTransform(smoothY, [-0.5, 0.5], [7, -7]);

  useEffect(() => {
    if (prefersReducedMotion) return;

    const moveWithPointer = (event: PointerEvent) => {
      pointerX.set(event.clientX / window.innerWidth - 0.5);
      pointerY.set(event.clientY / window.innerHeight - 0.5);
    };
    const resetPosition = () => {
      pointerX.set(0);
      pointerY.set(0);
    };

    window.addEventListener("pointermove", moveWithPointer, { passive: true });
    window.addEventListener("blur", resetPosition);

    return () => {
      window.removeEventListener("pointermove", moveWithPointer);
      window.removeEventListener("blur", resetPosition);
    };
  }, [pointerX, pointerY, prefersReducedMotion]);

  return (
    <div className="relative isolate min-h-screen bg-black">
      <AmbientMusic />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden [perspective:1200px]"
      >
        <motion.div
          className="absolute -inset-[5%] bg-cover bg-center"
          style={{
            backgroundImage: "url('/thumb-1920-1370592.jpeg')",
            x: offsetX,
            y: offsetY,
            rotateX,
            rotateY,
            scale: 1.08,
            transformStyle: "preserve-3d",
          }}
        />
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(13,25,15,0.18),rgba(0,0,0,0.56)_82%)]" />
      </div>

      <main
        tabIndex={0}
        className="relative z-10 h-screen snap-y snap-mandatory overflow-y-auto overscroll-y-contain scroll-smooth"
      >
        <LicenseGenerator />
        <PluginInstaller />
      </main>
    </div>
  );
}
