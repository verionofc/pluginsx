import { Schema, model } from "mongoose";
import { serverIconIds, type ServerIconId } from "../../domain/server-profile.js";

export type ActivationState = "PENDING" | "ACTIVE" | "INACTIVE" | "REJECTED" | "EXPIRED" | "REVOKED" | "ERROR";

export interface LicenseServerInterface {
  _id: string;
  licenseId: string;
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
}

const LicenseServerSchema = new Schema<LicenseServerInterface>({
  _id: { type: String, required: true },
  licenseId: { type: String, required: true, index: true },
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
  state: { type: String, enum: ["PENDING", "ACTIVE", "INACTIVE", "REJECTED", "EXPIRED", "REVOKED", "ERROR"], required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  lastValidatedAt: Date,
});
LicenseServerSchema.index({ licenseId: 1, serverId: 1 }, { unique: true });

export const LicenseServer = model<LicenseServerInterface>("license_server", LicenseServerSchema);
