import {
  PlanAccess,
  type PlanAccessRecord,
} from "../../database/models/PlanAccess.js";
import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import { env } from "../../env.js";
import type { ClientSession } from "mongoose";
import { recordedPurchaseStatus } from "./billing-payment-ledger.js";
import { addRecurringInterval, PLANS_CONFIG } from "./billing-config.js";

export async function isPaidAccessFunded(
  access: Pick<
    PlanAccessRecord,
    "userId" | "purchaseReference" | "grantSource" | "plan" | "planTerms"
  >,
  session?: ClientSession,
): Promise<boolean> {
  if (access.grantSource === "owner" || !access.purchaseReference) return true;
  const state = await recordedPurchaseStatus(
    access.userId,
    access.purchaseReference,
    "approved",
    session,
  );
  if (["refunded", "charged_back"].includes(state)) return false;
  if (access.plan === "monthly") {
    const lastPaid = await BillingTransaction.findOne({
      userId: access.userId,
      purchaseReference: access.purchaseReference,
      status: "approved",
      paidAt: { $exists: true },
    })
      .sort({ paidAt: -1 })
      .select({ paidAt: 1 })
      .session(session ?? null)
      .lean();
    // An older settled invoice cannot fund a later period whose payment was
    // reversed, even if the access summary has not been reconciled yet.
    if (lastPaid?.paidAt)
      return (
        addRecurringInterval(
          lastPaid.paidAt,
          access.planTerms?.duration ??
            PLANS_CONFIG.plans.monthly.recurrence.frequency,
          access.planTerms?.durationUnit === "days"
            ? "days"
            : access.planTerms?.durationUnit === "months"
              ? "months"
              : PLANS_CONFIG.plans.monthly.recurrence.frequencyType,
        ) > new Date()
      );
  }
  return true;
}

export function hasTrustedWebOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return Boolean(
    origin &&
      [env.URL, env.DEV_URL].some((url) => new URL(url).origin === origin),
  );
}

export async function hasPremiumAccess(userId: string): Promise<boolean> {
  const access = await PlanAccess.findOne({
    userId,
    status: "active",
    $or: [
      { plan: { $in: ["lifetime", "aether"] } },
      { plan: "monthly", expiresAt: { $gt: new Date() } },
    ],
  })
    .select({
      _id: 1,
      userId: 1,
      plan: 1,
      planTerms: 1,
      purchaseReference: 1,
      grantSource: 1,
    })
    .lean();
  return Boolean(access && (await isPaidAccessFunded(access)));
}

export async function getPaidPlan(
  userId: string,
): Promise<"monthly" | "lifetime" | "aether" | null> {
  const access = await PlanAccess.findOne({
    userId,
    status: "active",
    $or: [
      { plan: { $in: ["lifetime", "aether"] } },
      { plan: "monthly", expiresAt: { $gt: new Date() } },
    ],
  })
    .select({
      plan: 1,
      planTerms: 1,
      userId: 1,
      purchaseReference: 1,
      grantSource: 1,
    })
    .lean();
  return access &&
    (await isPaidAccessFunded(access)) &&
    (access.plan === "monthly" ||
      access.plan === "lifetime" ||
      access.plan === "aether")
    ? access.plan
    : null;
}
