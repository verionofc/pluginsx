"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { TbArrowUpRight, TbCheck, TbKey, TbX } from "react-icons/tb";
import type { PurchaseProgressData } from "@/lib/purchase-progress";

const artwork: Record<string, string> = {
  monthly: "/images/plans/license_icon_creeper.png",
  lifetime: "/images/plans/license_icon_ender_dragon.png",
  aether: "/images/plans/license_icon_aether.png",
};

export function PurchaseArrival({
  purchase,
  onClose,
}: {
  purchase: PurchaseProgressData;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const slots = purchase.plan === "server_slots";
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      title.current?.focus({ preventScroll: true });
    }
  }, []);
  const amount =
    typeof purchase.amount === "number" && Number.isFinite(purchase.amount)
      ? new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(purchase.amount)
      : null;
  return (
    <dialog
      ref={dialog}
      className="purchase-arrival"
      data-plan={purchase.plan}
      aria-labelledby="purchase-arrival-title"
      aria-describedby="purchase-arrival-description"
      onCancel={onClose}
      onClose={onClose}
    >
      <button
        type="button"
        className="purchase-arrival__close"
        onClick={onClose}
        aria-label="Fechar confirmação da compra"
      >
        <TbX aria-hidden="true" size={19} />
      </button>
      <div className="purchase-arrival__hero" aria-hidden="true">
        <div className="purchase-arrival__portal" />
        <div className="purchase-arrival__seal">
          <TbCheck size={18} />
        </div>
        {artwork[purchase.plan] ? (
          <Image
            src={artwork[purchase.plan]}
            alt=""
            width={300}
            height={220}
            priority
          />
        ) : (
          <TbKey size={90} />
        )}
      </div>
      <div className="purchase-arrival__content">
        <p className="purchase-arrival__eyebrow">Conquista desbloqueada</p>
        <h2
          ref={title}
          tabIndex={-1}
          id="purchase-arrival-title"
          className="font-minecraft-text"
        >
          {slots
            ? "Mais mundos pela frente."
            : "Um novo acesso. Uma key só sua."}
        </h2>
        <p id="purchase-arrival-description">
          {slots
            ? `${purchase.serverSlots ?? 0} ${purchase.serverSlots === 1 ? "vaga foi adicionada" : "vagas foram adicionadas"} à sua conta.`
            : `Sua licença ${purchase.planName ?? "PluginsX"} já está disponível no inventário, em um card próprio.`}
        </p>
        <div className="purchase-arrival__receipt">
          <span>
            <TbCheck aria-hidden="true" size={14} />
            Pagamento confirmado
          </span>
          {amount && <strong>{amount}</strong>}
          <span>
            {slots ? "Capacidade atualizada" : "Key independente emitida"}
          </span>
          <code>{purchase.reference.slice(0, 8).toUpperCase()}</code>
        </div>
        <Link
          href={`/account?purchase=${purchase.reference}${purchase.licenseRef ? `#license-${purchase.licenseRef}` : ""}`}
          onClick={onClose}
          className="purchase-action purchase-action--primary purchase-arrival__cta"
        >
          {slots ? "Ver meus servidores" : "Revelar no inventário"}
          <TbArrowUpRight aria-hidden="true" size={18} />
        </Link>
        <button
          type="button"
          className="purchase-arrival__continue"
          onClick={onClose}
        >
          Continuar nesta página
        </button>
      </div>
    </dialog>
  );
}
