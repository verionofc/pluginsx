import { Schema, model } from "mongoose";

export type PurchasePlan = "monthly" | "lifetime" | "aether" | "server_slots";
export type PurchaseStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "charged_back";
export interface PlanPurchaseRecord {
  userId: string;
  plan: PurchasePlan;
  serverSlots?: number;
  amount: number;
  regularAmount?: number;
  discountAmount?: number;
  couponId?: string;
  couponCode?: string;
  currency: string;
  externalReference: string;
  status: PurchaseStatus;
  preferenceId?: string;
  mercadoPagoPaymentId?: string;
  mercadoPagoSubscriptionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<PlanPurchaseRecord>({
  userId: { type: String, required: true, index: true },
  plan: { type: String, enum: ["monthly", "lifetime", "aether", "server_slots"], required: true },
  serverSlots: { type: Number, required: true, default: 0, min: 0 },
  amount: { type: Number, required: true },
  regularAmount: { type: Number, min: 0 },
  discountAmount: { type: Number, min: 0, default: 0 },
  couponId: { type: String },
  couponCode: { type: String, uppercase: true },
  currency: { type: String, required: true },
  externalReference: { type: String, required: true, unique: true },
  status: { type: String, enum: ["pending", "approved", "rejected", "cancelled", "refunded", "charged_back"], required: true },
  preferenceId: { type: String, sparse: true, unique: true },
  mercadoPagoPaymentId: { type: String, sparse: true, unique: true },
  mercadoPagoSubscriptionId: { type: String, sparse: true, unique: true },
}, { timestamps: true });
schema.index({ userId: 1, status: 1 });
export const PlanPurchase = model<PlanPurchaseRecord>("plan_purchase", schema);
