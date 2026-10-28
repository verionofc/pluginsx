import type {
  ActivationActor,
  ActivationAuthentication,
} from "../../domain/activation.js";
import { Schema, model } from "mongoose";
import {
  serverIconIds,
  type ServerIconId,
} from "../../domain/server-profile.js";

export type ActivationState =
  | "PENDING"
  | "ACTIVE"
  | "INACTIVE"
  | "REJECTED"
  | "EXPIRED"
  | "REVOKED"
  | "ERROR";

export interface LicenseServerInterface {
  _id: string;
  licenseId: string;
  ownerId?: string;
  licensePlan?: "trial" | "monthly" | "lifetime" | "aether";
  licenseTerms?: import("../../domain/licensing-config.js").PlanTerms;
  licenseExpiresAt?: Date;
  serverId: string;
  name: string;
  displayName?: string;
  tags?: string[];
  icon?: ServerIconId;
  pinned?: boolean;
  minecraftVersion: string;
  implementation: string;
  implementationVersion: string;
  pluginVersion: string;
  state: ActivationState;
  createdAt: Date;
  expiresAt: Date;
  lastValidatedAt?: Date;
  removedAt?: Date;
  protocol?: number;
  activationRequestId?: string;
  publicKey?: string;
  publicKeyFingerprint?: string;
  credentialHash?: string;
  activatedBy?: ActivationActor;
  authentication?: ActivationAuthentication;
  accountVerification?:
    | "VERIFIED"
    | "UNVERIFIED"
    | "UNKNOWN"
    | "NOT_APPLICABLE";
  approvedAt?: Date;
  revokedAt?: Date;
  lastHeartbeatAt?: Date;
  actorCapturedAt?: Date;
  privacyRevision?: number;
  remoteRevision?: number;
}

const LicenseServerSchema = new Schema<LicenseServerInterface>({
  _id: { type: String, required: true },
  licenseId: { type: String, required: true, index: true },
  ownerId: { type: String, index: true },
  licensePlan: String,
  licenseTerms: Schema.Types.Mixed,
  licenseExpiresAt: Date,
  serverId: { type: String, required: true },
  name: { type: String, required: true },
  displayName: { type: String, default: "", maxlength: 100 },
  tags: { type: [{ type: String, maxlength: 24 }], default: [] },
  icon: { type: String, enum: serverIconIds, default: "grass" },
  pinned: { type: Boolean, default: false },
  minecraftVersion: { type: String, required: true },
  implementation: { type: String, required: true },
  implementationVersion: { type: String, required: true },
  pluginVersion: { type: String, required: true },
  state: {
    type: String,
    enum: [
      "PENDING",
      "ACTIVE",
      "INACTIVE",
      "REJECTED",
      "EXPIRED",
      "REVOKED",
      "ERROR",
    ],
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  lastValidatedAt: Date,
  removedAt: Date,
  protocol: Number,
  activationRequestId: String,
  publicKey: String,
  publicKeyFingerprint: String,
  credentialHash: { type: String, select: false },
  activatedBy: Schema.Types.Mixed,
  authentication: Schema.Types.Mixed,
  accountVerification: {
    type: String,
    enum: ["VERIFIED", "UNVERIFIED", "UNKNOWN", "NOT_APPLICABLE"],
  },
  approvedAt: Date,
  revokedAt: Date,
  lastHeartbeatAt: Date,
  actorCapturedAt: Date,
  privacyRevision: { type: Number, default: 0 },
  remoteRevision: { type: Number, default: 0 },
});
LicenseServerSchema.index({ licenseId: 1, serverId: 1 }, { unique: true });

LicenseServerSchema.index(
  { activationRequestId: 1 },
  {
    unique: true,
    partialFilterExpression: { activationRequestId: { $type: "string" } },
  },
);
LicenseServerSchema.index({ state: 1, lastHeartbeatAt: 1 });

export const LicenseServer = model<LicenseServerInterface>(
  "license_server",
  LicenseServerSchema,
);
