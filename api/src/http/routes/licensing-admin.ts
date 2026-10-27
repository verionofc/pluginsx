import { allowAccountRequest } from "../plugins/rate-limit.js";
const limit = (userId: string) =>
  allowAccountRequest(userId, "licensing-admin");
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import {
  LicenseServerEvent,
  LicenseServerPrivacy,
} from "../../database/models/LicenseServerEvent.js";
import { Elysia } from "elysia";
import { z } from "zod";
import {
  LicensingConfiguration,
  LicensingRevision,
} from "../../database/models/LicensingConfiguration.js";
import {
  commercialPlanSchema,
  licensingPolicySchema,
  serverSlotSchema,
  planIds,
} from "../../domain/licensing-config.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import { hasTrustedWebOrigin } from "../plugins/plan-access.js";
import {
  getLicensingConfig,
  invalidateLicensingConfig,
} from "../plugins/licensing-config.js";
import { BillingRateLimit } from "../../database/models/BillingRateLimit.js";

const editSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
  confirm: z.literal(true),
});
export const licensingAdminRoutes = new Elysia({ prefix: "/panel" })
  .use(authSessionPlugin)
  .get(
    "/licensing",
    async ({ user, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      if (!(await limit(user.id)))
        return status(429, {
          message: "Aguarde antes de consultar novamente.",
        });
      const config = await getLicensingConfig();
      const revisions = await LicensingRevision.find()
        .sort({ version: -1 })
        .limit(50)
        .lean();
      const deliveries = await PlanPurchase.aggregate<{
        _id: number;
        applied: number;
        failed: number;
        cancellationFailed: number;
        cancellationPending: number;
      }>([
        { $match: { "planTerms.version": { $exists: true } } },
        {
          $group: {
            _id: "$planTerms.version",
            applied: {
              $sum: {
                $cond: [{ $eq: ["$providerDeliveryStatus", "applied"] }, 1, 0],
              },
            },
            failed: {
              $sum: {
                $cond: [{ $eq: ["$providerDeliveryStatus", "failed"] }, 1, 0],
              },
            },
            cancellationFailed: {
              $sum: {
                $cond: [
                  { $eq: ["$subscriptionCancellationStatus", "failed"] },
                  1,
                  0,
                ],
              },
            },
            cancellationPending: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$subscriptionCancellationStatus", "pending"] },
                      { $eq: ["$status", "approved"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]);
      const providerIssues = await PlanPurchase.find({
        $or: [
          { subscriptionCancellationStatus: "failed" },
          { providerDeliveryStatus: "failed" },
          { upgradeCreditReversed: true },
        ],
      })
        .sort({ updatedAt: -1 })
        .limit(30)
        .select({
          externalReference: 1,
          plan: 1,
          status: 1,
          subscriptionCancellationStatus: 1,
          providerDeliveryStatus: 1,
          upgradeCreditReversed: 1,
          updatedAt: 1,
        })
        .lean();
      const alerts = config.policy.alertsEnabled
        ? await LicenseServerEvent.find({
            action: { $in: ["VALIDATION_FAILED", "SUSPICIOUS_ACTIVATION"] },
            expiresAt: { $gt: new Date() },
          })
            .sort({ createdAt: -1 })
            .limit(30)
            .select({ serverRecordId: 1, action: 1, metadata: 1, createdAt: 1 })
            .lean()
        : [];
      return {
        config,
        revisions: revisions.map((row) => ({
          ...row,
          providerDeliveries: deliveries.find((d) => d._id === row.version) ?? {
            applied: 0,
            failed: 0,
            cancellationFailed: 0,
            cancellationPending: 0,
          },
        })),
        alerts,
        providerIssues,
        providerStrategy: "new_contracts_only",
      };
    },
    { owner: true },
  )
  .patch(
    "/plans/:id",
    async ({ user, params, body, request, status }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, {
          code: "ORIGIN_DENIED",
          message: "Origem não permitida.",
        });
      if (!(await limit(user.id)))
        return status(429, {
          code: "RATE_LIMIT",
          message: "Aguarde antes de editar novamente.",
        });
      if (body.plan.id !== params.id)
        return status(400, { message: "O identificador do plano é imutável." });
      let conflict = false;
      await LicensingConfiguration.db.transaction(async (session) => {
        const config =
          await LicensingConfiguration.findById("current").session(session);
        if (!config || config.version !== body.expectedVersion) {
          conflict = true;
          return;
        }
        const before = config.plans.find((p) => p.id === params.id);
        config.plans = config.plans.map((p) =>
          p.id === params.id ? body.plan : p,
        );
        config.version++;
        config.updatedAt = new Date().toISOString();
        await config.save({ session });
        await LicensingRevision.create(
          [
            {
              version: config.version,
              resource: `plan:${params.id}`,
              actorUserId: user.id,
              reason: body.reason,
              before,
              after: body.plan,
            },
          ],
          { session },
        );
      });
      if (conflict)
        return status(409, {
          code: "REVISION_CONFLICT",
          message: "Outra alteração foi salva. Recarregue a configuração.",
        });
      invalidateLicensingConfig();
      return {
        config: await getLicensingConfig(true),
        message:
          "Revisão salva. Novos checkouts usam os novos preços; contratos e limites já aceitos foram preservados.",
        providerStrategy: "new_contracts_only",
        providerStatus: "awaiting_checkout",
      };
    },
    {
      owner: true,
      params: z.object({ id: z.enum(planIds) }),
      body: editSchema.extend({ plan: commercialPlanSchema }),
    },
  )
  .patch(
    "/licensing/settings",
    async ({ user, body, request, status }) => {
      if (!hasTrustedWebOrigin(request))
        return status(403, { message: "Origem não permitida." });
      if (!(await limit(user.id)))
        return status(429, { message: "Aguarde antes de editar novamente." });
      if (body.policy.geolocationEnabled && !process.env.IPINFO_TOKEN)
        return status(409, {
          code: "GEOLOCATION_NOT_CONFIGURED",
          message:
            "Configure IPINFO_TOKEN no backend antes de habilitar geolocalização.",
        });
      let conflict = false;
      await LicensingConfiguration.db.transaction(async (session) => {
        const config =
          await LicensingConfiguration.findById("current").session(session);
        if (!config || config.version !== body.expectedVersion) {
          conflict = true;
          return;
        }
        await LicenseServerEvent.updateMany(
          {},
          [
            {
              $set: {
                expiresAt: {
                  $min: [
                    "$expiresAt",
                    {
                      $add: [
                        "$createdAt",
                        body.policy.logRetentionDays * 86400000,
                      ],
                    },
                  ],
                },
              },
            },
          ],
          { session },
        );
        if (!body.policy.collectPlayerIp)
          await LicenseServerPrivacy.deleteMany({}, { session });
        else
          await LicenseServerPrivacy.updateMany(
            {},
            [
              {
                $set: {
                  expiresAt: {
                    $min: [
                      "$expiresAt",
                      {
                        $add: [
                          { $ifNull: ["$collectedAt", "$consentedAt"] },
                          body.policy.sensitiveRetentionDays * 86400000,
                        ],
                      },
                    ],
                  },
                  ...(!body.policy.geolocationEnabled
                    ? { location: null }
                    : {}),
                },
              },
            ],
            { session },
          );
        const before = { policy: config.policy, serverSlot: config.serverSlot };
        config.policy = body.policy;
        if (body.serverSlot) config.serverSlot = body.serverSlot;
        config.version++;
        config.updatedAt = new Date().toISOString();
        await config.save({ session });
        await LicensingRevision.create(
          [
            {
              version: config.version,
              resource: "licensing:settings",
              actorUserId: user.id,
              reason: body.reason,
              before,
              after: { policy: body.policy, serverSlot: config.serverSlot },
            },
          ],
          { session },
        );
      });
      if (conflict)
        return status(409, {
          message: "Configuração alterada em outra sessão. Recarregue.",
        });
      invalidateLicensingConfig();
      return {
        config: await getLicensingConfig(true),
        message:
          "Políticas atualizadas. Novas solicitações recebem os novos prazos; solicitações emitidas mantêm sua expiração.",
      };
    },
    {
      owner: true,
      body: editSchema.extend({
        policy: licensingPolicySchema,
        serverSlot: serverSlotSchema.optional(),
      }),
    },
  );
