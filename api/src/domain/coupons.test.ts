import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { CouponRecord } from "../database/models/Coupon.js";
import { applyCouponDiscountToLines, CouponError, quoteCoupon, type CouponPriceLine } from "./coupons.js";

const now = new Date("2026-10-26T12:00:00Z");
const coupon = (changes: Partial<CouponRecord> = {}): CouponRecord => ({
  code: "CAVERNA", products: ["lifetime", "server_slots"], discountType: "fixed", discountValue: 10,
  usageMode: "multi", maxUses: null, maxPerAccount: null, monthlyRecurring: true,
  isActive: true, usageCount: 0, reservedCount: 0, createdBy: "owner", createdAt: now, updatedAt: now,
  ...changes,
});
const lines: CouponPriceLine[] = [{ product: "lifetime", amount: 59.9 }, { product: "server_slots", amount: 4.9 }];
const cents = (amount: number) => Math.round(amount * 100);

describe("coupon prices", () => {
  test("keeps the checkout equal to the quote when only one cent remains across multiple items", () => {
    const deal = coupon({ discountValue: 1000 });
    const quote = quoteCoupon(deal, lines, now);
    const items = applyCouponDiscountToLines(lines, deal.products, quote.discountAmount);
    assert.equal(quote.total, 0.01);
    assert.equal(items.reduce((sum, item) => sum + cents(item.amount), 0), 1);
    assert.ok(items.every((item) => item.amount >= 0));
    assert.equal(items.filter((item) => item.amount > 0).length, 1);
  });
  test("discounts only eligible products and never applies a recurring label to a one-time order", () => {
    const deal = coupon({ products: ["monthly", "lifetime"], discountType: "percentage", discountValue: 15 });
    const quote = quoteCoupon(deal, lines, now);
    assert.equal(quote.discountAmount, 8.99);
    assert.equal(quote.monthlyRecurring, false);
    assert.deepEqual(applyCouponDiscountToLines(lines, deal.products, quote.discountAmount), [
      { product: "lifetime", amount: 50.91 }, { product: "server_slots", amount: 4.9 },
    ]);
    assert.equal(quoteCoupon(deal, [{ product: "monthly", amount: 11.9 }], now).monthlyRecurring, true);
  });
  test("allocates fractional cents deterministically and preserves the original lines", () => {
    const input: CouponPriceLine[] = Array.from({ length: 3 }, () => ({ product: "server_slots", amount: 1 }));
    const result = applyCouponDiscountToLines(input, ["server_slots"], 0.01);
    assert.deepEqual(result.map((item) => item.amount), [0.99, 1, 1]);
    assert.ok(input.every((item) => item.amount === 1));
    assert.throws(() => applyCouponDiscountToLines(input, ["lifetime"], 1));
  });
  test("maintains exact totals for fixed and percentage discounts at every boundary", () => {
    for (const discountType of ["fixed", "percentage"] as const) {
      for (const amount of [0.02, 0.03, 0.99, 4.9, 59.9, 129.9, 99999.99]) {
        for (const discountValue of [0.01, 1, 15.5, 99.99]) {
          const deal = coupon({ discountType, discountValue });
          const input: CouponPriceLine[] = [{ product: "lifetime", amount }, { product: "server_slots", amount: 0.01 }];
          try {
            const quote = quoteCoupon(deal, input, now);
            const result = applyCouponDiscountToLines(input, deal.products, quote.discountAmount);
            assert.equal(result.reduce((sum, item) => sum + cents(item.amount), 0), cents(quote.total));
          } catch (error) {
            if (!(error instanceof CouponError && error.code === "COUPON_DISCOUNT_TOO_SMALL")) throw error;
          }
        }
      }
    }
  });
  test("enforces validity windows, activity and global reservations", () => {
    for (const [override, code] of [
      [{ isActive: false }, "COUPON_INACTIVE"],
      [{ startsAt: new Date(now.getTime() + 1) }, "COUPON_NOT_STARTED"],
      [{ expiresAt: now }, "COUPON_EXPIRED"],
      [{ maxUses: 2, usageCount: 1, reservedCount: 1 }, "COUPON_LIMIT_REACHED"],
    ] as const) {
      assert.throws(() => quoteCoupon(coupon(override), lines, now), (error: unknown) => error instanceof CouponError && error.code === code);
    }
    assert.equal(quoteCoupon(coupon({ startsAt: now }), lines, now).discountAmount, 10);
  });
  test("refuses ineligible and free products", () => {
    assert.throws(() => quoteCoupon(coupon({ products: ["aether"] }), lines, now), CouponError);
    assert.throws(() => quoteCoupon(coupon(), [{ product: "lifetime", amount: 0 }], now), CouponError);
  });
});
