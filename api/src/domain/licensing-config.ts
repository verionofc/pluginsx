import { z } from "zod";

export const planIds = ["free", "monthly", "lifetime", "aether"] as const;
export type CommercialPlanId = (typeof planIds)[number];
export const featureIds = [
  "spawners",
  "shop",
  "upgrades",
  "trading",
  "public_sales",
] as const;
const money = z.number().int().min(0).max(100_000_000);
export const commercialPlanSchema = z
  .object({
    id: z.enum(planIds),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(1000),
    basePriceCents: money,
    salePriceCents: money.nullable(),
    promotionEnabled: z.boolean(),
    promotionStartsAt: z.string().datetime().nullable(),
    promotionEndsAt: z.string().datetime().nullable(),
    billingType: z.enum(["free", "recurring", "lifetime"]),
    durationUnit: z.enum(["hours", "days", "months", "lifetime"]),
    duration: z.number().int().min(1).max(3650),
    serverLimit: z.number().int().min(1).max(1_000_000),
    features: z.array(z.enum(featureIds)).max(5),
    permissions: z.array(z.string().regex(/^[a-z0-9_.\-*]{1,100}$/)).max(50),
    enabled: z.boolean(),
    visible: z.boolean(),
    featured: z.boolean(),
    order: z.number().int().min(0).max(100),
  })
  .strict()
  .superRefine((p, ctx) => {
    const error = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (p.promotionEnabled && p.salePriceCents === null)
      error(
        "salePriceCents",
        "Informe o preço promocional antes de ativar a promoção.",
      );
    if (p.salePriceCents !== null && p.salePriceCents > p.basePriceCents)
      error("salePriceCents", "A promoção não pode superar o preço base.");
    if (
      p.id === "free" &&
      (p.basePriceCents !== 0 ||
        (p.salePriceCents ?? 0) !== 0 ||
        p.billingType !== "free" ||
        !["hours", "days"].includes(p.durationUnit))
    )
      error(
        "basePriceCents",
        "O Trial deve continuar gratuito e ter duração em horas ou dias.",
      );
    if (
      p.id !== "free" &&
      (p.basePriceCents < 1 ||
        (p.promotionEnabled &&
          p.salePriceCents !== null &&
          p.salePriceCents < 1))
    )
      error(
        "basePriceCents",
        "Produtos pagos devem custar pelo menos um centavo.",
      );
    if (
      p.id === "monthly" &&
      (p.billingType !== "recurring" ||
        !["months", "days"].includes(p.durationUnit))
    )
      error("billingType", "O mensal deve usar recorrência em meses ou dias.");
    if (
      ["lifetime", "aether"].includes(p.id) &&
      (p.billingType !== "lifetime" || p.durationUnit !== "lifetime")
    )
      error("billingType", "Este plano é vitalício.");
    if (
      p.promotionStartsAt &&
      p.promotionEndsAt &&
      Date.parse(p.promotionStartsAt) >= Date.parse(p.promotionEndsAt)
    )
      error("promotionEndsAt", "O término deve ocorrer após o início.");
  });
export type CommercialPlan = z.infer<typeof commercialPlanSchema>;
export const licensingPolicySchema = z
  .object({
    privateRequestsPerMinute: z.number().int().min(30).max(600).default(120),
    proofRequestsPerMinute: z.number().int().min(10).max(600).default(120),
    approvalMinutes: z.number().int().min(1).max(60),
    maxRequestsPerWindow: z.number().int().min(1).max(100),
    requestWindowSeconds: z.number().int().min(30).max(3600),
    maxPendingPerLicense: z.number().int().min(1).max(100),
    reactivationCooldownSeconds: z.number().int().min(0).max(86400),
    allowReactivation: z.boolean(),
    heartbeatSeconds: z.number().int().min(15).max(600),
    offlineAfterSeconds: z.number().int().min(30).max(3600),
    graceSeconds: z.number().int().min(0).max(3600),
    maxRetries: z.number().int().min(0).max(5),
    retrySeconds: z.number().int().min(5).max(300),
    clockSkewSeconds: z.number().int().min(30).max(300),
    logRetentionDays: z.number().int().min(1).max(365),
    sensitiveRetentionDays: z.number().int().min(1).max(30),
    collectPlayerIp: z.boolean(),
    geolocationEnabled: z.boolean(),
    consentVersion: z.number().int().min(1).max(1000),
    alertsEnabled: z.boolean().default(true),
    allowLegacyActivations: z.boolean(),
    requireSensitiveConfirmation: z.literal(true),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.offlineAfterSeconds < p.heartbeatSeconds * 2)
      ctx.addIssue({
        code: "custom",
        path: ["offlineAfterSeconds"],
        message: "O timeout deve permitir ao menos dois heartbeats.",
      });
    if (p.geolocationEnabled && !p.collectPlayerIp)
      ctx.addIssue({
        code: "custom",
        path: ["geolocationEnabled"],
        message: "Geolocalização exige coleta opcional de IP habilitada.",
      });
  });
export type LicensingPolicy = z.infer<typeof licensingPolicySchema>;
export const defaultLicensingPolicy: LicensingPolicy = {
  privateRequestsPerMinute: 120,
  proofRequestsPerMinute: 120,
  approvalMinutes: 12,
  maxRequestsPerWindow: 10,
  requestWindowSeconds: 60,
  maxPendingPerLicense: 3,
  reactivationCooldownSeconds: 60,
  allowReactivation: true,
  heartbeatSeconds: 60,
  offlineAfterSeconds: 180,
  graceSeconds: 600,
  maxRetries: 3,
  retrySeconds: 15,
  clockSkewSeconds: 120,
  logRetentionDays: 90,
  sensitiveRetentionDays: 7,
  collectPlayerIp: false,
  geolocationEnabled: false,
  consentVersion: 1,
  allowLegacyActivations: true,
  alertsEnabled: true,
  requireSensitiveConfirmation: true,
};
export const serverSlotSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    priceCents: z.number().int().min(1).max(100_000_000),
    maxPerPurchase: z.number().int().min(1).max(1000),
  })
  .strict();
export type LicensingConfig = {
  version: number;
  serverSlot: z.infer<typeof serverSlotSchema>;
  plans: CommercialPlan[];
  policy: LicensingPolicy;
  updatedAt: string;
  migratedAt?: string;
};
export type PlanTerms = {
  planId: CommercialPlanId;
  version: number;
  name: string;
  priceCents: number;
  serverLimit: number;
  features: string[];
  permissions: string[];
  durationUnit: CommercialPlan["durationUnit"];
  duration: number;
};
export function effectivePrice(plan: CommercialPlan, now = Date.now()) {
  const promotion =
    plan.promotionEnabled &&
    plan.salePriceCents !== null &&
    plan.salePriceCents < plan.basePriceCents &&
    (!plan.promotionStartsAt || Date.parse(plan.promotionStartsAt) <= now) &&
    (!plan.promotionEndsAt || Date.parse(plan.promotionEndsAt) > now);
  return {
    priceCents: promotion ? plan.salePriceCents! : plan.basePriceCents,
    promotion,
    discountPercent: promotion
      ? Math.round((1 - plan.salePriceCents! / plan.basePriceCents) * 100)
      : 0,
  };
}
export function acceptedPlanTerms(
  config: LicensingConfig,
  plan: CommercialPlan,
): PlanTerms {
  return {
    planId: plan.id,
    version: config.version,
    name: plan.name,
    priceCents: effectivePrice(plan).priceCents,
    serverLimit: plan.serverLimit,
    features: [...plan.features],
    permissions: [...plan.permissions],
    durationUnit: plan.durationUnit,
    duration: plan.duration,
  };
}
