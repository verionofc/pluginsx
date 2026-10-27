import {
  LicensingConfiguration,
  LicensingRevision,
} from "../../database/models/LicensingConfiguration.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { LicenseServer } from "../../database/models/LicenseServer.js";
import { License } from "../../database/models/License.js";
import {
  acceptedPlanTerms,
  commercialPlanSchema,
  serverSlotSchema,
  defaultLicensingPolicy,
  featureIds,
  licensingPolicySchema,
  type CommercialPlan,
  type LicensingConfig,
} from "../../domain/licensing-config.js";
import {
  applyLicensingConfiguration,
  DEFAULT_PLANS_CONFIG,
} from "./billing-config.js";

export function initialLicensingConfig(): LicensingConfig {
  const plans: CommercialPlan[] = Object.entries(
    DEFAULT_PLANS_CONFIG.plans,
  ).map(([key, plan], order) => ({
    id: plan.id as CommercialPlan["id"],
    name: plan.name,
    description:
      key === "trial"
        ? "Conheça os recursos Plus em uma licença independente do seu plano pago."
        : "Recursos Plus para administrar seus mundos PaperMC.",
    basePriceCents: Math.round(plan.amount * 100),
    salePriceCents: null,
    promotionEnabled: false,
    promotionStartsAt: null,
    promotionEndsAt: null,
    billingType:
      key === "trial" ? "free" : key === "monthly" ? "recurring" : "lifetime",
    durationUnit:
      key === "trial"
        ? "hours"
        : key === "monthly"
          ? DEFAULT_PLANS_CONFIG.plans.monthly.recurrence.frequencyType ===
            "months"
            ? "months"
            : "days"
          : "lifetime",
    duration:
      key === "trial"
        ? DEFAULT_PLANS_CONFIG.plans.trial.durationHours
        : key === "monthly"
          ? DEFAULT_PLANS_CONFIG.plans.monthly.recurrence.frequency
          : 1,
    serverLimit: plan.serverLimit,
    features: [...featureIds],
    permissions: ["spawnerx.plus"],
    enabled:
      key !== "trial" ||
      process.env.TEMP_LICENSE_TRIAL_ENABLED?.toLowerCase() === "true",
    visible:
      key !== "trial" ||
      process.env.TEMP_LICENSE_TRIAL_ENABLED?.toLowerCase() === "true",
    featured: key === "monthly",
    order,
  }));
  return {
    version: 1,
    serverSlot: {
      name: DEFAULT_PLANS_CONFIG.serverSlot.name,
      priceCents: Math.round(DEFAULT_PLANS_CONFIG.serverSlot.amount * 100),
      maxPerPurchase: DEFAULT_PLANS_CONFIG.serverSlot.maxPerPurchase,
    },
    plans,
    policy: { ...defaultLicensingPolicy },
    updatedAt: new Date().toISOString(),
  };
}
let cached: LicensingConfig | undefined;
let checkedAt = 0;
let loading: Promise<LicensingConfig> | undefined;
export function invalidateLicensingConfig() {
  cached = undefined;
  checkedAt = 0;
}
export async function getLicensingConfig(
  force = false,
): Promise<LicensingConfig> {
  if (!force && cached && Date.now() - checkedAt < 5000) {
    applyLicensingConfiguration(cached);
    return cached;
  }
  if (loading) return loading;
  loading = (async () => {
    const seed = initialLicensingConfig();
    const row = await LicensingConfiguration.findOneAndUpdate(
      { _id: "current" },
      { $setOnInsert: seed },
      { upsert: true, new: true },
    ).lean();
    const config: LicensingConfig = {
      version: row!.version,
      serverSlot: serverSlotSchema.parse(row!.serverSlot ?? seed.serverSlot),
      plans: row!.plans.map((p) => commercialPlanSchema.parse(p)),
      policy: licensingPolicySchema.parse(row!.policy),
      updatedAt: row!.updatedAt,
      ...(row!.migratedAt ? { migratedAt: row!.migratedAt } : {}),
    };
    cached = config;
    checkedAt = Date.now();
    applyLicensingConfiguration(config);
    return config;
  })();
  try {
    return await loading;
  } finally {
    loading = undefined;
  }
}
export async function migrateLicensingBeta3() {
  await Promise.all([LicensingConfiguration.init(), LicensingRevision.init()]);
  const config = await getLicensingConfig(true);
  if (
    config.migratedAt &&
    (await LicensingConfiguration.findById("current").lean())
      ?.ownershipMigratedAt
  )
    return;
  // Freeze the original entitlements before accepting any commercial edits.
  const original = initialLicensingConfig();
  for (const plan of original.plans) {
    const terms = acceptedPlanTerms(original, plan);
    if (plan.id !== "free")
      await PlanAccess.updateMany(
        { plan: plan.id, planTerms: { $exists: false } },
        { $set: { planTerms: terms } },
      );
    await License.updateMany(
      {
        sourcePlan: plan.id === "free" ? "trial" : plan.id,
        planTerms: { $exists: false },
      },
      { $set: { planTerms: terms } },
    );
  }
  for await (const license of License.find({ ownerId: { $exists: true } })
    .lean()
    .cursor()) {
    const access = await PlanAccess.findOne({ userId: license.ownerId }).lean();
    await LicenseServer.updateMany(
      { licenseId: license._id, ownerId: { $exists: false } },
      {
        $set: {
          ownerId: license.ownerId,
          licensePlan: access?.plan ?? license.sourcePlan,
          licenseTerms: access?.planTerms ?? license.planTerms,
          licenseExpiresAt: access?.expiresAt ?? license.expiresAt,
        },
      },
    );
  }
  for await (const access of PlanAccess.find({
    trialLicenseCode: { $exists: true },
  })
    .lean()
    .cursor()) {
    await LicenseServer.updateMany(
      { licenseId: access.trialLicenseCode, ownerId: { $exists: false } },
      {
        $set: {
          ownerId: access.userId,
          licensePlan: "trial",
          licenseTerms: acceptedPlanTerms(
            original,
            original.plans.find((p) => p.id === "free")!,
          ),
          licenseExpiresAt: access.trialLicenseExpiresAt,
        },
      },
    );
  }
  await LicensingConfiguration.updateOne(
    { _id: "current" },
    {
      $set: {
        migratedAt: config.migratedAt ?? new Date().toISOString(),
        ownershipMigratedAt: new Date().toISOString(),
      },
    },
  );
  invalidateLicensingConfig();
}
