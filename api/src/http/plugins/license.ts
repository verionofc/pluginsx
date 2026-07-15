import { License } from "../../database/models/License.js";
import { v3 as uuidv3 } from "uuid";

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

export async function view(license_key: string): Promise<LicenseView> {
  const key = license_key.trim();
  if (!key) {
    return { valid: false };
  }

  const license = await License.findById(key).lean();

  if (!license) {
    return { valid: false };
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
