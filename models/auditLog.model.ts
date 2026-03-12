import { Schema, type Connection, type Model } from "mongoose";
import { getDocumentDbConnection } from "../db/maindb";

const auditChangeSchema = new Schema(
  {
    field: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    operation: {
      type: String,
      enum: ["create", "update", "delete", "append", "remove", "unknown"],
      default: "unknown",
    },
  },
  { _id: false },
);

const auditRequestSchema = new Schema(
  {
    method: { type: String, required: true },
    path: { type: String, required: true },
    statusCode: { type: Number, required: true },
    ip: { type: String },
    userAgent: { type: String },
    requestId: { type: String },
    durationMs: { type: Number, required: true },
  },
  { _id: false },
);

const auditLogSchema = new Schema(
  {
    action: { type: String, required: true, index: true },
    eventType: { type: String, default: "generic", index: true },
    success: { type: Boolean, required: true, index: true },
    errorMessage: { type: String },

    actor: {
      id: { type: String, index: true },
      type: { type: String, default: "user", index: true }, 
      role: { type: String, index: true },
      email: { type: String },
    },

    resource: {
      id: { type: String, index: true },
      type: { type: String, index: true }, 
      collection: { type: String },
    },

    request: { type: auditRequestSchema, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    changes: { type: [auditChangeSchema], default: [] },
    tags: { type: [String], default: [] },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    strict: true,
    minimize: false,
  },
);

export type AuditChange = {
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  operation?: "create" | "update" | "delete" | "append" | "remove" | "unknown";
};

export type AuditActor = {
  id?: string;
  type?: string;
  role?: string;
  email?: string;
};

export type AuditResource = {
  id?: string;
  type?: string;
  collection?: string;
};

export type AuditRequest = {
  method: string;
  path: string;
  statusCode: number;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  durationMs: number;
};

export type AuditLogInput = {
  action: string;
  eventType?: string;
  success: boolean;
  errorMessage?: string;
  actor?: AuditActor;
  resource?: AuditResource;
  request: AuditRequest;
  metadata?: Record<string, unknown>;
  changes?: AuditChange[];
  tags?: string[];
};

export type AuditLogDocument = AuditLogInput & {
  _id: unknown;
  createdAt: Date;
};

export function getAuditLogModel(connection?: Connection): Model<AuditLogDocument> {
  const db = connection ?? getDocumentDbConnection();

  return (db.models.AuditLog as Model<AuditLogDocument>) ||
    db.model<AuditLogDocument>("AuditLog", auditLogSchema, "audit_logs");
}
