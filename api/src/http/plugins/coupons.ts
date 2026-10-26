import { Coupon, type CouponRecord } from "../../database/models/Coupon.js";
import { CouponAccountUsage } from "../../database/models/CouponAccountUsage.js";
import { CouponRedemption } from "../../database/models/CouponRedemption.js";

import { CouponError } from "../../domain/coupons.js";
export { CouponError, quoteCoupon, type CouponPriceLine, type CouponQuote } from "../../domain/coupons.js";

export async function reserveCoupon({
  coupon,
  userId,
  purchaseReference,
  discountAmount,
  now = new Date(),
}: {
  coupon: CouponRecord & { _id: { toString(): string } };
  userId: string;
  purchaseReference: string;
  discountAmount: number;
  now?: Date;
}) {
  const couponId = coupon._id.toString();
  const couponFilter: Record<string, unknown> = {
    _id: coupon._id,
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }] },
    ],
  };
  if (coupon.maxUses != null) {
    couponFilter.$expr = {
      $lt: [
        { $add: [{ $ifNull: ["$usageCount", 0] }, { $ifNull: ["$reservedCount", 0] }] },
        coupon.maxUses,
      ],
    };
  }
  // Create the account counter independently of the cap predicate. Including a
  // cap in an upsert can attempt to insert a second row when the limit is full.
  if (coupon.maxPerAccount != null) {
    try {
      await CouponAccountUsage.updateOne(
        { couponId, userId },
        { $setOnInsert: { couponId, userId, usedCount: 0, reservedCount: 0 } },
        { upsert: true },
      );
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === 11000)) throw error;
    }
  }

  await Coupon.db.transaction(async (session) => {
    const reservedCoupon = await Coupon.findOneAndUpdate(
      couponFilter,
      { $inc: { reservedCount: 1 } },
      { new: true, session },
    ).lean();
    if (!reservedCoupon) throw new CouponError("Este cupom não está disponível ou atingiu o limite de usos.", "COUPON_LIMIT_REACHED", 409);

    if (reservedCoupon.maxPerAccount != null) {
      const usage = await CouponAccountUsage.findOneAndUpdate(
        {
          couponId, userId,
          $expr: {
            $lt: [
              { $add: [{ $ifNull: ["$usedCount", 0] }, { $ifNull: ["$reservedCount", 0] }] },
              reservedCoupon.maxPerAccount,
            ],
          },
        },
        { $inc: { reservedCount: 1 } },
        { new: true, session },
      );
      if (!usage) throw new CouponError("Esta conta já atingiu o limite de usos deste cupom.", "COUPON_ACCOUNT_LIMIT", 409);
    }
    await CouponRedemption.create([{
      couponId,
      code: coupon.code,
      userId,
      purchaseReference,
      discountAmount,
      accountLimited: reservedCoupon.maxPerAccount != null,
      status: "reserved",
    }], { session });
  });
}

export async function settleCouponReservation(purchaseReference: string, outcome: "approved" | "released") {
  await Coupon.db.transaction(async (session) => {
    const redemption = await CouponRedemption.findOneAndUpdate(
      { purchaseReference, status: "reserved" },
      { $set: { status: outcome } },
      { new: true, session },
    ).lean();
    if (!redemption) return;

    const coupon = await Coupon.findById(redemption.couponId).session(session).lean();
    const adjustment = outcome === "approved"
      ? { $inc: { reservedCount: -1, usageCount: 1 } }
      : { $inc: { reservedCount: -1 } };
    const global = await Coupon.updateOne(
      { _id: redemption.couponId, reservedCount: { $gt: 0 } },
      adjustment,
      { session },
    );
    if (!global.modifiedCount) throw new Error("Coupon reservation counter is missing");
    if (redemption.accountLimited ?? (coupon?.maxPerAccount != null)) {
      const account = await CouponAccountUsage.updateOne(
        { couponId: redemption.couponId, userId: redemption.userId, reservedCount: { $gt: 0 } },
        outcome === "approved"
          ? { $inc: { reservedCount: -1, usedCount: 1 } }
          : { $inc: { reservedCount: -1 } },
        { session },
      );
      if (!account.modifiedCount) throw new Error("Account coupon reservation counter is missing");
    }
  });
}

export async function getCouponUseForAccount(couponId: string, userId: string) {
  return CouponAccountUsage.findOne({ couponId, userId }).select({ usedCount: 1, reservedCount: 1 }).lean();
}
