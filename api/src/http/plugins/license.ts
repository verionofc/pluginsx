import { License } from "../../database/models/License.js";
import { hasPremiumAccess } from "./plan-access.js";
import { v3 as uuidv3 } from "uuid";
import { randomUUID } from "node:crypto";

export type TierType = "default" | "plus";
export type LicenseView = {
  valid: boolean;
  type?: "pluginsx_license";
  value?: {
    tier: TierType;
    valid: boolean;
  };
};

const LICENSE_NAMESPACE = uuidv3.URL;

const getCodePrefix = (tier: TierType) =>
  tier === "plus" ? "plus_" : "pluginsx_";

const createUuidBody = (ownerId: string, tier: TierType, attempt: number) =>
  uuidv3(`${ownerId}:${tier}:${Date.now()}:${attempt}:${Math.random()}`, LICENSE_NAMESPACE);

const isDuplicateKeyError = (error: unknown) =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === 11000,
  );

export async function generate(ownerId: string, tier: TierType): Promise<string> {
  const codePrefix = getCodePrefix(tier);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `${codePrefix}${createUuidBody(ownerId, tier, attempt)}`;
    try {
      await License.create({
        _id: code,
        value: {
          tier,
          valid: true,
        },
      });
      return code;
    } catch (error) {
      if (isDuplicateKeyError(error)) continue;
      throw error;
    }
  }

  throw new Error("Unable to generate a unique license code.");
}

export async function generatePremiumForAccount(
  ownerId: string,
  sourcePlan: "monthly" | "lifetime" | "aether",
): Promise<{ code: string; created: boolean }> {
  const existing = await License.findOne({ ownerId })
    .select({ _id: 1 })
    .lean();

  if (existing) {
    // Keep the account license in sync when its owner changes billing plans.
    await License.updateOne({ _id: existing._id }, { $set: { sourcePlan } });
    return { code: existing._id, created: false };
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `plus_${createUuidBody(ownerId, "plus", attempt)}`;

    try {
      await License.create({
        _id: code,
        ownerId,
        sourcePlan,
        value: {
          tier: "plus",
          valid: true,
        },
      });
      return { code, created: true };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      // A simultaneous request may have won the unique ownerId index race.
      const accountLicense = await License.findOne({ ownerId })
        .select({ _id: 1 })
        .lean();
      if (accountLicense) return { code: accountLicense._id, created: false };
    }
  }

  throw new Error("Unable to generate a unique premium license code.");
}

export async function generateTemporaryPremiumLicense(expiresAt: Date): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = `plus_${randomUUID()}`;
    try {
      await License.create({
        _id: code,
        sourcePlan: "trial",
        expiresAt,
        value: { tier: "plus", valid: true },
      });
      return code;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }
  throw new Error("Unable to generate a unique temporary license code.");
}

export async function view(license_key: string): Promise<LicenseView> {
  const key = license_key.trim();
  if (!key) {
    return { valid: false };
  }

  const license = await License.findById(key).lean();

  if (!license) {
    return { valid: false };
  }

  if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) {
    await License.deleteOne({ _id: key, expiresAt: { $lte: new Date() } });
    return { valid: false, type: "pluginsx_license", value: { tier: license.value.tier, valid: false } };
  }

  if (license.value.tier === "plus" && license.ownerId && !(await hasPremiumAccess(license.ownerId))) {
    return { valid: false, type: "pluginsx_license", value: { tier: "plus", valid: false } };
  }

  return {
    valid: license.value.valid,
    type: "pluginsx_license",
    value: {
      tier: license.value.tier,
      valid: license.value.valid,
    },
  };
}

export async function isValid(license_key: string): Promise<boolean> {
  const license = await view(license_key);
  return license.valid;
}
