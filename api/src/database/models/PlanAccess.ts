import { Schema, model } from "mongoose";

export type PlanName = "free" | "monthly" | "lifetime";
export type PlanStatus = "trial" | "active" | "pending" | "past_due" | "canceled" | "expired" | "revoked";
export interface PlanAccessRecord {
  userId: string;
  plan: PlanName;
  status: PlanStatus;
  trialUsedAt?: Date;
  trialLicenseCode?: string;
  trialLicenseExpiresAt?: Date;
  startsAt?: Date;
  expiresAt?: Date;
  mercadoPagoSubscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
  updatedAt: Date;
}

const schema = new Schema<PlanAccessRecord>({
  userId: { type: String, required: true, unique: true },
  plan: { type: String, enum: ["free", "monthly", "lifetime"], required: true },
  status: { type: String, enum: ["trial", "active", "pending", "past_due", "canceled", "expired", "revoked"], required: true },
  trialUsedAt: Date,
  // Retain the code only for the temporary license's recovery window.
  trialLicenseCode: String,
  trialLicenseExpiresAt: Date,
  startsAt: Date,
  expiresAt: Date,
  mercadoPagoSubscriptionId: { type: String, sparse: true, unique: true },
  cancelAtPeriodEnd: { type: Boolean, default: false },
}, { timestamps: true });

export const PlanAccess = model<PlanAccessRecord>("plan_access", schema);
