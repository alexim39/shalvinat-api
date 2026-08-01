import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const systemSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export const SystemSetting = (models.SystemSetting || model("SystemSetting", systemSettingSchema)) as any;
