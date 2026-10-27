import type { PlanTerms } from "../../domain/licensing-config.js";
import { Schema, model } from "mongoose";

export type PurchasePlan = "monthly" | "lifetime" | "aether" | "server_slots";
export type PurchaseStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back";
export interface PlanPurchaseRecord {
  userId: string;
  plan: PurchasePlan;
  serverSlots?: number;
  amount: number;
  planTerms?: PlanTerms;
  commercialVersion?: number;
  slotUnitPriceCents?: number;
  regularAmount?: number;
  upgradeCreditCents?: number;
  upgradeCreditPaymentId?: string;
  upgradeFromSubscriptionId?: string;
  upgradeCreditReserved?: boolean;
  upgradeCreditReversed?: boolean;
  subscriptionCancellationStatus?: "pending" | "cancelled" | "failed";
  checkoutUrl?: string;
  entitlementCheckoutReserved?: boolean;
  providerDeliveryStatus?: "pending" | "applied" | "failed";
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

const schema = new Schema<PlanPurchaseRecord>(
  {
    userId: { type: String, required: true, index: true },
    plan: {
      type: String,
      enum: ["monthly", "lifetime", "aether", "server_slots"],
      required: true,
    },
    serverSlots: { type: Number, required: true, default: 0, min: 0 },
    amount: { type: Number, required: true },
    planTerms: Schema.Types.Mixed,
    commercialVersion: { type: Number, min: 1 },
    slotUnitPriceCents: { type: Number, min: 1 },
    upgradeCreditCents: { type: Number, default: 0 },
    upgradeCreditPaymentId: String,
    upgradeFromSubscriptionId: String,
    upgradeCreditReserved: Boolean,
    upgradeCreditReversed: Boolean,
    subscriptionCancellationStatus: String,
    providerDeliveryStatus: String,
    checkoutUrl: String,
    entitlementCheckoutReserved: Boolean,
    regularAmount: { type: Number, min: 0 },
    discountAmount: { type: Number, min: 0, default: 0 },
    couponId: { type: String },
    couponCode: { type: String, uppercase: true },
    currency: { type: String, required: true },
    externalReference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "refunded",
        "charged_back",
      ],
      required: true,
    },
    preferenceId: { type: String, sparse: true, unique: true },
    mercadoPagoPaymentId: { type: String, sparse: true, unique: true },
    mercadoPagoSubscriptionId: { type: String, sparse: true, unique: true },
  },
  { timestamps: true },
);
schema.index({ userId: 1, status: 1 });
schema.index(
  { userId: 1, entitlementCheckoutReserved: 1 },
  {
    name: "one_pending_contract_per_user",
    unique: true,
    partialFilterExpression: { entitlementCheckoutReserved: true },
  },
);
schema.index(
  { upgradeCreditPaymentId: 1 },
  { unique: true, partialFilterExpression: { upgradeCreditReserved: true } },
);
export const PlanPurchase = model<PlanPurchaseRecord>("plan_purchase", schema);
