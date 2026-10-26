import type { ReactNode } from "react";
import { TbInfinity } from "react-icons/tb";
import { getLicenseCapacity } from "@/lib/license-capacity";

const numberFormat = new Intl.NumberFormat("pt-BR");

export function LicenseCapacity({
  used,
  limit,
  unlimited,
  children,
}: {
  used: number;
  limit: number | null;
  unlimited?: boolean | undefined;
  children?: ReactNode;
}) {
  const view = getLicenseCapacity(used, limit, unlimited);
  const usedLabel = numberFormat.format(view.used);
  const limitLabel =
    view.limit === null ? "—" : numberFormat.format(view.limit);
  return (
    <div className="license-card__capacity" data-capacity-mode={view.mode}>
      <div className="license-capacity__heading">
        <span>Vagas de servidor</span>
        <strong>
          {view.mode === "unlimited"
            ? "Ilimitadas"
            : view.mode === "unknown"
              ? "Não informada"
              : `${usedLabel}/${limitLabel}`}
        </strong>
      </div>
      {view.mode === "unlimited" ? (
        <div className="license-capacity__unlimited">
          <span aria-hidden="true">
            <TbInfinity size={30} />
          </span>
          <p>
            <strong>{usedLabel}</strong>{" "}
            {view.used === 1 ? "vaga reservada" : "vagas reservadas"}
          </p>
        </div>
      ) : view.mode === "unknown" || view.mode === "empty" ? (
        <p className="license-capacity__note">
          {view.mode === "unknown"
            ? `${usedLabel} ${view.used === 1 ? "vaga reservada" : "vagas reservadas"} · limite não informado`
            : "Nenhuma vaga disponível neste acesso."}
        </p>
      ) : (
        <>
          <meter
            className="sr-only"
            aria-label={`${usedLabel} de ${limitLabel} vagas reservadas`}
            min={0}
            max={view.limit ?? 1}
            value={Math.min(view.used, view.limit ?? 0)}
          />
          {view.mode === "inventory" ? (
            <div
              className="license-card__slots"
              data-layout="inventory"
              aria-hidden="true"
              style={{
                maxWidth: `${view.cells * 54 + Math.max(0, view.cells - 1) * 5}px`,
              }}
            >
              {Array.from({ length: view.cells }, (_, slot) => slot).map(
                (slot) => (
                  <span
                    key={slot}
                    className={
                      slot < view.filled
                        ? "license-card__slot--active"
                        : "license-card__track"
                    }
                  >
                    <i className="license-inventory-block" />
                  </span>
                ),
              )}
            </div>
          ) : (
            <div className="license-capacity__network" aria-hidden="true">
              <div
                className="license-card__fill"
                style={{ width: `${view.percent}%` }}
              />
              <span className="license-capacity__ticks" />
            </div>
          )}
          {view.mode === "network" && (
            <p className="license-capacity__note">
              {view.excess > 0
                ? `${numberFormat.format(view.excess)} acima do limite`
                : view.available === 0
                  ? "Todas as vagas estão reservadas"
                  : `${numberFormat.format(view.available ?? 0)} ${view.available === 1 ? "vaga disponível" : "vagas disponíveis"}`}
            </p>
          )}
        </>
      )}
      {children}
    </div>
  );
}
