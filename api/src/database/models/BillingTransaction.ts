import { Schema, model } from "mongoose";

export type BillingTransactionPlan = "monthly" | "lifetime" | "aether" | "server_slots";
export type BillingTransactionStatus = "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "charged_back";

export interface BillingTransactionRecord {
  userId: string;
  purchaseReference: string;
  providerPaymentId: string;
  plan: BillingTransactionPlan;
  serverSlots: number;
  amount: number;
  discountAmount?: number;
  couponCode?: string;
  currency: string;
  status: BillingTransactionStatus;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<BillingTransactionRecord>({
  userId: { type: String, required: true, index: true },
  purchaseReference: { type: String, required: true, index: true },
  providerPaymentId: { type: String, required: true, unique: true },
  plan: { type: String, enum: ["monthly", "lifetime", "aether", "server_slots"], required: true },
  serverSlots: { type: Number, required: true, default: 0, min: 0 },
  amount: { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, min: 0, default: 0 },
  couponCode: { type: String, uppercase: true },
  currency: { type: String, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected", "cancelled", "refunded", "charged_back"], required: true },
  paidAt: Date,
}, { timestamps: true });

schema.index({ status: 1, paidAt: 1 });
schema.index({ userId: 1, paidAt: -1 });

export const BillingTransaction = model<BillingTransactionRecord>("billing_transaction", schema);
