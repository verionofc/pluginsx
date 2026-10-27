import {
  consumeRateLimit as rateLimit,
  allowAccountRequest,
} from "../plugins/rate-limit.js";
import { acceptedPlanTerms } from "../../domain/licensing-config.js";
import { getLicensingConfig } from "../plugins/licensing-config.js";
import {
  quoteUpgrade,
  cancelUpgradedSubscription,
  revokeUpgradesForReversedCredit,
  assertUpgradeCredit,
} from "../plugins/upgrade.js";
import { randomUUID } from "node:crypto";
import {
  lockBillingAccount,
  assertCheckoutEntitlement,
  BillingConflict,
} from "../plugins/billing-lock.js";
import { grantPermanentPurchase } from "../plugins/billing-entitlements.js";
import { recordPaymentAttempt } from "../plugins/billing-payment-ledger.js";
import { Elysia } from "elysia";
import { z } from "zod";
import {
  Chargeback,
  MercadoPagoConfig,
  Payment,
  PreApproval,
  Preference,
  WebhookSignatureValidator,
} from "mercadopago";

import { env } from "../../env.js";
import { License } from "../../database/models/License.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { BillingTransaction } from "../../database/models/BillingTransaction.js";
import { PaymentEvent } from "../../database/models/PaymentEvent.js";
import { BillingRateLimit } from "../../database/models/BillingRateLimit.js";
import { Coupon, type CouponRecord } from "../../database/models/Coupon.js";
import { generateTemporaryPremiumLicense } from "../plugins/license.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import {
  CouponError,
  getCouponUseForAccount,
  quoteCoupon,
  reserveCoupon,
  settleCouponReservation,
  type CouponPriceLine,
} from "../plugins/coupons.js";
import {
  syncSubscriptionAuthorization,
  syncSubscriptionCancellation,
} from "../plugins/subscription-access.js";
import { claimPaymentEvent } from "../plugins/payment-events.js";
import { applyCouponDiscountToLines } from "../../domain/coupons.js";
import {
  hasPremiumAccess,
  hasTrustedWebOrigin,
} from "../plugins/plan-access.js";
import {
  MAX_SERVER_SLOTS_PER_PURCHASE,
  PLAN_CATALOG,
  PLANS_CONFIG,
  SERVER_SLOT_PRICE,
  TRIAL_DURATION_HOURS,
  TRIAL_DURATION_MS,
  addRecurringInterval,
  formatPlanAmount,
  getPlanConfig,
  safeReturnPath,
} from "../plugins/billing-config.js";

const checkoutBody = z
  .object({
    plan: z.enum(["monthly", "lifetime", "aether", "server_slots"]),
    serverSlots: z.number().int().min(0).max(1000).default(0),
    couponCode: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .transform((value) => value.toUpperCase())
      .optional(),
    returnTo: z.string().optional(),
    expectedTotalCents: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, context) => {
    if (value.plan === "monthly" && value.serverSlots > 0) {
      context.addIssue({
        code: "custom",
        path: ["serverSlots"],
        message:
          "Slots extras não podem ser incluídos em uma assinatura mensal.",
      });
    }
    if (value.plan === "server_slots" && value.serverSlots < 1) {
      context.addIssue({
        code: "custom",
        path: ["serverSlots"],
        message: "Selecione pelo menos uma vaga de servidor.",
      });
    }
  });

const couponValidationBody = z
  .object({
    plan: z.enum(["monthly", "lifetime", "aether", "server_slots"]),
    serverSlots: z.number().int().min(0).max(1000).default(0),
    couponCode: z
      .string()
      .trim()
      .min(3)
      .max(32)
      .transform((value) => value.toUpperCase()),
  })
  .superRefine((value, context) => {
    if (value.plan === "monthly" && value.serverSlots > 0) {
      context.addIssue({
        code: "custom",
        path: ["serverSlots"],
        message:
          "Slots extras não podem ser incluídos em uma assinatura mensal.",
      });
    }
    if (value.plan === "server_slots" && value.serverSlots < 1) {
      context.addIssue({
        code: "custom",
        path: ["serverSlots"],
        message: "Selecione pelo menos uma vaga de servidor.",
      });
    }
  });

function getPurchaseLines(
  plan: "monthly" | "lifetime" | "aether" | "server_slots",
  serverSlots: number,
): CouponPriceLine[] {
  const lines: CouponPriceLine[] = [];
  if (plan !== "server_slots")
    lines.push({ product: plan, amount: getPlanConfig(plan).amount });
  if (serverSlots > 0)
    lines.push({
      product: "server_slots",
      amount: serverSlots * SERVER_SLOT_PRICE,
    });
  return lines;
}

const getClient = () => {
  if (!env.MERCADOPAGO_ACCESS_TOKEN)
    throw new Error("Mercado Pago is not configured");
  return new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });
};

async function reconcileMonthlyReversal(purchase: {
  userId: string;
  externalReference: string;
  mercadoPagoSubscriptionId?: string;
  planTerms?: { duration: number; durationUnit: string };
}) {
  await PlanAccess.db.transaction(async (session) => {
    await lockBillingAccount(purchase.userId, session);
    const approved = await BillingTransaction.findOne({
      purchaseReference: purchase.externalReference,
      status: "approved",
      paidAt: { $exists: true },
    })
      .sort({ paidAt: -1 })
      .session(session)
      .lean();
    const paidThrough = approved?.paidAt
      ? addRecurringInterval(
          approved.paidAt,
          purchase.planTerms?.duration ??
            PLANS_CONFIG.plans.monthly.recurrence.frequency,
          purchase.planTerms?.durationUnit === "days"
            ? "days"
            : purchase.planTerms?.durationUnit === "months"
              ? "months"
              : PLANS_CONFIG.plans.monthly.recurrence.frequencyType,
        )
      : null;
    await PlanAccess.updateOne(
      {
        userId: purchase.userId,
        plan: "monthly",
        mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId,
        grantSource: { $ne: "owner" },
      },
      {
        $set: {
          status:
            paidThrough && paidThrough > new Date() ? "active" : "revoked",
          ...(paidThrough ? { expiresAt: paidThrough } : {}),
        },
      },
      { session },
    );
  });
}
const appUrl = () => {
  if (!env.NEXT_PUBLIC_APP_URL)
    throw new Error("Public website URL is not configured");
  return env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
};
const isDuplicateKeyError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000,
  );

async function restoreLegacyTrialUse(userId: string) {
  const access = await PlanAccess.findOne({ userId })
    .select({ trialUsedAt: 1 })
    .lean();
  if (access?.trialUsedAt) return;

  const legacyUse = await BillingRateLimit.findOne({
    key: `temporary-trial:${userId}`,
    count: { $gt: 0 },
  }).lean();
  if (!legacyUse) return;

  const expiresAt = legacyUse.expiresAt;
  const usedAt = new Date(expiresAt.getTime() - TRIAL_DURATION_MS);
  const trialStatus = expiresAt > new Date() ? "trial" : "expired";

  try {
    await PlanAccess.findOneAndUpdate(
      { userId, trialUsedAt: null },
      {
        $set: { trialUsedAt: usedAt },
        $setOnInsert: {
          userId,
          plan: "free",
          status: trialStatus,
          startsAt: usedAt,
          expiresAt,
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }
}

async function claimTrialUse(
  userId: string,
  usedAt: Date,
  expiresAt: Date,
  code: string,
) {
  return PlanAccess.findOneAndUpdate(
    { userId, trialUsedAt: null },
    {
      $set: {
        trialUsedAt: usedAt,
        trialLicenseCode: code,
        trialLicenseExpiresAt: expiresAt,
      },
      $setOnInsert: {
        userId,
        plan: "free",
        status: "trial",
        startsAt: usedAt,
        expiresAt,
      },
    },
    { upsert: true, new: true },
  );
}

async function getActiveTrialLicense(userId: string, now = new Date()) {
  const access = await PlanAccess.findOne({ userId })
    .select({ trialLicenseCode: 1, trialLicenseExpiresAt: 1 })
    .lean();
  if (!access?.trialLicenseCode || !access.trialLicenseExpiresAt) return null;
  if (access.trialLicenseExpiresAt > now) {
    return {
      code: access.trialLicenseCode,
      expiresAt: access.trialLicenseExpiresAt,
    };
  }

  await PlanAccess.updateOne(
    { userId, trialLicenseExpiresAt: { $lte: now } },
    { $unset: { trialLicenseCode: 1 } },
  );
  return null;
}

const getCurrentAccess = async (userId: string) => {
  const access = await PlanAccess.findOne({ userId }).lean();
  if (!access) return null;
  if (
    (access.plan === "lifetime" || access.plan === "aether") &&
    access.status === "active"
  )
    return access;
  if (
    (access.plan === "monthly" || access.plan === "free") &&
    access.status === "active" &&
    access.expiresAt &&
    access.expiresAt > new Date()
  )
    return access;
  if (
    access.plan === "free" &&
    access.status === "trial" &&
    access.expiresAt &&
    access.expiresAt > new Date()
  )
    return access;
  const expired = access.expiresAt && access.expiresAt <= new Date();
  return {
    ...access,
    status:
      expired && ["active", "trial"].includes(access.status)
        ? "expired"
        : access.status,
  };
};

export const billingRoutes = new Elysia({ prefix: "/billing" })
  .use(authSessionPlugin)
  .get("/catalog", async () => {
    const config = await getLicensingConfig();
    return {
      currency: PLANS_CONFIG.currency,
      trialEnabled: Boolean(
        config.plans.find((plan) => plan.id === "free")?.visible,
      ),
      plans: PLAN_CATALOG.filter((plan) => plan.visible),
      serverSlot: {
        amount: SERVER_SLOT_PRICE,
        formattedPrice: formatPlanAmount(SERVER_SLOT_PRICE),
        name: PLANS_CONFIG.serverSlot.name,
        maxPerPurchase: MAX_SERVER_SLOTS_PER_PURCHASE,
      },
    };
  })
  .get(
    "/state",
    async ({ user, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      if (!(await allowAccountRequest(user.id, "billing-state")))
        return status(429, {
          message: "Aguarde antes de consultar a compra novamente.",
        });
      await restoreLegacyTrialUse(user.id);
      const access = await getCurrentAccess(user.id);
      const temporaryLicense = await getActiveTrialLicense(user.id);
      const upgrade = await quoteUpgrade(user.id, Number.MAX_SAFE_INTEGER);
      const purchaseFields = {
        plan: 1,
        status: 1,
        createdAt: 1,
        checkoutUrl: 1,
        externalReference: 1,
        subscriptionCancellationStatus: 1,
        upgradeCreditReversed: 1,
        entitlementCheckoutReserved: 1,
      };
      const lastPurchase =
        (await PlanPurchase.findOne({
          userId: user.id,
          entitlementCheckoutReserved: true,
        })
          .select(purchaseFields)
          .lean()) ??
        (await PlanPurchase.findOne({ userId: user.id })
          .sort({ createdAt: -1 })
          .select(purchaseFields)
          .lean());
      const [slotPurchases] = await PlanPurchase.aggregate<{ total: number }>([
        { $match: { userId: user.id, status: "approved" } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ["$serverSlots", 0] } },
          },
        },
      ]);
      return {
        access: access
          ? {
              plan: access.plan,
              status: access.status,
              trialUsedAt: access.trialUsedAt,
              trialExpiresAt: access.trialLicenseExpiresAt,
              startsAt: access.startsAt,
              expiresAt: access.expiresAt,
              cancelAtPeriodEnd: access.cancelAtPeriodEnd,
              canCancelSubscription:
                access.plan === "monthly" &&
                access.status === "active" &&
                Boolean(access.mercadoPagoSubscriptionId) &&
                !access.cancelAtPeriodEnd,
            }
          : null,
        temporaryLicense,
        upgrade: {
          creditCents: upgrade.creditCents,
          endsAt: upgrade.endsAt,
          eligible: upgrade.eligible,
        },
        lastPurchase: lastPurchase
          ? {
              ...lastPurchase,
              ...(lastPurchase.upgradeCreditReversed
                ? {
                    message:
                      "O pagamento usado como crédito foi estornado. O upgrade precisa de revisão; entre em contato com o suporte.",
                  }
                : lastPurchase.subscriptionCancellationStatus === "failed"
                  ? {
                      message:
                        "Pagamento recebido; o upgrade aguarda o encerramento da renovação mensal. A confirmação será tentada novamente.",
                    }
                  : {}),
            }
          : null,
        additionalServerSlots: Number(slotPurchases?.total ?? 0),
      };
    },
    { auth: true },
  )
  .post(
    "/upgrade/quote",
    async ({ user, body, request, status }) => {
      if (!(await allowAccountRequest(user.id, "upgrade-quote")))
        return status(429, {
          message: "Aguarde antes de consultar outro orçamento.",
        });
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem não permitida." });
      const price = Math.round(getPlanConfig(body.plan).amount * 100);
      const upgrade = await quoteUpgrade(user.id, price);
      return {
        plan: body.plan,
        regularAmount: price / 100,
        creditCents: upgrade.creditCents,
        total: (price - upgrade.creditCents) / 100,
        eligible: upgrade.eligible,
        endsAt: upgrade.endsAt,
      };
    },
    { auth: true, body: z.object({ plan: z.enum(["lifetime", "aether"]) }) },
  )
  .post(
    "/coupon/validate",
    async ({ user, body, status, request }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem da solicitação não permitida." });
      if (!(await rateLimit(user.id, "coupon-validate", 15, 60_000)))
        return status(429, {
          message: "Muitas tentativas de cupom. Aguarde um minuto.",
        });
      const { plan, serverSlots, couponCode } =
        couponValidationBody.parse(body);
      if (serverSlots > MAX_SERVER_SLOTS_PER_PURCHASE)
        return status(400, {
          message: "Quantidade de vagas acima do limite por compra.",
        });
      const coupon = await Coupon.findOne({ code: couponCode }).lean();
      if (!coupon)
        return status(404, {
          code: "COUPON_NOT_FOUND",
          message: "Este código de cupom não foi encontrado.",
        });
      try {
        const lines = getPurchaseLines(plan, serverSlots);
        if ((plan === "lifetime" || plan === "aether") && lines[0]) {
          const upgrade = await quoteUpgrade(
            user.id,
            Math.round(lines[0].amount * 100),
          );
          lines[0].amount =
            (Math.round(lines[0].amount * 100) - upgrade.creditCents) / 100;
        }
        const quote = quoteCoupon(coupon, lines);
        if (coupon.maxPerAccount != null) {
          const usage = await getCouponUseForAccount(
            String(coupon._id),
            user.id,
          );
          if (
            (usage?.usedCount ?? 0) + (usage?.reservedCount ?? 0) >=
            coupon.maxPerAccount
          ) {
            throw new CouponError(
              "Esta conta já atingiu o limite de usos deste cupom.",
              "COUPON_ACCOUNT_LIMIT",
              409,
            );
          }
        }
        return { code: coupon.code, ...quote };
      } catch (error) {
        if (error instanceof CouponError)
          return status(error.status, {
            code: error.code,
            message: error.message,
          });
        throw error;
      }
    },
    { auth: true, body: couponValidationBody },
  )
  .post(
    "/trial",
    async ({ user, status, request }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem da solicitação não permitida." });
      await restoreLegacyTrialUse(user.id);
      const existingAccess = await PlanAccess.findOne({ userId: user.id })
        .select({ trialUsedAt: 1, trialLicenseExpiresAt: 1 })
        .lean();
      if (existingAccess?.trialUsedAt) {
        const activeTrialLicense = await getActiveTrialLicense(user.id);
        if (activeTrialLicense) {
          return {
            plan: "trial",
            status: "active",
            tier: "plus",
            ...activeTrialLicense,
          };
        }
        return status(409, {
          code: "TRIAL_ALREADY_USED",
          message: existingAccess.trialLicenseExpiresAt
            ? "O período de visualização da key temporária terminou. Ela não pode ser recuperada nem gerada novamente."
            : "Esta conta já usou o Trial. A key não está disponível para recuperação e não pode ser gerada novamente.",
        });
      }
      if (
        !(await getLicensingConfig()).plans.find((plan) => plan.id === "free")
          ?.enabled
      )
        return status(409, {
          code: "TRIAL_DISABLED",
          message: "O Trial não está disponível para novas ativações.",
        });
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TRIAL_DURATION_MS);
      if (!(await rateLimit(user.id, "temporary-trial-create", 3, 60_000)))
        return status(429, {
          code: "TRIAL_RATE_LIMITED",
          message: "Muitas solicitações de teste. Aguarde um minuto.",
        });
      const code = await generateTemporaryPremiumLicense(expiresAt);
      const trialConfig = await getLicensingConfig();
      await License.updateOne(
        { _id: code },
        {
          $set: {
            planTerms: acceptedPlanTerms(
              trialConfig,
              trialConfig.plans.find((p) => p.id === "free")!,
            ),
          },
        },
      );
      try {
        const claimed = await claimTrialUse(user.id, now, expiresAt, code);
        if (!claimed) {
          await License.deleteOne({ _id: code, sourcePlan: "trial" });
          const activeTrialLicense = await getActiveTrialLicense(user.id);
          if (activeTrialLicense) {
            return {
              plan: "trial",
              status: "active",
              tier: "plus",
              ...activeTrialLicense,
            };
          }
          return status(409, {
            code: "TRIAL_ALREADY_USED",
            message: `Esta conta já usou sua licença temporária. Cada conta recebe uma única key válida por ${TRIAL_DURATION_HOURS} horas.`,
          });
        }
      } catch (error) {
        await License.deleteOne({ _id: code, sourcePlan: "trial" });
        if (isDuplicateKeyError(error)) {
          const activeTrialLicense = await getActiveTrialLicense(user.id);
          if (activeTrialLicense) {
            return {
              plan: "trial",
              status: "active",
              tier: "plus",
              ...activeTrialLicense,
            };
          }
          return status(409, {
            code: "TRIAL_ALREADY_USED",
            message: `Esta conta já usou sua licença temporária. Cada conta recebe uma única key válida por ${TRIAL_DURATION_HOURS} horas.`,
          });
        }
        throw error;
      }
      return { plan: "trial", status: "active", tier: "plus", code, expiresAt };
    },
    { auth: true },
  )
  .post(
    "/checkout",
    async ({ user, body, status, request }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem da solicitação não permitida." });
      if (!(await rateLimit(user.id, "checkout", 5, 60_000)))
        return status(429, {
          message: "Muitas tentativas de checkout. Aguarde um minuto.",
        });
      const { plan, serverSlots, returnTo, couponCode, expectedTotalCents } =
        checkoutBody.parse(body);
      if (serverSlots > MAX_SERVER_SLOTS_PER_PURCHASE)
        return status(400, {
          message: "Quantidade de vagas acima do limite por compra.",
        });
      const safeReturnTo = safeReturnPath(returnTo);
      const current = await PlanAccess.findOne({ userId: user.id }).lean();
      if (plan === "server_slots") {
        if (!(await hasPremiumAccess(user.id))) {
          const paidPlans = [
            PLANS_CONFIG.plans.monthly.name,
            PLANS_CONFIG.plans.lifetime.name,
            PLANS_CONFIG.plans.aether.name,
          ];
          return status(409, {
            message: `Ative um plano ${paidPlans.join(", ")} antes de comprar vagas extras.`,
          });
        }
      } else {
        if (
          (plan === "lifetime" || plan === "aether") &&
          (current?.plan === "lifetime" || current?.plan === "aether") &&
          current.status === "active"
        )
          return status(409, { message: "Um plano vitalício já está ativo." });
        if (
          plan === "monthly" &&
          ((current?.plan === "monthly" &&
            ["active", "pending", "past_due"].includes(current.status)) ||
            ((current?.plan === "lifetime" || current?.plan === "aether") &&
              current.status === "active"))
        )
          return status(409, {
            message:
              "Já existe uma assinatura mensal. Gerencie-a antes de contratar outro plano.",
          });
      }
      const commercial = await getLicensingConfig();
      const selectedOffer = commercial.plans.find((p) => p.id === plan);
      if (plan !== "server_slots" && !selectedOffer?.enabled)
        return status(409, {
          code: "PLAN_UNAVAILABLE",
          message: "Este plano não está disponível para novas contratações.",
        });
      const planTerms = selectedOffer
        ? acceptedPlanTerms(commercial, selectedOffer)
        : undefined;
      const externalReference = randomUUID();
      const planConfig = plan === "server_slots" ? null : getPlanConfig(plan);
      const planPrice = planTerms ? planTerms.priceCents / 100 : 0;
      const slotUnitPriceCents = commercial.serverSlot.priceCents;
      const regularAmount =
        ((planTerms?.priceCents ?? 0) + serverSlots * slotUnitPriceCents) / 100;
      const originalLines: CouponPriceLine[] = [
        ...(plan === "server_slots"
          ? []
          : [{ product: plan, amount: planPrice }]),
        ...(serverSlots > 0
          ? [
              {
                product: "server_slots" as const,
                amount: (serverSlots * slotUnitPriceCents) / 100,
              },
            ]
          : []),
      ];
      const upgrade =
        plan === "lifetime" || plan === "aether"
          ? await quoteUpgrade(user.id, Math.round(planPrice * 100))
          : null;
      const upgradeCreditCents = upgrade?.creditCents ?? 0;
      if (upgradeCreditCents > 0 && originalLines[0])
        originalLines[0].amount =
          Math.max(
            0,
            Math.round(originalLines[0].amount * 100) - upgradeCreditCents,
          ) / 100;
      let appliedCoupon:
        | (CouponRecord & { _id: { toString(): string } })
        | null = null;
      let discountAmount = 0;
      let price = (Math.round(regularAmount * 100) - upgradeCreditCents) / 100;
      if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode }).lean();
        if (!coupon)
          return status(404, {
            code: "COUPON_NOT_FOUND",
            message: "Este código de cupom não foi encontrado.",
          });
        try {
          const quote = quoteCoupon(coupon, originalLines);
          if (coupon.maxPerAccount != null) {
            const usage = await getCouponUseForAccount(
              String(coupon._id),
              user.id,
            );
            if (
              (usage?.usedCount ?? 0) + (usage?.reservedCount ?? 0) >=
              coupon.maxPerAccount
            ) {
              throw new CouponError(
                "Esta conta já atingiu o limite de usos deste cupom.",
                "COUPON_ACCOUNT_LIMIT",
                409,
              );
            }
          }
          appliedCoupon = coupon as CouponRecord & {
            _id: { toString(): string };
          };
          discountAmount = quote.discountAmount;
          price = quote.total;
          await reserveCoupon({
            coupon,
            userId: user.id,
            purchaseReference: externalReference,
            discountAmount,
          });
        } catch (error) {
          if (error instanceof CouponError)
            return status(error.status, {
              code: error.code,
              message: error.message,
            });
          throw error;
        }
      }
      if (
        expectedTotalCents !== undefined &&
        expectedTotalCents !== Math.round(price * 100)
      ) {
        if (appliedCoupon)
          await settleCouponReservation(externalReference, "released");
        return status(409, {
          code: "PRICE_CHANGED",
          message:
            "As condições da compra mudaram. Atualize os preços e reaplique o cupom antes de continuar.",
        });
      }
      const couponId = appliedCoupon?._id
        ? String(appliedCoupon._id)
        : undefined;
      const discountedLines = appliedCoupon
        ? applyCouponDiscountToLines(
            originalLines,
            appliedCoupon.products,
            discountAmount,
          )
        : originalLines;
      const returnPage = safeReturnTo === "/cart" ? "/cart" : "/plans";
      let providerRequestStarted = false;
      let providerCheckoutCreated = false;
      try {
        await PlanAccess.db.transaction(async (session) => {
          await lockBillingAccount(user.id, session);
          await assertCheckoutEntitlement(user.id, plan, session);
          if (upgrade?.subscriptionId) {
            const locked = await PlanAccess.findOne({ userId: user.id })
              .session(session)
              .lean();
            if (
              locked?.mercadoPagoSubscriptionId !== upgrade.subscriptionId ||
              (upgradeCreditCents > 0 &&
                upgrade.endsAt &&
                new Date(upgrade.endsAt) <= new Date())
            )
              throw new BillingConflict(
                "As condições do upgrade mudaram. Atualize o orçamento antes de continuar.",
                "PRICE_CHANGED",
              );
          }
          await PlanPurchase.create(
            [
              {
                userId: user.id,
                plan,
                serverSlots,
                amount: price,
                regularAmount,
                planTerms,
                commercialVersion: commercial.version,
                slotUnitPriceCents,
                upgradeCreditCents,
                ...(upgrade?.subscriptionId
                  ? {
                      upgradeFromSubscriptionId: upgrade.subscriptionId,
                      subscriptionCancellationStatus: "pending",
                    }
                  : {}),
                ...(upgrade?.paymentId
                  ? {
                      upgradeCreditPaymentId: upgrade.paymentId,
                      upgradeCreditReserved: true,
                    }
                  : {}),
                providerDeliveryStatus: "pending",
                entitlementCheckoutReserved: plan !== "server_slots",
                discountAmount,
                ...(couponId
                  ? { couponId, couponCode: appliedCoupon?.code }
                  : {}),
                currency: PLANS_CONFIG.currency,
                externalReference,
                status: "pending",
              },
            ],
            { session },
          );
        });
        const client = getClient();
        if (price === 0 && (plan === "lifetime" || plan === "aether")) {
          const purchase = await PlanPurchase.findOne({ externalReference });
          if (!purchase) throw new Error("Upgrade purchase missing");
          await assertUpgradeCredit(purchase);
          await cancelUpgradedSubscription(purchase, client);
          await grantPermanentPurchase(externalReference);
          return {
            checkoutUrl: `${appUrl()}/cart?return=success&purchase=${externalReference}`,
            purchaseReference: externalReference,
          };
        }
        const base = appUrl();
        const returnUrl = (
          result: "success" | "pending" | "failure" | "subscription",
        ) =>
          `${base}${returnPage}?return=${result}&purchase=${externalReference}&returnTo=${encodeURIComponent(safeReturnTo)}`;
        if (
          plan === "lifetime" ||
          plan === "aether" ||
          plan === "server_slots"
        ) {
          const discountedPlanAmount = planConfig
            ? (discountedLines[0]?.amount ?? planConfig.amount)
            : 0;
          const discountedSlotsAmount =
            serverSlots > 0
              ? (discountedLines[planConfig ? 1 : 0]?.amount ??
                serverSlots * SERVER_SLOT_PRICE)
              : 0;
          const planItem =
            planConfig && discountedPlanAmount > 0
              ? {
                  id: `pluginsx-${plan}`,
                  title: `PluginsX | ${planTerms?.name ?? planConfig.name}`,
                  description: `Acesso vitalício Premium/Plus do PluginsX com até ${planTerms?.serverLimit ?? planConfig.serverLimit} servidores.`,
                  quantity: 1,
                  currency_id: PLANS_CONFIG.currency as "BRL",
                  unit_price: discountedPlanAmount,
                }
              : null;
          const items = [
            ...(planItem ? [planItem] : []),
            ...(serverSlots > 0 && discountedSlotsAmount > 0
              ? [
                  {
                    id: "pluginsx-server-slot",
                    title: `PluginsX | ${serverSlots} ${PLANS_CONFIG.serverSlot.name}${serverSlots === 1 ? "" : "s"}`,
                    description:
                      "Vagas adicionais permanentes para uma licença Plus ativa.",
                    quantity: 1,
                    currency_id: PLANS_CONFIG.currency as "BRL",
                    unit_price: discountedSlotsAmount,
                  },
                ]
              : []),
          ];
          providerRequestStarted = true;
          const preference = await new Preference(client).create({
            requestOptions: { idempotencyKey: externalReference },
            body: {
              external_reference: externalReference,
              items,
              back_urls: {
                success: returnUrl("success"),
                pending: returnUrl("pending"),
                failure: returnUrl("failure"),
              },
              notification_url: `${env.URL.replace(/\/$/, "")}/billing/webhook`,
              auto_return: "approved",
            },
          });
          providerCheckoutCreated = true;
          if (!preference.id || !preference.init_point)
            throw new Error("Checkout preference missing redirect URL");
          await PlanPurchase.updateOne(
            { externalReference },
            {
              $set: {
                preferenceId: preference.id,
                checkoutUrl: preference.init_point,
                providerDeliveryStatus: "applied",
              },
            },
          );
          return {
            checkoutUrl: preference.init_point,
            purchaseReference: externalReference,
          };
        }
        providerRequestStarted = true;
        const subscription = await new PreApproval(client).create({
          requestOptions: { idempotencyKey: externalReference },
          body: {
            reason: `PluginsX | ${planTerms?.name ?? "Acesso recorrente"} - Premium/Plus`,
            external_reference: externalReference,
            payer_email: user.email,
            back_url: returnUrl("subscription"),
            auto_recurring: {
              frequency: planTerms!.duration,
              frequency_type:
                planTerms!.durationUnit === "days" ? "days" : "months",
              transaction_amount: price,
              currency_id: PLANS_CONFIG.currency as "BRL",
            },
          },
        });
        providerCheckoutCreated = true;
        if (!subscription.id || !subscription.init_point)
          throw new Error("Subscription checkout missing redirect URL");
        await PlanPurchase.updateOne(
          { externalReference },
          {
            $set: {
              mercadoPagoSubscriptionId: subscription.id,
              checkoutUrl: subscription.init_point,
              providerDeliveryStatus: "applied",
            },
          },
        );
        return {
          checkoutUrl: subscription.init_point,
          purchaseReference: externalReference,
        };
      } catch (error) {
        const details =
          error && typeof error === "object"
            ? (error as Record<string, unknown>)
            : {};
        const providerStatus = Number(details.status);
        // Timeouts and errors after creation can leave a payable checkout at the
        // provider. Preserve its reservation until reconciliation confirms closure.
        const definitivelyRejected =
          !providerCheckoutCreated &&
          providerStatus >= 400 &&
          providerStatus < 500 &&
          providerStatus !== 408;
        const releaseReservation =
          !providerRequestStarted || definitivelyRejected;
        if (releaseReservation)
          await settleCouponReservation(externalReference, "released");
        console.error("[billing] Mercado Pago checkout creation failed", {
          plan,
          name: details.name,
          message: details.message ?? String(error),
          status: details.status,
          error: details.error,
          causes: details.causes,
        });
        await PlanPurchase.updateOne(
          { externalReference },
          { $set: { providerDeliveryStatus: "failed" } },
        );
        if (releaseReservation)
          await PlanPurchase.updateOne(
            { externalReference, status: "pending" },
            {
              $set: {
                status: "cancelled",
                upgradeCreditReserved: false,
                entitlementCheckoutReserved: false,
              },
            },
          );
        if (isDuplicateKeyError(error))
          return status(409, {
            code: "CHECKOUT_ALREADY_PENDING",
            message:
              "Já existe uma contratação ou upgrade em andamento. Retome a compra anterior em Planos.",
          });
        if (error instanceof BillingConflict)
          return status(409, { code: error.code, message: error.message });
        return status(503, {
          message:
            "Não foi possível iniciar o checkout agora. Tente novamente.",
        });
      }
    },
    { auth: true, body: checkoutBody },
  )
  .post(
    "/cancel",
    async ({ user, status, request }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem da solicitação não permitida." });
      if (!(await rateLimit(user.id, "cancel", 5, 60_000)))
        return status(429, {
          message: "Muitas tentativas de cancelamento. Aguarde um minuto.",
        });
      const access = await PlanAccess.findOne({
        userId: user.id,
        plan: "monthly",
        mercadoPagoSubscriptionId: { $exists: true },
      });
      if (!access?.mercadoPagoSubscriptionId)
        return status(404, {
          message: "Nenhuma assinatura mensal foi encontrada.",
        });
      const purchase = await PlanPurchase.findOne({
        userId: user.id,
        mercadoPagoSubscriptionId: access.mercadoPagoSubscriptionId,
      });
      if (!purchase)
        return status(404, {
          message: "Nenhuma assinatura mensal foi encontrada.",
        });
      try {
        const subscription = await new PreApproval(getClient()).update({
          id: access.mercadoPagoSubscriptionId,
          body: { status: "cancelled" },
        });
        const periodEnd = await syncSubscriptionCancellation(
          user.id,
          access.mercadoPagoSubscriptionId,
        );
        // Cancellation stops future invoices; an already submitted charge may
        // still settle. Keep its reservation until provider reconciliation.
        return {
          status: subscription.status ?? "cancelled",
          expiresAt: periodEnd,
        };
      } catch {
        return status(503, {
          message: "Não foi possível cancelar a renovação agora.",
        });
      }
    },
    { auth: true },
  )
  .get(
    "/purchase/:reference",
    async ({ user, params, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      if (!(await allowAccountRequest(user.id, "purchase-state")))
        return status(429, {
          message: "Aguarde antes de consultar a compra novamente.",
        });
      const purchase = await PlanPurchase.findOne({
        externalReference: params.reference,
        userId: user.id,
      })
        .select({
          plan: 1,
          serverSlots: 1,
          status: 1,
          couponCode: 1,
          discountAmount: 1,
          subscriptionCancellationStatus: 1,
          upgradeCreditReversed: 1,
          entitlementCheckoutReserved: 1,
          checkoutUrl: 1,
          createdAt: 1,
        })
        .lean();
      if (!purchase) return status(404, { message: "Compra não encontrada." });
      return {
        ...purchase,
        ...(purchase.upgradeCreditReversed
          ? {
              message:
                "O pagamento usado como crédito foi estornado. O upgrade precisa de revisão; entre em contato com o suporte.",
            }
          : purchase.subscriptionCancellationStatus === "failed"
            ? {
                message:
                  "Pagamento recebido; o upgrade aguarda o encerramento da renovação mensal. A confirmação será tentada novamente.",
              }
            : {}),
      };
    },
    { auth: true, params: z.object({ reference: z.string().uuid() }) },
  )
  .post(
    "/webhook",
    async ({ request, query, status }) => {
      const signature = request.headers.get("x-signature");
      const requestId = request.headers.get("x-request-id");
      const dataId = query["data.id"] ?? query.id;
      if (
        !env.MERCADOPAGO_WEBHOOK_SECRET ||
        !signature ||
        !requestId ||
        !dataId
      )
        return status(401, { message: "Invalid notification" });
      try {
        WebhookSignatureValidator.validate({
          xSignature: signature,
          xRequestId: requestId,
          dataId,
          secret: env.MERCADOPAGO_WEBHOOK_SECRET,
          toleranceSeconds: 300,
        });
      } catch {
        return status(401, { message: "Invalid notification" });
      }
      const body = (await request.json().catch(() => null)) as {
        type?: unknown;
        action?: unknown;
        data?: { id?: unknown };
      } | null;
      const resourceId = String(body?.data?.id ?? dataId);
      if (resourceId !== dataId)
        return status(401, {
          message: "Notification resource does not match its signature",
        });
      const type = String(body?.type ?? body?.action ?? "");
      const eventId = `${String((body as { id?: unknown } | null)?.id ?? requestId)}:${type}:${resourceId}`;
      try {
        const claim = await claimPaymentEvent(eventId, type, resourceId);
        if (claim === "processed") return { received: true, duplicate: true };
        if (claim === "busy")
          return status(503, {
            message: "Notification is still processing; retry later",
          });
      } catch (error) {
        return status(503, { message: "Notification could not be recorded" });
      }
      let chargeEventId: string | undefined;
      let ownsChargeClaim = false;
      try {
        const client = getClient();
        let paymentResourceId = resourceId;
        let authorizedSubscriptionId: string | undefined;
        if (type === "subscription_authorized_payment") {
          if (!env.MERCADOPAGO_ACCESS_TOKEN)
            throw new Error("Mercado Pago is not configured");
          const invoiceResponse = await fetch(
            `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(resourceId)}`,
            {
              headers: {
                Authorization: `Bearer ${env.MERCADOPAGO_ACCESS_TOKEN}`,
              },
            },
          );
          if (!invoiceResponse.ok)
            throw new Error("Authorized payment could not be verified");
          const invoice = (await invoiceResponse.json()) as {
            preapproval_id?: string;
            transaction_amount?: number | string;
            currency_id?: string;
            payment?: { id?: number | string };
          };
          const invoicePurchase = invoice.preapproval_id
            ? await PlanPurchase.findOne({
                mercadoPagoSubscriptionId: invoice.preapproval_id,
                plan: "monthly",
              })
            : null;
          if (
            !invoicePurchase ||
            Number(invoice.transaction_amount) !== invoicePurchase.amount ||
            invoice.currency_id !== PLANS_CONFIG.currency
          )
            throw new Error("Invoice does not match an internal subscription");
          authorizedSubscriptionId = invoice.preapproval_id;
          if (!invoice.payment?.id) {
            await PaymentEvent.updateOne(
              { eventId },
              { $set: { status: "processed" } },
            );
            return { received: true, pending: true };
          }
          paymentResourceId = String(invoice.payment.id);
        }
        if (
          type.startsWith("payment") ||
          type === "subscription_authorized_payment"
        ) {
          const payment = await new Payment(client).get({
            id: paymentResourceId,
          });
          const external = payment.external_reference;
          const linkedSubscriptionId = (
            payment as typeof payment & { preapproval_id?: string }
          ).preapproval_id;
          const purchaseAlternatives = [
            ...(external ? [{ externalReference: external }] : []),
            ...((linkedSubscriptionId ?? authorizedSubscriptionId)
              ? [
                  {
                    mercadoPagoSubscriptionId:
                      linkedSubscriptionId ?? authorizedSubscriptionId,
                  },
                ]
              : []),
          ];
          if (purchaseAlternatives.length === 0)
            throw new Error("Missing purchase reference");
          const purchase = await PlanPurchase.findOne({
            $or: purchaseAlternatives,
          });
          if (
            !purchase ||
            Number(payment.transaction_amount) !== purchase.amount ||
            payment.currency_id !== PLANS_CONFIG.currency
          )
            throw new Error("Payment does not match an internal purchase");
          const paymentStatus = payment.status;
          let nextStatus =
            payment.status_detail === "partially_refunded"
              ? "refunded"
              : paymentStatus === "approved"
                ? "approved"
                : paymentStatus === "refunded"
                  ? "refunded"
                  : paymentStatus === "charged_back"
                    ? "charged_back"
                    : paymentStatus === "cancelled"
                      ? "cancelled"
                      : paymentStatus === "rejected"
                        ? "rejected"
                        : "pending";
          let shouldApplyMonthlyCharge =
            nextStatus === "approved" && purchase.plan === "monthly";
          if (shouldApplyMonthlyCharge) {
            chargeEventId = `payment-approved:${String(payment.id)}`;
            try {
              await PaymentEvent.create({
                eventId: chargeEventId,
                type: "payment.approved",
                resourceId: paymentResourceId,
                status: "processing",
              });
              ownsChargeClaim = true;
            } catch (error) {
              if (
                !(
                  error &&
                  typeof error === "object" &&
                  "code" in error &&
                  error.code === 11000
                )
              )
                throw error;
              const priorCharge = await PaymentEvent.findOne({
                eventId: chargeEventId,
              }).lean();
              if (priorCharge?.status === "processed")
                shouldApplyMonthlyCharge = false;
              else if (
                priorCharge?.receivedAt &&
                priorCharge.receivedAt < new Date(Date.now() - 5 * 60_000)
              ) {
                const reclaimed = await PaymentEvent.findOneAndUpdate(
                  {
                    eventId: chargeEventId,
                    status: "processing",
                    receivedAt: { $lt: new Date(Date.now() - 5 * 60_000) },
                  },
                  { $set: { receivedAt: new Date() } },
                  { new: true },
                );
                if (reclaimed) ownsChargeClaim = true;
                else throw new Error("Payment charge is already being applied");
              } else throw new Error("Payment charge is already being applied");
            }
          }
          const transactionUpdate: Record<string, unknown> = {
            userId: purchase.userId,
            purchaseReference: purchase.externalReference,
            providerPaymentId: String(payment.id),
            plan: purchase.plan,
            serverSlots: purchase.serverSlots ?? 0,
            amount: Number(payment.transaction_amount),
            discountAmount: purchase.discountAmount ?? 0,
            ...(purchase.couponCode ? { couponCode: purchase.couponCode } : {}),
            currency: payment.currency_id,
            status: nextStatus,
          };
          if (payment.date_approved || nextStatus === "approved") {
            transactionUpdate.paidAt = new Date(
              payment.date_approved ?? payment.date_created ?? Date.now(),
            );
          }
          const recorded = await recordPaymentAttempt(
            String(payment.id),
            transactionUpdate,
          );
          if (recorded.status !== nextStatus) {
            nextStatus = recorded.status;
            transactionUpdate.status = nextStatus;
            shouldApplyMonthlyCharge = false;
            if (chargeEventId && ownsChargeClaim)
              await PaymentEvent.deleteOne({
                eventId: chargeEventId,
                status: "processing",
              });
          }
          if (
            nextStatus === "approved" &&
            (purchase.plan === "lifetime" || purchase.plan === "aether")
          ) {
            await assertUpgradeCredit(purchase);
            await cancelUpgradedSubscription(purchase, client);
          }
          // A checkout may have several payment attempts. Serialize the summary
          // with its ledger so a declined attempt cannot erase another paid one.
          const hasApprovedPayment = await PlanPurchase.db.transaction(
            async (session) => {
              await lockBillingAccount(purchase.userId, session);
              const effective = await recordPaymentAttempt(
                String(payment.id),
                transactionUpdate,
                session,
              );
              const approved = await BillingTransaction.findOne({
                purchaseReference: purchase.externalReference,
                status: "approved",
              })
                .sort({ paidAt: -1, _id: -1 })
                .session(session)
                .lean();
              await PlanPurchase.updateOne(
                { _id: purchase._id },
                {
                  $set: {
                    status: approved ? "approved" : effective.status,
                    mercadoPagoPaymentId:
                      approved?.providerPaymentId ?? String(payment.id),
                  },
                },
                { session },
              );
              return {
                hasApproved: Boolean(approved),
                status: effective.status,
              };
            },
          );
          nextStatus = hasApprovedPayment.status;
          if (nextStatus !== "approved") {
            shouldApplyMonthlyCharge = false;
            if (chargeEventId && ownsChargeClaim)
              await PaymentEvent.deleteOne({
                eventId: chargeEventId,
                status: "processing",
              });
          }
          if (["refunded", "charged_back"].includes(nextStatus))
            await revokeUpgradesForReversedCredit(
              String(payment.id),
              purchase.userId,
            );
          if (nextStatus === "approved")
            await settleCouponReservation(
              purchase.externalReference,
              "approved",
            );
          // A canceled payment attempt does not invalidate its checkout link.
          // Keep its coupon reserved until the checkout itself is canceled.
          if (purchase.plan === "lifetime" || purchase.plan === "aether") {
            if (nextStatus === "approved") {
              await grantPermanentPurchase(purchase.externalReference);
            }
            if (
              ["refunded", "charged_back"].includes(nextStatus) &&
              !hasApprovedPayment.hasApproved
            ) {
              await PlanAccess.updateOne(
                {
                  userId: purchase.userId,
                  plan: purchase.plan,
                  grantSource: { $ne: "owner" },
                  $or: [
                    { purchaseReference: purchase.externalReference },
                    { purchaseReference: { $exists: false } },
                  ],
                },
                { $set: { status: "revoked" } },
              );
            }
          } else if (
            purchase.plan === "monthly" &&
            purchase.mercadoPagoSubscriptionId
          ) {
            if (shouldApplyMonthlyCharge) {
              await PlanAccess.db.transaction(async (session) => {
                await lockBillingAccount(purchase.userId, session);
                if (
                  !(await BillingTransaction.exists({
                    providerPaymentId: String(payment.id),
                    status: "approved",
                  }).session(session))
                )
                  return;
                const existingAccess = await PlanAccess.findOne({
                  userId: purchase.userId,
                }).session(session);
                const access =
                  existingAccess?.plan === "monthly" ? existingAccess : null;
                const start = new Date(
                  payment.date_approved ??
                    payment.date_created ??
                    purchase.createdAt,
                );
                const paidThrough = addRecurringInterval(
                  start,
                  purchase.planTerms?.duration ??
                    PLANS_CONFIG.plans.monthly.recurrence.frequency,
                  purchase.planTerms?.durationUnit === "days"
                    ? "days"
                    : purchase.planTerms?.durationUnit === "months"
                      ? "months"
                      : PLANS_CONFIG.plans.monthly.recurrence.frequencyType,
                );
                const expiresAt =
                  access?.expiresAt && access.expiresAt > paidThrough
                    ? access.expiresAt
                    : paidThrough;
                const hasActivePermanentPlan =
                  (existingAccess?.plan === "lifetime" ||
                    existingAccess?.plan === "aether") &&
                  existingAccess.status === "active";
                const otherPaidMonthly =
                  existingAccess?.plan === "monthly" &&
                  existingAccess.status === "active" &&
                  existingAccess.mercadoPagoSubscriptionId &&
                  existingAccess.mercadoPagoSubscriptionId !==
                    purchase.mercadoPagoSubscriptionId;
                if (
                  !hasActivePermanentPlan &&
                  existingAccess?.grantSource !== "owner" &&
                  !otherPaidMonthly
                ) {
                  await PlanAccess.updateOne(
                    { userId: purchase.userId },
                    {
                      $set: {
                        userId: purchase.userId,
                        plan: "monthly",
                        status: "active",
                        purchaseReference: purchase.externalReference,
                        startsAt: access?.startsAt ?? start,
                        expiresAt,
                        mercadoPagoSubscriptionId:
                          purchase.mercadoPagoSubscriptionId,
                        cancelAtPeriodEnd: false,
                        ...(purchase.planTerms
                          ? { planTerms: purchase.planTerms }
                          : {}),
                      },
                      $unset: { grantSource: "" },
                    },
                    { upsert: true, session },
                  );
                }
                await PlanPurchase.updateOne(
                  { _id: purchase._id },
                  { $set: { entitlementCheckoutReserved: false } },
                  { session },
                );
              });
            } else if (nextStatus === "rejected") {
              await PlanAccess.updateOne(
                {
                  userId: purchase.userId,
                  plan: "monthly",
                  mercadoPagoSubscriptionId: purchase.mercadoPagoSubscriptionId,
                  expiresAt: { $lte: new Date() },
                },
                { $set: { status: "past_due" } },
              );
            } else if (["refunded", "charged_back"].includes(nextStatus)) {
              await reconcileMonthlyReversal(purchase);
            }
          }
          if (nextStatus === "approved")
            await PlanPurchase.updateOne(
              { _id: purchase._id },
              { $set: { entitlementCheckoutReserved: false } },
            );
          if (chargeEventId && shouldApplyMonthlyCharge)
            await PaymentEvent.updateOne(
              { eventId: chargeEventId },
              { $set: { status: "processed" } },
            );
        } else if (type === "subscription_preapproval") {
          const subscription = await new PreApproval(client).get({
            id: resourceId,
          });
          const purchase = subscription.external_reference
            ? await PlanPurchase.findOne({
                externalReference: subscription.external_reference,
                mercadoPagoSubscriptionId: resourceId,
              })
            : null;
          if (
            !purchase ||
            purchase.plan !== "monthly" ||
            Number(subscription.auto_recurring?.transaction_amount) !==
              purchase.amount ||
            subscription.auto_recurring?.currency_id !== PLANS_CONFIG.currency
          )
            throw new Error("Subscription does not match an internal purchase");
          if (subscription.status === "authorized") {
            await syncSubscriptionAuthorization(
              purchase.userId,
              resourceId,
              true,
            );
          } else if (
            ["cancelled", "paused"].includes(subscription.status ?? "")
          ) {
            await syncSubscriptionCancellation(purchase.userId, resourceId);
            await PlanPurchase.updateOne(
              { _id: purchase._id },
              { $set: { status: "cancelled" } },
            );
            // Existing charges may still settle after cancellation or a pause.
          } else if (subscription.status === "pending") {
            await syncSubscriptionAuthorization(
              purchase.userId,
              resourceId,
              false,
            );
          }
        } else if (type === "topic_chargebacks_wh") {
          const chargeback = await new Chargeback(client).get({
            id: resourceId,
          });
          if (!chargeback.payment_id)
            throw new Error("Chargeback does not identify a payment");
          const payment = await new Payment(client).get({
            id: String(chargeback.payment_id),
          });
          const subscriptionId = (
            payment as typeof payment & { preapproval_id?: string }
          ).preapproval_id;
          const alternatives = [
            ...(payment.external_reference
              ? [{ externalReference: payment.external_reference }]
              : []),
            ...(subscriptionId
              ? [{ mercadoPagoSubscriptionId: subscriptionId }]
              : []),
          ];
          const purchase = alternatives.length
            ? await PlanPurchase.findOne({ $or: alternatives })
            : null;
          if (
            !purchase ||
            Number(payment.transaction_amount) !== purchase.amount ||
            payment.currency_id !== PLANS_CONFIG.currency
          )
            throw new Error("Chargeback does not match an internal purchase");
          await revokeUpgradesForReversedCredit(
            String(payment.id),
            purchase.userId,
          );
          const hasOtherApproval = await PlanPurchase.db.transaction(
            async (session) => {
              await lockBillingAccount(purchase.userId, session);
              await BillingTransaction.updateOne(
                { providerPaymentId: String(payment.id) },
                {
                  $set: {
                    userId: purchase.userId,
                    purchaseReference: purchase.externalReference,
                    providerPaymentId: String(payment.id),
                    plan: purchase.plan,
                    serverSlots: purchase.serverSlots ?? 0,
                    amount: Number(payment.transaction_amount),
                    currency: payment.currency_id,
                    status: "charged_back",
                  },
                },
                { upsert: true, session },
              );
              const approved = await BillingTransaction.findOne({
                purchaseReference: purchase.externalReference,
                status: "approved",
              })
                .sort({ paidAt: -1, _id: -1 })
                .session(session)
                .lean();
              await PlanPurchase.updateOne(
                { _id: purchase._id },
                {
                  $set: {
                    status: approved ? "approved" : "charged_back",
                    mercadoPagoPaymentId:
                      approved?.providerPaymentId ?? String(payment.id),
                  },
                },
                { session },
              );
              return Boolean(approved);
            },
          );
          if (purchase.plan === "monthly") {
            await reconcileMonthlyReversal(purchase);
          } else if (
            !hasOtherApproval &&
            (purchase.plan === "lifetime" || purchase.plan === "aether")
          ) {
            await PlanAccess.updateOne(
              {
                userId: purchase.userId,
                plan: purchase.plan,
                grantSource: { $ne: "owner" },
                $or: [
                  { purchaseReference: purchase.externalReference },
                  { purchaseReference: { $exists: false } },
                ],
              },
              { $set: { status: "revoked" } },
            );
          }
        }
        await PaymentEvent.updateOne(
          { eventId },
          { $set: { status: "processed" } },
        );
        return { received: true };
      } catch {
        if (chargeEventId && ownsChargeClaim)
          await PaymentEvent.deleteOne({
            eventId: chargeEventId,
            status: "processing",
          });
        await PaymentEvent.deleteOne({ eventId, status: "processing" });
        return status(503, {
          message: "Notification processing will be retried",
        });
      }
    },
    { query: z.record(z.string(), z.string()).optional() },
  );
