import { Schema, model } from "mongoose";

export type AdminAuditStatus = "pending" | "applied" | "failed";

export interface AdminAuditLogRecord {
  actorUserId: string;
  actorEmail: string;
  targetUserId: string;
  targetEmail: string;
  action: "plan_access_updated";
  status: AdminAuditStatus;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<AdminAuditLogRecord>({
  actorUserId: { type: String, required: true, index: true },
  actorEmail: { type: String, required: true },
  targetUserId: { type: String, required: true, index: true },
  targetEmail: { type: String, required: true },
  action: { type: String, enum: ["plan_access_updated"], required: true },
  status: { type: String, enum: ["pending", "applied", "failed"], required: true, index: true },
  before: { type: Schema.Types.Mixed, required: true },
  after: { type: Schema.Types.Mixed, required: true },
  error: { type: String },
}, { timestamps: true });

schema.index({ createdAt: -1 });

export const AdminAuditLog = model<AdminAuditLogRecord>("admin_audit_log", schema);
