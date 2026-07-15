import { Schema, model } from "mongoose";

export type LicenseTier = "default" | "plus";

export interface LicenseInterface {
  _id: string;
  value: {
    tier: LicenseTier;
    valid: boolean;
  };
}

const LicenseSchema = new Schema<LicenseInterface>({
  _id: { type: String, required: true },
  value: {
    tier: {
      type: String,
      enum: ["default", "plus"],
      required: true,
      default: "default",
    },
    valid: { type: Boolean, default: true },
  },
});

export const License = model<LicenseInterface>("license", LicenseSchema);
