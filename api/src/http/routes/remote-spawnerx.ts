import { Elysia } from "elysia";
import { z } from "zod";
import { ActivationError } from "../../domain/activation.js";
import {
  authorizePayload,
  confirmPayload,
  connectPayload,
  disconnectPayload,
  draftPayload,
  operationPayload,
  pluginBase,
  pollPayload,
  remoteEnvelope,
  resultPayload,
} from "../../domain/remote-spawnerx.js";
import {
  acceptServerProof,
  activationEvent,
  activationResponse,
  authenticateInstallation,
  ownedServer,
} from "../plugins/activation-service.js";
import { getLicensingConfig } from "../plugins/licensing-config.js";
import { hasTrustedWebOrigin } from "../plugins/plan-access.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import {
  acknowledgeRemoteOperation,
  authorizeRemoteConnection,
  confirmRemoteConnection,
  createRemoteConnection,
  disconnectRemoteConnection,
  pollRemoteConnection,
  readRemoteState,
  remoteRateLimit,
  requestRemoteOperation,
  revokeRemoteForInvalidLicense,
  saveRemoteDraft,
} from "../plugins/remote-spawnerx.js";

const recordParams = z.object({ recordId: z.string().uuid() });
const confirmedPayload = z.object({ confirmed: z.literal(true) }).strict();
function requireOrigin(request: Request) {
  if (!hasTrustedWebOrigin(request))
    throw new ActivationError(
      "ORIGIN_FORBIDDEN",
      "Origem da solicitação não permitida.",
      403,
    );
}
function problem(error: unknown) {
  if (error instanceof ActivationError)
    return {
      status: error.status,
      body: { code: error.code, message: error.message },
    };
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return {
      status: 400,
      body: {
        code: "INVALID_REMOTE_PAYLOAD",
        message: "Formato da solicitação remota inválido.",
      },
    };
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000
  )
    return {
      status: 409,
      body: {
        code: "REMOTE_CONFLICT",
        message:
          "Outra operação já está em andamento. Atualize o estado antes de continuar.",
      },
    };
  return {
    status: 503,
    body: {
      code: "REMOTE_UNAVAILABLE",
      message:
        "O gerenciamento remoto está temporariamente indisponível. Nenhuma confirmação foi presumida.",
    },
  };
}
export const remoteSpawnerXRoutes = new Elysia({ prefix: "/remote/spawnerx" })
  .onError(({ code, status }) => {
    if (code === "VALIDATION" || code === "PARSE")
      return status(400, {
        code: "INVALID_REMOTE_PAYLOAD",
        message: "Formato da solicitação remota inválido.",
      });
  })
  .post(
    "/plugin/:action",
    async ({ body, request, params, set, status }) => {
      set.headers["cache-control"] = "private, no-store";
      let recordId: string | undefined;
      try {
        const config = await getLicensingConfig();
        const fingerprint = await acceptServerProof(
          body,
          new URL(request.url).pathname,
          config,
        );
        const json = JSON.parse(body.payload),
          base = pluginBase.parse(json);
        const server = await authenticateInstallation(
          base.activationId,
          base.serverId,
          base.requestId,
          fingerprint,
        );
        recordId = server._id;
        if (server.state !== "ACTIVE")
          throw new ActivationError(
            "SERVER_AUTHORIZATION_REQUIRED",
            "A instalação não está autorizada.",
            403,
          );
        const token = request.headers
          .get("authorization")
          ?.replace(/^Bearer /, "");
        await activationResponse(server, config, token, true);
        switch (params.action) {
          case "connect": {
            const input = connectPayload.parse(json);
            return await createRemoteConnection(
              server,
              input.actor,
              input.snapshot,
            );
          }
          case "poll": {
            const input = pollPayload.parse(json);
            return await pollRemoteConnection(server, input);
          }
          case "confirm": {
            const input = confirmPayload.parse(json);
            return await confirmRemoteConnection(server, input);
          }
          case "result": {
            const input = resultPayload.parse(json);
            return await acknowledgeRemoteOperation(server, input);
          }
          case "disconnect": {
            const input = disconnectPayload.parse(json);
            return await disconnectRemoteConnection(
              server._id,
              undefined,
              input.sessionId,
            );
          }
        }
      } catch (error) {
        if (recordId && error instanceof ActivationError) {
          const server = await (
            await import("../../database/models/LicenseServer.js")
          ).LicenseServer.findById(recordId);
          if (server)
            await activationEvent(server, "REMOTE_VALIDATION_FAILED", null, {
              reason: error.code,
            }).catch(() => undefined);
        }
        if (
          recordId &&
          error instanceof ActivationError &&
          [
            "INVALID_LICENSE",
            "EXPIRED_LICENSE",
            "INACTIVE_LICENSE",
            "SERVER_AUTHORIZATION_REQUIRED",
            "PAID_PLAN_REQUIRED",
            "REMOTE_OWNER_UNAVAILABLE",
            "INVALID_ACTIVATION_CREDENTIAL",
          ].includes(error.code)
        )
          await revokeRemoteForInvalidLicense(recordId).catch(() => undefined);
        const result = problem(error);
        return status(result.status, result.body);
      }
    },
    {
      params: z.object({
        action: z.enum(["connect", "poll", "confirm", "result", "disconnect"]),
      }),
      body: remoteEnvelope,
    },
  )
  .use(authSessionPlugin)
  .get(
    "/servers/:recordId",
    async ({ user, params, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      try {
        await remoteRateLimit(user.id, "state", 100);
        return await readRemoteState(user.id, params.recordId);
      } catch (error) {
        const result = problem(error);
        return status(result.status, result.body);
      }
    },
    { auth: true, params: recordParams },
  )
  .get(
    "/servers/:recordId/revisions",
    async ({ user, params, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      try {
        await remoteRateLimit(user.id, "history", 60);
        return {
          revisions: (await readRemoteState(user.id, params.recordId))
            .revisions,
        };
      } catch (error) {
        const result = problem(error);
        return status(result.status, result.body);
      }
    },
    { auth: true, params: recordParams },
  )
  .get(
    "/servers/:recordId/history",
    async ({ user, params, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      try {
        await remoteRateLimit(user.id, "history", 60);
        return {
          history: (await readRemoteState(user.id, params.recordId)).history,
        };
      } catch (error) {
        const result = problem(error);
        return status(result.status, result.body);
      }
    },
    { auth: true, params: recordParams },
  )
  .post(
    "/servers/:recordId/authorize",
    async ({ user, params, body, request, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      try {
        requireOrigin(request);
        return await authorizeRemoteConnection(
          user.id,
          user.name,
          params.recordId,
          body,
        );
      } catch (error) {
        if (
          error instanceof ActivationError &&
          error.code === "INVALID_CONNECTION_TOKEN"
        ) {
          const server = await ownedServer(user.id, params.recordId).catch(
            () => null,
          );
          if (server)
            await activationEvent(server, "REMOTE_INVALID_TOKEN", user.id, {
              sessionId: body.requestId,
            }).catch(() => undefined);
        }
        const result = problem(error);
        return status(result.status, result.body);
      }
    },
    { auth: true, params: recordParams, body: authorizePayload },
  )
  .post(
    "/servers/:recordId/draft",
    async ({ user, params, body, request, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      try {
        requireOrigin(request);
        return await saveRemoteDraft(user.id, params.recordId, body);
      } catch (error) {
        const result = problem(error);
        return status(result.status, result.body);
      }
    },
    { auth: true, params: recordParams, body: draftPayload },
  )
  .post(
    "/servers/:recordId/operations",
    async ({ user, params, body, request, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      try {
        requireOrigin(request);
        return await requestRemoteOperation(user.id, params.recordId, body);
      } catch (error) {
        const result = problem(error);
        return status(result.status, result.body);
      }
    },
    { auth: true, params: recordParams, body: operationPayload },
  )
  .post(
    "/servers/:recordId/disconnect",
    async ({ user, params, request, status, set }) => {
      set.headers["cache-control"] = "private, no-store";
      try {
        requireOrigin(request);
        return await disconnectRemoteConnection(params.recordId, user.id);
      } catch (error) {
        const result = problem(error);
        return status(result.status, result.body);
      }
    },
    { auth: true, params: recordParams, body: confirmedPayload },
  );
