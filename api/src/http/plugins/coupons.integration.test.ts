import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import mongoose from "mongoose";
import { Coupon } from "../../database/models/Coupon.js";
import { CouponAccountUsage } from "../../database/models/CouponAccountUsage.js";
import { CouponRedemption } from "../../database/models/CouponRedemption.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PaymentEvent } from "../../database/models/PaymentEvent.js";
import { reserveCoupon, settleCouponReservation } from "./coupons.js";
import { syncSubscriptionAuthorization } from "./subscription-access.js";
import { claimPaymentEvent } from "./payment-events.js";

// Opt in with an isolated local replica set. Never connect this test to application data.
const uri = process.env.COUPON_TEST_MONGODB_URI;
describe("coupon transactions and subscription events", { skip: !uri }, () => {
  before(async () => {
    assert.match(uri!, /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/pluginsx_coupon_test(?:\?|$)/);
    await mongoose.connect(uri!);
    await Promise.all([Coupon.init(), CouponAccountUsage.init(), CouponRedemption.init(), PlanAccess.init(), PaymentEvent.init()]);
  });
  after(async () => { await mongoose.disconnect(); });
  beforeEach(async () => {
    await Promise.all([Coupon.deleteMany({}), CouponAccountUsage.deleteMany({}), CouponRedemption.deleteMany({}), PlanAccess.deleteMany({}), PaymentEvent.deleteMany({})]);
  });
  const createCoupon = (extra = {}) => Coupon.create({ code: "TEST", products: ["lifetime"], discountType: "fixed", discountValue: 10, usageMode: "multi", createdBy: "test-owner", ...extra });
  const reserve = (coupon: Awaited<ReturnType<typeof createCoupon>>, purchaseReference: string, userId = "alice") => reserveCoupon({ coupon, purchaseReference, userId, discountAmount: 10 });

  test("concurrent accounts cannot exceed the global cap", async () => {
    const coupon = await createCoupon({ maxUses: 3 });
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => reserve(coupon, `order-${index}`, `user-${index}`)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 3);
    assert.equal((await Coupon.findById(coupon._id))?.reservedCount, 3);
    assert.equal(await CouponRedemption.countDocuments({ status: "reserved" }), 3);
  });
  test("concurrent reservations enforce each account cap and roll back rejected global increments", async () => {
    const coupon = await createCoupon({ maxPerAccount: 2 });
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => reserve(coupon, `order-${index}`, index < 5 ? "alice" : "bob")));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 4);
    assert.equal((await Coupon.findById(coupon._id))?.reservedCount, 4);
    for (const userId of ["alice", "bob"]) assert.equal((await CouponAccountUsage.findOne({ userId }))?.reservedCount, 2);
  });
  test("a duplicate purchase reference cannot leak a reservation", async () => {
    const coupon = await createCoupon({ maxPerAccount: 5 });
    await reserve(coupon, "same-order");
    await assert.rejects(reserve(coupon, "same-order"));
    assert.equal((await Coupon.findById(coupon._id))?.reservedCount, 1);
    assert.equal((await CouponAccountUsage.findOne({ userId: "alice" }))?.reservedCount, 1);
  });
  test("duplicate payment notifications consume exactly one use", async () => {
    const coupon = await createCoupon({ maxPerAccount: 1 });
    await reserve(coupon, "paid");
    await Promise.all([settleCouponReservation("paid", "approved"), settleCouponReservation("paid", "approved")]);
    const global = await Coupon.findById(coupon._id);
    const account = await CouponAccountUsage.findOne({ userId: "alice" });
    assert.equal(global?.usageCount, 1); assert.equal(global?.reservedCount, 0);
    assert.equal(account?.usedCount, 1); assert.equal(account?.reservedCount, 0);
    await assert.rejects(reserve(coupon, "second"));
  });
  test("a settlement error leaves the redemption and counters retryable", async () => {
    const coupon = await createCoupon({ maxPerAccount: 1 });
    await reserve(coupon, "retry");
    await CouponAccountUsage.deleteMany({});
    await assert.rejects(settleCouponReservation("retry", "approved"));
    assert.equal((await CouponRedemption.findOne({ purchaseReference: "retry" }))?.status, "reserved");
    assert.equal((await Coupon.findById(coupon._id))?.reservedCount, 1);
    assert.equal((await Coupon.findById(coupon._id))?.usageCount, 0);
    await CouponAccountUsage.create({ couponId: String(coupon._id), userId: "alice", reservedCount: 1 });
    await settleCouponReservation("retry", "approved");
    assert.equal((await Coupon.findById(coupon._id))?.usageCount, 1);
  });
  test("terminal cancellation releases both limits only once", async () => {
    const coupon = await createCoupon({ maxUses: 1, maxPerAccount: 1 });
    await reserve(coupon, "canceled");
    await settleCouponReservation("canceled", "released");
    await settleCouponReservation("canceled", "released");
    assert.equal((await Coupon.findById(coupon._id))?.reservedCount, 0);
    await reserve(coupon, "replacement");
    assert.equal((await Coupon.findById(coupon._id))?.reservedCount, 1);
  });
  test("subscription authorization preserves the paid period, canceled renewal and owner grants", async () => {
    const expiresAt = new Date(Date.now() + 86_400_000);
    for (const [userId, extra] of [
      ["paid", { plan: "monthly", status: "active", expiresAt, cancelAtPeriodEnd: true }],
      ["permanent", { plan: "aether", status: "active" }],
      ["owner-grant", { plan: "monthly", status: "active", grantSource: "owner", expiresAt }],
      ["revoked", { plan: "monthly", status: "revoked", expiresAt }],
    ] as const) {
      await PlanAccess.create({ userId, ...extra });
      const original = await PlanAccess.findOne({ userId }).lean();
      await syncSubscriptionAuthorization(userId, "subscription", true);
      assert.deepEqual(await PlanAccess.findOne({ userId }).lean(), original);
    }
    await syncSubscriptionAuthorization("new", "subscription", true);
    assert.equal((await PlanAccess.findOne({ userId: "new" }))?.status, "pending");
  });
  test("webhook retries reclaim an abandoned event once and acknowledge only processed events", async () => {
    const now = new Date();
    assert.equal(await claimPaymentEvent("event", "payment", "123", now), "claimed");
    assert.equal(await claimPaymentEvent("event", "payment", "123", now), "busy");
    const later = new Date(now.getTime() + 6 * 60_000);
    const results = await Promise.all([claimPaymentEvent("event", "payment", "123", later), claimPaymentEvent("event", "payment", "123", later)]);
    assert.deepEqual(results.sort(), ["busy", "claimed"]);
    await PaymentEvent.updateOne({ eventId: "event" }, { $set: { status: "processed" } });
    assert.equal(await claimPaymentEvent("event", "payment", "123", later), "processed");
  });
});
