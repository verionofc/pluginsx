import type { ClientSession } from "mongoose";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import {
  PlanPurchase,
  type PurchasePlan,
} from "../../database/models/PlanPurchase.js";

export class BillingConflict extends Error {
  readonly status = 409;

  constructor(
    message: string,
    readonly code = "ENTITLEMENT_CONFLICT",
  ) {
    super(message);
  }
}

/** All checkout and fulfillment transitions serialize on the account document. */
export async function lockBillingAccount(
  userId: string,
  session: ClientSession,
) {
  await PlanAccess.updateOne(
    { userId },
    {
      $setOnInsert: { userId, plan: "free", status: "expired" },
      $inc: { billingRevision: 1 },
    },
    { upsert: true, session },
  );
}

/** Call after locking the account, before reserving a new paid contract. */
export async function assertCheckoutEntitlement(
  userId: string,
  plan: PurchasePlan,
  session: ClientSession,
) {
  const current = await PlanAccess.findOne({ userId }).session(session).lean();
  const permanent =
    (current?.plan === "lifetime" || current?.plan === "aether") &&
    current.status === "active";
  if (plan === "server_slots") {
    const monthly =
      current?.plan === "monthly" &&
      current.status === "active" &&
      current.expiresAt &&
      current.expiresAt > new Date();
    if (!permanent && !monthly)
      throw new BillingConflict(
        "Ative um plano pago antes de comprar vagas extras.",
        "PAID_PLAN_REQUIRED",
      );
    return;
  }
  if (permanent) throw new BillingConflict("Um plano vitalício já está ativo.");
  // Old checkouts predate the partial reservation index. They may still be
  // payable, so do not create a second contract before they are reconciled.
  const legacyPending = await PlanPurchase.exists({
    userId,
    plan: { $in: ["monthly", "lifetime", "aether"] },
    status: "pending",
    entitlementCheckoutReserved: { $exists: false },
    $or: [
      { mercadoPagoSubscriptionId: { $exists: true } },
      { preferenceId: { $exists: true } },
    ],
  }).session(session);
  if (legacyPending)
    throw new BillingConflict(
      "Existe uma contratação anterior aguardando confirmação. Retome ou reconcilie esse pedido antes de contratar outro plano.",
      "CHECKOUT_ALREADY_PENDING",
    );
  if (
    plan === "monthly" &&
    current?.plan === "monthly" &&
    ["active", "pending", "past_due"].includes(current.status)
  )
    throw new BillingConflict(
      "Já existe uma assinatura mensal. Gerencie-a antes de contratar outro plano.",
    );
}
