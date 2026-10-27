import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { z } from "zod";
import { License } from "../../database/models/License.js";
import { LicenseServer } from "../../database/models/LicenseServer.js";
import {
  LicenseServerEvent,
  LicenseRequestNonce,
  LicenseActivationReceipt,
} from "../../database/models/LicenseServerEvent.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { isPaidAccessFunded } from "./plan-access.js";
import { PlanPurchase } from "../../database/models/PlanPurchase.js";
import { BillingRateLimit } from "../../database/models/BillingRateLimit.js";
import {
  ActivationError,
  accountVerification,
  activationPayload,
  licenseReference,
  tokenHash,
  verifyServerProof,
  type signedEnvelope,
} from "../../domain/activation.js";
import type { LicensingConfig } from "../../domain/licensing-config.js";
import { acceptedPlanTerms } from "../../domain/licensing-config.js";
import { getLicensingConfig } from "./licensing-config.js";
import { collectActivationPrivacy } from "./activation-privacy.js";

export async function activationEvent(
  record: { _id: string; licenseId: string },
  action: string,
  actorId: string | null,
  metadata: Record<string, unknown> = {},
  session?: ClientSession,
  requestId?: string,
) {
  const config = await getLicensingConfig();
  await LicenseServerEvent.create(
    [
      {
        serverRecordId: record._id,
        licenseRef: licenseReference(record.licenseId),
        action,
        actorId,
        metadata,
        ...(requestId ? { requestId } : {}),
        createdAt: new Date(),
        expiresAt: new Date(
          Date.now() + config.policy.logRetentionDays * 86400000,
        ),
      },
    ],
    session ? { session } : {},
  );
}
export async function acceptServerProof(
  envelope: z.infer<typeof signedEnvelope>,
  path: string,
  config: LicensingConfig,
) {
  const fingerprint = verifyServerProof(
    envelope,
    path,
    config.policy.clockSkewSeconds,
  );
  try {
    await LicenseRequestNonce.create({
      fingerprint,
      nonce: envelope.nonce,
      expiresAt: new Date(Date.now() + config.policy.clockSkewSeconds * 2000),
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    )
      throw new ActivationError(
        "REQUEST_REPLAY",
        "Esta solicitação já foi recebida.",
        409,
      );
    throw error;
  }
  const key = `activation-proof:${fingerprint}:${Math.floor(Date.now() / 60000)}`;
  const rate = await BillingRateLimit.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + 120000) },
    },
    { upsert: true, new: true },
  );
  if (rate.count > config.policy.proofRequestsPerMinute)
    throw new ActivationError(
      "RATE_LIMIT",
      "Muitas solicitações desta instalação.",
      429,
    );
  return fingerprint;
}
export async function licenseEntitlement(
  licenseId: string,
  config: LicensingConfig,
  session?: ClientSession,
) {
  const license = await License.findById(licenseId)
    .session(session ?? null)
    .lean();
  if (!license?.value.valid || license.value.tier !== "plus")
    throw new ActivationError(
      "INVALID_LICENSE",
      "Chave inválida ou revogada.",
      403,
    );
  if (license.expiresAt && license.expiresAt <= new Date())
    throw new ActivationError("EXPIRED_LICENSE", "Esta licença expirou.", 403);
  const trial = license.sourcePlan === "trial" || Boolean(license.expiresAt);
  const access =
    license.ownerId && !trial
      ? await PlanAccess.findOne({ userId: license.ownerId })
          .session(session ?? null)
          .lean()
      : null;
  if (
    license.ownerId &&
    !trial &&
    (!access ||
      access.status !== "active" ||
      !(await isPaidAccessFunded(access, session)) ||
      (access.plan === "monthly" &&
        (!access.expiresAt || access.expiresAt <= new Date())) ||
      !["monthly", "lifetime", "aether"].includes(access.plan) ||
      (license.sourcePlan && license.sourcePlan !== access.plan))
  )
    throw new ActivationError(
      "INACTIVE_LICENSE",
      "O plano desta licença não está ativo.",
      403,
    );
  const id =
    license.sourcePlan === "trial" || license.expiresAt
      ? "free"
      : (license.sourcePlan ?? access?.plan ?? "monthly");
  const terms =
    (id === "free" ? license.planTerms : access?.planTerms) ??
    acceptedPlanTerms(config, config.plans.find((p) => p.id === id)!);
  let additional = 0;
  if (license.ownerId && !trial) {
    const rows = await PlanPurchase.aggregate<{ total: number }>([
      { $match: { userId: license.ownerId, status: "approved" } },
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$serverSlots", 0] } },
        },
      },
    ]).session(session ?? null);
    additional = Math.max(0, rows[0]?.total ?? 0);
  }
  return {
    license,
    access,
    terms,
    limit: access?.serverLimitUnlimited
      ? Number.MAX_SAFE_INTEGER
      : (access?.serverLimitOverride ?? terms.serverLimit) + additional,
  };
}
export async function expireServerRequest(id: string) {
  await LicenseServer.db.transaction(async (session) => {
    const row = await LicenseServer.findOneAndUpdate(
      { _id: id, state: "PENDING", expiresAt: { $lte: new Date() } },
      { $set: { state: "EXPIRED" }, $unset: { credentialHash: "" } },
      { new: true, session },
    ).lean();
    if (row) {
      await License.updateOne(
        { _id: row.licenseId, serverSlots: { $gt: 0 } },
        { $inc: { serverSlots: -1, activationRevision: 1 } },
        { session },
      );
      await activationEvent(row, "REQUEST_EXPIRED", null, {}, session);
    }
  });
}
export async function createActivation(
  input: z.infer<typeof activationPayload>,
  envelope: z.infer<typeof signedEnvelope>,
  fingerprint: string,
  config: LicensingConfig,
) {
  await licenseEntitlement(input.licenseKey, config);
  const key = `activation-request:${licenseReference(input.licenseKey)}:${Math.floor(Date.now() / (config.policy.requestWindowSeconds * 1000))}`;
  const rate = await BillingRateLimit.findOneAndUpdate(
    { key },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        expiresAt: new Date(
          Date.now() + config.policy.requestWindowSeconds * 2000,
        ),
      },
    },
    { upsert: true, new: true },
  );
  if (rate.count > config.policy.maxRequestsPerWindow)
    throw new ActivationError(
      "RATE_LIMIT",
      "Limite de tentativas atingido. Aguarde antes de tentar novamente.",
      429,
    );
  let resultId = "";
  let capturePrivacy = false;
  await License.db.transaction(async (session) => {
    capturePrivacy = false;
    const { license, limit, access, terms } = await licenseEntitlement(
      input.licenseKey,
      config,
      session,
    );
    const trialOwner = license.ownerId
      ? null
      : await PlanAccess.findOne({ trialLicenseCode: license._id })
          .session(session)
          .lean();
    await License.updateOne(
      { _id: license._id },
      { $inc: { activationRevision: 1 } },
      { session },
    );
    const priorAttempt = await LicenseActivationReceipt.findOne({
      requestId: input.requestId,
    })
      .session(session)
      .lean();
    const existing = await LicenseServer.findOne({
      licenseId: license._id,
      serverId: input.serverId,
    }).session(session);
    if (
      existing?.publicKeyFingerprint &&
      existing.publicKeyFingerprint !== fingerprint
    )
      throw new ActivationError(
        "IDENTITY_MISMATCH",
        "Esta identidade de servidor pertence a outra instalação. Não copie o server-id.",
        403,
      );
    if (priorAttempt && existing?.activationRequestId !== input.requestId) {
      // A configuration command on an active installation has its own receipt,
      // without replacing the request that the account holder approved.
      if (
        existing?.state === "ACTIVE" &&
        existing.protocol === 3 &&
        priorAttempt.serverRecordId === existing._id
      ) {
        resultId = existing._id;
        return;
      }
      throw new ActivationError(
        "REQUEST_REPLAY",
        "Uma solicitação antiga não pode ser reutilizada.",
        409,
      );
    }
    if (
      existing?.activationRequestId === input.requestId &&
      existing.state === "PENDING" &&
      existing.expiresAt <= new Date()
    ) {
      existing.state = "EXPIRED";
      await existing.save({ session });
      await License.updateOne(
        { _id: license._id, serverSlots: { $gt: 0 } },
        { $inc: { serverSlots: -1 } },
        { session },
      );
      await activationEvent(existing, "REQUEST_EXPIRED", null, {}, session);
    }
    if (existing?.activationRequestId === input.requestId) {
      resultId = existing._id;
      return;
    }
    if (existing?.state === "ACTIVE" && existing.protocol === 3) {
      existing.name = input.name;
      existing.minecraftVersion = input.minecraftVersion;
      existing.implementation = input.implementation;
      existing.implementationVersion = input.implementationVersion;
      existing.pluginVersion = input.pluginVersion;
      await existing.save({ session });
      await LicenseActivationReceipt.create(
        [
          {
            requestId: input.requestId,
            serverRecordId: existing._id,
            licenseRef: licenseReference(license._id),
          },
        ],
        { session },
      );
      await activationEvent(
        existing,
        "CONFIGURATION_UPDATED",
        null,
        {
          actor: input.actor,
          authentication: input.authentication,
          accountVerification: accountVerification(input.actor),
          minecraftVersion: input.minecraftVersion,
          implementationVersion: input.implementationVersion,
          pluginVersion: input.pluginVersion,
        },
        session,
        input.requestId,
      );
      resultId = existing._id;
      capturePrivacy = true;
      return;
    }
    if (existing?.state === "PENDING" && existing.expiresAt > new Date()) {
      resultId = existing._id;
      return;
    }
    if (
      existing &&
      ["REVOKED", "INACTIVE", "REJECTED"].includes(existing.state)
    ) {
      if (!config.policy.allowReactivation)
        throw new ActivationError(
          "REACTIVATION_DISABLED",
          "A reativação está desabilitada. Contate o titular.",
          409,
        );
      if (
        existing.revokedAt &&
        Date.now() - existing.revokedAt.getTime() <
          config.policy.reactivationCooldownSeconds * 1000
      )
        throw new ActivationError(
          "REACTIVATION_COOLDOWN",
          "Aguarde o intervalo de reativação.",
          429,
        );
    }
    const expired = await LicenseServer.find({
      licenseId: license._id,
      state: "PENDING",
      expiresAt: { $lte: new Date() },
    }).session(session);
    for (const item of expired) {
      item.state = "EXPIRED";
      await item.save({ session });
      await activationEvent(item, "REQUEST_EXPIRED", null, {}, session);
    }
    const used = await LicenseServer.countDocuments({
      licenseId: license._id,
      $or: [
        { state: "ACTIVE" },
        { state: "PENDING", expiresAt: { $gt: new Date() } },
      ],
    }).session(session);
    const pending = await LicenseServer.countDocuments({
      licenseId: license._id,
      state: "PENDING",
      expiresAt: { $gt: new Date() },
    }).session(session);
    const replacesActive = existing?.state === "ACTIVE";
    if (
      (!replacesActive && used >= limit) ||
      pending >= config.policy.maxPendingPerLicense
    )
      throw new ActivationError(
        "SERVER_LIMIT",
        "Limite de servidores atingido. Remova uma vinculação existente ou altere seu plano.",
        409,
      );
    const data = {
      licenseId: license._id,
      ownerId: license.ownerId ?? trialOwner?.userId,
      licensePlan: license.expiresAt
        ? "trial"
        : (access?.plan ?? license.sourcePlan),
      licenseTerms: terms,
      licenseExpiresAt:
        license.expiresAt ??
        (access?.plan === "monthly" ? access.expiresAt : undefined),
      serverId: input.serverId,
      name: input.name,
      minecraftVersion: input.minecraftVersion,
      implementation: input.implementation,
      implementationVersion: input.implementationVersion,
      pluginVersion: input.pluginVersion,
      protocol: 3,
      activationRequestId: input.requestId,
      publicKey: envelope.publicKey,
      publicKeyFingerprint: fingerprint,
      state: "PENDING" as const,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + config.policy.approvalMinutes * 60000),
      activatedBy: input.actor,
      authentication: input.authentication,
      accountVerification: accountVerification(input.actor),
      actorCapturedAt: new Date(),
    };
    if (existing) {
      Object.assign(existing, data);
      existing.set("removedAt", undefined);
      existing.set("credentialHash", undefined);
      existing.set("lastHeartbeatAt", undefined);
      await existing.save({ session });
      resultId = existing._id;
    } else {
      const [created] = await LicenseServer.create(
        [{ _id: randomUUID(), ...data }],
        { session },
      );
      resultId = created!._id;
    }
    await License.updateOne(
      { _id: license._id },
      { $set: { serverSlots: used + (replacesActive ? 0 : 1) } },
      { session },
    );
    await LicenseActivationReceipt.create(
      [
        {
          requestId: input.requestId,
          serverRecordId: resultId,
          licenseRef: licenseReference(license._id),
        },
      ],
      { session },
    );
    await activationEvent(
      { _id: resultId, licenseId: license._id },
      "REQUEST_CREATED",
      null,
      {
        executionType: input.actor.executionType,
        username: input.actor.username,
        accountVerification: data.accountVerification,
      },
      session,
      input.requestId,
    );
    capturePrivacy = true;
  });
  const result = await LicenseServer.findById(resultId);
  if (!result) throw new Error("Activation was not persisted");
  if (capturePrivacy)
    await collectActivationPrivacy(result._id, input, config.policy).catch(
      () => undefined,
    );
  return result;
}
export async function authenticateInstallation(
  id: string,
  serverId: string,
  requestId: string,
  fingerprint: string,
) {
  await expireServerRequest(id);
  const record = await LicenseServer.findOne({
    _id: id,
    serverId,
    activationRequestId: requestId,
    publicKeyFingerprint: fingerprint,
  }).select("+credentialHash");
  if (!record)
    throw new ActivationError(
      "ACTIVATION_NOT_FOUND",
      "Solicitação inexistente ou pertencente a outra instalação.",
      404,
    );
  return record;
}
export async function activationResponse(
  record: Awaited<ReturnType<typeof authenticateInstallation>>,
  config: LicensingConfig,
  credential?: string,
  heartbeat = false,
) {
  let features: string[] = [];
  let permissions: string[] = [];
  let licenseExpiresAt: Date | null = null;
  if (record.state === "ACTIVE") {
    const entitlement = await licenseEntitlement(record.licenseId, config);
    features = entitlement.terms.features;
    permissions = entitlement.terms.permissions;
    licenseExpiresAt =
      entitlement.license.expiresAt ??
      (entitlement.access?.plan === "monthly"
        ? (entitlement.access.expiresAt ?? null)
        : null);
    if (heartbeat) {
      const supplied = credential ? tokenHash(credential) : "";
      if (
        !record.credentialHash ||
        supplied.length !== record.credentialHash.length ||
        !timingSafeEqual(
          Buffer.from(supplied),
          Buffer.from(record.credentialHash),
        )
      ) {
        await activationEvent(record, "VALIDATION_FAILED", null, {
          reason: "INVALID_ACTIVATION_CREDENTIAL",
        });
        throw new ActivationError(
          "INVALID_ACTIVATION_CREDENTIAL",
          "Credencial de ativação inválida.",
          401,
        );
      }
      const changed = await LicenseServer.updateOne(
        {
          _id: record._id,
          state: "ACTIVE",
          credentialHash: record.credentialHash,
        },
        { $set: { lastHeartbeatAt: new Date(), lastValidatedAt: new Date() } },
      );
      if (!changed.modifiedCount)
        throw new ActivationError(
          "ACTIVATION_REVOKED",
          "A vinculação foi revogada.",
          403,
        );
    }
  }
  let activationCredential: string | undefined;
  if (record.state === "ACTIVE" && !heartbeat) {
    activationCredential = randomBytes(32).toString("base64url");
    const changed = await LicenseServer.updateOne(
      {
        _id: record._id,
        state: "ACTIVE",
        publicKeyFingerprint: record.publicKeyFingerprint,
      },
      { $set: { credentialHash: tokenHash(activationCredential) } },
    );
    if (!changed.modifiedCount)
      throw new ActivationError(
        "ACTIVATION_REVOKED",
        "A vinculação foi revogada.",
        403,
      );
    await activationEvent(record, "LICENSE_ACTIVATED", null);
  }
  return {
    id: record._id,
    serverId: record.serverId,
    requestId: record.activationRequestId,
    state: record.state,
    expiresAt: record.expiresAt,
    approvedAt: record.approvedAt ?? null,
    serverTime: new Date(),
    licenseRef: licenseReference(record.licenseId),
    licenseExpiresAt,
    features,
    permissions,
    ...(activationCredential ? { activationCredential } : {}),
    heartbeatSeconds: config.policy.heartbeatSeconds,
    offlineAfterSeconds: config.policy.offlineAfterSeconds,
    graceSeconds: config.policy.graceSeconds,
    maxRetries: config.policy.maxRetries,
    retrySeconds: config.policy.retrySeconds,
    consentVersion: config.policy.consentVersion,
  };
}

export async function ownedServer(
  userId: string,
  id: string,
  session?: ClientSession,
) {
  const record = await LicenseServer.findById(id).session(session ?? null);
  if (!record)
    throw new ActivationError(
      "SERVER_NOT_FOUND",
      "Servidor não encontrado.",
      404,
    );
  const owned = await License.exists({
    _id: record.licenseId,
    ownerId: userId,
    "value.tier": "plus",
  }).session(session ?? null);
  const trial = owned
    ? null
    : await PlanAccess.exists({
        userId,
        trialLicenseCode: record.licenseId,
        trialLicenseExpiresAt: { $gt: new Date() },
      }).session(session ?? null);
  if (!owned && !trial && record.ownerId !== userId)
    throw new ActivationError(
      "SERVER_NOT_FOUND",
      "Servidor não encontrado.",
      404,
    );
  return record;
}
export async function manageActivation(
  userId: string,
  id: string,
  action: "approve" | "reject" | "remove" | "delete",
  confirmed: boolean,
) {
  if ((action === "remove" || action === "delete") && !confirmed)
    throw new ActivationError(
      "CONFIRMATION_REQUIRED",
      "Confirme a remoção deste servidor.",
      400,
    );
  await expireServerRequest(id);
  const config = await getLicensingConfig();
  let result: unknown;
  await LicenseServer.db.transaction(async (session) => {
    const row = await ownedServer(userId, id, session);
    await License.updateOne(
      { _id: row.licenseId },
      { $inc: { activationRevision: 1 } },
      { session },
    );
    if (action === "approve" || action === "reject") {
      if (row.state !== "PENDING" || row.expiresAt <= new Date())
        throw new ActivationError(
          "REQUEST_NOT_PENDING",
          "A solicitação não está mais pendente.",
          409,
        );
      if (action === "approve") {
        const entitlement = await licenseEntitlement(
          row.licenseId,
          config,
          session,
        );
        const active = await LicenseServer.countDocuments({
          licenseId: row.licenseId,
          state: "ACTIVE",
        }).session(session);
        if (active >= entitlement.limit)
          throw new ActivationError(
            "SERVER_LIMIT",
            "Limite de servidores atingido. Remova uma vinculação existente ou altere seu plano.",
            409,
          );
      }
      row.state = action === "approve" ? "ACTIVE" : "REJECTED";
      if (action === "approve") row.approvedAt = new Date();
      else row.revokedAt = new Date();
      await row.save({ session });
      if (action === "reject")
        await License.updateOne(
          { _id: row.licenseId, serverSlots: { $gt: 0 } },
          { $inc: { serverSlots: -1 } },
          { session },
        );
      await activationEvent(
        row,
        action === "approve"
          ? "AUTHORIZATION_APPROVED"
          : "AUTHORIZATION_REJECTED",
        userId,
        {},
        session,
      );
    } else if (action === "remove") {
      const occupied = ["PENDING", "ACTIVE"].includes(row.state);
      row.state = "REVOKED";
      row.revokedAt = new Date();
      row.set("credentialHash", undefined);
      await row.save({ session });
      if (occupied)
        await License.updateOne(
          { _id: row.licenseId, serverSlots: { $gt: 0 } },
          { $inc: { serverSlots: -1 } },
          { session },
        );
      await activationEvent(row, "LICENSE_REVOKED", userId, {}, session);
    } else {
      if (["PENDING", "ACTIVE"].includes(row.state))
        throw new ActivationError(
          "SERVER_STILL_ACTIVE",
          "Revogue a vinculação antes de apagar o registro.",
          409,
        );
      // Keep the closed binding as a replay tombstone, hide it from the inventory.
      row.set("removedAt", new Date());
      row.set("activatedBy", undefined);
      await row.save({ session });
      await activationEvent(row, "SERVER_REMOVED", userId, {}, session);
      const { LicenseServerPrivacy } = await import(
        "../../database/models/LicenseServerEvent.js"
      );
      await LicenseServerPrivacy.deleteOne(
        { serverRecordId: row._id },
        { session },
      );
    }
    result = row.toObject();
  });
  return result;
}
