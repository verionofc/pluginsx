import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { createMonthlyBillingReader } from "../../domain/monthly-billing.js";
import { env } from "../../env.js";

export const getMonthlyBilling = createMonthlyBillingReader({
  configured: Boolean(env.MERCADOPAGO_ACCESS_TOKEN),
  findAccess: async (userId) => {
    const access = await PlanAccess.findOne({ userId, plan: "monthly" }).lean();
    return access ? { ...access, id: String(access._id) } : null;
  },
  readSubscription: async (userId, subscriptionId) => {
    const purchase = await PlanPurchase.findOne({ userId, plan: "monthly", mercadoPagoSubscriptionId: subscriptionId }).lean();
    if (!purchase || !env.MERCADOPAGO_ACCESS_TOKEN) return null;
    const client = new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN, options: { timeout: 4000, maxRetries: 0 } });
    const subscription = await new PreApproval(client).get({ id: subscriptionId });
    if (subscription.external_reference !== purchase.externalReference) return null;
    return { nextPaymentDate: subscription.next_payment_date ?? null, authorized: subscription.status === "authorized" };
  },
  storeSchedule: async (access, schedule) => {
    const saved = await PlanAccess.updateOne(
      { _id: access.id, plan: "monthly", grantSource: { $ne: "owner" }, mercadoPagoSubscriptionId: access.mercadoPagoSubscriptionId, cancelAtPeriodEnd: { $ne: true } },
      { $set: schedule },
    );
    return saved.matchedCount > 0;
  },
});
