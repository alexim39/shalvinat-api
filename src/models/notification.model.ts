import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", index: true },
    role: { type: String, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    severity: { type: String, enum: ["info", "success", "warning", "critical"], default: "info" },
    link: { type: String, trim: true },
    readAt: { type: Date },
  },
  { timestamps: true },
);

export const Notification = (models.Notification || model("Notification", notificationSchema)) as any;
