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
  serverSlots: { type: Number, default: 0, min: 0, max: 3 },
});

// Sparse uniqueness permits the shared default license while enforcing one
// account-bound license for each authenticated user.
LicenseSchema.index({ ownerId: 1 }, { unique: true, sparse: true });

export const License = model<LicenseInterface>("license", LicenseSchema);
