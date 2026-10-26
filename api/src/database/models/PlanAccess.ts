import { Schema, model } from "mongoose";

export type PlanName = "free" | "monthly" | "lifetime" | "aether";
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
  nextBillingAt?: Date | null;
  billingScheduleCheckedAt?: Date;
  billingScheduleSubscriptionId?: string;
  billingRenewalEnabled?: boolean;
  grantSource?: "owner";
  serverLimitOverride?: number;
  serverLimitUnlimited?: boolean;
  updatedAt: Date;
}

const schema = new Schema<PlanAccessRecord>({
  userId: { type: String, required: true, unique: true },
  plan: { type: String, enum: ["free", "monthly", "lifetime", "aether"], required: true },
  status: { type: String, enum: ["trial", "active", "pending", "past_due", "canceled", "expired", "revoked"], required: true },
  trialUsedAt: Date,
  // Retain the code only for the temporary license's recovery window.
  trialLicenseCode: String,
  trialLicenseExpiresAt: Date,
  startsAt: Date,
  expiresAt: Date,
  mercadoPagoSubscriptionId: { type: String, sparse: true, unique: true },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  nextBillingAt: Date,
  billingScheduleCheckedAt: Date,
  billingScheduleSubscriptionId: String,
  billingRenewalEnabled: Boolean,
  grantSource: { type: String, enum: ["owner"] },
  serverLimitOverride: { type: Number, min: 1, max: 1_000_000 },
  serverLimitUnlimited: { type: Boolean, default: false },
}, { timestamps: true });

export const PlanAccess = model<PlanAccessRecord>("plan_access", schema);
