import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { BillingConflict, lockBillingAccount } from "./billing-lock.js";
import { assertUpgradeCredit } from "./upgrade.js";

/** Grant only from persisted payments; no provider request belongs in this transaction. */
export async function grantPermanentPurchase(reference: string): Promise<void> {
  const initial = await PlanPurchase.findOne({ externalReference: reference })
    .select({ userId: 1 })
    .lean();
  if (!initial) throw new BillingConflict("Compra não encontrada.");
  await PlanAccess.db.transaction(async (session) => {
    await lockBillingAccount(initial.userId, session);
    const purchase = await PlanPurchase.findOne({
      externalReference: reference,
      userId: initial.userId,
    })
      .session(session)
      .lean();
    if (!purchase || !["lifetime", "aether"].includes(purchase.plan))
      throw new BillingConflict(
        "Esta compra não corresponde a um plano vitalício.",
      );
    const approved =
      purchase.amount === 0 ||
      (await BillingTransaction.exists({
        purchaseReference: reference,
        userId: initial.userId,
        status: "approved",
      }).session(session));
    if (!approved)
      throw new BillingConflict(
        "O pagamento desta compra não está aprovado.",
        "PAYMENT_NOT_APPROVED",
      );
    await assertUpgradeCredit(purchase, session);
    if (
      purchase.upgradeFromSubscriptionId &&
      purchase.subscriptionCancellationStatus !== "cancelled"
    )
      throw new BillingConflict(
        "Aguardando a confirmação do encerramento da assinatura mensal.",
        "UPGRADE_CANCELLATION_PENDING",
      );
    const current = await PlanAccess.findOne({ userId: initial.userId })
      .session(session)
      .lean();
    const permanent =
      (current?.plan === "lifetime" || current?.plan === "aether") &&
      current.status === "active";
    if (!permanent) {
      await PlanAccess.updateOne(
        { userId: initial.userId },
        {
          $set: {
            userId: initial.userId,
            plan: purchase.plan,
            status: "active",
            purchaseReference: reference,
            startsAt: new Date(),
            expiresAt: null,
            cancelAtPeriodEnd: false,
            ...(purchase.planTerms ? { planTerms: purchase.planTerms } : {}),
          },
          $unset: {
            grantSource: "",
            serverLimitOverride: "",
            serverLimitUnlimited: "",
            mercadoPagoSubscriptionId: "",
            nextBillingAt: "",
            billingScheduleCheckedAt: "",
            billingScheduleSubscriptionId: "",
            billingRenewalEnabled: "",
          },
        },
        { session },
      );
    }
    await PlanPurchase.updateOne(
      { _id: purchase._id },
      {
        $set: {
          status: "approved",
          providerDeliveryStatus: "applied",
          entitlementCheckoutReserved: false,
        },
      },
      { session },
    );
  });
}
