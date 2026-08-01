import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const appointmentSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    department: { type: String, required: true, trim: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: "User" },
    type: {
      type: String,
      enum: ["walk_in", "scheduled_opd", "specialist", "antenatal", "immunisation", "follow_up"],
      required: true,
    },
    startsAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["scheduled", "checked_in", "rescheduled", "cancelled", "completed"],
      default: "scheduled",
    },
    reason: { type: String, trim: true },
    reminderSentAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export const Appointment = (models.Appointment || model("Appointment", appointmentSchema)) as any;
