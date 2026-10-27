import { PlanAccess } from "../../database/models/PlanAccess.js";
import { lockBillingAccount } from "./billing-lock.js";

/** Authorization alone never replaces a paid period or an owner's access grant. */
export async function syncSubscriptionAuthorization(
  userId: string,
  subscriptionId: string,
  authorized: boolean,
  now = new Date(),
) {
  await PlanAccess.db.transaction(async (session) => {
    const access = await PlanAccess.findOne({ userId }).session(session).lean();
    if (access?.grantSource === "owner" || access?.status === "revoked") return;
    const paidPermanent =
      (access?.plan === "lifetime" || access?.plan === "aether") &&
      access.status === "active";
    const paidMonthly =
      access?.plan === "monthly" &&
      access.status === "active" &&
      access.expiresAt &&
      access.expiresAt > now;
    if (paidPermanent || paidMonthly) return;
    await PlanAccess.updateOne(
      { userId },
      {
        $set: {
          userId,
          plan: "monthly",
          status: "pending",
          mercadoPagoSubscriptionId: subscriptionId,
          ...(authorized ? { cancelAtPeriodEnd: false } : {}),
        },
      },
      { upsert: true, session },
    );
  });
}

/** A late cancellation belongs only to the monthly contract it identifies. */
export async function syncSubscriptionCancellation(
  userId: string,
  subscriptionId: string,
  now = new Date(),
) {
  return PlanAccess.db.transaction(async (session) => {
    await lockBillingAccount(userId, session);
    const current = await PlanAccess.findOne({
      userId,
      plan: "monthly",
      mercadoPagoSubscriptionId: subscriptionId,
      grantSource: { $ne: "owner" },
    })
      .session(session)
      .lean();
    if (!current || current.status === "revoked") return null;
    const expiresAt =
      current.expiresAt && current.expiresAt > now ? current.expiresAt : null;
    await PlanAccess.updateOne(
      { _id: current._id },
      {
        $set: {
          status: expiresAt ? "active" : "canceled",
          cancelAtPeriodEnd: true,
          billingRenewalEnabled: false,
        },
        $unset: {
          nextBillingAt: "",
          billingScheduleCheckedAt: "",
          billingScheduleSubscriptionId: "",
        },
      },
      { session },
    );
    return expiresAt;
  });
}
