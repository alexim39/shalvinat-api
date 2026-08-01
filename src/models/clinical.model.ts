import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const encryptedTextSchema = new Schema(
  {
    iv: { type: String },
    tag: { type: String },
    value: { type: String },
  },
  { _id: false },
);

const diagnosisSchema = new Schema(
  {
    code: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    type: { type: String, enum: ["primary", "secondary", "differential"], default: "primary" },
  },
  { _id: false },
);

const clinicalNoteSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    subjective: { type: String, required: true, trim: true },
    objective: { type: String, required: true, trim: true },
    assessmentEncrypted: encryptedTextSchema,
    diagnoses: [diagnosisSchema],
    plan: { type: String, required: true, trim: true },
    reviewOfSystems: { type: String, trim: true },
    physicalExam: { type: String, trim: true },
    lockedAt: { type: Date },
    patientCurrentStatus: {
      type: String,
      enum: ["active_inpatient", "ready_for_discharge", "discharged", "deceased", "transferred"],
    },
    doctorStatusTimestamp: { type: Date },
    doctorStatusReason: { type: String, trim: true },
  },
  { timestamps: true },
);

export const ClinicalNote = (models.ClinicalNote || model("ClinicalNote", clinicalNoteSchema)) as any;
