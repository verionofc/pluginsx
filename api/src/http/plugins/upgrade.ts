import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { firstMonthCredit } from "../../domain/upgrade.js";
import { PreApproval, type MercadoPagoConfig } from "mercadopago";
import type { ClientSession } from "mongoose";
import { lockBillingAccount } from "./billing-lock.js";
export async function quoteUpgrade(userId: string, targetPriceCents: number) {
  const access = await PlanAccess.findOne({
    userId,
    plan: "monthly",
    grantSource: { $ne: "owner" },
    status: { $in: ["active", "past_due", "canceled"] },
  }).lean();
  if (!access?.mercadoPagoSubscriptionId)
    return {
      creditCents: 0,
      endsAt: null,
      eligible: false,
      subscriptionId: null,
      paymentId: null,
    };
  const first = await BillingTransaction.findOne({
    userId,
    plan: "monthly",
    paidAt: { $exists: true },
  })
    .sort({ paidAt: 1, _id: 1 })
    .lean();
  const purchase = first
    ? await PlanPurchase.findOne({
        externalReference: first.purchaseReference,
        userId,
      }).lean()
    : null;
  const claimed = first
    ? await PlanPurchase.exists({
        upgradeCreditPaymentId: first.providerPaymentId,
        upgradeCreditReserved: true,
      })
    : null;
  const historicalStart = access.startsAt;
  const knownFirstPeriod = Boolean(
    first?.paidAt &&
      historicalStart &&
      Math.abs(first.paidAt.getTime() - historicalStart.getTime()) <
        2 * 86400000,
  );
  const credit = first?.paidAt
    ? firstMonthCredit({
        targetPriceCents,
        paidCents: Math.round(first.amount * 100),
        paidAt: first.paidAt,
        status: first.status,
        subscriptionMatches:
          knownFirstPeriod &&
          purchase?.mercadoPagoSubscriptionId ===
            access.mercadoPagoSubscriptionId,
        alreadyClaimed: Boolean(claimed),
      })
    : { creditCents: 0, endsAt: null, eligible: false };
  return {
    ...credit,
    subscriptionId: access.mercadoPagoSubscriptionId,
    paymentId:
      credit.creditCents > 0 ? (first?.providerPaymentId ?? null) : null,
  };
}
/** Cancel renewal before granting the permanent access. Throwing keeps the webhook retryable. */
export async function cancelUpgradedSubscription(
  purchase: {
    externalReference: string;
    upgradeFromSubscriptionId?: string;
    subscriptionCancellationStatus?: string;
  },
  client: MercadoPagoConfig,
) {
  if (
    !purchase.upgradeFromSubscriptionId ||
    purchase.subscriptionCancellationStatus === "cancelled"
  )
    return;
  try {
    const subscriptions = new PreApproval(client);
    const current = await subscriptions.get({
      id: purchase.upgradeFromSubscriptionId,
    });
    if (current.status !== "cancelled")
      await subscriptions.update({
        id: purchase.upgradeFromSubscriptionId,
        body: { status: "cancelled" },
      });
    await PlanPurchase.updateOne(
      { externalReference: purchase.externalReference },
      { $set: { subscriptionCancellationStatus: "cancelled" } },
    );
  } catch (error) {
    await PlanPurchase.updateOne(
      { externalReference: purchase.externalReference },
      { $set: { subscriptionCancellationStatus: "failed" } },
    );
    throw error;
  }
}

/** Recheck the source charge at fulfillment, not only when the quote was made. */
export async function assertUpgradeCredit(
  purchase: {
    externalReference: string;
    userId: string;
    upgradeCreditPaymentId?: string;
    upgradeCreditCents?: number;
  },
  session?: ClientSession,
) {
  if (!purchase.upgradeCreditPaymentId || !purchase.upgradeCreditCents) return;
  const stored = await PlanPurchase.findOne({
    externalReference: purchase.externalReference,
  })
    .session(session ?? null)
    .lean();
  const payment = await BillingTransaction.findOne({
    providerPaymentId: purchase.upgradeCreditPaymentId,
    userId: purchase.userId,
    status: "approved",
  })
    .session(session ?? null)
    .lean();
  if (
    payment &&
    !stored?.upgradeCreditReversed &&
    Math.round(payment.amount * 100) >= purchase.upgradeCreditCents
  )
    return;
  if (!session)
    await PlanPurchase.updateOne(
      { externalReference: purchase.externalReference },
      { $set: { upgradeCreditReversed: true } },
    );
  throw new Error(
    "The credited payment is no longer approved; the upgrade requires reconciliation",
  );
}

/** A chargeback/refund of the credited monthly payment also invalidates its dependent upgrade. */
export async function revokeUpgradesForReversedCredit(
  paymentId: string,
  userId: string,
) {
  await PlanAccess.db.transaction(async (session) => {
    await lockBillingAccount(userId, session);
    const upgrades = await PlanPurchase.find({
      userId,
      upgradeCreditPaymentId: paymentId,
      upgradeCreditReserved: true,
    })
      .select({ externalReference: 1 })
      .session(session)
      .lean();
    await PlanPurchase.updateMany(
      {
        userId,
        upgradeCreditPaymentId: paymentId,
        upgradeCreditReserved: true,
      },
      { $set: { upgradeCreditReversed: true } },
      { session },
    );
    for (const upgrade of upgrades)
      await PlanAccess.updateOne(
        {
          userId,
          purchaseReference: upgrade.externalReference,
          grantSource: { $ne: "owner" },
        },
        { $set: { status: "revoked" } },
        { session },
      );
  });
}
