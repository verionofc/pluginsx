import { Schema, model } from "mongoose";

export type PurchasePlan = "monthly" | "lifetime";
export type PurchaseStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "charged_back";
export interface PlanPurchaseRecord {
  userId: string;
  plan: PurchasePlan;
  amount: number;
  currency: "BRL";
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
  plan: { type: String, enum: ["monthly", "lifetime"], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, enum: ["BRL"], required: true },
  externalReference: { type: String, required: true, unique: true },
  status: { type: String, enum: ["pending", "approved", "rejected", "cancelled", "refunded", "charged_back"], required: true },
  preferenceId: { type: String, sparse: true, unique: true },
  mercadoPagoPaymentId: { type: String, sparse: true, unique: true },
  mercadoPagoSubscriptionId: { type: String, sparse: true, unique: true },
}, { timestamps: true });
export const PlanPurchase = model<PlanPurchaseRecord>("plan_purchase", schema);
