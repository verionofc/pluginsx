import { Schema, model } from "mongoose";

export interface CouponAccountUsageRecord {
  couponId: string;
  userId: string;
  usedCount: number;
  reservedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<CouponAccountUsageRecord>({
  couponId: { type: String, required: true },
  userId: { type: String, required: true },
  usedCount: { type: Number, default: 0, min: 0 },
  reservedCount: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

schema.index({ couponId: 1, userId: 1 }, { unique: true });
export const CouponAccountUsage = model<CouponAccountUsageRecord>("coupon_account_usage", schema);
