"use client";

import Image from "next/image";
import { useState } from "react";
import { getMobHead, mobDisplayName, mobHeadUrl } from "@/lib/mob-heads";

export function MobHead({
  mobId,
  size = 40,
}: {
  mobId: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const entry = getMobHead(mobId);
  const source = mobHeadUrl(mobId, Math.max(64, size * 2));
  if (!entry || !source || failed)
    return (
      <span
        className="mob-head mob-head--fallback"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${mobDisplayName(mobId)} sem textura disponível`}
      >
        <span>{mobDisplayName(mobId).slice(0, 2).toUpperCase()}</span>
      </span>
    );
  return (
    <span className="mob-head" style={{ width: size, height: size }}>
      <Image
        src={source}
        alt={`${entry.name}, cabeça do mob`}
        width={size}
        height={size}
        unoptimized
        onError={() => setFailed(true)}
      />
    </span>
  );
}
