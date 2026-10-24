import { Elysia } from "elysia";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { License } from "../../database/models/License.js";
import { LicenseServer } from "../../database/models/LicenseServer.js";
import { PlanAccess } from "../../database/models/PlanAccess.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import { view } from "../plugins/license.js";
import { getPaidPlan } from "../plugins/plan-access.js";

const planForLicense = async (license: { ownerId?: string; sourcePlan?: "trial" | "monthly" | "lifetime"; expiresAt?: Date }) => {
  // Also recognizes trial keys created before `sourcePlan: "trial"` existed.
  if (license.sourcePlan === "trial" || license.expiresAt) return "trial";
  const activePlan = license.ownerId ? await getPaidPlan(license.ownerId) : null;
  return activePlan ?? license.sourcePlan ?? null;
};

const serverLimitForPlan = (plan: "trial" | "monthly" | "lifetime" | null) =>
  plan === "trial" ? 1 : plan === "lifetime" ? 5 : 3;

async function enforceServerLimit(licenseId: string, limit: number, now = new Date()) {
  const expiredPending = await LicenseServer.find({
    licenseId,
    state: "PENDING",
    expiresAt: { $lte: now },
  }).select({ _id: 1 }).lean();
  for (const expired of expiredPending) {
    const changed = await LicenseServer.updateOne(
      { _id: expired._id, state: "PENDING", expiresAt: { $lte: now } },
      { $set: { state: "EXPIRED" } },
    );
    if (changed.modifiedCount) {
      await License.updateOne({ _id: licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
    }
  }

  const reservations = await LicenseServer.find({
    licenseId,
    $or: [
      { state: "ACTIVE" },
      { state: "PENDING", expiresAt: { $gt: now } },
    ],
  }).sort({ createdAt: 1, _id: 1 }).lean();

  // Keep active servers first, then the oldest pending requests.
  reservations.sort((a, b) => {
    const stateOrder = Number(a.state !== "ACTIVE") - Number(b.state !== "ACTIVE");
    return stateOrder || a.createdAt.getTime() - b.createdAt.getTime() || String(a._id).localeCompare(String(b._id));
  });

  for (const excess of reservations.slice(limit)) {
    const nextState = excess.state === "ACTIVE" ? "REVOKED" : "EXPIRED";
    const filter = excess.state === "PENDING"
      ? { _id: excess._id, state: "PENDING", expiresAt: { $gt: now } }
      : { _id: excess._id, state: "ACTIVE" };
    const changed = await LicenseServer.updateOne(filter, { $set: { state: nextState } });
    if (changed.modifiedCount) {
      await License.updateOne({ _id: licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
    }
  }
}

const serverInfo = z.object({
  serverId: z.string().uuid(), name: z.string().trim().min(1).max(100),
  minecraftVersion: z.string().max(40).default("unknown"),
  implementation: z.string().max(40).default("Paper"),
  implementationVersion: z.string().max(60).default("unknown"),
  pluginVersion: z.string().max(40).default("unknown"),
});

const publicRecord = (record: any) => ({
  id: record._id, licenseId: record.licenseId, serverId: record.serverId,
  name: record.name, minecraftVersion: record.minecraftVersion,
  implementation: record.implementation, implementationVersion: record.implementationVersion,
  pluginVersion: record.pluginVersion, state: record.state,
  createdAt: record.createdAt, expiresAt: record.expiresAt, lastValidatedAt: record.lastValidatedAt ?? null,
  connection: "UNKNOWN" as const,
});

export const licenseServerRoutes = new Elysia({ prefix: "/license" })
  .use(authSessionPlugin)
  // Called by SpawnerX. A successful key check only creates a PENDING request.
  .post("/servers/request", async ({ body, status }) => {
    const input = body as z.infer<typeof serverInfo> & { key: string };
    const checked = serverInfo.safeParse(input);
    if (!checked.success || typeof input.key !== "string" || !/^plus_[0-9a-f-]{36}$/i.test(input.key.trim())) {
      return status(400, { message: "Invalid license key or server details" });
    }
    const licenseId = input.key.trim();
    const license = await License.findOne({ _id: licenseId, "value.tier": "plus", "value.valid": true }).lean();
    if (!license || !(await view(licenseId)).valid) return status(403, { state: "ERROR", message: "Invalid Plus license" });
    const plan = await planForLicense(license);
    const serverLimit = serverLimitForPlan(plan);
    const now = new Date();
    await enforceServerLimit(licenseId, serverLimit, now);
    const existing = await LicenseServer.findOne({ licenseId, serverId: checked.data.serverId });
    if (existing) {
      if (existing.state === "PENDING" && existing.expiresAt <= now) {
        const expired = await LicenseServer.updateOne({ _id: existing._id, state: "PENDING", expiresAt: { $lte: now } }, { $set: { state: "EXPIRED" } });
        if (expired.modifiedCount) await License.updateOne({ _id: licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
        Object.assign(existing, (await LicenseServer.findById(existing._id))?.toObject() ?? {});
      } else if (["PENDING", "ACTIVE"].includes(existing.state)) return publicRecord(existing);
    }
    // Atomic reservation prevents parallel requests from exceeding this plan's limit.
    const reserved = await License.findOneAndUpdate(
      { _id: licenseId, "value.tier": "plus", "value.valid": true, $or: [{ serverSlots: { $lt: serverLimit } }, { serverSlots: { $exists: false } }] },
      { $inc: { serverSlots: 1 } }, { new: true },
    );
    if (!reserved) return status(409, { state: "ERROR", message: "No server slots available" });
    const record = {
      _id: randomUUID(), licenseId, ...checked.data, state: "PENDING" as const,
      createdAt: now, expiresAt: new Date(now.getTime() + 12 * 60_000),
    };
    if (existing) {
      const { _id: _ignored, ...renewal } = record;
      const renewed = await LicenseServer.findOneAndUpdate(
        { _id: existing._id, state: { $in: ["EXPIRED", "REJECTED", "REVOKED", "ERROR", "INACTIVE"] } },
        { $set: renewal }, { new: true },
      );
      if (renewed) return publicRecord(renewed);
      await License.updateOne({ _id: licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
      const latest = await LicenseServer.findById(existing._id);
      if (latest) return publicRecord(latest);
      return status(409, { message: "Activation request already in progress" });
    }
    try {
      const created = await LicenseServer.create(record);
      return publicRecord(created);
    } catch (error) {
      await License.updateOne({ _id: licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
      const duplicate = await LicenseServer.findOne({ licenseId, serverId: checked.data.serverId });
      if (duplicate) return publicRecord(duplicate);
      throw error;
    }
  }, { body: z.object({ key: z.string(), ...serverInfo.shape }), detail: { summary: "Request Plus server authorization", tags: ["License"] } })
  .get("/servers/status", async ({ query, status }) => {
    const licenseId = query.key.trim();
    if (!/^plus_[0-9a-f-]{36}$/i.test(licenseId)) return status(400, { message: "Invalid license key" });
    const license = await License.findOne({ _id: licenseId, "value.tier": "plus", "value.valid": true }).lean();
    if (!license || !(await view(licenseId)).valid) return status(403, { state: "ERROR", message: "Invalid Plus license" });
    const plan = await planForLicense(license);
    await enforceServerLimit(licenseId, serverLimitForPlan(plan));
    const record = await LicenseServer.findOne({ licenseId, serverId: query.serverId });
    if (!record) return status(404, { state: "ERROR", message: "Activation not found" });
    if (record.state === "PENDING" && record.expiresAt <= new Date()) {
      const expired = await LicenseServer.updateOne({ _id: record._id, state: "PENDING", expiresAt: { $lte: new Date() } }, { $set: { state: "EXPIRED" } });
      if (expired.modifiedCount) await License.updateOne({ _id: licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
      Object.assign(record, (await LicenseServer.findById(record._id))?.toObject() ?? {});
    }
    if (record.state === "ACTIVE") { record.lastValidatedAt = new Date(); await record.save(); }
    return publicRecord(record);
  }, { query: z.object({ key: z.string(), serverId: z.string().uuid() }), detail: { summary: "Validate a Plus server activation", tags: ["License"] } })
  .get("/servers", async ({ user }) => {
    const now = new Date();
    const trialAccess = await PlanAccess.findOne({
      userId: user.id,
      trialLicenseCode: { $exists: true },
      trialLicenseExpiresAt: { $gt: now },
    }).select({ trialLicenseCode: 1 }).lean();
    const licenses = await License.find(trialAccess?.trialLicenseCode
      ? { $or: [
          { ownerId: user.id },
          { _id: trialAccess.trialLicenseCode, sourcePlan: "trial", expiresAt: { $gt: now } },
        ] }
      : { ownerId: user.id }).lean();
    for (const license of licenses) {
      const plan = await planForLicense(license);
      await enforceServerLimit(license._id, serverLimitForPlan(plan), now);
    }
    const records = await LicenseServer.find({ licenseId: { $in: licenses.map((item) => item._id) } }).sort({ createdAt: -1 }).lean();
    return Promise.all(licenses.map(async (license) => {
      const plan = await planForLicense(license);
      const currentLicense = await License.findById(license._id).select({ serverSlots: 1 }).lean();
      return {
        id: license._id, tier: license.value.tier, valid: license.value.valid, plan,
        expiresAt: license.expiresAt ?? null,
        used: currentLicense?.serverSlots ?? 0,
        limit: license.value.tier === "plus" ? serverLimitForPlan(plan) : 0,
        servers: records.filter((record) => record.licenseId === license._id).map(publicRecord),
      };
    }));
  }, { auth: true, detail: { summary: "List current user's licenses and servers", tags: ["License"] } })
  .post("/servers/:id/:action", async ({ user, params, status }) => {
    if (!["approve", "reject", "remove", "delete"].includes(params.action)) return status(400, { message: "Invalid action" });
    const record = await LicenseServer.findById(params.id);
    if (!record) return status(404, { message: "Server activation not found" });
    const owned = await License.exists({ _id: record.licenseId, ownerId: user.id, "value.tier": "plus" });
    const trialOwned = owned ? null : await PlanAccess.exists({
      userId: user.id,
      trialLicenseCode: record.licenseId,
      trialLicenseExpiresAt: { $gt: new Date() },
    });
    if (!owned && !trialOwned) return status(404, { message: "Server activation not found" });
    if (params.action === "approve") {
      const license = await License.findById(record.licenseId).lean();
      if (!license) return status(404, { message: "License not found" });
      const plan = await planForLicense(license);
      await enforceServerLimit(license._id, serverLimitForPlan(plan));
      const refreshed = await LicenseServer.findById(record._id);
      if (!refreshed || refreshed.state !== "PENDING") {
        return status(409, { message: "The server limit is already full or this request is no longer pending" });
      }
      Object.assign(record, refreshed.toObject());
    }
    if (params.action === "delete") {
      const deleted = await LicenseServer.deleteOne({
        _id: record._id,
        state: { $in: ["REVOKED", "REJECTED", "EXPIRED", "ERROR", "INACTIVE"] },
      });
      if (!deleted.deletedCount) return status(409, { message: "Only closed server connections can be deleted" });
      return { id: record._id, deleted: true };
    }
    const now = new Date();
    if (params.action === "approve" || params.action === "reject") {
      const next = params.action === "approve" ? "ACTIVE" : "REJECTED";
      const updated = await LicenseServer.findOneAndUpdate(
        { _id: record._id, state: "PENDING", expiresAt: { $gt: now } }, { $set: { state: next } }, { new: true },
      );
      if (!updated) {
        if (record.state === "PENDING" && record.expiresAt <= now) {
          const expired = await LicenseServer.updateOne({ _id: record._id, state: "PENDING", expiresAt: { $lte: now } }, { $set: { state: "EXPIRED" } });
          if (expired.modifiedCount) await License.updateOne({ _id: record.licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
        }
        return status(409, { message: "Authorization request is no longer pending" });
      }
      Object.assign(record, updated.toObject());
      if (next === "REJECTED") await License.updateOne({ _id: record.licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
    } else {
      if (["PENDING", "ACTIVE"].includes(record.state)) {
        const updated = await LicenseServer.findOneAndUpdate(
          { _id: record._id, state: { $in: ["PENDING", "ACTIVE"] } }, { $set: { state: "REVOKED" } }, { new: true },
        );
        if (updated) {
          Object.assign(record, updated.toObject());
          await License.updateOne({ _id: record.licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
        } else Object.assign(record, (await LicenseServer.findById(record._id))?.toObject() ?? {});
      }
    }
    return publicRecord(record);
  }, { auth: true, params: z.object({ id: z.string().uuid(), action: z.enum(["approve", "reject", "remove", "delete"]) }), detail: { summary: "Manage an owned server activation", tags: ["License"] } });
