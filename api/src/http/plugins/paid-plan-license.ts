import type { ClientSession } from "mongoose";
import { randomUUID } from "node:crypto";
import { License } from "../../database/models/License.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { acceptedPlanTerms } from "../../domain/licensing-config.js";
import { BillingConflict, lockBillingAccount } from "./billing-lock.js";
import { getLicensingConfig } from "./licensing-config.js";
import { isPaidAccessFunded } from "./plan-access.js";

export const paidLicensePlans = ["monthly", "lifetime", "aether"] as const;
export type PaidLicensePlan = (typeof paidLicensePlans)[number];

/** Preserve existing key identities while replacing account-wide uniqueness. */
export async function migratePlanLicenseIndexes() {
  await License.createCollection();
  // Temporary licenses historically had no owner, but older deployments may
  // have attached one. Their finite lifetime must never become a paid key.
  await License.updateMany(
    { ownerId: { $type: "string" }, expiresAt: { $type: "date" } },
    { $set: { sourcePlan: "trial" } },
  );
  for await (const license of License.find({
    ownerId: { $type: "string" },
    sourcePlan: { $exists: false },
    expiresAt: null,
    "value.tier": "plus",
  })
    .lean()
    .cursor()) {
    const access = await PlanAccess.findOne({
      userId: license.ownerId,
      plan: { $in: paidLicensePlans },
    })
      .select({ plan: 1, planTerms: 1 })
      .lean();
    if (access)
      await License.updateOne(
        { _id: license._id, sourcePlan: { $exists: false } },
        {
          $set: {
            sourcePlan: access.plan,
            ...(access.planTerms ? { planTerms: access.planTerms } : {}),
          },
        },
      );
  }
  await License.collection.createIndex(
    { ownerId: 1, sourcePlan: 1 },
    {
      name: "one_paid_key_per_account_plan",
      unique: true,
      partialFilterExpression: {
        ownerId: { $type: "string" },
        sourcePlan: { $in: [...paidLicensePlans] },
      },
    },
  );
  const indexes = await License.collection.indexes();
  for (const index of indexes) {
    if (
      index.unique &&
      Object.keys(index.key).length === 1 &&
      index.key.ownerId === 1 &&
      index.name
    )
      await License.collection.dropIndex(index.name);
  }
}

/** Called inside fulfillment; GET inventory also repairs already-paid missing keys. */
export async function ensurePaidPlanLicense(
  userId: string,
  plan: PaidLicensePlan,
  session?: ClientSession,
): Promise<{ code: string; created: boolean }> {
  if (!session) {
    const active = await PlanAccess.findOne({
      userId,
      plan,
      status: "active",
      ...(plan === "monthly" ? { expiresAt: { $gt: new Date() } } : {}),
    })
      .select({
        userId: 1,
        plan: 1,
        planTerms: 1,
        purchaseReference: 1,
        grantSource: 1,
      })
      .lean();
    if (!active || !(await isPaidAccessFunded(active)))
      throw new BillingConflict(
        "Este plano não possui acesso pago ativo para emitir uma licença.",
        "PLAN_REQUIRED",
      );
    const existing = await License.findOne({
      ownerId: userId,
      sourcePlan: plan,
      expiresAt: null,
      "value.tier": "plus",
    })
      .select({ _id: 1, planTerms: 1 })
      .lean();
    if (existing?.planTerms) return { code: existing._id, created: false };
  }
  const ensure = async (activeSession: ClientSession) => {
    await lockBillingAccount(userId, activeSession);
    const access = await PlanAccess.findOne({
      userId,
      plan,
      status: "active",
      ...(plan === "monthly" ? { expiresAt: { $gt: new Date() } } : {}),
    })
      .session(activeSession)
      .lean();
    if (!access || !(await isPaidAccessFunded(access, activeSession)))
      throw new BillingConflict(
        "Este plano não possui acesso pago ativo para emitir uma licença.",
        "PLAN_REQUIRED",
      );
    const config = access.planTerms ? null : await getLicensingConfig();
    const terms =
      access.planTerms ??
      acceptedPlanTerms(
        config!,
        config!.plans.find((item) => item.id === plan)!,
      );
    const existing = await License.findOne({
      ownerId: userId,
      sourcePlan: plan,
      expiresAt: null,
      "value.tier": "plus",
    })
      .session(activeSession)
      .lean();
    if (existing) {
      await License.updateOne(
        { _id: existing._id },
        { $set: { planTerms: terms } },
        { session: activeSession },
      );
      return { code: existing._id, created: false };
    }
    // Retain a legacy account key only when it has not already been assigned
    // to a plan. A Trial or another paid plan is never repurposed.
    const legacy = await License.findOne({
      ownerId: userId,
      sourcePlan: { $exists: false },
      expiresAt: null,
      "value.tier": "plus",
    })
      .session(activeSession)
      .lean();
    if (legacy) {
      await License.updateOne(
        { _id: legacy._id, sourcePlan: { $exists: false } },
        { $set: { sourcePlan: plan, planTerms: terms } },
        { session: activeSession },
      );
      return { code: legacy._id, created: false };
    }
    const code = `plus_${randomUUID()}`;
    await License.create(
      [
        {
          _id: code,
          ownerId: userId,
          sourcePlan: plan,
          planTerms: terms,
          value: { tier: "plus", valid: true },
        },
      ],
      { session: activeSession },
    );
    return { code, created: true };
  };
  if (session) return ensure(session);
  // A first-time account lock can race another transaction's unique userId
  // insertion. Retry with a fresh transaction; do not continue an aborted one.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await License.db.transaction(ensure);
    } catch (error) {
      if (
        !(
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === 11000
        ) ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new Error("Unable to ensure an independent paid plan license");
}
