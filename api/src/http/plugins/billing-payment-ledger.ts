import type { ClientSession } from "mongoose";
import {
  BillingTransaction,
  type BillingTransactionStatus,
} from "../../database/models/BillingTransaction.js";

const terminalStatuses = ["refunded", "charged_back"];
const unpaidStatuses = ["pending", "rejected", "cancelled"];

/** Recorded reversals take precedence over an interrupted order summary update. */
export async function recordedPurchaseStatus(
  userId: string,
  reference: string,
  fallback: BillingTransactionStatus,
  session?: ClientSession,
): Promise<BillingTransactionStatus> {
  const [state] = await BillingTransaction.aggregate<{
    approved: number;
    chargedBack: number;
    refunded: number;
  }>([
    { $match: { userId, purchaseReference: reference } },
    {
      $group: {
        _id: null,
        approved: { $max: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
        chargedBack: {
          $max: { $cond: [{ $eq: ["$status", "charged_back"] }, 1, 0] },
        },
        refunded: { $max: { $cond: [{ $eq: ["$status", "refunded"] }, 1, 0] } },
      },
    },
  ]).session(session ?? null);
  if (state?.approved) return "approved";
  if (state?.chargedBack) return "charged_back";
  if (state?.refunded) return "refunded";
  return fallback;
}

/** A delayed notification cannot undo a recorded reversal or an approved charge. */
export async function recordPaymentAttempt(
  providerPaymentId: string,
  values: Record<string, unknown>,
  session?: ClientSession,
) {
  const status = values.status;
  if (
    typeof status !== "string" ||
    !["approved", ...terminalStatuses, ...unpaidStatuses].includes(status)
  )
    throw new Error("Invalid payment ledger status");
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (
      value === undefined ||
      [
        "_id",
        "createdAt",
        "updatedAt",
        "providerPaymentId",
        "paidAt",
        "status",
      ].includes(key)
    )
      continue;
    fields[key] = { $literal: value };
  }
  fields.providerPaymentId = { $literal: providerPaymentId };
  fields.status = {
    $cond: [
      {
        $or: [
          {
            $and: [
              { $in: ["$status", terminalStatuses] },
              { $not: [{ $in: [{ $literal: status }, terminalStatuses] }] },
            ],
          },
          {
            $and: [
              { $eq: ["$status", "approved"] },
              { $in: [{ $literal: status }, unpaidStatuses] },
            ],
          },
        ],
      },
      "$status",
      { $literal: status },
    ],
  };
  if (values.paidAt != null)
    fields.paidAt = { $ifNull: ["$paidAt", { $literal: values.paidAt }] };
  fields.createdAt = { $ifNull: ["$createdAt", "$$NOW"] };
  fields.updatedAt = "$$NOW";
  const recorded = await BillingTransaction.findOneAndUpdate(
    { providerPaymentId },
    [{ $set: fields }],
    { upsert: true, new: true, ...(session ? { session } : {}) },
  );
  if (!recorded) throw new Error("The payment ledger entry was not persisted");
  return recorded;
}
