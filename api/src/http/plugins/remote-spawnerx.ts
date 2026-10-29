import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import mongoose, { type ClientSession, type HydratedDocument } from "mongoose";
import { LicenseServer } from "../../database/models/LicenseServer.js";
import { License } from "../../database/models/License.js";
import { BillingRateLimit } from "../../database/models/BillingRateLimit.js";
import { LicenseServerEvent } from "../../database/models/LicenseServerEvent.js";
import {
  RemoteSession,
  RemoteOperation,
  RemoteRevision,
  type RemoteSessionRecord,
  type RemoteOperationRecord,
  type RemoteRevisionRecord,
} from "../../database/models/RemoteSpawnerX.js";
import {
  ActivationError,
  tokenHash,
  type ActivationActor,
} from "../../domain/activation.js";
import {
  validateDocuments,
  validateSnapshot,
  type Documents,
  type Snapshot,
  type OperationKind,
  type OperationStatus,
} from "../../domain/remote-spawnerx.js";
import {
  activationEvent,
  licenseEntitlement,
  ownedServer,
} from "./activation-service.js";
import { getLicensingConfig } from "./licensing-config.js";
import { lockBillingAccount } from "./billing-lock.js";
import { env } from "../../env.js";

const LIVE_MS = 10000,
  APPROVAL_MS = 300000,
  IDLE_MS = 8 * 3600000,
  MAX_SESSION_MS = 24 * 3600000;
type Session = HydratedDocument<RemoteSessionRecord>;
type Server = HydratedDocument<
  import("../../database/models/LicenseServer.js").LicenseServerInterface
>;
const equalHash = (token: string, expected?: string) =>
  Boolean(
    expected &&
      /^[a-f0-9]{64}$/.test(expected) &&
      timingSafeEqual(Buffer.from(tokenHash(token)), Buffer.from(expected)),
  );
const challenge = (
  row: Pick<RemoteSessionRecord, "sessionId" | "actor" | "approvalExpiresAt">,
) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(
      `pluginsx-remote-confirm-v1\n${row.sessionId}\n${row.actor.uuid}\n${row.approvalExpiresAt.getTime()}`,
    )
    .digest("base64url");
function fail(code: string, message: string, status = 409): never {
  throw new ActivationError(code, message, status);
}
const publicSession = (row: RemoteSessionRecord | null) =>
  row
    ? {
        id: row.sessionId,
        state: row.state,
        code: row.code,
        requestedAt: row.requestedAt,
        expiresAt: row.expiresAt,
        lastSeenAt: row.lastSeenAt,
        leaseExpiresAt: row.leaseExpiresAt,
        actor: { ...row.actor, accountVerification: "UNVERIFIED" },
        authorizedBy: row.authorizedBy ?? null,
      }
    : null;
const publicRevision = (row: RemoteRevisionRecord) => ({
  id: row._id,
  documents: row.documents,
  baseHash: row.baseHash,
  resultingHash: row.resultingHash ?? null,
  createdAt: row.createdAt,
  actorId: row.actorId,
  status: row.status,
  operationId: row.operationId ?? null,
});
const publicOperation = (row: RemoteOperationRecord) => ({
  id: row._id,
  kind: row.kind,
  status: row.status,
  message: row.message,
  expectedHash: row.expectedHash,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  completedAt: row.completedAt ?? null,
  backupId: row.backupId ?? null,
  revisionId: row.revisionId ?? null,
});

export async function remoteRateLimit(
  subject: string,
  action: string,
  max = 30,
) {
  const now = Date.now();
  const row = await BillingRateLimit.findOneAndUpdate(
    { key: `remote:${subject}:${action}:${Math.floor(now / 60000)}` },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(now + 120000) } },
    { upsert: true, new: true },
  );
  if (row.count > max)
    fail("RATE_LIMIT", "Aguarde antes de realizar outra operação remota.", 429);
}

async function assertOwnerAvailable(userId: string, session?: ClientSession) {
  if (!mongoose.isValidObjectId(userId))
    fail(
      "REMOTE_OWNER_UNAVAILABLE",
      "A conta autorizada não está disponível.",
      403,
    );
  const user = await License.db
    .collection("user")
    .findOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { projection: { _id: 1, banned: 1 }, ...(session ? { session } : {}) },
    );
  if (!user || user.banned === true)
    fail(
      "REMOTE_OWNER_UNAVAILABLE",
      "A conta autorizada não está disponível.",
      403,
    );
}
async function authority(
  server: Server,
  userId?: string,
  session?: ClientSession,
) {
  if (server.state !== "ACTIVE" || server.removedAt)
    fail(
      "SERVER_AUTHORIZATION_REQUIRED",
      "A autorização deste servidor não está ativa.",
      403,
    );
  const { license, access } = await licenseEntitlement(
    server.licenseId,
    await getLicensingConfig(),
    session,
  );
  if (
    license.sourcePlan === "trial" ||
    license.expiresAt ||
    !license.ownerId ||
    !access ||
    !["monthly", "lifetime", "aether"].includes(access.plan)
  )
    fail(
      "PAID_PLAN_REQUIRED",
      "O gerenciamento remoto exige um plano Premium/Plus pago e ativo.",
      403,
    );
  if (
    (userId && license.ownerId !== userId) ||
    (server.ownerId && server.ownerId !== license.ownerId)
  )
    fail("SERVER_NOT_FOUND", "Servidor não encontrado.", 404);
  await assertOwnerAvailable(license.ownerId, session);
  return {
    ownerId: license.ownerId,
    plan: access.plan as "monthly" | "lifetime" | "aether",
  };
}
async function lockServer(serverId: string, session: ClientSession) {
  const server = await LicenseServer.findById(serverId).session(session);
  if (!server) fail("SERVER_NOT_FOUND", "Servidor não encontrado.", 404);
  await LicenseServer.updateOne(
    { _id: serverId },
    { $inc: { remoteRevision: 1 } },
    { session },
  );
  await License.updateOne(
    { _id: server.licenseId },
    { $inc: { activationRevision: 1 } },
    { session },
  );
  return server;
}
async function expireOperations(
  serverId: string,
  session?: ClientSession,
  all = false,
) {
  const condition = {
    serverRecordId: serverId,
    busy: true,
    ...(all ? {} : { expiresAt: { $lte: new Date() } }),
  };
  const rows = await RemoteOperation.find(condition).session(session ?? null);
  for (const op of rows) {
    op.status = op.status === "QUEUED" ? "EXPIRED" : "UNKNOWN";
    op.busy = false;
    op.completedAt = new Date();
    op.message =
      op.status === "EXPIRED"
        ? "A operação expirou antes do envio. Solicite novamente com o servidor conectado."
        : "A conexão foi interrompida antes da confirmação. Confira o estado atual antes de repetir a operação.";
    await op.save(session ? { session } : {});
  }
}
async function reconcile(row: Session, session?: ClientSession) {
  const now = new Date();
  if (
    (["PENDING", "WEB_APPROVED"].includes(row.state) &&
      row.approvalExpiresAt <= now) ||
    (["CONNECTED", "DISCONNECTED"].includes(row.state) &&
      (row.expiresAt <= now || row.hardExpiresAt <= now))
  ) {
    row.state = "EXPIRED";
    row.closedAt = now;
    row.tokenHash = undefined;
    row.confirmationHash = undefined;
    await expireOperations(row._id, session, true);
    await row.save(session ? { session } : {});
  } else if (row.state === "CONNECTED" && row.leaseExpiresAt <= now) {
    row.state = "DISCONNECTED";
    row.closedAt = now;
    await expireOperations(row._id, session, true);
    await row.save(session ? { session } : {});
  } else await expireOperations(row._id, session);
  return row;
}
async function requireSession(
  server: Server,
  id: string,
  session?: ClientSession,
) {
  const row = await RemoteSession.findOne({ _id: server._id, sessionId: id })
    .select("+tokenHash +confirmationHash")
    .session(session ?? null);
  if (!row)
    fail(
      "REMOTE_SESSION_NOT_FOUND",
      "A solicitação remota não existe mais.",
      404,
    );
  await reconcile(row, session);
  const auth = await authority(server, row.ownerId, session);
  if (row.licenseId !== server.licenseId || row.ownerId !== auth.ownerId)
    fail(
      "REMOTE_SESSION_REVOKED",
      "A autorização da sessão foi alterada.",
      403,
    );
  return row;
}
function assertLive(row: RemoteSessionRecord) {
  if (
    row.state !== "CONNECTED" ||
    row.leaseExpiresAt <= new Date() ||
    row.expiresAt <= new Date() ||
    row.hardExpiresAt <= new Date()
  )
    fail(
      "SERVER_DISCONNECTED",
      "Servidor desconectado. Execute /sx connect e aguarde a conexão operacional.",
    );
}
async function storeSnapshot(
  row: Session,
  value: unknown,
  session?: ClientSession,
) {
  const snap = validateSnapshot(value);
  const changed = row.configHash !== snap.configHash || !row.documents;
  row.configHash = snap.configHash;
  row.documents = snap.documents;
  row.capabilities = snap.capabilities;
  row.serverIcon = snap.serverIcon;
  row.capturedAt = new Date();
  await LicenseServer.updateOne(
    { _id: row._id },
    { $set: { pluginVersion: snap.capabilities.pluginVersion } },
    session ? { session } : {},
  );
  if (changed)
    await RemoteRevision.create(
      [
        {
          _id: randomUUID(),
          serverRecordId: row._id,
          sessionId: row.sessionId,
          ownerId: row.ownerId,
          actorId: null,
          documents: snap.documents,
          baseHash: snap.configHash,
          resultingHash: snap.configHash,
          status: "SNAPSHOT",
          createdAt: row.capturedAt,
        },
      ],
      session ? { session } : {},
    );
  return snap;
}
function refreshLease(row: Session) {
  const now = Date.now();
  row.lastSeenAt = new Date(now);
  row.leaseExpiresAt = new Date(now + LIVE_MS);
  if (row.state === "CONNECTED" || row.state === "DISCONNECTED") {
    row.state = "CONNECTED";
    row.expiresAt = new Date(
      Math.min(now + IDLE_MS, row.hardExpiresAt.getTime()),
    );
    row.closedAt = undefined;
  }
}
export async function createRemoteConnection(
  server: Server,
  actor: ActivationActor,
  rawSnapshot: unknown,
) {
  if (actor.executionType !== "PLAYER" || !actor.uuid || !actor.username)
    fail(
      "PLAYER_REQUIRED",
      "Execute /sx connect como jogador autorizado.",
      400,
    );
  const snap = validateSnapshot(rawSnapshot),
    token = randomBytes(32).toString("base64url"),
    now = new Date(),
    id = randomUUID();
  await remoteRateLimit(server._id, "connect", 5);
  await RemoteSession.db.transaction(async (session) => {
    const currentServer = await lockServer(server._id, session),
      auth = await authority(currentServer, undefined, session);
    await lockBillingAccount(auth.ownerId, session);
    const existing = await RemoteSession.findById(server._id).session(session);
    if (existing) {
      await reconcile(existing, session);
      if (["PENDING", "WEB_APPROVED", "CONNECTED"].includes(existing.state))
        fail(
          "REMOTE_SESSION_EXISTS",
          "Este servidor já possui uma conexão ativa ou aguardando confirmação.",
        );
      await expireOperations(server._id, session, true);
    }
    const row = await RemoteSession.findOneAndUpdate(
      { _id: server._id },
      {
        $set: {
          sessionId: id,
          ownerId: auth.ownerId,
          licenseId: server.licenseId,
          state: "PENDING",
          actor,
          code: `${randomBytes(3).toString("hex").slice(0, 4).toUpperCase()}-${randomBytes(3).toString("hex").slice(0, 4).toUpperCase()}`,
          tokenHash: tokenHash(token),
          requestedAt: now,
          approvalExpiresAt: new Date(+now + APPROVAL_MS),
          expiresAt: new Date(+now + APPROVAL_MS),
          hardExpiresAt: new Date(+now + MAX_SESSION_MS),
          lastSeenAt: now,
          leaseExpiresAt: new Date(+now + LIVE_MS),
          configHash: snap.configHash,
          documents: snap.documents,
          capabilities: snap.capabilities,
          capturedAt: now,
        },
        $unset: {
          authorizedBy: "",
          authorizedAt: "",
          connectedAt: "",
          closedAt: "",
          confirmationHash: "",
          draftId: "",
        },
        $inc: { revision: 1 },
      },
      { upsert: true, new: true, session },
    );
    await RemoteRevision.create(
      [
        {
          _id: randomUUID(),
          serverRecordId: server._id,
          sessionId: id,
          ownerId: auth.ownerId,
          actorId: null,
          documents: snap.documents,
          baseHash: snap.configHash,
          resultingHash: snap.configHash,
          status: "SNAPSHOT",
          createdAt: now,
        },
      ],
      { session },
    );
    await activationEvent(
      server,
      "REMOTE_CONNECTION_REQUESTED",
      null,
      {
        sessionId: id,
        username: actor.username,
        accountVerification: "UNVERIFIED",
      },
      session,
    );
    return row;
  });
  const row = await RemoteSession.findOne({ _id: server._id, sessionId: id });
  if (!row) throw new Error("Remote session was not saved");
  const origin = new URL(env.NEXT_PUBLIC_APP_URL ?? env.URL).origin;
  return {
    sessionId: id,
    code: row.code,
    url: `${origin}/server/${server._id}/spawnerx/connect#request=${id}&token=${token}`,
    expiresAt: row.expiresAt,
    state: row.state,
    pollSeconds: 2,
  };
}
export async function authorizeRemoteConnection(
  userId: string,
  userName: string,
  serverId: string,
  input: { requestId: string; token: string; decision: "approve" | "reject" },
) {
  await remoteRateLimit(userId, "authorize", 15);
  return RemoteSession.db.transaction(async (session) => {
    const server = await lockServer(serverId, session);
    await authority(server, userId, session);
    await lockBillingAccount(userId, session);
    const row = await requireSession(server, input.requestId, session);
    if (row.state !== "PENDING")
      fail(
        "REMOTE_REQUEST_NOT_PENDING",
        "A solicitação já foi usada, cancelada ou expirou.",
      );
    if (row.leaseExpiresAt <= new Date())
      fail(
        "SERVER_DISCONNECTED",
        "O servidor precisa estar online para autorizar a conexão.",
      );
    if (!equalHash(input.token, row.tokenHash)) {
      fail("INVALID_CONNECTION_TOKEN", "Código de conexão inválido.", 403);
    }
    row.state = input.decision === "approve" ? "WEB_APPROVED" : "REJECTED";
    row.authorizedBy = { userId, name: userName.slice(0, 100) };
    row.authorizedAt = new Date();
    row.tokenHash = undefined;
    if (row.state === "WEB_APPROVED")
      row.confirmationHash = tokenHash(challenge(row));
    else row.closedAt = new Date();
    await row.save({ session });
    await activationEvent(
      server,
      row.state === "WEB_APPROVED"
        ? "REMOTE_WEB_APPROVED"
        : "REMOTE_CONNECTION_REJECTED",
      userId,
      { sessionId: row.sessionId },
      session,
    );
    return { session: publicSession(row) };
  });
}
export async function pollRemoteConnection(
  server: Server,
  input: {
    sessionId: string;
    snapshot?: unknown;
    uptimeSeconds?: number | undefined;
  },
) {
  return RemoteSession.db.transaction(async (session) => {
    const current = await lockServer(server._id, session),
      row = await requireSession(current, input.sessionId, session);
    if (
      !["PENDING", "WEB_APPROVED", "CONNECTED", "DISCONNECTED"].includes(
        row.state,
      )
    )
      return {
        sessionId: row.sessionId,
        state: row.state,
        expiresAt: row.expiresAt,
        leaseExpiresAt: row.leaseExpiresAt,
        pollSeconds: 2,
      };
    if (row.state === "DISCONNECTED" && !input.snapshot)
      fail(
        "FRESH_SNAPSHOT_REQUIRED",
        "Sincronize as configurações reais antes de retomar a conexão.",
      );
    if (input.snapshot) await storeSnapshot(row, input.snapshot, session);
    refreshLease(row);
    if (input.uptimeSeconds !== undefined)
      row.uptimeSeconds = input.uptimeSeconds;
    await row.save({ session });
    let operation;
    if (row.state === "CONNECTED") {
      const op = await RemoteOperation.findOne({
        serverRecordId: server._id,
        sessionId: row.sessionId,
        busy: true,
        expiresAt: { $gt: new Date() },
      }).session(session);
      if (op) {
        if (op.status === "QUEUED" && op.expectedHash !== row.configHash) {
          op.status = "CONFLICT";
          op.busy = false;
          op.completedAt = new Date();
          op.message =
            "As configurações foram alteradas localmente. Sincronize antes de aplicar.";
          await op.save({ session });
        } else {
          if (op.status === "QUEUED") {
            op.status = "SENT";
            op.sentAt = new Date();
            op.message =
              "Operação enviada; aguardando confirmação do SpawnerX.";
            await op.save({ session });
          }
          operation = {
            id: op._id,
            kind: op.kind,
            expectedHash: op.expectedHash,
            ...(op.documents ? { documents: op.documents } : {}),
            expiresAt: op.expiresAt,
          };
        }
      }
    }
    return {
      sessionId: row.sessionId,
      state: row.state,
      expiresAt: row.expiresAt,
      leaseExpiresAt: row.leaseExpiresAt,
      pollSeconds: 2,
      ...(row.state === "WEB_APPROVED"
        ? { confirmationToken: challenge(row), requestedBy: row.authorizedBy }
        : {}),
      ...(operation ? { operation } : {}),
    };
  });
}
export async function confirmRemoteConnection(
  server: Server,
  input: {
    sessionId: string;
    playerUuid: string;
    confirmationToken: string;
    decision: "confirm" | "reject";
    snapshot?: unknown;
  },
) {
  return RemoteSession.db.transaction(async (session) => {
    const current = await lockServer(server._id, session),
      row = await requireSession(current, input.sessionId, session);
    if (row.state !== "WEB_APPROVED" || row.approvalExpiresAt <= new Date())
      fail(
        "REMOTE_REQUEST_NOT_PENDING",
        "A confirmação não está mais disponível.",
      );
    if (row.leaseExpiresAt <= new Date())
      fail("SERVER_DISCONNECTED", "A conexão operacional expirou.");
    if (
      row.actor.uuid !== input.playerUuid ||
      !equalHash(input.confirmationToken, row.confirmationHash)
    )
      fail(
        "INVALID_GAME_CONFIRMATION",
        "Confirmação inválida ou pertencente a outro jogador.",
        403,
      );
    row.confirmationHash = undefined;
    if (input.decision === "reject") {
      row.state = "REJECTED";
      row.closedAt = new Date();
    } else {
      if (input.snapshot) await storeSnapshot(row, input.snapshot, session);
      row.state = "CONNECTED";
      row.connectedAt = new Date();
      refreshLease(row);
    }
    await row.save({ session });
    await activationEvent(
      server,
      row.state === "CONNECTED"
        ? "REMOTE_CONNECTED"
        : "REMOTE_CONNECTION_REJECTED",
      row.authorizedBy?.userId ?? null,
      { sessionId: row.sessionId },
      session,
    );
    return {
      sessionId: row.sessionId,
      state: row.state,
      expiresAt: row.expiresAt,
      leaseExpiresAt: row.leaseExpiresAt,
      pollSeconds: 2,
    };
  });
}
async function webSession(userId: string, id: string, session: ClientSession) {
  const server = await lockServer(id, session);
  await authority(server, userId, session);
  await lockBillingAccount(userId, session);
  const row = await RemoteSession.findById(id).session(session);
  if (!row)
    fail(
      "REMOTE_SESSION_NOT_FOUND",
      "Execute /sx connect no servidor antes de continuar.",
      404,
    );
  const validated = await requireSession(server, row.sessionId, session);
  assertLive(validated);
  return { server, row: validated };
}
export async function saveRemoteDraft(
  userId: string,
  id: string,
  input: {
    expectedRevision: string | null;
    expectedHash: string;
    documents: Documents;
  },
) {
  await remoteRateLimit(userId, "draft");
  return RemoteSession.db.transaction(async (session) => {
    const { server, row } = await webSession(userId, id, session);
    if (!row.capabilities || row.configHash !== input.expectedHash)
      fail(
        "CONFIGURATION_CONFLICT",
        "O servidor mudou desde a leitura. Sincronize as configurações antes de salvar.",
      );
    if ((row.draftId ?? null) !== input.expectedRevision)
      fail(
        "DRAFT_CONFLICT",
        "Outro editor salvou uma revisão. Atualize o painel antes de continuar.",
      );
    if (
      await RemoteOperation.exists({ serverRecordId: id, busy: true }).session(
        session,
      )
    )
      fail(
        "OPERATION_IN_PROGRESS",
        "Aguarde a operação atual antes de salvar outra revisão.",
      );
    const documents = validateDocuments(input.documents, row.capabilities),
      revisionId = randomUUID();
    const [revision] = await RemoteRevision.create(
      [
        {
          _id: revisionId,
          serverRecordId: id,
          sessionId: row.sessionId,
          ownerId: userId,
          actorId: userId,
          documents,
          baseHash: input.expectedHash,
          status: "SAVED",
          createdAt: new Date(),
        },
      ],
      { session },
    );
    row.draftId = revisionId;
    await row.save({ session });
    await activationEvent(
      server,
      "REMOTE_DRAFT_SAVED",
      userId,
      { sessionId: row.sessionId, revisionId },
      session,
    );
    return { revision: publicRevision(revision!) };
  });
}
export async function requestRemoteOperation(
  userId: string,
  id: string,
  input: {
    kind: OperationKind;
    expectedHash: string;
    revisionId?: string | undefined;
  },
) {
  await remoteRateLimit(userId, "operation", 20);
  return RemoteSession.db.transaction(async (session) => {
    const { server, row } = await webSession(userId, id, session);
    if (row.configHash !== input.expectedHash)
      fail(
        "CONFIGURATION_CONFLICT",
        "As configurações foram alteradas; sincronize antes de enviar a operação.",
      );
    if (!row.capabilities?.operations.includes(input.kind))
      fail(
        "UNSUPPORTED_OPERATION",
        "Esta versão do plugin não suporta a operação.",
        400,
      );
    if (
      await RemoteOperation.exists({ serverRecordId: id, busy: true }).session(
        session,
      )
    )
      fail(
        "OPERATION_IN_PROGRESS",
        "Já existe uma operação em andamento para este servidor.",
      );
    let documents: Documents | undefined;
    if (["APPLY", "RESTORE"].includes(input.kind)) {
      if (!input.revisionId)
        fail(
          "REVISION_REQUIRED",
          "Selecione uma revisão antes de aplicar.",
          400,
        );
      const revision = await RemoteRevision.findOne({
        _id: input.revisionId,
        serverRecordId: id,
        ownerId: userId,
      })
        .session(session)
        .lean();
      if (
        !revision ||
        (input.kind === "APPLY" &&
          (revision.status !== "SAVED" ||
            row.draftId !== revision._id ||
            revision.baseHash !== row.configHash))
      )
        fail(
          "REVISION_CONFLICT",
          "A revisão não pertence ao estado atual deste servidor.",
        );
      documents = validateDocuments(revision.documents, row.capabilities);
    }
    const [op] = await RemoteOperation.create(
      [
        {
          _id: randomUUID(),
          serverRecordId: id,
          sessionId: row.sessionId,
          ownerId: userId,
          actorId: userId,
          kind: input.kind,
          status: "QUEUED",
          busy: true,
          expectedHash: input.expectedHash,
          ...(documents ? { documents } : {}),
          ...(input.revisionId ? { revisionId: input.revisionId } : {}),
          message:
            "Solicitação aceita. Aguardando o canal autenticado do plugin.",
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 30000),
        },
      ],
      { session },
    );
    await activationEvent(
      server,
      "REMOTE_OPERATION_REQUESTED",
      userId,
      {
        sessionId: row.sessionId,
        operationId: op!._id,
        kind: input.kind,
        revisionId: input.revisionId ?? null,
      },
      session,
    );
    return { operation: publicOperation(op!) };
  });
}
export async function acknowledgeRemoteOperation(
  server: Server,
  input: {
    sessionId: string;
    operationId: string;
    status:
      | "APPLIED"
      | "AWAITING_RELOAD"
      | "RESTART_REQUIRED"
      | "FAILED"
      | "CONFLICT";
    message: string;
    snapshot?: unknown;
    backupId?: string | undefined;
  },
) {
  return RemoteSession.db.transaction(async (session) => {
    const current = await lockServer(server._id, session),
      row = await requireSession(current, input.sessionId, session);
    const op = await RemoteOperation.findOne({
      _id: input.operationId,
      serverRecordId: server._id,
      sessionId: row.sessionId,
    }).session(session);
    if (!op) fail("OPERATION_NOT_FOUND", "Operação não encontrada.", 404);
    if (!op.busy) {
      if (
        op.acknowledgedStatus === input.status &&
        op.resultHash ===
          (input.snapshot && typeof input.snapshot === "object"
            ? (input.snapshot as Snapshot).configHash
            : undefined)
      )
        return { accepted: true, state: row.state };
      fail(
        "OPERATION_ALREADY_FINISHED",
        "A operação já foi concluída, expirou ou perdeu a confirmação.",
      );
    }
    assertLive(row);
    if (op.status !== "SENT" || op.expiresAt <= new Date())
      fail(
        "OPERATION_NOT_DELIVERED",
        "A operação não está disponível para confirmação.",
      );
    const success = ["APPLIED", "AWAITING_RELOAD", "RESTART_REQUIRED"].includes(
      input.status,
    );
    if (success && !input.snapshot)
      fail(
        "SNAPSHOT_REQUIRED",
        "O plugin precisa confirmar o estado real das configurações.",
        400,
      );
    const snap = input.snapshot
      ? await storeSnapshot(row, input.snapshot, session)
      : null;
    if (
      snap &&
      success &&
      op.documents &&
      JSON.stringify(snap.documents) !== JSON.stringify(op.documents)
    ) {
      // Object property order is normalized below; semantic comparison is used.
      if (canonical(snap.documents) !== canonical(op.documents))
        fail(
          "RESULT_CONFIGURATION_MISMATCH",
          "A confirmação não corresponde às configurações solicitadas.",
          409,
        );
    }
    op.status = input.status;
    op.busy = false;
    op.message = input.message;
    op.completedAt = new Date();
    op.acknowledgedStatus = input.status;
    if (input.backupId) op.backupId = input.backupId;
    if (snap) op.resultHash = snap.configHash;
    if (success && snap) {
      const [revision] = await RemoteRevision.create(
        [
          {
            _id: randomUUID(),
            serverRecordId: server._id,
            sessionId: row.sessionId,
            ownerId: row.ownerId,
            actorId: op.actorId,
            documents: snap.documents,
            baseHash: op.expectedHash,
            resultingHash: snap.configHash,
            status: input.status,
            operationId: op._id,
            createdAt: new Date(),
          },
        ],
        { session },
      );
      if (op.revisionId)
        await RemoteRevision.updateOne(
          { _id: op.revisionId, serverRecordId: server._id },
          {
            $set: {
              status: input.status,
              resultingHash: snap.configHash,
              operationId: op._id,
            },
          },
          { session },
        );
      if (row.draftId === op.revisionId) row.draftId = undefined;
    }
    await op.save({ session });
    await row.save({ session });
    await activationEvent(
      server,
      "REMOTE_OPERATION_RESULT",
      op.actorId,
      {
        sessionId: row.sessionId,
        operationId: op._id,
        kind: op.kind,
        status: op.status,
        backupId: op.backupId ?? null,
      },
      session,
    );
    return { accepted: true, state: row.state };
  });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export async function disconnectRemoteConnection(
  serverId: string,
  userId?: string,
  sessionId?: string,
) {
  return RemoteSession.db.transaction(async (session) => {
    const server = await lockServer(serverId, session);
    const auth = await authority(server, userId, session);
    await lockBillingAccount(auth.ownerId, session);
    const row = await RemoteSession.findOne({
      _id: serverId,
      ...(sessionId ? { sessionId } : {}),
    }).session(session);
    if (!row) fail("REMOTE_SESSION_NOT_FOUND", "Sessão não encontrada.", 404);
    row.state = userId ? "REVOKED" : "DISCONNECTED";
    row.closedAt = new Date();
    row.leaseExpiresAt = new Date(0);
    row.tokenHash = undefined;
    row.confirmationHash = undefined;
    if (!userId) {
      row.state = "REVOKED";
    } // Explicit plugin disconnect is final, unlike a transient lease loss.
    await expireOperations(serverId, session, true);
    await row.save({ session });
    await activationEvent(
      server,
      "REMOTE_DISCONNECTED",
      userId ?? null,
      { sessionId: row.sessionId },
      session,
    );
    return { session: publicSession(row), state: row.state };
  });
}
export async function revokeRemoteForInvalidLicense(serverId: string) {
  await RemoteSession.db.transaction(async (session) => {
    await lockServer(serverId, session);
    const row = await RemoteSession.findById(serverId).session(session);
    if (row && !["REVOKED", "EXPIRED", "REJECTED"].includes(row.state)) {
      row.state = "REVOKED";
      row.closedAt = new Date();
      row.leaseExpiresAt = new Date(0);
      row.tokenHash = undefined;
      row.confirmationHash = undefined;
      await expireOperations(serverId, session, true);
      await row.save({ session });
    }
  });
}
export async function readRemoteState(userId: string, id: string) {
  return RemoteSession.db.transaction(async (session) => {
    const server = await ownedServer(userId, id, session);
    await lockServer(id, session);
    let reason = "Execute /sx connect no servidor para iniciar a conexão.",
      paid = false,
      plan = server.licensePlan ?? "unknown";
    let row = await RemoteSession.findById(id).session(session);
    try {
      const auth = await authority(server, userId, session);
      paid = true;
      plan = auth.plan;
    } catch (error) {
      if (
        !(error instanceof ActivationError) ||
        error.code === "SERVER_NOT_FOUND"
      )
        throw error;
      reason = error.message;
      if (row) {
        row.state = "REVOKED";
        row.closedAt = new Date();
        row.leaseExpiresAt = new Date(0);
        row.tokenHash = undefined;
        row.confirmationHash = undefined;
        await expireOperations(id, session, true);
        await row.save({ session });
      }
    }
    if (row) row = await reconcile(row, session);
    const online = Boolean(
      paid &&
        row &&
        row.leaseExpiresAt > new Date() &&
        ["PENDING", "WEB_APPROVED", "CONNECTED"].includes(row.state),
    );
    const manageable = Boolean(
      online &&
        row?.state === "CONNECTED" &&
        row.expiresAt > new Date() &&
        row.hardExpiresAt > new Date(),
    );
    if (paid && row?.state === "CONNECTED")
      reason =
        "Servidor conectado. Operações disponíveis pelo canal autenticado.";
    else if (paid && row && !online)
      reason =
        "Servidor desconectado. As alterações e o reload estão bloqueados até a conexão operacional voltar.";
    else if (paid && row?.state === "PENDING")
      reason =
        "Confira a solicitação e autorize a conexão. Depois, confirme no Minecraft.";
    else if (paid && row?.state === "WEB_APPROVED")
      reason =
        "Autorizado no website. Confirme no Minecraft com o jogador que iniciou a solicitação.";
    const revisions = await RemoteRevision.find({
      serverRecordId: id,
      ownerId: userId,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .session(session)
      .lean();
    const operations = await RemoteOperation.find({
      serverRecordId: id,
      ownerId: userId,
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(30)
      .session(session)
      .lean();
    const history = await LicenseServerEvent.find({
      serverRecordId: id,
      action: /^REMOTE_/,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .session(session)
      .lean();
    const draft = row?.draftId
      ? (revisions.find((v) => v._id === row?.draftId) ??
        (await RemoteRevision.findOne({
          _id: row.draftId,
          serverRecordId: id,
          ownerId: userId,
        })
          .session(session)
          .lean()))
      : null;
    return {
      server: {
        id: server._id,
        serverId: server.serverId,
        name: server.displayName || server.name,
        icon: server.icon ?? "grass",
        iconData: row?.serverIcon?.data ?? null,
        minecraftVersion: server.minecraftVersion,
        implementation: server.implementation,
        implementationVersion: server.implementationVersion,
        pluginVersion: row?.capabilities?.pluginVersion ?? server.pluginVersion,
        license: { plan, valid: paid },
        lastHeartbeatAt: server.lastHeartbeatAt ?? null,
        uptimeSeconds: row?.uptimeSeconds ?? null,
      },
      session: publicSession(row),
      online,
      manageable,
      reason,
      capabilities: row?.capabilities ?? null,
      snapshot:
        row?.configHash && row.documents
          ? {
              hash: row.configHash,
              documents: row.documents,
              capturedAt: row.capturedAt,
            }
          : null,
      draft: draft ? publicRevision(draft) : null,
      revisions: revisions.map(publicRevision),
      operations: operations.map(publicOperation),
      history: history.map((v) => ({
        action: v.action,
        actorId: v.actorId,
        createdAt: v.createdAt,
        metadata: v.metadata,
      })),
    };
  });
}
