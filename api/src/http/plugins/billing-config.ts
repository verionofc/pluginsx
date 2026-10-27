import {
  effectivePrice,
  type LicensingConfig,
} from "../../domain/licensing-config.js";
import { readFileSync } from "node:fs";
import { z } from "zod";

const amountSchema = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (amount) =>
      Number.isSafeInteger(Math.round(amount * 100)) &&
      Number(amount.toFixed(2)) === amount,
    "Amounts must be representable in whole cents.",
  );

const commonPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  amount: amountSchema,
  serverLimit: z.number().int().positive(),
  oneTime: z.boolean(),
});

const plansFileSchema = z.object({
  currency: z.string().length(3),
  locale: z.string().min(1),
  plans: z.object({
    trial: commonPlanSchema.extend({
      id: z.literal("free"),
      durationHours: z.number().int().positive(),
      oneTime: z.literal(true),
    }),
    monthly: commonPlanSchema.extend({
      id: z.literal("monthly"),
      interval: z.literal("month"),
      recurrence: z.object({
        frequency: z.number().int().positive(),
        frequencyType: z.enum(["days", "months"]),
      }),
      oneTime: z.literal(false),
    }),
    lifetime: commonPlanSchema.extend({
      id: z.literal("lifetime"),
      oneTime: z.literal(true),
    }),
    aether: commonPlanSchema.extend({
      id: z.literal("aether"),
      oneTime: z.literal(true),
    }),
  }),
  serverSlot: z.object({
    name: z.string().min(1),
    amount: amountSchema,
    maxPerPurchase: z.number().int().positive(),
  }),
});

const plansFile = JSON.parse(
  readFileSync(new URL("../../../plans.json", import.meta.url), "utf8"),
) as unknown;

export const DEFAULT_PLANS_CONFIG = plansFileSchema.parse(plansFile);
export let PLANS_CONFIG = structuredClone(DEFAULT_PLANS_CONFIG);
export let PLAN_PRICES = {
  monthly: PLANS_CONFIG.plans.monthly.amount,
  lifetime: PLANS_CONFIG.plans.lifetime.amount,
  aether: PLANS_CONFIG.plans.aether.amount,
} as const;
export let SERVER_SLOT_PRICE = PLANS_CONFIG.serverSlot.amount;
export let MAX_SERVER_SLOTS_PER_PURCHASE =
  PLANS_CONFIG.serverSlot.maxPerPurchase;
export let TRIAL_DURATION_HOURS = PLANS_CONFIG.plans.trial.durationHours;
export let TRIAL_DURATION_MS = TRIAL_DURATION_HOURS * 60 * 60 * 1000;

export type ServerPlan = "trial" | "monthly" | "lifetime" | "aether" | null;

export function getPlanConfig(
  plan: "free" | "monthly" | "lifetime" | "aether",
) {
  if (plan === "free") return PLANS_CONFIG.plans.trial;
  return PLANS_CONFIG.plans[plan];
}

export function getServerLimitForPlan(plan: ServerPlan): number {
  if (plan === "trial") return PLANS_CONFIG.plans.trial.serverLimit;
  return PLANS_CONFIG.plans[plan ?? "monthly"].serverLimit;
}

export function formatPlanAmount(amount: number): string {
  return new Intl.NumberFormat(PLANS_CONFIG.locale, {
    style: "currency",
    currency: PLANS_CONFIG.currency,
  }).format(amount);
}

export function addRecurringInterval(
  date: Date,
  frequency: number,
  frequencyType: "days" | "months",
): Date {
  if (frequencyType === "days") {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + frequency);
    return next;
  }

  const next = new Date(date);
  const originalDay = date.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + frequency);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next;
}

export let PLAN_CATALOG = [
  {
    ...PLANS_CONFIG.plans.trial,
    amount: PLANS_CONFIG.plans.trial.amount,
    durationHours: TRIAL_DURATION_HOURS,
  },
  PLANS_CONFIG.plans.monthly,
  PLANS_CONFIG.plans.lifetime,
  PLANS_CONFIG.plans.aether,
].map((plan, index) => ({
  ...plan,
  formattedPrice: formatPlanAmount(plan.amount),
  basePriceCents: Math.round(plan.amount * 100),
  salePriceCents: null as number | null,
  promotion: false,
  discountPercent: 0,
  duration: "durationHours" in plan ? plan.durationHours : 1,
  durationUnit:
    plan.id === "free"
      ? "hours"
      : plan.id === "monthly"
        ? "months"
        : "lifetime",
  description: "",
  features: [] as string[],
  permissions: [] as string[],
  visible: true,
  enabled: true,
  featured: false,
  order: index,
  version: 1,
}));

export function safeReturnPath(returnTo: string | undefined): string {
  if (
    !returnTo ||
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.includes("\\")
  )
    return "/";
  return returnTo === "/" ||
    returnTo === "/cart" ||
    returnTo === "/plans" ||
    returnTo.startsWith("/#") ||
    returnTo.startsWith("/account/keys/")
    ? returnTo
    : "/";
}

export function addOneCalendarMonth(date: Date): Date {
  return addRecurringInterval(date, 1, "months");
}

/** Refresh the existing billing contract from the persisted administrative catalog. */
export function applyLicensingConfiguration(config: LicensingConfig) {
  const next = structuredClone(DEFAULT_PLANS_CONFIG);
  for (const plan of config.plans) {
    const key = plan.id === "free" ? "trial" : plan.id;
    const target = next.plans[key];
    target.name = plan.name;
    target.amount = effectivePrice(plan).priceCents / 100;
    target.serverLimit = plan.serverLimit;
    if (plan.id === "free")
      next.plans.trial.durationHours =
        plan.duration * (plan.durationUnit === "days" ? 24 : 1);
    if (plan.id === "monthly")
      next.plans.monthly.recurrence = {
        frequency: plan.duration,
        frequencyType: plan.durationUnit === "months" ? "months" : "days",
      };
  }
  next.serverSlot = {
    name: config.serverSlot.name,
    amount: config.serverSlot.priceCents / 100,
    maxPerPurchase: config.serverSlot.maxPerPurchase,
  };
  SERVER_SLOT_PRICE = next.serverSlot.amount;
  MAX_SERVER_SLOTS_PER_PURCHASE = next.serverSlot.maxPerPurchase;
  PLANS_CONFIG = next;
  PLAN_PRICES = {
    monthly: next.plans.monthly.amount,
    lifetime: next.plans.lifetime.amount,
    aether: next.plans.aether.amount,
  };
  TRIAL_DURATION_HOURS = next.plans.trial.durationHours;
  TRIAL_DURATION_MS = TRIAL_DURATION_HOURS * 3_600_000;
  PLAN_CATALOG = config.plans
    .map((plan) => {
      const terms = plan.id === "free" ? next.plans.trial : next.plans[plan.id];
      const price = effectivePrice(plan);
      return {
        ...terms,
        formattedPrice: formatPlanAmount(terms.amount),
        basePriceCents: plan.basePriceCents,
        salePriceCents: plan.salePriceCents,
        duration: plan.duration,
        durationUnit: plan.durationUnit,
        promotion: price.promotion,
        discountPercent: price.discountPercent,
        description: plan.description,
        features: plan.features,
        permissions: plan.permissions,
        visible: plan.visible,
        enabled: plan.enabled,
        featured: plan.featured,
        order: plan.order,
        version: config.version,
      };
    })
    .sort((a, b) => a.order - b.order);
}
