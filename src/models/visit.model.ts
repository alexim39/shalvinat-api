import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const visitSchema = new Schema(
  {
    visitNumber: { type: String, required: true, unique: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    visitType: {
      type: String,
      enum: ["opd", "ipd", "emergency", "antenatal", "immunisation"],
      required: true,
      index: true,
    },
    department: { type: String, required: true, trim: true, index: true },
    assignedDoctor: { type: Schema.Types.ObjectId, ref: "User" },
    queueNumber: { type: Number, required: true },
    checkInTime: { type: Date, default: Date.now },
    triageLevel: {
      type: String,
      enum: ["resuscitation", "emergent", "urgent", "less_urgent", "non_urgent"],
    },
    status: {
      type: String,
      enum: [
        "registered",
        "queued",
        "triaged",
        "with_doctor",
        "investigations",
        "pharmacy",
        "admitted",
        "discharged",
        "deceased",
      ],
      default: "registered",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid", "hmo", "deferred"],
      default: "pending",
      index: true,
    },
    billing: {
      totalInvoice: { type: Number, default: 0 },
      amountPaid: { type: Number, default: 0 },
      balance: { type: Number, default: 0 },
    },
    admission: {
      ward: { type: String, trim: true },
      bed: { type: Schema.Types.ObjectId, ref: "Bed" },
      admittingDiagnosis: { type: String, trim: true },
      managementPlan: { type: String, trim: true },
      admittedAt: { type: Date },
      dischargedAt: { type: Date },
      dischargeSummary: { type: String, trim: true },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

visitSchema.index({ department: 1, status: 1, queueNumber: 1 });
visitSchema.index({ patient: 1, createdAt: -1 });

export const Visit = (models.Visit || model("Visit", visitSchema)) as any;
