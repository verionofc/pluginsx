export const PLAN_PRICES = { monthly: 12.53, lifetime: 63.04 } as const;

export const PLAN_CATALOG = [
  { id: "free", amount: 0, formattedPrice: "R$ 0,00", durationHours: 12, oneTime: true },
  { id: "monthly", amount: PLAN_PRICES.monthly, formattedPrice: "R$ 12,53", interval: "month", oneTime: false },
  { id: "lifetime", amount: PLAN_PRICES.lifetime, formattedPrice: "R$ 63,04", oneTime: true },
] as const;

export function safeReturnPath(returnTo: string | undefined): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) return "/";
  return returnTo === "/" || returnTo.startsWith("/#") || returnTo.startsWith("/account/keys/") ? returnTo : "/";
}

export function addOneCalendarMonth(date: Date): Date {
  const next = new Date(date);
  const targetMonth = (next.getUTCMonth() + 1) % 12;
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const originalDay = date.getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next;
}
