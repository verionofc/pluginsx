import type { MercadoPagoConfig, Payment } from "mercadopago";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import { PaymentEvent } from "../../database/models/PaymentEvent.js";
import { PLANS_CONFIG, addRecurringInterval } from "./billing-config.js";
import { lockBillingAccount } from "./billing-lock.js";
import { grantPermanentPurchase } from "./billing-entitlements.js";
import { recordPaymentAttempt } from "./billing-payment-ledger.js";
import {
  assertUpgradeCredit,
  cancelUpgradedSubscription,
  revokeUpgradesForReversedCredit,
} from "./upgrade.js";
import { settleCouponReservation } from "./coupons.js";
import { ensurePaidPlanLicense } from "./paid-plan-license.js";

export async function reconcileMonthlyReversal(purchase: {
  userId: string;
  externalReference: string;
  mercadoPagoSubscriptionId?: string;
  planTerms?: { duration: number; durationUnit: string };
}) {
  await PlanAccess.db.transaction(async (session) => {
    await lockBillingAccount(purchase.userId, session);
    const approved = await BillingTransaction.findOne({
      purchaseReference: purchase.externalReference,
      status: "approved",
      paidAt: { $exists: true },
    })
      .sort({ paidAt: -1 })
      .session(session)
      .lean();
    const paidThrough = approved?.paidAt
      ? addRecurringInterval(
          approved.paidAt,
          purchase.planTerms?.duration ??
            PLANS_CONFIG.plans.monthly.recurrence.frequency,
          purchase.planTerms?.durationUnit === "days"
            ? "days"
            : purchase.planTerms?.durationUnit === "months"
              ? "months"
              : PLANS_CONFIG.plans.monthly.recurrence.frequencyType,
        )
      : null;
    await PlanAccess.updateOne(
      {
        userId: purchase.userId,
        plan: "monthly",
        mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId,
        grantSource: { $ne: "owner" },
      },
      {
        $set: {
          status:
            paidThrough && paidThrough > new Date() ? "active" : "revoked",
          ...(paidThrough ? { expiresAt: paidThrough } : {}),
        },
      },
      { session },
    );
  });
}
/** The same verified provider resource fulfills both webhooks and owned receipt checks. */
export async function applyVerifiedPayment(
  payment: Awaited<ReturnType<Payment["get"]>>,
  client: MercadoPagoConfig,
  expectedReference?: string,
  authorizedSubscriptionId?: string,
) {
  let chargeEventId: string | undefined;
  let ownsChargeClaim = false;
  const paymentResourceId = String(payment.id ?? "");
  if (!paymentResourceId) throw new Error("Missing provider payment id");
  try {
    const external = payment.external_reference;
    const linkedSubscriptionId = (
      payment as typeof payment & { preapproval_id?: string }
    ).preapproval_id;
    const purchaseAlternatives = [
      ...(external ? [{ externalReference: external }] : []),
      ...((linkedSubscriptionId ?? authorizedSubscriptionId)
        ? [
            {
              mercadoPagoSubscriptionId:
                linkedSubscriptionId ?? authorizedSubscriptionId,
            },
          ]
        : []),
    ];
    if (purchaseAlternatives.length === 0)
      throw new Error("Missing purchase reference");
    const purchase = await PlanPurchase.findOne({
      $or: purchaseAlternatives,
    });
    if (
      !purchase ||
      (expectedReference !== undefined &&
        purchase.externalReference !== expectedReference) ||
      Number(payment.transaction_amount) !== purchase.amount ||
      payment.currency_id !== purchase.currency
    )
      throw new Error("Payment does not match an internal purchase");
    const paymentStatus = payment.status;
    let nextStatus =
      payment.status_detail === "partially_refunded"
        ? "refunded"
        : paymentStatus === "approved"
          ? "approved"
          : paymentStatus === "refunded"
            ? "refunded"
            : paymentStatus === "charged_back"
              ? "charged_back"
              : paymentStatus === "cancelled"
                ? "cancelled"
                : paymentStatus === "rejected"
                  ? "rejected"
                  : "pending";
    let shouldApplyMonthlyCharge =
      nextStatus === "approved" && purchase.plan === "monthly";
    if (shouldApplyMonthlyCharge) {
      chargeEventId = `payment-approved:${String(payment.id)}`;
      try {
        await PaymentEvent.create({
          eventId: chargeEventId,
          type: "payment.approved",
          resourceId: paymentResourceId,
          status: "processing",
        });
        ownsChargeClaim = true;
      } catch (error) {
        if (
          !(
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === 11000
          )
        )
          throw error;
        const priorCharge = await PaymentEvent.findOne({
          eventId: chargeEventId,
        }).lean();
        if (priorCharge?.status === "processed")
          shouldApplyMonthlyCharge = false;
        else if (
          priorCharge?.receivedAt &&
          priorCharge.receivedAt < new Date(Date.now() - 5 * 60_000)
        ) {
          const reclaimed = await PaymentEvent.findOneAndUpdate(
            {
              eventId: chargeEventId,
              status: "processing",
              receivedAt: { $lt: new Date(Date.now() - 5 * 60_000) },
            },
            { $set: { receivedAt: new Date() } },
            { new: true },
          );
          if (reclaimed) ownsChargeClaim = true;
          else throw new Error("Payment charge is already being applied");
        } else throw new Error("Payment charge is already being applied");
      }
    }
    const transactionUpdate: Record<string, unknown> = {
      userId: purchase.userId,
      purchaseReference: purchase.externalReference,
      providerPaymentId: String(payment.id),
      plan: purchase.plan,
      serverSlots: purchase.serverSlots ?? 0,
      amount: Number(payment.transaction_amount),
      discountAmount: purchase.discountAmount ?? 0,
      ...(purchase.couponCode ? { couponCode: purchase.couponCode } : {}),
      currency: payment.currency_id,
      status: nextStatus,
    };
    if (payment.date_approved || nextStatus === "approved") {
      transactionUpdate.paidAt = new Date(
        payment.date_approved ?? payment.date_created ?? Date.now(),
      );
    }
    const recorded = await recordPaymentAttempt(
      String(payment.id),
      transactionUpdate,
    );
    if (recorded.status === "approved")
      await PlanPurchase.updateOne(
        {
          _id: purchase._id,
          fulfilledAt: { $exists: false },
          upgradeCreditReversed: { $ne: true },
        },
        { $set: { fulfillmentStatus: "processing" } },
      );
    if (recorded.status !== nextStatus) {
      nextStatus = recorded.status;
      transactionUpdate.status = nextStatus;
      shouldApplyMonthlyCharge = false;
      if (chargeEventId && ownsChargeClaim)
        await PaymentEvent.deleteOne({
          eventId: chargeEventId,
          status: "processing",
        });
    }
    if (
      nextStatus === "approved" &&
      (purchase.plan === "lifetime" || purchase.plan === "aether")
    ) {
      await assertUpgradeCredit(purchase);
      await cancelUpgradedSubscription(purchase, client);
    }
    // A checkout may have several payment attempts. Serialize the summary
    // with its ledger so a declined attempt cannot erase another paid one.
    const hasApprovedPayment = await PlanPurchase.db.transaction(
      async (session) => {
        await lockBillingAccount(purchase.userId, session);
        const effective = await recordPaymentAttempt(
          String(payment.id),
          transactionUpdate,
          session,
        );
        const approved = await BillingTransaction.findOne({
          purchaseReference: purchase.externalReference,
          status: "approved",
        })
          .sort({ paidAt: -1, _id: -1 })
          .session(session)
          .lean();
        await PlanPurchase.updateOne(
          { _id: purchase._id },
          {
            $set: {
              status: approved ? "approved" : effective.status,
              mercadoPagoPaymentId:
                approved?.providerPaymentId ?? String(payment.id),
            },
          },
          { session },
        );
        return {
          hasApproved: Boolean(approved),
          status: effective.status,
        };
      },
    );
    nextStatus = hasApprovedPayment.status;
    if (nextStatus !== "approved") {
      shouldApplyMonthlyCharge = false;
      if (chargeEventId && ownsChargeClaim)
        await PaymentEvent.deleteOne({
          eventId: chargeEventId,
          status: "processing",
        });
    }
    if (["refunded", "charged_back"].includes(nextStatus))
      await revokeUpgradesForReversedCredit(
        String(payment.id),
        purchase.userId,
      );
    if (nextStatus === "approved")
      await settleCouponReservation(purchase.externalReference, "approved");
    // A canceled payment attempt does not invalidate its checkout link.
    // Keep its coupon reserved until the checkout itself is canceled.
    if (purchase.plan === "lifetime" || purchase.plan === "aether") {
      if (nextStatus === "approved") {
        await grantPermanentPurchase(purchase.externalReference);
      }
      if (
        ["refunded", "charged_back"].includes(nextStatus) &&
        !hasApprovedPayment.hasApproved
      ) {
        await PlanAccess.updateOne(
          {
            userId: purchase.userId,
            plan: purchase.plan,
            grantSource: { $ne: "owner" },
            $or: [
              { purchaseReference: purchase.externalReference },
              { purchaseReference: { $exists: false } },
            ],
          },
          { $set: { status: "revoked" } },
        );
      }
    } else if (
      purchase.plan === "monthly" &&
      purchase.mercadoPagoSubscriptionId
    ) {
      if (shouldApplyMonthlyCharge) {
        await PlanAccess.db.transaction(async (session) => {
          await lockBillingAccount(purchase.userId, session);
          if (
            !(await BillingTransaction.exists({
              providerPaymentId: String(payment.id),
              status: "approved",
            }).session(session))
          )
            return;
          const existingAccess = await PlanAccess.findOne({
            userId: purchase.userId,
          }).session(session);
          const access =
            existingAccess?.plan === "monthly" ? existingAccess : null;
          const start = new Date(
            payment.date_approved ?? payment.date_created ?? purchase.createdAt,
          );
          const paidThrough = addRecurringInterval(
            start,
            purchase.planTerms?.duration ??
              PLANS_CONFIG.plans.monthly.recurrence.frequency,
            purchase.planTerms?.durationUnit === "days"
              ? "days"
              : purchase.planTerms?.durationUnit === "months"
                ? "months"
                : PLANS_CONFIG.plans.monthly.recurrence.frequencyType,
          );
          const expiresAt =
            access?.expiresAt && access.expiresAt > paidThrough
              ? access.expiresAt
              : paidThrough;
          const hasActivePermanentPlan =
            (existingAccess?.plan === "lifetime" ||
              existingAccess?.plan === "aether") &&
            existingAccess.status === "active";
          const otherPaidMonthly =
            existingAccess?.plan === "monthly" &&
            existingAccess.status === "active" &&
            existingAccess.mercadoPagoSubscriptionId &&
            existingAccess.mercadoPagoSubscriptionId !==
              purchase.mercadoPagoSubscriptionId;
          if (
            !hasActivePermanentPlan &&
            existingAccess?.grantSource !== "owner" &&
            !otherPaidMonthly
          ) {
            await PlanAccess.updateOne(
              { userId: purchase.userId },
              {
                $set: {
                  userId: purchase.userId,
                  plan: "monthly",
                  status: "active",
                  purchaseReference: purchase.externalReference,
                  startsAt: access?.startsAt ?? start,
                  expiresAt,
                  mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId,
                  cancelAtPeriodEnd: false,
                  ...(purchase.planTerms
                    ? { planTerms: purchase.planTerms }
                    : {}),
                },
                $unset: { grantSource: "" },
              },
              { upsert: true, session },
            );
            await ensurePaidPlanLicense(purchase.userId, "monthly", session);
            await PlanPurchase.updateOne(
              { _id: purchase._id },
              { $set: { fulfillmentStatus: "ready", fulfilledAt: new Date() } },
              { session },
            );
          }
          await PlanPurchase.updateOne(
            { _id: purchase._id },
            { $set: { entitlementCheckoutReserved: false } },
            { session },
          );
        });
      } else if (nextStatus === "rejected") {
        await PlanAccess.updateOne(
          {
            userId: purchase.userId,
            plan: "monthly",
            mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId,
            expiresAt: { $lte: new Date() },
          },
          { $set: { status: "past_due" } },
        );
      } else if (["refunded", "charged_back"].includes(nextStatus)) {
        await reconcileMonthlyReversal(purchase);
      }
    }
    if (nextStatus === "approved")
      await PlanPurchase.updateOne(
        { _id: purchase._id },
        { $set: { entitlementCheckoutReserved: false } },
      );
    if (purchase.plan === "server_slots" && hasApprovedPayment.hasApproved)
      await PlanPurchase.updateOne(
        { _id: purchase._id },
        {
          $set: {
            fulfillmentStatus: "ready",
            fulfilledAt: purchase.fulfilledAt ?? new Date(),
          },
        },
      );
    if (
      ["refunded", "charged_back"].includes(nextStatus) &&
      !hasApprovedPayment.hasApproved
    )
      await PlanPurchase.updateOne(
        { _id: purchase._id },
        { $set: { fulfillmentStatus: "revoked" } },
      );
    if (chargeEventId && shouldApplyMonthlyCharge)
      await PaymentEvent.updateOne(
        { eventId: chargeEventId },
        { $set: { status: "processed" } },
      );
    return { reference: purchase.externalReference, paymentStatus: nextStatus };
  } catch (error) {
    if (chargeEventId && ownsChargeClaim)
      await PaymentEvent.deleteOne({
        eventId: chargeEventId,
        status: "processing",
      });
    throw error;
  }
}
