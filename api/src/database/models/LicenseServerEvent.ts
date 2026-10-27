import { Schema, model } from "mongoose";
const schema = new Schema({
  serverRecordId: { type: String, required: true, index: true },
  licenseRef: { type: String, required: true },
  action: { type: String, required: true },
  actorId: { type: String, default: null },
  requestId: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});
schema.index(
  { requestId: 1 },
  { unique: true, partialFilterExpression: { requestId: { $type: "string" } } },
);
schema.index({ serverRecordId: 1, createdAt: -1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const LicenseServerEvent = model("license_server_event", schema);
const nonceSchema = new Schema({
  fingerprint: { type: String, required: true },
  nonce: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});
nonceSchema.index({ fingerprint: 1, nonce: 1 }, { unique: true });
nonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const LicenseRequestNonce = model("license_request_nonce", nonceSchema);
const privacySchema = new Schema({
  serverRecordId: { type: String, required: true, unique: true },
  subjectUuid: String,
  encryptedIp: { type: String, required: true },
  collectedAt: { type: Date, default: Date.now },
  maskedIp: { type: String, required: true },
  location: { type: Schema.Types.Mixed, default: null },
  consentVersion: Number,
  consentedAt: Date,
  expiresAt: { type: Date, required: true },
});
privacySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const LicenseServerPrivacy = model(
  "license_server_privacy",
  privacySchema,
);

// Minimal anti-replay receipts outlive the display history and contain no actor or IP.
const receiptSchema = new Schema({
  requestId: { type: String, required: true, unique: true },
  serverRecordId: { type: String, required: true },
  licenseRef: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
export const LicenseActivationReceipt = model(
  "license_activation_receipt",
  receiptSchema,
);
