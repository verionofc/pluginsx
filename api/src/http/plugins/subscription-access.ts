import { PlanAccess } from "../../database/models/PlanAccess.js";

/** Authorization alone never replaces a paid period or an owner's access grant. */
export async function syncSubscriptionAuthorization(userId: string, subscriptionId: string, authorized: boolean, now = new Date()) {
  await PlanAccess.db.transaction(async (session) => {
    const access = await PlanAccess.findOne({ userId }).session(session).lean();
    if (access?.grantSource === "owner" || access?.status === "revoked") return;
    const paidPermanent = (access?.plan === "lifetime" || access?.plan === "aether") && access.status === "active";
    const paidMonthly = access?.plan === "monthly" && access.status === "active" && access.expiresAt && access.expiresAt > now;
    if (paidPermanent || paidMonthly) return;
    await PlanAccess.updateOne({ userId }, {
      $set: {
        userId, plan: "monthly", status: "pending", mercadoPagoSubscriptionId: subscriptionId,
        ...(authorized ? { cancelAtPeriodEnd: false } : {}),
      },
    }, { upsert: true, session });
  });
}
