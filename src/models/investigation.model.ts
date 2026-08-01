import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const labResultSchema = new Schema(
  {
    analyte: { type: String, required: true, trim: true },
    value: { type: String, required: true, trim: true },
    unit: { type: String, trim: true },
    referenceRange: { type: String, trim: true },
    flag: { type: String, enum: ["normal", "high", "low", "critical"], default: "normal" },
  },
  { _id: false },
);

const labRequestSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tests: [{ type: String, required: true, trim: true }],
    discipline: {
      type: String,
      enum: ["haematology", "chemistry", "microbiology", "serology", "urinalysis", "histology"],
      required: true,
      index: true,
    },
    urgency: { type: String, enum: ["routine", "urgent", "stat"], default: "routine", index: true },
    specimenType: { type: String, trim: true },
    clinicalNotes: { type: String, trim: true },
    sampleCode: { type: String, unique: true, sparse: true },
    sampleCollectedAt: { type: Date },
    sampleCollectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    sampleCondition: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    results: [labResultSchema],
    technicalValidatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    technicalValidatedAt: { type: Date },
    authorizedBy: { type: Schema.Types.ObjectId, ref: "User" },
    authorizedAt: { type: Date },
    criticalAcknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    criticalAcknowledgedAt: { type: Date },
    resultFiles: [
      {
        fileName: { type: String, required: true },
        originalName: { type: String, required: true },
        fileType: { type: String, required: true },
        fileSize: { type: Number, required: true },
        storagePath: { type: String, required: true },
        uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        uploadedAt: { type: Date, default: Date.now },
        summary: { type: String, trim: true },
        released: { type: Boolean, default: false },
        releasedAt: { type: Date },
      },
    ],
    status: {
      type: String,
      enum: ["ordered", "sample_collected", "processing", "validated", "authorized", "rejected", "reviewed"],
      default: "ordered",
      index: true,
    },
  },
  { timestamps: true },
);

const imagingRequestSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    modality: { type: String, enum: ["xray", "ultrasound", "ecg", "echocardiography"], required: true },
    bodyRegion: { type: String, required: true, trim: true },
    clinicalIndication: { type: String, required: true, trim: true },
    urgency: { type: String, enum: ["routine", "urgent", "stat"], default: "routine", index: true },
    assignedTechnician: { type: Schema.Types.ObjectId, ref: "User" },
    suite: { type: String, trim: true },
    performedAt: { type: Date },
    radiationDose: { type: String, trim: true },
    preparationNotes: { type: String, trim: true },
    imageUrls: [{ type: String, trim: true }],
    reportText: { type: String, trim: true },
    reportUrl: { type: String, trim: true },
    resultFiles: [
      {
        fileName: { type: String, required: true },
        originalName: { type: String, required: true },
        fileType: { type: String, required: true },
        fileSize: { type: Number, required: true },
        storagePath: { type: String, required: true },
        uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
        uploadedAt: { type: Date, default: Date.now },
        summary: { type: String, trim: true },
        released: { type: Boolean, default: false },
        releasedAt: { type: Date },
      },
    ],
    urgentFinding: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["ordered", "scheduled", "performed", "reported", "reviewed", "cancelled"],
      default: "ordered",
      index: true,
    },
  },
  { timestamps: true },
);

export const LabRequest = (models.LabRequest || model("LabRequest", labRequestSchema)) as any;
export const ImagingRequest = (models.ImagingRequest || model("ImagingRequest", imagingRequestSchema)) as any;
