import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const patientSchema = new Schema(
  {
    patientNumber: { type: String, required: true, unique: true, index: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, enum: ["male", "female", "other"], required: true },
    maritalStatus: { type: String, trim: true },
    bloodGroup: { type: String, enum: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
    genotype: { type: String, enum: ["AA", "AS", "SS", "AC", "SC"] },
    nationality: { type: String, default: "Nigerian", trim: true },
    stateOfOrigin: { type: String, trim: true },
    lgaOfOrigin: { type: String, trim: true },
    villageOfOrigin: { type: String, trim: true },
    residentialAddress: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    phoneAlt: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    category: {
      type: String,
      enum: ["company", "family", "hmo", "individual"],
      default: "individual",
      index: true,
    },
    nextOfKin: {
      name: { type: String, trim: true },
      relationship: { type: String, trim: true },
      phone: { type: String, trim: true },
      address: { type: String, trim: true },
      stateOfOrigin: { type: String, trim: true },
      lga: { type: String, trim: true },
    },
    hmo: {
      company: { type: String, trim: true },
      plan: { type: String, trim: true },
      idNumber: { type: String, trim: true },
      employerName: { type: String, trim: true },
    },
    allergies: [{ type: String, trim: true }],
    alerts: [{ type: String, trim: true }],
    photoUrl: { type: String, trim: true },
    consent: {
      dataProcessing: { type: Boolean, default: true },
      marketingMessages: { type: Boolean, default: false },
      consentedAt: { type: Date, default: Date.now },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    familyId: { type: Schema.Types.ObjectId, ref: "Patient" },
    organizationName: { type: String, trim: true },
    employerId: { type: String, trim: true },
    billingPolicy: {
      type: String,
      enum: ["individual_billed", "family_billed", "organization_billed"],
      default: "individual_billed",
    },
  },
  { timestamps: true },
);

patientSchema.index({
  patientNumber: "text",
  firstName: "text",
  middleName: "text",
  lastName: "text",
  phone: "text",
  "hmo.idNumber": "text",
});

export const Patient = (models.Patient || model("Patient", patientSchema)) as any;
