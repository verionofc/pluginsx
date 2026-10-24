import { readFileSync } from "node:fs";
import { z } from "zod";

const amountSchema = z.number().finite().nonnegative().refine(
  (amount) => Number.isSafeInteger(Math.round(amount * 100)) && Number(amount.toFixed(2)) === amount,
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

export const PLANS_CONFIG = plansFileSchema.parse(plansFile);
export const PLAN_PRICES = {
  monthly: PLANS_CONFIG.plans.monthly.amount,
  lifetime: PLANS_CONFIG.plans.lifetime.amount,
  aether: PLANS_CONFIG.plans.aether.amount,
} as const;
export const SERVER_SLOT_PRICE = PLANS_CONFIG.serverSlot.amount;
export const MAX_SERVER_SLOTS_PER_PURCHASE = PLANS_CONFIG.serverSlot.maxPerPurchase;
export const TRIAL_DURATION_HOURS = PLANS_CONFIG.plans.trial.durationHours;
export const TRIAL_DURATION_MS = TRIAL_DURATION_HOURS * 60 * 60 * 1000;

export type ServerPlan = "trial" | "monthly" | "lifetime" | "aether" | null;

export function getPlanConfig(plan: "free" | "monthly" | "lifetime" | "aether") {
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
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDay));
  return next;
}

export const PLAN_CATALOG = [
  { ...PLANS_CONFIG.plans.trial, amount: PLANS_CONFIG.plans.trial.amount, durationHours: TRIAL_DURATION_HOURS },
  PLANS_CONFIG.plans.monthly,
  PLANS_CONFIG.plans.lifetime,
  PLANS_CONFIG.plans.aether,
].map((plan) => ({
  ...plan,
  formattedPrice: formatPlanAmount(plan.amount),
}));

export function safeReturnPath(returnTo: string | undefined): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//") || returnTo.includes("\\")) return "/";
  return returnTo === "/" || returnTo === "/cart" || returnTo === "/plans" || returnTo.startsWith("/#") || returnTo.startsWith("/account/keys/") ? returnTo : "/";
}

export function addOneCalendarMonth(date: Date): Date {
  return addRecurringInterval(date, 1, "months");
}
