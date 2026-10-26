import { Schema, model } from "mongoose";

export type CouponProduct = "monthly" | "lifetime" | "aether" | "server_slots";
export type CouponUsageMode = "single" | "multi" | "per_account";
export type CouponDiscountType = "percentage" | "fixed";

export interface CouponRecord {
  code: string;
  products: CouponProduct[];
  discountType: CouponDiscountType;
  discountValue: number;
  usageMode: CouponUsageMode;
  maxUses: number | null;
  maxPerAccount: number | null;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  monthlyRecurring: boolean;
  isActive: boolean;
  usageCount: number;
  reservedCount: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<CouponRecord>({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true, minlength: 3, maxlength: 32 },
  products: {
    type: [{ type: String, enum: ["monthly", "lifetime", "aether", "server_slots"] }],
    required: true,
    validate: (value: string[]) => value.length > 0,
  },
  discountType: { type: String, enum: ["percentage", "fixed"], required: true },
  discountValue: { type: Number, required: true, min: 0.01 },
  usageMode: { type: String, enum: ["single", "multi", "per_account"], required: true },
  maxUses: { type: Number, min: 1, default: null },
  maxPerAccount: { type: Number, min: 1, default: null },
  startsAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  monthlyRecurring: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
  usageCount: { type: Number, default: 0, min: 0 },
  reservedCount: { type: Number, default: 0, min: 0 },
  createdBy: { type: String, required: true },
}, { timestamps: true });

schema.index({ isActive: 1, expiresAt: 1 });
export const Coupon = model<CouponRecord>("coupon", schema);
