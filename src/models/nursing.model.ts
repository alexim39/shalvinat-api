import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const triageRecordSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    category: {
      type: String,
      enum: ["resuscitation", "emergent", "urgent", "less_urgent", "non_urgent"],
      required: true,
    },
    presentingComplaint: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    escalated: { type: Boolean, default: false },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const vitalSignSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    systolicBp: { type: Number, min: 0 },
    diastolicBp: { type: Number, min: 0 },
    pulse: { type: Number, min: 0 },
    temperatureC: { type: Number, min: 20, max: 45 },
    respiratoryRate: { type: Number, min: 0 },
    spo2: { type: Number, min: 0, max: 100 },
    randomBloodGlucose: { type: Number, min: 0 },
    weightKg: { type: Number, min: 0 },
    heightCm: { type: Number, min: 0 },
    bmi: { type: Number, min: 0 },
    painScore: { type: Number, min: 0, max: 10 },
    flags: [{ type: String, trim: true }],
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const nursingNoteSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    framework: { type: String, default: "NANDA" },
    assessment: { type: String, required: true, trim: true },
    diagnoses: [{ type: String, trim: true }],
    goals: [{ type: String, trim: true }],
    interventions: [{ type: String, trim: true }],
    shiftHandover: { type: String, trim: true },
    fallRiskScore: { type: Number },
    pressureUlcerRiskScore: { type: Number },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const medicationAdministrationSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    prescription: { type: Schema.Types.ObjectId, ref: "Prescription", required: true },
    doseGiven: { type: String, required: true, trim: true },
    route: { type: String, required: true, trim: true },
    administeredAt: { type: Date, required: true },
    status: { type: String, enum: ["given", "missed", "refused", "held"], default: "given" },
    reason: { type: String, trim: true },
    administeredBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const fluidBalanceSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    inputMl: { type: Number, default: 0, min: 0 },
    outputMl: { type: Number, default: 0, min: 0 },
    source: { type: String, trim: true },
    route: { type: String, trim: true },
    balanceMl: { type: Number, default: 0 },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export const TriageRecord = (models.TriageRecord || model("TriageRecord", triageRecordSchema)) as any;
export const VitalSign = (models.VitalSign || model("VitalSign", vitalSignSchema)) as any;
export const NursingNote = (models.NursingNote || model("NursingNote", nursingNoteSchema)) as any;
export const MedicationAdministration =
  (models.MedicationAdministration || model("MedicationAdministration", medicationAdministrationSchema)) as any;
export const FluidBalance = (models.FluidBalance || model("FluidBalance", fluidBalanceSchema)) as any;
