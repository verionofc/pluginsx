"use client";

import { useEffect, useRef, useState } from "react";
import { TbCalendarDue, TbHourglass } from "react-icons/tb";

export type MonthlyBillingInfo = {
  nextBillingAt: string | null;
  currentPeriodEndsAt: string | null;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZoneName: "short",
});
function remainingTime(date: number, now: number) {
  const total = Math.max(0, Math.ceil((date - now) / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const clock = [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  return `${days > 0 ? `${days} ${days === 1 ? "dia" : "dias"} · ` : ""}${clock}`;
}

export function MonthlyBillingCountdown({
  billing,
  licenseId,
  onExpired,
}: {
  billing: MonthlyBillingInfo | null | undefined;
  licenseId?: string;
  onExpired?: (licenseId: string, periodEndsAt: string) => void;
}) {
  const [now, setNow] = useState<number | null>(null);
  const notifiedExpiration = useRef<string | null>(null);
  const expiryRaw = billing?.currentPeriodEndsAt;
  const expiry = expiryRaw ? Date.parse(expiryRaw) : Number.NaN;
  const hasExpiry = Number.isFinite(expiry);
  const expired = hasExpiry && now !== null && expiry <= now;
  const nextRaw = billing?.nextBillingAt;
  const next = nextRaw ? Date.parse(nextRaw) : Number.NaN;
  const recurring = Boolean(billing?.autoRenew && !billing.cancelAtPeriodEnd);

  useEffect(() => {
    let timer = 0;
    const tick = () => setNow(Date.now());
    function sync() {
      window.clearInterval(timer);
      tick();
      if (!document.hidden) timer = window.setInterval(tick, 1000);
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", tick);
    };
  }, []);

  useEffect(() => {
    if (
      !expired ||
      !expiryRaw ||
      !licenseId ||
      !onExpired ||
      notifiedExpiration.current === expiryRaw
    )
      return;
    notifiedExpiration.current = expiryRaw;
    onExpired(licenseId, expiryRaw);
  }, [expired, expiryRaw, licenseId, onExpired]);

  return (
    <div className="license-monthly-billing" data-expired={expired}>
      <div className="license-monthly-billing__expiry">
        <TbHourglass size={20} aria-hidden="true" />
        <div className="license-monthly-billing__validity">
          <p>Expiração do acesso mensal</p>
          {hasExpiry && expiryRaw ? (
            <time dateTime={expiryRaw}>
              {dateFormat.format(new Date(expiry))}
            </time>
          ) : (
            <span className="license-monthly-billing__unknown">
              Data de expiração não informada
            </span>
          )}
        </div>
        <div className="license-monthly-billing__remaining">
          <p>{expired ? "Acesso expirado" : "Tempo restante"}</p>
          <strong
            role="timer"
            aria-live="off"
            aria-label="Tempo restante do acesso mensal"
          >
            {!hasExpiry
              ? "—"
              : now === null
                ? "Calculando…"
                : expired
                  ? "00:00:00"
                  : remainingTime(expiry, now)}
          </strong>
        </div>
      </div>
      <div className="license-monthly-billing__invoice">
        <TbCalendarDue size={14} aria-hidden="true" />
        {billing?.cancelAtPeriodEnd ? (
          <span>Renovação cancelada · sem nova cobrança automática.</span>
        ) : recurring ? (
          <>
            <span>
              {now !== null && Number.isFinite(next) && next <= now
                ? "Fatura em confirmação:"
                : "Próxima fatura:"}
            </span>
            {Number.isFinite(next) && nextRaw ? (
              <>
                <time dateTime={nextRaw}>
                  {dateFormat.format(new Date(next))}
                </time>
                {now !== null && (
                  <span
                    className="license-monthly-billing__invoice-remaining"
                    role="timer"
                    aria-live="off"
                    aria-label="Tempo até a próxima fatura"
                  >
                    {next <= now
                      ? "Aguardando confirmação"
                      : `em ${remainingTime(next, now)}`}
                  </span>
                )}
              </>
            ) : (
              <span>Aguardando a data de cobrança</span>
            )}
          </>
        ) : billing ? (
          <span>Sem cobrança automática</span>
        ) : (
          <span>Calendário de cobrança ainda não informado</span>
        )}
      </div>
    </div>
  );
}
