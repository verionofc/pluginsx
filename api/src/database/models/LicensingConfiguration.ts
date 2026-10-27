import { Schema, model } from "mongoose";
import type { LicensingConfig } from "../../domain/licensing-config.js";
const schema = new Schema<
  LicensingConfig & {
    _id: string;
    ownershipMigratedAt?: string;
    privacyWriteRevision?: number;
  }
>(
  {
    _id: String,
    version: { type: Number, required: true },
    serverSlot: Schema.Types.Mixed,
    plans: { type: Schema.Types.Mixed, required: true },
    policy: { type: Schema.Types.Mixed, required: true },
    updatedAt: String,
    migratedAt: String,
    ownershipMigratedAt: String,
    privacyWriteRevision: { type: Number, default: 0 },
  },
  { versionKey: false },
);
export const LicensingConfiguration = model("licensing_configuration", schema);
const revisionSchema = new Schema({
  version: { type: Number, required: true, unique: true },
  resource: { type: String, required: true },
  actorUserId: { type: String, required: true },
  reason: { type: String, required: true },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  providerStrategy: { type: String, default: "new_contracts_only" },
  providerStatus: { type: String, default: "awaiting_checkout" },
  createdAt: { type: Date, default: Date.now },
});
revisionSchema.index({ createdAt: -1 });
export const LicensingRevision = model("licensing_revision", revisionSchema);
