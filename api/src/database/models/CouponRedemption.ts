import { Schema, model } from "mongoose";

export type CouponRedemptionStatus = "reserved" | "approved" | "released";

export interface CouponRedemptionRecord {
  couponId: string;
  code: string;
  userId: string;
  purchaseReference: string;
  discountAmount: number;
  accountLimited?: boolean;
  status: CouponRedemptionStatus;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<CouponRedemptionRecord>({
  couponId: { type: String, required: true, index: true },
  code: { type: String, required: true },
  userId: { type: String, required: true, index: true },
  purchaseReference: { type: String, required: true, unique: true },
  discountAmount: { type: Number, required: true, min: 0 },
  accountLimited: Boolean,
  status: { type: String, enum: ["reserved", "approved", "released"], required: true, default: "reserved" },
}, { timestamps: true });

schema.index({ couponId: 1, userId: 1, status: 1 });
schema.index({ status: 1, createdAt: 1 });
export const CouponRedemption = model<CouponRedemptionRecord>("coupon_redemption", schema);
