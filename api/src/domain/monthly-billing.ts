export type MonthlyBilling = {
  nextBillingAt: Date | null;
  currentPeriodEndsAt: Date | null;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
};
export type MonthlyAccess = {
  id: string;
  status: string;
  expiresAt?: Date | null;
  mercadoPagoSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
  grantSource?: string;
  nextBillingAt?: Date | null;
  billingScheduleCheckedAt?: Date | null;
  billingScheduleSubscriptionId?: string;
  billingRenewalEnabled?: boolean;
};
type Schedule = { billingScheduleSubscriptionId: string; nextBillingAt: Date | null; billingScheduleCheckedAt: Date; billingRenewalEnabled: boolean };
type BillingServices = {
  configured: boolean;
  findAccess: (userId: string) => Promise<MonthlyAccess | null>;
  readSubscription: (userId: string, subscriptionId: string) => Promise<{ nextPaymentDate: string | null; authorized: boolean } | null>;
  storeSchedule: (access: MonthlyAccess, schedule: Schedule) => Promise<boolean>;
  now?: () => number;
};

function describeAccess(access: MonthlyAccess): MonthlyBilling {
  const stopped = Boolean(access.cancelAtPeriodEnd) || ["canceled", "revoked"].includes(access.status) || access.grantSource === "owner" || !access.mercadoPagoSubscriptionId;
  const matchingSchedule = access.billingScheduleSubscriptionId === access.mercadoPagoSubscriptionId;
  return {
    nextBillingAt: stopped || !matchingSchedule ? null : access.nextBillingAt ?? null,
    currentPeriodEndsAt: access.expiresAt ?? null,
    autoRenew: !stopped && (!matchingSchedule || access.billingRenewalEnabled !== false),
    cancelAtPeriodEnd: Boolean(access.cancelAtPeriodEnd),
  };
}

/** Consulta somente o calendário; nunca concede acesso ou estende um período pago. */
export function createMonthlyBillingReader(services: BillingServices) {
  const inFlight = new Map<string, Promise<MonthlyBilling | null>>();
  async function read(userId: string): Promise<MonthlyBilling | null> {
    const access = await services.findAccess(userId);
    if (!access) return null;
    const base = describeAccess(access);
    const stopped = access.cancelAtPeriodEnd || ["canceled", "revoked"].includes(access.status) || access.grantSource === "owner" || !access.mercadoPagoSubscriptionId;
    if (stopped) return base;
    const now = services.now?.() ?? Date.now();
    const age = access.billingScheduleCheckedAt ? now - access.billingScheduleCheckedAt.getTime() : Number.POSITIVE_INFINITY;
    if ((access.billingScheduleSubscriptionId === access.mercadoPagoSubscriptionId && age >= 0 && age < 5 * 60_000) || !services.configured) return base;
    try {
      const subscription = await services.readSubscription(userId, access.mercadoPagoSubscriptionId!);
      if (!subscription) return { ...base, nextBillingAt: null };
      const date = subscription.nextPaymentDate ? new Date(subscription.nextPaymentDate) : null;
      const nextBillingAt = subscription.authorized && date && Number.isFinite(date.getTime()) ? date : null;
      const saved = await services.storeSchedule(access, { billingScheduleSubscriptionId: access.mercadoPagoSubscriptionId!, nextBillingAt, billingScheduleCheckedAt: new Date(now), billingRenewalEnabled: subscription.authorized });
      if (!saved) {
        const latest = await services.findAccess(userId);
        return latest ? describeAccess(latest) : null;
      }
      return { ...base, nextBillingAt, autoRenew: subscription.authorized };
    } catch {
      return base;
    }
  }
  return async (userId: string) => {
    const current = inFlight.get(userId);
    if (current) return current;
    const request = read(userId);
    inFlight.set(userId, request);
    try { return await request; } finally { inFlight.delete(userId); }
  };
}
