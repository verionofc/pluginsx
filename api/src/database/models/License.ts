import { Schema, model } from "mongoose";

export type LicenseTier = "default" | "plus";

export interface LicenseInterface {
  _id: string;
  ownerId?: string;
  value: {
    tier: LicenseTier;
    valid: boolean;
  };
  serverSlots?: number;
  sourcePlan?: "trial" | "monthly" | "lifetime";
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const LicenseSchema = new Schema<LicenseInterface>({
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
  // Lifetime licenses can reserve five servers; the API enforces the
  // per-plan limit when creating each reservation.
  serverSlots: { type: Number, default: 0, min: 0, max: 5 },
  sourcePlan: { type: String, enum: ["trial", "monthly", "lifetime"] },
  expiresAt: { type: Date },
}, { timestamps: true });

// Sparse uniqueness permits the shared default license while enforcing one
// account-bound license for each authenticated user.
LicenseSchema.index({ ownerId: 1 }, { unique: true, sparse: true });
LicenseSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const License = model<LicenseInterface>("license", LicenseSchema);
