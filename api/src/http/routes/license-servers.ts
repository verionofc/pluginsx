import { Elysia } from "elysia";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { License } from "../../database/models/License.js";
import { LicenseServer } from "../../database/models/LicenseServer.js";
import { authSessionPlugin } from "../plugins/better-auth.js";
import { view } from "../plugins/license.js";

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
    const now = new Date();
    const existing = await LicenseServer.findOne({ licenseId, serverId: checked.data.serverId });
    if (existing) {
      if (existing.state === "PENDING" && existing.expiresAt <= now) {
        const expired = await LicenseServer.updateOne({ _id: existing._id, state: "PENDING", expiresAt: { $lte: now } }, { $set: { state: "EXPIRED" } });
        if (expired.modifiedCount) await License.updateOne({ _id: licenseId, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
        Object.assign(existing, (await LicenseServer.findById(existing._id))?.toObject() ?? {});
      } else if (["PENDING", "ACTIVE"].includes(existing.state)) return publicRecord(existing);
    }
    // Atomic reservation ensures parallel requests cannot take slot four.
    const reserved = await License.findOneAndUpdate(
      { _id: licenseId, "value.tier": "plus", "value.valid": true, $or: [{ serverSlots: { $lt: 3 } }, { serverSlots: { $exists: false } }] },
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
    const licenses = await License.find({ ownerId: user.id }).lean();
    const now = new Date();
    for (const license of licenses) {
      const expired = await LicenseServer.find({ licenseId: license._id, state: "PENDING", expiresAt: { $lte: now } }).select({ _id: 1 }).lean();
      for (const item of expired) {
        const changed = await LicenseServer.updateOne({ _id: item._id, state: "PENDING", expiresAt: { $lte: now } }, { $set: { state: "EXPIRED" } });
        if (changed.modifiedCount) await License.updateOne({ _id: license._id, serverSlots: { $gt: 0 } }, { $inc: { serverSlots: -1 } });
      }
    }
    const records = await LicenseServer.find({ licenseId: { $in: licenses.map((item) => item._id) } }).sort({ createdAt: -1 }).lean();
    return licenses.map((license) => ({
      id: license._id, tier: license.value.tier, valid: license.value.valid,
      used: license.serverSlots ?? 0, limit: license.value.tier === "plus" ? 3 : 0,
      servers: records.filter((record) => record.licenseId === license._id).map(publicRecord),
    }));
  }, { auth: true, detail: { summary: "List current user's licenses and servers", tags: ["License"] } })
  .post("/servers/:id/:action", async ({ user, params, status }) => {
    if (params.action !== "approve" && params.action !== "reject" && params.action !== "remove") return status(400, { message: "Invalid action" });
    const record = await LicenseServer.findById(params.id);
    if (!record) return status(404, { message: "Server activation not found" });
    const owned = await License.exists({ _id: record.licenseId, ownerId: user.id, "value.tier": "plus" });
    if (!owned) return status(404, { message: "Server activation not found" });
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
  }, { auth: true, params: z.object({ id: z.string().uuid(), action: z.enum(["approve", "reject", "remove"]) }), detail: { summary: "Approve, reject, or revoke an owned server activation", tags: ["License"] } });
