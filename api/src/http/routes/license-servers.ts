import { allowAccountRequest } from "../plugins/rate-limit.js";
import { ActivationError, serverConnection } from "../../domain/activation.js";
import {
  activationEvent,
  expireServerRequest,
  manageActivation,
  ownedServer,
} from "../plugins/activation-service.js";
import { getLicensingConfig } from "../plugins/licensing-config.js";
import { eraseActivationPrivacy } from "../plugins/activation-privacy.js";
import {
  LicenseServerEvent,
  LicenseServerPrivacy,
} from "../../database/models/LicenseServerEvent.js";
import { Elysia } from "elysia";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { License } from "../../database/models/License.js";
import { LicenseServer } from "../../database/models/LicenseServer.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import { getServerLimitForPlan } from "../plugins/billing-config.js";
import { view } from "../plugins/license.js";
import { ensurePaidPlanLicense } from "../plugins/paid-plan-license.js";
import { BillingConflict } from "../plugins/billing-lock.js";
import { RemoteSession } from "../../database/models/RemoteSpawnerX.js";
import { getPaidPlan, hasTrustedWebOrigin } from "../plugins/plan-access.js";
import { getMonthlyBilling } from "../plugins/monthly-billing.js";
import {
  serverIconIds,
  serverProfileUpdate,
  updateAuthorizedServerProfile,
} from "../../domain/server-profile.js";

type LicensePlan = "trial" | "monthly" | "lifetime" | "aether" | null;

const planForLicense = async (license: {
  ownerId?: string;
  sourcePlan?: "trial" | "monthly" | "lifetime" | "aether";
  expiresAt?: Date;
}): Promise<LicensePlan> => {
  // Also recognizes trial keys created before `sourcePlan: "trial"` existed.
  if (license.sourcePlan === "trial" || license.expiresAt) return "trial";
  const activePlan = license.ownerId
    ? await getPaidPlan(license.ownerId)
    : null;
  return license.sourcePlan ?? activePlan ?? null;
};

const serverLimitForPlan = getServerLimitForPlan;
const unlimitedServerLimit = Number.MAX_SAFE_INTEGER;

const additionalServerSlotsFor = async (userId: string) => {
  const [purchases] = await PlanPurchase.aggregate<{ total: number }>([
    { $match: { userId, status: "approved" } },
    {
      $group: { _id: null, total: { $sum: { $ifNull: ["$serverSlots", 0] } } },
    },
  ]);
  return Math.max(0, Math.floor(Number(purchases?.total ?? 0)));
};

const serverLimitForLicense = async (
  license: {
    ownerId?: string;
    sourcePlan?: "trial" | "monthly" | "lifetime" | "aether";
    expiresAt?: Date;
  },
  plan?: LicensePlan,
) => {
  const resolvedPlan = plan ?? (await planForLicense(license));
  const baseLimit =
    ("planTerms" in license
      ? (license.planTerms as { serverLimit?: number } | undefined)?.serverLimit
      : undefined) ?? serverLimitForPlan(resolvedPlan);
  if (
    !license.ownerId ||
    !["monthly", "lifetime", "aether"].includes(resolvedPlan ?? "")
  )
    return baseLimit;
  const activeAccess = await PlanAccess.findOne({
    userId: license.ownerId,
    plan: resolvedPlan,
    status: "active",
    $or: [
      { plan: { $in: ["lifetime", "aether"] } },
      { plan: "monthly", expiresAt: { $gt: new Date() } },
    ],
  })
    .select({
      plan: 1,
      serverLimitOverride: 1,
      serverLimitUnlimited: 1,
      planTerms: 1,
    })
    .lean();
  if (!activeAccess) return baseLimit;
  if (activeAccess.serverLimitUnlimited) return unlimitedServerLimit;
  const paidPlan =
    activeAccess.plan === "monthly" ||
    activeAccess.plan === "lifetime" ||
    activeAccess.plan === "aether"
      ? activeAccess.plan
      : null;
  if (!paidPlan) return baseLimit;
  const planLimit =
    activeAccess.serverLimitOverride ??
    activeAccess.planTerms?.serverLimit ??
    serverLimitForPlan(paidPlan);
  return planLimit + (await additionalServerSlotsFor(license.ownerId));
};

const serverCapacityForLicense = async (
  license: {
    ownerId?: string;
    sourcePlan?: "trial" | "monthly" | "lifetime" | "aether";
    expiresAt?: Date;
  },
  plan?: LicensePlan,
) => {
  const limit = await serverLimitForLicense(license, plan);
  const unlimited = limit === unlimitedServerLimit;
  return { limit, unlimited };
};

const accountLicenseRef = (licenseId: string) =>
  createHash("sha256")
    .update(`pluginsx-account-license:${licenseId}`)
    .digest("hex");

async function expirePendingRequests(licenseId: string, now = new Date()) {
  const expiredPending = await LicenseServer.find({
    licenseId,
    state: "PENDING",
    expiresAt: { $lte: now },
  })
    .select({ _id: 1 })
    .lean();
  for (const expired of expiredPending) {
    await expireServerRequest(expired._id);
  }
}

const serverInfo = z.object({
  serverId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  minecraftVersion: z.string().max(40).default("unknown"),
  implementation: z.string().max(40).default("Paper"),
  implementationVersion: z.string().max(60).default("unknown"),
  pluginVersion: z.string().max(40).default("unknown"),
});

const publicRecord = (
  record: any,
  accountView = false,
  offlineSeconds = 180,
  remote = {
    state: "DISCONNECTED",
    online: false,
    manageable: false,
    reason: "Execute /sx connect no Minecraft para conectar o SpawnerX.",
  },
) => ({
  id: record._id,
  serverId: record.serverId,
  name: record.name,
  minecraftVersion: record.minecraftVersion,
  implementation: record.implementation,
  implementationVersion: record.implementationVersion,
  pluginVersion: record.pluginVersion,
  state: record.state,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  lastValidatedAt: record.lastValidatedAt ?? null,
  connection: serverConnection(
    record.state,
    record.lastHeartbeatAt,
    offlineSeconds,
  ),
  approvedAt: record.approvedAt ?? null,
  lastHeartbeatAt: record.lastHeartbeatAt ?? null,
  ...(accountView
    ? {
        remote,
        plugins: [
          { id: "spawnerx", name: "SpawnerX", version: record.pluginVersion },
        ],
        activatedBy: record.activatedBy ?? null,
        authentication: record.authentication ?? null,
        accountVerification: record.accountVerification ?? "UNKNOWN",
        protocol: record.protocol ?? 2,
      }
    : {}),
  ...(accountView
    ? {
        displayName: record.displayName ?? "",
        tags: record.tags ?? [],
        icon: serverIconIds.includes(record.icon) ? record.icon : "grass",
        pinned: Boolean(record.pinned),
      }
    : {}),
});

export const licenseServerRoutes = new Elysia({ prefix: "/license" })
  .use(authSessionPlugin)
  // Called by SpawnerX. A successful key check only creates a PENDING request.
  .post(
    "/servers/request",
    async ({ body, status }) => {
      const policy = (await getLicensingConfig()).policy;
      const input = body as z.infer<typeof serverInfo> & { key: string };
      const checked = serverInfo.safeParse(input);
      if (
        !checked.success ||
        typeof input.key !== "string" ||
        !/^plus_[0-9a-f-]{36}$/i.test(input.key.trim())
      ) {
        return status(400, {
          message: "Invalid license key or server details",
        });
      }
      const licenseId = input.key.trim();
      const license = await License.findOne({
        _id: licenseId,
        "value.tier": "plus",
        "value.valid": true,
      }).lean();
      if (!license || !(await view(licenseId)).valid)
        return status(403, { state: "ERROR", message: "Invalid Plus license" });
      const licenseOwnerId =
        license.ownerId ??
        (await PlanAccess.findOne({ trialLicenseCode: license._id }).lean())
          ?.userId;
      const plan = await planForLicense(license);
      const serverLimit = await serverLimitForLicense(license, plan);
      const now = new Date();
      await expirePendingRequests(licenseId, now);
      return License.db.transaction(async (session) => {
        // Both protocols serialize on this document before counting bindings.
        // A reserved slot and its legacy binding must become visible together.
        const locked = await License.updateOne(
          { _id: licenseId, "value.tier": "plus", "value.valid": true },
          { $inc: { activationRevision: 1 } },
          { session },
        );
        if (!locked.matchedCount)
          return status(403, {
            state: "ERROR",
            message: "Invalid Plus license",
          });
        const existing = await LicenseServer.findOne({
          licenseId,
          serverId: checked.data.serverId,
        }).session(session);
        if (existing) {
          if (existing.protocol === 3 || existing.publicKeyFingerprint)
            return status(409, {
              code: "PLUGIN_UPDATE_REQUIRED",
              message:
                "Esta instalação exige o protocolo de ativação assinado. Atualize o SpawnerX.",
            });
          if (existing.state === "PENDING" && existing.expiresAt <= now) {
            existing.state = "EXPIRED";
            await existing.save({ session });
            await License.updateOne(
              { _id: licenseId, serverSlots: { $gt: 0 } },
              { $inc: { serverSlots: -1 } },
              { session },
            );
          } else if (["PENDING", "ACTIVE"].includes(existing.state))
            return publicRecord(existing);
        }
        if (!policy.allowLegacyActivations)
          return status(409, {
            code: "PLUGIN_UPDATE_REQUIRED",
            message:
              "Atualize o SpawnerX para ativar esta instalação com identidade segura.",
          });
        if (
          existing &&
          ["REJECTED", "REVOKED", "INACTIVE"].includes(existing.state)
        ) {
          if (!policy.allowReactivation)
            return status(409, {
              code: "REACTIVATION_DISABLED",
              message: "A reativação está desabilitada. Contate o titular.",
            });
          if (
            existing.revokedAt &&
            now.getTime() - existing.revokedAt.getTime() <
              policy.reactivationCooldownSeconds * 1000
          )
            return status(429, {
              code: "REACTIVATION_COOLDOWN",
              message: "Aguarde o intervalo de reativação.",
            });
        }
        const used = await LicenseServer.countDocuments({
          licenseId,
          $or: [
            { state: "ACTIVE" },
            { state: "PENDING", expiresAt: { $gt: now } },
          ],
        }).session(session);
        const pending = await LicenseServer.countDocuments({
          licenseId,
          state: "PENDING",
          expiresAt: { $gt: now },
        }).session(session);
        if (used >= serverLimit || pending >= policy.maxPendingPerLicense)
          return status(409, {
            state: "ERROR",
            message:
              "Limite de servidores atingido. Remova uma vinculação existente ou altere seu plano.",
          });
        const record = {
          licenseId,
          ownerId: licenseOwnerId,
          licensePlan: plan,
          licenseTerms: license.planTerms,
          licenseExpiresAt: license.expiresAt,
          ...checked.data,
          state: "PENDING" as const,
          createdAt: now,
          expiresAt: new Date(now.getTime() + policy.approvalMinutes * 60_000),
        };
        let created;
        if (existing) {
          Object.assign(existing, record);
          existing.set("removedAt", undefined);
          existing.set("credentialHash", undefined);
          created = await existing.save({ session });
        } else {
          [created] = await LicenseServer.create(
            [{ _id: randomUUID(), ...record }],
            { session },
          );
        }
        await License.updateOne(
          { _id: licenseId },
          { $set: { serverSlots: used + 1 } },
          { session },
        );
        return publicRecord(created);
      });
    },
    {
      body: z.object({ key: z.string(), ...serverInfo.shape }),
      detail: {
        summary: "Request Plus server authorization",
        tags: ["License"],
      },
    },
  )
  .get(
    "/servers/status",
    async ({ query, status }) => {
      const licenseId = query.key.trim();
      if (!/^plus_[0-9a-f-]{36}$/i.test(licenseId))
        return status(400, { message: "Invalid license key" });
      const license = await License.findOne({
        _id: licenseId,
        "value.tier": "plus",
        "value.valid": true,
      }).lean();
      if (!license || !(await view(licenseId)).valid)
        return status(403, { state: "ERROR", message: "Invalid Plus license" });
      await expirePendingRequests(licenseId);
      const record = await LicenseServer.findOne({
        licenseId,
        serverId: query.serverId,
      });
      if (!record)
        return status(404, { state: "ERROR", message: "Activation not found" });
      if (record.protocol === 3 || record.publicKeyFingerprint)
        return status(409, {
          code: "PLUGIN_UPDATE_REQUIRED",
          message:
            "Esta instalação exige o protocolo de ativação assinado. Atualize o SpawnerX.",
        });
      if (record.state === "PENDING" && record.expiresAt <= new Date()) {
        await expireServerRequest(record._id);
        Object.assign(
          record,
          (await LicenseServer.findById(record._id))?.toObject() ?? {},
        );
      }
      if (record.state === "ACTIVE") {
        record.lastValidatedAt = new Date();
        await record.save();
      }
      return publicRecord(record);
    },
    {
      query: z.object({ key: z.string(), serverId: z.string().uuid() }),
      detail: {
        summary: "Validate a Plus server activation",
        tags: ["License"],
      },
    },
  )
  .get(
    "/servers",
    async ({ user, status, set }) => {
      if (!(await allowAccountRequest(user.id, "inventory")))
        return status(429, {
          message: "Aguarde antes de atualizar o inventário.",
        });
      set.headers["cache-control"] = "no-store, private";
      const config = await getLicensingConfig();
      const now = new Date();
      const paidPlan = await getPaidPlan(user.id);
      if (paidPlan) {
        try {
          await ensurePaidPlanLicense(user.id, paidPlan);
        } catch (error) {
          // A refund/revocation can win between reading access and repairing
          // its missing key. Never manufacture access to make inventory load.
          if (
            !(
              error instanceof BillingConflict && error.code === "PLAN_REQUIRED"
            )
          )
            throw error;
        }
      }
      const trialAccess = await PlanAccess.findOne({
        userId: user.id,
        trialLicenseCode: { $exists: true },
        trialLicenseExpiresAt: { $gt: now },
      })
        .select({ trialLicenseCode: 1 })
        .lean();
      const licenses = await License.find(
        trialAccess?.trialLicenseCode
          ? {
              $or: [
                { ownerId: user.id },
                {
                  _id: trialAccess.trialLicenseCode,
                  sourcePlan: "trial",
                  expiresAt: { $gt: now },
                },
              ],
            }
          : { ownerId: user.id },
      ).lean();
      const licenseLimits = new Map<
        string,
        { plan: LicensePlan; limit: number; unlimited: boolean }
      >();
      for (const license of licenses) {
        const plan = await planForLicense(license);
        const capacity = await serverCapacityForLicense(license, plan);
        licenseLimits.set(license._id, { plan, ...capacity });
        await expirePendingRequests(license._id, now);
      }
      const records = await LicenseServer.find({
        licenseId: { $in: licenses.map((item) => item._id) },
        removedAt: { $exists: false },
      })
        .sort({ createdAt: -1 })
        .lean();
      const billing = [...licenseLimits.values()].some(
        (item) => item.plan === "monthly",
      )
        ? await getMonthlyBilling(user.id)
        : null;
      const remoteRows = await RemoteSession.find({
        _id: { $in: records.map((row) => row._id) },
        ownerId: user.id,
      })
        .select({
          _id: 1,
          state: 1,
          leaseExpiresAt: 1,
          expiresAt: 1,
          hardExpiresAt: 1,
        })
        .lean();
      const remoteById = new Map(remoteRows.map((row) => [row._id, row]));
      const inventory = await Promise.all(
        licenses.map(async (license) => {
          const { plan, limit, unlimited } = licenseLimits.get(license._id) ?? {
            plan: null,
            limit: 0,
            unlimited: false,
          };
          const currentLicense = await License.findById(license._id)
            .select({ serverSlots: 1 })
            .lean();
          const access = license.ownerId
            ? await PlanAccess.findOne({ userId: license.ownerId }).lean()
            : null;
          const matchingAccess = access?.plan === plan ? access : null;
          const terms = license.planTerms ?? matchingAccess?.planTerms;
          const valid = (await view(license._id)).valid;
          return {
            planName: terms?.name ?? null,
            id: accountLicenseRef(license._id),
            tier: license.value.tier,
            valid,
            plan,
            terms: terms ?? null,
            expiresAt:
              license.expiresAt ??
              (plan === "monthly" ? (matchingAccess?.expiresAt ?? null) : null),
            billing: plan === "monthly" ? billing : null,
            used: currentLicense?.serverSlots ?? 0,
            limit:
              license.value.tier === "plus" ? (unlimited ? null : limit) : 0,
            unlimited: license.value.tier === "plus" && unlimited,
            servers: records
              .filter((record) => record.licenseId === license._id)
              .map((record) => {
                const remote = remoteById.get(record._id);
                const paid = valid && plan !== "trial" && !license.expiresAt;
                const live = Boolean(
                  paid &&
                    record.state === "ACTIVE" &&
                    remote &&
                    remote.leaseExpiresAt > now &&
                    remote.expiresAt > now &&
                    remote.hardExpiresAt > now &&
                    ["PENDING", "WEB_APPROVED", "CONNECTED"].includes(
                      remote.state,
                    ),
                );
                const manageable = live && remote?.state === "CONNECTED";
                return publicRecord(
                  record,
                  true,
                  config.policy.offlineAfterSeconds,
                  {
                    state:
                      remote?.state === "CONNECTED" && !live
                        ? "DISCONNECTED"
                        : (remote?.state ?? "DISCONNECTED"),
                    online: live,
                    manageable,
                    reason: !paid
                      ? "O gerenciamento remoto exige um plano Premium/Plus pago e ativo."
                      : manageable
                        ? "Canal autenticado operacional."
                        : "Execute /sx connect no Minecraft para conectar o SpawnerX.",
                  },
                );
              }),
          };
        }),
      );
      const archived = await LicenseServer.find({
        ownerId: user.id,
        licenseId: { $nin: licenses.map((item) => item._id) },
        removedAt: { $exists: false },
      })
        .sort({ createdAt: -1 })
        .lean();
      const groups = new Map<string, typeof archived>();
      for (const record of archived) {
        const group = groups.get(record.licenseId) ?? [];
        group.push(record);
        groups.set(record.licenseId, group);
      }
      const historical = [...groups.entries()].map(([licenseId, items]) => {
        const first = items[0]!;
        const expired = first.licenseExpiresAt && first.licenseExpiresAt <= now;
        return {
          id: accountLicenseRef(licenseId),
          tier: "plus",
          valid: false,
          plan: first.licensePlan ?? "trial",
          planName: first.licenseTerms?.name ?? null,
          terms: first.licenseTerms ?? null,
          expiresAt: first.licenseExpiresAt ?? null,
          billing: null,
          used: 0,
          limit: first.licenseTerms?.serverLimit ?? 1,
          unlimited: false,
          servers: items.map((row) =>
            publicRecord(
              {
                ...row,
                state: ["ACTIVE", "PENDING"].includes(row.state)
                  ? expired
                    ? "EXPIRED"
                    : "INACTIVE"
                  : row.state,
              },
              true,
              config.policy.offlineAfterSeconds,
            ),
          ),
        };
      });
      return [...inventory, ...historical];
    },
    {
      auth: true,
      detail: {
        summary: "List current user's licenses and servers",
        tags: ["License"],
      },
    },
  )
  .post(
    "/servers/key",
    async ({ user, body, status, set, request }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem não permitida." });
      if (!(await allowAccountRequest(user.id, "key")))
        return status(429, {
          message: "Aguarde antes de consultar a key novamente.",
        });
      const { licenseRef } = body as { licenseRef: string };
      const now = new Date();
      const trialAccess = await PlanAccess.findOne({
        userId: user.id,
        trialLicenseCode: { $exists: true },
        trialLicenseExpiresAt: { $gt: now },
      })
        .select({ trialLicenseCode: 1 })
        .lean();
      const licenses = await License.find(
        trialAccess?.trialLicenseCode
          ? {
              $or: [
                { ownerId: user.id },
                {
                  _id: trialAccess.trialLicenseCode,
                  sourcePlan: "trial",
                  expiresAt: { $gt: now },
                },
              ],
            }
          : { ownerId: user.id },
      )
        .select({ _id: 1, sourcePlan: 1, expiresAt: 1 })
        .lean();
      const license = licenses.find(
        (item) =>
          accountLicenseRef(item._id) === licenseRef &&
          !(item.expiresAt && item.expiresAt <= now),
      );
      if (!license) return status(404, { message: "License not found" });
      set.headers["cache-control"] = "no-store, private";
      return { key: license._id };
    },
    {
      auth: true,
      body: z.object({ licenseRef: z.string().regex(/^[a-f0-9]{64}$/i) }),
      detail: {
        summary: "Reveal an owned license key on demand",
        tags: ["License"],
      },
    },
  )
  .patch(
    "/servers/:id/appearance",
    async ({ user, params, body, request, status }) => {
      if (!(await allowAccountRequest(user.id, "appearance")))
        return status(429, { message: "Aguarde antes de editar novamente." });
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem da solicitação não permitida." });
      const result = await updateAuthorizedServerProfile(
        user.id,
        params.id,
        body,
        {
          findServer: async (id) =>
            LicenseServer.findById(id)
              .select({ _id: 1, licenseId: 1, state: 1 })
              .lean(),
          ownsLicense: async (userId, licenseId) =>
            Boolean(
              await License.exists({
                _id: licenseId,
                ownerId: userId,
                "value.tier": "plus",
              }),
            ),
          ownsLiveTrial: async (userId, licenseId) =>
            Boolean(
              await PlanAccess.exists({
                userId,
                trialLicenseCode: licenseId,
                trialLicenseExpiresAt: { $gt: new Date() },
              }),
            ),
          updateActiveServer: async (id, licenseId, patch) =>
            LicenseServer.findOneAndUpdate(
              { _id: id, licenseId, state: "ACTIVE" },
              { $set: patch },
              { new: true, runValidators: true },
            ).lean(),
        },
      );
      if (!result.ok) return status(result.status, { message: result.message });
      return publicRecord(result.server, true);
    },
    {
      auth: true,
      params: z.object({ id: z.string().uuid() }),
      body: serverProfileUpdate,
      detail: {
        summary: "Customize an owned authorized server",
        tags: ["License"],
      },
    },
  )
  .get(
    "/servers/:id",
    async ({ user, params, status, set }) => {
      if (!(await allowAccountRequest(user.id, "details")))
        return status(429, {
          message: "Aguarde antes de consultar novamente.",
        });
      set.headers["cache-control"] = "no-store, private";
      try {
        const config = await getLicensingConfig();
        const record = await ownedServer(user.id, params.id);
        const license = await License.findById(record.licenseId).lean();
        const plan = license
          ? await planForLicense(license)
          : (record.licensePlan ?? null);
        const access = license?.ownerId
          ? await PlanAccess.findOne({ userId: license.ownerId }).lean()
          : null;
        const matchingAccess = access?.plan === plan ? access : null;
        const terms =
          license?.planTerms ??
          matchingAccess?.planTerms ??
          record.licenseTerms;
        const events = await LicenseServerEvent.find({
          serverRecordId: record._id,
          expiresAt: { $gt: new Date() },
        })
          .sort({ createdAt: -1 })
          .limit(100)
          .select({ action: 1, createdAt: 1, metadata: 1 })
          .lean();
        const privacy = await LicenseServerPrivacy.findOne({
          serverRecordId: record._id,
          expiresAt: { $gt: new Date() },
          // This tab describes the original activating administrator. Never
          // attribute another configuring player's optional location to them.
          $or: [
            { subjectUuid: record.activatedBy?.uuid ?? null },
            { subjectUuid: { $exists: false } },
          ],
        })
          .select({ maskedIp: 1, location: 1, consentedAt: 1, expiresAt: 1 })
          .lean();
        return {
          server: publicRecord(record, true, config.policy.offlineAfterSeconds),
          license: {
            id: accountLicenseRef(record.licenseId),
            plan,
            valid: license ? (await view(license._id)).valid : false,
            acquiredAt:
              matchingAccess?.startsAt ??
              license?.createdAt ??
              record.createdAt,
            expiresAt:
              plan === "monthly"
                ? (matchingAccess?.expiresAt ?? record.licenseExpiresAt ?? null)
                : (license?.expiresAt ?? record.licenseExpiresAt ?? null),
            limit: license ? await serverLimitForLicense(license, plan) : 0,
            used: license?.serverSlots ?? 0,
            terms: terms ?? null,
          },
          events,
          privacy: privacy ?? null,
        };
      } catch (error) {
        if (error instanceof ActivationError)
          return status(error.status, {
            code: error.code,
            message: error.message,
          });
        throw error;
      }
    },
    { auth: true, params: z.object({ id: z.string().uuid() }) },
  )
  .post(
    "/servers/:id/:action",
    async ({ user, params, body, request, status }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem não permitida." });
      if (!(await allowAccountRequest(user.id, "manage")))
        return status(429, { message: "Aguarde antes de alterar novamente." });
      try {
        const row = await manageActivation(
          user.id,
          params.id,
          params.action,
          body.confirm,
        );
        return publicRecord(row, true);
      } catch (error) {
        if (error instanceof ActivationError)
          return status(error.status, {
            code: error.code,
            message: error.message,
          });
        throw error;
      }
    },
    {
      auth: true,
      params: z.object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject", "remove", "delete"]),
      }),
      body: z.object({ confirm: z.boolean() }),
    },
  )
  .delete(
    "/servers/:id/privacy",
    async ({ user, params, body, request, status }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem não permitida." });
      if (!(await allowAccountRequest(user.id, "privacy")))
        return status(429, { message: "Aguarde antes de alterar novamente." });
      if (!body.confirm)
        return status(400, {
          message: "Confirme a exclusão dos dados opcionais.",
        });
      try {
        const row = await ownedServer(user.id, params.id);
        await eraseActivationPrivacy(row._id);
        await activationEvent(row, "OPTIONAL_DATA_DELETED", user.id);
        return { deleted: true };
      } catch (error) {
        if (error instanceof ActivationError)
          return status(error.status, { message: error.message });
        throw error;
      }
    },
    {
      auth: true,
      params: z.object({ id: z.string().uuid() }),
      body: z.object({ confirm: z.boolean() }),
    },
  );
