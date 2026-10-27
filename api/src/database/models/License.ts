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

// Sparse uniqueness permits the shared default license while enforcing one
// account-bound license for each authenticated user.
LicenseSchema.index({ ownerId: 1 }, { unique: true, sparse: true });
LicenseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const License = model<LicenseInterface>("license", LicenseSchema);
