import Image from "next/image";
import type { ReactNode } from "react";
import {
  TbCheck,
  TbClockHour4,
  TbInfinity,
  TbShieldCheck,
  TbX,
} from "react-icons/tb";

import { LicenseWorldScene } from "./LicenseWorldScene";

export type LicenseEdition =
  | "trial"
  | "monthly"
  | "lifetime"
  | "aether"
  | "standard";

const editions = {
  trial: {
    number: "01",
    collection: "Passe de exploração",
    description:
      "Seu primeiro portal para experimentar o SpawnerX no mundo real.",
    seal: "Expedição temporária",
    image: "/images/plans/license_icon_free_tier.png",
  },
  monthly: {
    number: "02",
    collection: "Cofre do Overworld",
    description:
      "Uma base sólida para os mundos que você continua construindo.",
    seal: "Edição mensal",
    image: "/images/plans/license_icon_creeper.png",
  },
  lifetime: {
    number: "03",
    collection: "Relíquia do End",
    description: "Seu território além do portal. Sem ciclo de renovação.",
    seal: "Edição vitalícia",
    image: "/images/plans/license_icon_ender_dragon.png",
  },
  aether: {
    number: "04",
    collection: "Estação celeste",
    description: "Um ponto de comando para uma rede inteira de mundos.",
    seal: "Edição Aether",
    image: "/images/plans/license_icon_aether.png",
  },
  standard: {
    number: "PX",
    collection: "Inventário PluginsX",
    description: "O acesso aos seus mundos, reunido em uma licença.",
    seal: "Licença de acesso",
    image: "/images/plans/license_icon_creeper.png",
  },
} satisfies Record<
  LicenseEdition,
  {
    number: string;
    collection: string;
    description: string;
    seal: string;
    image: string;
  }
>;

type LicenseIdentityProps = {
  edition: LicenseEdition;
  name: string;
  titleId: string;
  reference: string;
  usable: boolean;
  status: string;
  children?: ReactNode;
};

/** A identidade é decorativa; validade, capacidade e ações vêm dos dados da conta. */
export function LicenseIdentity({
  edition,
  name,
  titleId,
  reference,
  usable,
  status,
  children,
}: LicenseIdentityProps) {
  const design = editions[edition];
  const SealIcon =
    edition === "trial"
      ? TbClockHour4
      : edition === "lifetime"
        ? TbInfinity
        : TbShieldCheck;

  return (
    <header className="license-identity">
      <LicenseWorldScene edition={edition} />
      <div className="license-identity__topline">
        <span className="license-identity__collection">
          <span>{design.number}</span> {design.collection}
        </span>
        <span className="license-identity__status" data-usable={usable}>
          {usable ? (
            <TbCheck size={13} aria-hidden="true" />
          ) : (
            <TbX size={13} aria-hidden="true" />
          )}
          {status}
        </span>
      </div>
      <div className="license-identity__composition">
        <div className="license-identity__copy">
          <p className="license-identity__eyebrow">
            SpawnerX · licença pessoal
          </p>
          <h3 id={titleId}>{name}</h3>
          <p className="license-identity__description">{design.description}</p>
          {children ? (
            <div className="license-identity__countdown">{children}</div>
          ) : null}
        </div>
        <div className="license-identity__art" aria-hidden="true">
          {edition === "trial" && (
            <span className="license-ticket-stamp">
              PX
              <br />
              TRIAL
            </span>
          )}
          {edition === "monthly" && (
            <>
              <span className="license-vault-face" />
              <span className="license-vault-bolts" />
            </>
          )}
          {edition === "lifetime" && (
            <>
              <span className="license-end-portal" />
              <span className="license-end-runes">◆ · ◆ · ◆</span>
            </>
          )}
          {edition === "aether" && (
            <>
              <span className="license-aether-orbit" />
              <span className="license-aether-wings" />
            </>
          )}
          <Image
            src={design.image}
            alt=""
            width={420}
            height={280}
            sizes="(max-width: 640px) 160px, 320px"
            className="license-identity__image"
          />
        </div>
      </div>
      <div className="license-identity__footer">
        <span>
          <SealIcon size={14} aria-hidden="true" />
          {design.seal}
        </span>
        <span
          className="license-identity__reference"
          title={`Referência da licença: ${reference}`}
        >
          REF. {reference.slice(0, 6).toUpperCase()} ·{" "}
          {reference.slice(-4).toUpperCase()}
        </span>
      </div>
    </header>
  );
}
