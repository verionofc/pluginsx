export function formatBillingInterval(offer: {
  duration?: number;
  durationUnit?: string;
}): string | null {
  const count = offer.duration;
  if (!Number.isSafeInteger(count) || count === undefined || count < 1)
    return null;
  if (offer.durationUnit === "days")
    return `${count} ${count === 1 ? "dia" : "dias"}`;
  if (offer.durationUnit === "months")
    return `${count} ${count === 1 ? "mês" : "meses"}`;
  return null;
}
