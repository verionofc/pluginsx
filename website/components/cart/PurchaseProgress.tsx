"use client";

import Image from "next/image";
import Link from "next/link";
import {
  TbArrowUpRight,
  TbCheck,
  TbExternalLink,
  TbKey,
  TbRefresh,
  TbX,
} from "react-icons/tb";
import {
  purchaseIsReady,
  purchasePhase,
  safeCheckoutUrl,
} from "@/lib/purchase-progress";
import { usePurchaseJourney } from "./PurchaseJourneyProvider";

export const planArtwork: Record<string, string> = {
  monthly: "/images/plans/license_icon_creeper.png",
  lifetime: "/images/plans/license_icon_ender_dragon.png",
  aether: "/images/plans/license_icon_aether.png",
};

export function PurchaseProgress() {
  const {
    purchase,
    reference,
    checking,
    connectionError,
    refresh,
    resumeCheckout,
    dismiss,
  } = usePurchaseJourney();
  if (!reference) return null;
  const phase = purchase ? purchasePhase(purchase) : "pending";
  const ready = purchase ? purchaseIsReady(purchase) : false;
  const slots = purchase?.plan === "server_slots";
  const planName =
    purchase?.planName ?? (slots ? "Vagas de servidor" : "Seu acesso");
  const paid = phase === "processing" || ready;
  const needsReview = phase === "review" || phase === "revoked";
  const checkoutUrl =
    purchase && !paid && !needsReview && typeof window !== "undefined"
      ? safeCheckoutUrl(purchase.checkoutUrl, window.location.origin)
      : null;
  const title = ready
    ? slots
      ? "Sua rede ganhou espaço"
      : `${planName} no seu inventário`
    : phase === "processing"
      ? "Pagamento confirmado. Preparando seu acesso."
      : phase === "review"
        ? "Este pedido precisa de atenção"
        : phase === "revoked"
          ? "O acesso deste pedido não está ativo"
          : "Sua compra está sendo acompanhada";
  const description =
    purchase?.message ??
    (ready
      ? slots
        ? "As vagas confirmadas já fazem parte da capacidade da sua conta."
        : "A key deste plano foi emitida. Ela tem seu próprio card, separado dos demais acessos."
      : phase === "processing"
        ? "Estamos concluindo a emissão da licença e conferindo sua disponibilidade na conta."
        : needsReview
          ? "Consulte o estado do pedido antes de realizar outro pagamento."
          : "Conclua o pagamento na janela segura. Esta página verifica a confirmação e atualiza seu inventário automaticamente.");
  return (
    <section
      className="purchase-progress"
      data-phase={phase}
      data-plan={purchase?.plan}
      aria-label="Acompanhamento da compra"
    >
      <div className="purchase-progress__header">
        <span className="purchase-progress__emblem" aria-hidden="true">
          {purchase && planArtwork[purchase.plan] ? (
            <Image
              src={planArtwork[purchase.plan]}
              alt=""
              width={84}
              height={84}
            />
          ) : (
            <TbKey size={30} />
          )}
        </span>
        <div className="purchase-progress__copy">
          <p className="purchase-progress__eyebrow">
            PluginsX · {ready ? "Aquisição concluída" : "Pedido em andamento"}
          </p>
          <h2 className="font-minecraft-text">{title}</h2>
          <p aria-live="polite">{description}</p>
        </div>
        {(ready || needsReview) && (
          <button
            type="button"
            className="purchase-progress__dismiss"
            onClick={dismiss}
            aria-label="Dispensar acompanhamento da compra"
          >
            <TbX aria-hidden="true" />
          </button>
        )}
      </div>
      {!needsReview && (
        <ol className="purchase-progress__steps" aria-label="Etapas do pedido">
          {[
            { label: "Pedido criado", done: true },
            { label: "Pagamento confirmado", done: paid },
            { label: slots ? "Vagas liberadas" : "Key emitida", done: ready },
          ].map((step, index) => (
            <li
              key={step.label}
              data-done={step.done}
              aria-current={
                !step.done && (index === 1 || paid) ? "step" : undefined
              }
            >
              <span aria-hidden="true">
                {step.done ? <TbCheck size={14} /> : `0${index + 1}`}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      )}
      <div className="purchase-progress__footer">
        <span className="purchase-progress__reference">
          PEDIDO {reference.slice(0, 8).toUpperCase()}
        </span>
        <div className="purchase-progress__actions">
          {ready ? (
            <Link
              href={`/account?purchase=${reference}${purchase?.licenseRef ? `#license-${purchase.licenseRef}` : ""}`}
              className="purchase-action purchase-action--primary"
            >
              {slots ? "Ver capacidade" : "Abrir minha licença"}
              <TbArrowUpRight aria-hidden="true" />
            </Link>
          ) : (
            <>
              {checkoutUrl && (
                <a
                  href={checkoutUrl}
                  onClick={(event) => {
                    event.preventDefault();
                    resumeCheckout(checkoutUrl);
                  }}
                  className="purchase-action"
                >
                  Retomar pagamento <TbExternalLink aria-hidden="true" />
                </a>
              )}
              <button
                type="button"
                className="purchase-action"
                onClick={refresh}
                disabled={checking}
              >
                <TbRefresh
                  className={checking ? "animate-spin" : ""}
                  aria-hidden="true"
                />
                {checking ? "Consultando…" : "Verificar agora"}
              </button>
            </>
          )}
        </div>
      </div>
      {connectionError && (
        <output className="purchase-progress__connection" aria-live="polite">
          {connectionError}
        </output>
      )}
    </section>
  );
}
