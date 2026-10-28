import { Schema, model } from "mongoose";
import type { ActivationActor } from "../../domain/activation.js";
import {
  operationKinds,
  operationStatuses,
  remoteStates,
  type Capabilities,
  type Documents,
  type OperationKind,
  type OperationStatus,
  type RemoteState,
} from "../../domain/remote-spawnerx.js";

export interface RemoteSessionRecord {
  _id: string;
  sessionId: string;
  ownerId: string;
  licenseId: string;
  state: RemoteState;
  actor: ActivationActor;
  code: string;
  tokenHash?: string | undefined;
  confirmationHash?: string | undefined;
  requestedAt: Date;
  approvalExpiresAt: Date;
  expiresAt: Date;
  hardExpiresAt: Date;
  lastSeenAt: Date;
  leaseExpiresAt: Date;
  authorizedBy?: { userId: string; name: string };
  authorizedAt?: Date;
  connectedAt?: Date;
  closedAt?: Date | undefined;
  revision: number;
  configHash?: string;
  documents?: Documents;
  capabilities?: Capabilities;
  capturedAt?: Date;
  uptimeSeconds?: number;
  draftId?: string | undefined;
}
const sessionSchema = new Schema<RemoteSessionRecord>({
  _id: String,
  sessionId: { type: String, required: true, unique: true },
  ownerId: { type: String, required: true, index: true },
  licenseId: { type: String, required: true },
  state: { type: String, required: true, enum: remoteStates },
  actor: { type: Schema.Types.Mixed, required: true },
  code: { type: String, required: true },
  tokenHash: { type: String, select: false },
  confirmationHash: { type: String, select: false },
  requestedAt: { type: Date, required: true },
  approvalExpiresAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  hardExpiresAt: { type: Date, required: true },
  lastSeenAt: { type: Date, required: true },
  leaseExpiresAt: { type: Date, required: true },
  authorizedBy: Schema.Types.Mixed,
  authorizedAt: Date,
  connectedAt: Date,
  closedAt: Date,
  revision: { type: Number, default: 0 },
  configHash: String,
  documents: Schema.Types.Mixed,
  capabilities: Schema.Types.Mixed,
  capturedAt: Date,
  uptimeSeconds: Number,
  draftId: String,
});
sessionSchema.index({ state: 1, leaseExpiresAt: 1 });
export const RemoteSession = model<RemoteSessionRecord>(
  "remote_spawnerx_session",
  sessionSchema,
);

export interface RemoteRevisionRecord {
  _id: string;
  serverRecordId: string;
  sessionId: string;
  ownerId: string;
  actorId: string | null;
  documents: Documents;
  baseHash: string;
  resultingHash?: string;
  status: string;
  createdAt: Date;
  operationId?: string;
}
const revisionSchema = new Schema<RemoteRevisionRecord>({
  _id: String,
  serverRecordId: { type: String, required: true },
  sessionId: { type: String, required: true },
  ownerId: { type: String, required: true },
  actorId: { type: String, default: null },
  documents: { type: Schema.Types.Mixed, required: true },
  baseHash: { type: String, required: true },
  resultingHash: String,
  status: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  operationId: String,
});
revisionSchema.index({ serverRecordId: 1, createdAt: -1 });
export const RemoteRevision = model<RemoteRevisionRecord>(
  "remote_spawnerx_revision",
  revisionSchema,
);

export interface RemoteOperationRecord {
  _id: string;
  serverRecordId: string;
  sessionId: string;
  ownerId: string;
  actorId: string;
  kind: OperationKind;
  status: OperationStatus;
  busy: boolean;
  expectedHash: string;
  documents?: Documents;
  revisionId?: string;
  message: string;
  createdAt: Date;
  expiresAt: Date;
  sentAt?: Date;
  completedAt?: Date;
  backupId?: string;
  acknowledgedStatus?: string;
  resultHash?: string;
}
const operationSchema = new Schema<RemoteOperationRecord>({
  _id: String,
  serverRecordId: { type: String, required: true },
  sessionId: { type: String, required: true },
  ownerId: { type: String, required: true },
  actorId: { type: String, required: true },
  kind: { type: String, enum: operationKinds, required: true },
  status: { type: String, enum: operationStatuses, required: true },
  busy: { type: Boolean, required: true },
  expectedHash: { type: String, required: true },
  documents: Schema.Types.Mixed,
  revisionId: String,
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  sentAt: Date,
  completedAt: Date,
  backupId: String,
  acknowledgedStatus: String,
  resultHash: String,
});
operationSchema.index(
  { serverRecordId: 1, busy: 1 },
  { unique: true, partialFilterExpression: { busy: true } },
);
operationSchema.index({ serverRecordId: 1, createdAt: -1 });
export const RemoteOperation = model<RemoteOperationRecord>(
  "remote_spawnerx_operation",
  operationSchema,
);
