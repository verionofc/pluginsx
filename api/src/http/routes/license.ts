import { Elysia } from "elysia";
import { z } from "zod";

import { License } from "../../database/models/License.js";
import {
  generate as generateLicense,
  isValid as isLicenseValid,
  view as viewLicense,
  type LicenseView,
} from "../plugins/license.js";

type LicenseTier = "default";

const DEFAULT_OWNER_ID = "default";
const DEFAULT_TIER: LicenseTier = "default";
const DEFAULT_CODE_PREFIX = "pluginsx_";

const defaultLicenseSchema = z.object({
  code: z.string(),
  tier: z.literal("default"),
  valid: z.boolean(),
});

const generatedDefaultLicenseSchema = defaultLicenseSchema.extend({
  created: z.literal(true).optional(),
});

const hasExpectedCodePrefix = (code: string) =>
  code.startsWith(DEFAULT_CODE_PREFIX);

const resolveTierFromValue = (value: LicenseView["value"]): LicenseTier | undefined => {
  if (!value || typeof value !== "object") return undefined;

  const rawTier = (value as { tier?: unknown }).tier;
  return rawTier === "default" ? rawTier : undefined;
};

const findDefaultLicenseId = async (): Promise<string | undefined> => {
  const license = await License.findOne({
    "value.tier": DEFAULT_TIER,
    "value.valid": true,
  })
    .select({ _id: 1 })
    .sort({ _id: 1 })
    .lean();

  return license?._id;
};

const mapLicenseResponse = (code: string, view: LicenseView) => ({
  code,
  tier: resolveTierFromValue(view.value) ?? DEFAULT_TIER,
  valid: view.valid,
});

type EnsuredDefaultLicense = {
  code: string;
  view: LicenseView;
  created?: true;
};

const createDefaultLicense = async (): Promise<EnsuredDefaultLicense> => {
  const code = await generateLicense(DEFAULT_OWNER_ID, DEFAULT_TIER);
  const view = await viewLicense(code);
  return {
    code,
    view,
    created: true as const,
  };
};

const regenerateDefaultLicense = async (
  previousCode?: string,
): Promise<EnsuredDefaultLicense> => {
  if (previousCode) {
    await License.deleteOne({ _id: previousCode });
  }
  return createDefaultLicense();
};

const ensureDefaultLicense = async (): Promise<EnsuredDefaultLicense> => {
  const existingId = await findDefaultLicenseId();
  if (!existingId) return createDefaultLicense();

  if (!hasExpectedCodePrefix(existingId)) {
    return regenerateDefaultLicense(existingId);
  }

  const existingView = await viewLicense(existingId);
  if (!existingView.valid) {
    return regenerateDefaultLicense(existingId);
  }

  return {
    code: existingId,
    view: existingView,
  };
};

export const licenseRoutes = new Elysia({ prefix: "/license" })
  .post(
    "/generate",
    async () => {
      const generated = await ensureDefaultLicense();
      if (generated.created) {
        return {
          ...mapLicenseResponse(generated.code, generated.view),
          created: true as const,
        };
      }

      return mapLicenseResponse(generated.code, generated.view);
    },
    {
      detail: {
        summary: "Generate default license",
        tags: ["License"],
      },
      response: {
        200: generatedDefaultLicenseSchema,
      },
    },
  )
  .get(
    "/view",
    async ({ status }) => {
      const existingId = await findDefaultLicenseId();
      if (!existingId) {
        return status(404, { message: "default license not found" });
      }

      if (!hasExpectedCodePrefix(existingId)) {
        const regenerated = await regenerateDefaultLicense(existingId);
        return mapLicenseResponse(regenerated.code, regenerated.view);
      }

      const licenseView = await viewLicense(existingId);
      return mapLicenseResponse(existingId, licenseView);
    },
    {
      detail: {
        summary: "View current default license",
        tags: ["License"],
      },
      response: {
        200: defaultLicenseSchema,
        404: z.object({ message: z.string() }),
      },
    },
  )
  .get(
    "/verify",
    async ({ query, status }) => {
      const key = typeof query.key === "string" ? query.key.trim() : "";

      if (!key) {
        return status(400, { message: "license key is required" });
      }

      return isLicenseValid(key);
    },
    {
      query: z.object({
        key: z.string().min(1),
      }),
      detail: {
        summary: "Verify license by key",
        tags: ["License"],
      },
      response: {
        200: z.boolean(),
        400: z.object({ message: z.string() }),
        404: z.object({ message: z.string() }),
      },
    },
  );
