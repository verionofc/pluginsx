import { Schema, model } from "mongoose";

interface BillingRateLimitRecord {
  key: string;
  count: number;
  expiresAt: Date;
}

const schema = new Schema<BillingRateLimitRecord>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const BillingRateLimit = model<BillingRateLimitRecord>("billing_rate_limit", schema);
