import type { PlanTerms } from "../../domain/licensing-config.js";
import { Schema, model } from "mongoose";

export type LicenseTier = "default" | "plus";

export interface LicenseInterface {
  _id: string;
  ownerId?: string;
  value: {
    tier: LicenseTier;
    valid: boolean;
  };
  planTerms?: PlanTerms;
  serverSlots?: number;
  activationRevision?: number;
  sourcePlan?: "trial" | "monthly" | "lifetime" | "aether";
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const LicenseSchema = new Schema<LicenseInterface>(
  {
    _id: { type: String, required: true },
    ownerId: { type: String, required: false },
    value: {
      tier: {
        type: String,
        enum: ["default", "plus"],
        required: true,
        default: "default",
      },
      valid: { type: Boolean, default: true },
    },
    // This tracks active and pending reservations; the route enforces the
    // account's plan capacity, including purchased additional slots.
    planTerms: Schema.Types.Mixed,
    activationRevision: { type: Number, default: 0 },
    serverSlots: { type: Number, default: 0, min: 0 },
    sourcePlan: {
      type: String,
      enum: ["trial", "monthly", "lifetime", "aether"],
    },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

// Trial keys are independent. A paid key belongs to one account and one plan,
// even when that account later upgrades to a different paid plan.
LicenseSchema.index(
  { ownerId: 1, sourcePlan: 1 },
  {
    name: "one_paid_key_per_account_plan",
    unique: true,
    partialFilterExpression: {
      ownerId: { $type: "string" },
      sourcePlan: { $in: ["monthly", "lifetime", "aether"] },
    },
  },
);
LicenseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const License = model<LicenseInterface>("license", LicenseSchema);
