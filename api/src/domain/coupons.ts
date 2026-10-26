import type { CouponProduct, CouponRecord } from "../database/models/Coupon.js";

export class CouponError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) {
    super(message);
    this.name = "CouponError";
  }
}

export type CouponPriceLine = { product: CouponProduct; amount: number };
export type CouponQuote = {
  subtotal: number;
  discountAmount: number;
  total: number;
  eligibleAmount: number;
  monthlyRecurring: boolean;
};

const toCents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

export function quoteCoupon(coupon: CouponRecord, lines: CouponPriceLine[], now = new Date()): CouponQuote {
  if (!coupon.isActive) throw new CouponError("Este cupom não está ativo.", "COUPON_INACTIVE");
  if (coupon.startsAt && coupon.startsAt > now) throw new CouponError("Este cupom ainda não está disponível.", "COUPON_NOT_STARTED");
  if (coupon.expiresAt && coupon.expiresAt <= now) throw new CouponError("Este cupom expirou.", "COUPON_EXPIRED");
  if (coupon.maxUses != null && coupon.usageCount + coupon.reservedCount >= coupon.maxUses) {
    throw new CouponError("Este cupom atingiu o limite global de usos.", "COUPON_LIMIT_REACHED");
  }

  const subtotalCents = lines.reduce((total, line) => total + toCents(line.amount), 0);
  const eligibleCents = lines.reduce(
    (total, line) => total + (coupon.products.includes(line.product) ? toCents(line.amount) : 0),
    0,
  );
  if (eligibleCents <= 1) throw new CouponError("Este cupom não se aplica aos itens pagos selecionados.", "COUPON_PRODUCT_MISMATCH");

  const requestedDiscountCents = coupon.discountType === "percentage"
    ? Math.round(eligibleCents * coupon.discountValue / 100)
    : toCents(coupon.discountValue);
  const discountCents = Math.min(requestedDiscountCents, eligibleCents - 1);
  if (discountCents < 1) throw new CouponError("O desconto deste cupom é menor que R$ 0,01 neste pedido.", "COUPON_DISCOUNT_TOO_SMALL");

  return {
    subtotal: subtotalCents / 100,
    discountAmount: discountCents / 100,
    total: (subtotalCents - discountCents) / 100,
    eligibleAmount: eligibleCents / 100,
    monthlyRecurring: lines.some((line) => line.product === "monthly" && line.amount > 0)
      && coupon.products.includes("monthly") && coupon.monthlyRecurring,
  };
}

/** Allocate whole cents, including the remainder, so provider items match the quote exactly. */
export function applyCouponDiscountToLines(lines: CouponPriceLine[], products: CouponProduct[], discountAmount: number): CouponPriceLine[] {
  const amounts = lines.map((line) => toCents(line.amount));
  const eligibleTotal = lines.reduce((total, line, index) => total + (products.includes(line.product) ? amounts[index]! : 0), 0);
  const discount = toCents(discountAmount);
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > eligibleTotal) {
    throw new Error("Discount exceeds eligible purchase items");
  }
  if (discount === 0) return lines.map((line) => ({ ...line }));
  const allocations = lines.map((line, index) => {
    const share = products.includes(line.product) ? discount * amounts[index]! / eligibleTotal : 0;
    return { index, cents: Math.floor(share), remainder: share - Math.floor(share) };
  });
  let remaining = discount - allocations.reduce((sum, item) => sum + item.cents, 0);
  const byRemainder = [...allocations].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const item of byRemainder) {
    if (remaining === 0) break;
    if (products.includes(lines[item.index]!.product) && item.cents < amounts[item.index]!) {
      item.cents++;
      remaining--;
    }
  }
  if (remaining !== 0) throw new Error("Unable to allocate coupon discount");
  return lines.map((line, index) => ({ ...line, amount: (amounts[index]! - allocations[index]!.cents) / 100 }));
}
