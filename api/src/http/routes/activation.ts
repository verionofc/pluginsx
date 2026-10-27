import { LicenseServer } from "../../database/models/LicenseServer.js";
import { LicenseServerPrivacy } from "../../database/models/LicenseServerEvent.js";
import { activationEvent } from "../plugins/activation-service.js";
import { eraseActivationPrivacy } from "../plugins/activation-privacy.js";
import { Elysia } from "elysia";
import { z } from "zod";
import {
  ActivationError,
  activationPayload,
  signedEnvelope,
} from "../../domain/activation.js";
import { getLicensingConfig } from "../plugins/licensing-config.js";
import {
  acceptServerProof,
  createActivation,
  authenticateInstallation,
  activationResponse,
} from "../plugins/activation-service.js";
const referencePayload = z
  .object({
    activationId: z.string().uuid(),
    serverId: z.string().uuid(),
    requestId: z.string().uuid(),
  })
  .strict();
export const activationRoutes = new Elysia({ prefix: "/license/servers" })
  .post(
    "/activation-requests",
    async ({ body, request, status }) => {
      try {
        const config = await getLicensingConfig();
        const fingerprint = await acceptServerProof(
          body,
          new URL(request.url).pathname,
          config,
        );
        const parsed = activationPayload.safeParse(JSON.parse(body.payload));
        if (!parsed.success)
          return status(400, {
            code: "INVALID_ACTIVATION_PAYLOAD",
            message: "Metadados da instalação inválidos.",
          });
        const row = await createActivation(
          parsed.data,
          body,
          fingerprint,
          config,
        );
        // Only a signed poll can receive the credential after owner approval.
        return {
          id: row._id,
          requestId: row.activationRequestId,
          serverId: row.serverId,
          state: row.state,
          expiresAt: row.expiresAt,
          retrySeconds: config.policy.retrySeconds,
        };
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof z.ZodError)
          return status(400, {
            code: "INVALID_PAYLOAD",
            message: "Formato da solicitação inválido.",
          });
        if (error instanceof ActivationError) {
          if (error.code === "IDENTITY_MISMATCH") {
            const input = activationPayload.safeParse(JSON.parse(body.payload));
            if (input.success) {
              const row = await LicenseServer.findOne({
                licenseId: input.data.licenseKey,
                serverId: input.data.serverId,
              });
              if (row)
                await activationEvent(row, "SUSPICIOUS_ACTIVATION", null, {
                  reason: error.code,
                });
            }
          }
          return status(error.status, {
            code: error.code,
            state: error.code === "EXPIRED_LICENSE" ? "EXPIRED" : "ERROR",
            message: error.message,
          });
        }
        return status(503, {
          code: "ACTIVATION_UNAVAILABLE",
          message: "Não foi possível registrar a instalação agora.",
        });
      }
    },
    { body: signedEnvelope },
  )
  .post(
    "/poll",
    async ({ body, request, status }) => {
      try {
        const config = await getLicensingConfig();
        const fingerprint = await acceptServerProof(
          body,
          new URL(request.url).pathname,
          config,
        );
        const input = referencePayload.parse(JSON.parse(body.payload));
        const row = await authenticateInstallation(
          input.activationId,
          input.serverId,
          input.requestId,
          fingerprint,
        );
        return await activationResponse(row, config);
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof z.ZodError)
          return status(400, {
            code: "INVALID_PAYLOAD",
            message: "Formato da solicitação inválido.",
          });
        if (error instanceof ActivationError)
          return status(error.status, {
            code: error.code,
            state: error.code === "EXPIRED_LICENSE" ? "EXPIRED" : "ERROR",
            message: error.message,
          });
        return status(503, {
          code: "ACTIVATION_UNAVAILABLE",
          message: "Falha temporária ao consultar a autorização.",
        });
      }
    },
    { body: signedEnvelope },
  )
  .post(
    "/heartbeat",
    async ({ body, request, status }) => {
      try {
        const config = await getLicensingConfig();
        const fingerprint = await acceptServerProof(
          body,
          new URL(request.url).pathname,
          config,
        );
        const input = referencePayload.parse(JSON.parse(body.payload));
        const row = await authenticateInstallation(
          input.activationId,
          input.serverId,
          input.requestId,
          fingerprint,
        );
        const token = request.headers
          .get("authorization")
          ?.replace(/^Bearer /, "");
        return await activationResponse(row, config, token, true);
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof z.ZodError)
          return status(400, {
            code: "INVALID_PAYLOAD",
            message: "Formato da solicitação inválido.",
          });
        if (error instanceof ActivationError)
          return status(error.status, {
            code: error.code,
            state:
              error.code === "INACTIVE_LICENSE"
                ? "INACTIVE"
                : error.code === "EXPIRED_LICENSE"
                  ? "EXPIRED"
                  : "ERROR",
            message: error.message,
          });
        return status(503, {
          code: "HEARTBEAT_UNAVAILABLE",
          message: "Falha temporária de comunicação.",
        });
      }
    },
    { body: signedEnvelope },
  )
  .post(
    "/privacy",
    async ({ body, request, status }) => {
      try {
        const config = await getLicensingConfig();
        const fingerprint = await acceptServerProof(
          body,
          new URL(request.url).pathname,
          config,
        );
        const input = referencePayload
          .extend({ playerUuid: z.string().uuid() })
          .parse(JSON.parse(body.payload));
        const row = await authenticateInstallation(
          input.activationId,
          input.serverId,
          input.requestId,
          fingerprint,
        );
        const privacy = await LicenseServerPrivacy.findOne({
          serverRecordId: row._id,
        });
        if (
          privacy &&
          (privacy.subjectUuid ?? row.activatedBy?.uuid) !== input.playerUuid
        )
          return status(404, {
            message: "Dados opcionais não encontrados para este jogador.",
          });
        await eraseActivationPrivacy(row._id, input.playerUuid);
        await activationEvent(row, "OPTIONAL_DATA_DELETED", null);
        return { deleted: true };
      } catch (error) {
        if (error instanceof ActivationError)
          return status(error.status, {
            code: error.code,
            message: error.message,
          });
        if (error instanceof SyntaxError || error instanceof z.ZodError)
          return status(400, { message: "Formato inválido." });
        return status(503, {
          message: "Não foi possível confirmar a exclusão dos dados opcionais.",
        });
      }
    },
    { body: signedEnvelope },
  );
