import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    actorEmail: { type: String, trim: true },
    action: { type: String, required: true, index: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    statusCode: { type: Number, required: true },
    ipAddress: { type: String, trim: true },
    userAgent: { type: String, trim: true },
    requestId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const AuditLog = (models.AuditLog || model("AuditLog", auditLogSchema)) as any;
