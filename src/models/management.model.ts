import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;
import { ROLES } from "../types.js";

const staffSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, lowercase: true, trim: true, index: true },
    phone: { type: String, trim: true },
    department: { type: String, required: true, trim: true, index: true },
    designation: { type: String, trim: true },
    qualification: { type: String, trim: true },
    professionalRegistrationNumber: { type: String, trim: true },
    employmentType: { type: String, enum: ["full_time", "part_time", "contract", "locum"], required: true },
    startDate: { type: Date, required: true },
    status: { type: String, enum: ["active", "on_leave", "inactive"], default: "active" },
    leaveBalanceDays: { type: Number, default: 0 },
    platformAccessEnabled: { type: Boolean, default: false },
    performanceNotes: [{ type: String, trim: true }],
  },
  { timestamps: true },
);

const expenseSchema = new Schema(
  {
    category: {
      type: String,
      enum: ["salaries", "drugs_consumables", "utilities", "maintenance", "vendor_payment", "miscellaneous"],
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    incurredAt: { type: Date, required: true, index: true },
    receiptUrl: { type: String, trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const bedSchema = new Schema(
  {
    ward: { type: String, required: true, trim: true, index: true },
    bedNumber: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["general", "private", "semi_private", "icu", "maternity", "paediatric"],
      required: true,
    },
    status: {
      type: String,
      enum: ["vacant", "occupied", "under_cleaning", "reserved", "maintenance"],
      default: "vacant",
      index: true,
    },
    currentPatient: { type: Schema.Types.ObjectId, ref: "Patient" },
    currentVisit: { type: Schema.Types.ObjectId, ref: "Visit" },
    admittingDoctor: { type: Schema.Types.ObjectId, ref: "User" },
    admittedAt: { type: Date },
    reservationExpiresAt: { type: Date },
    reservedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

const assetSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    serialNumber: { type: String, trim: true },
    purchaseDate: { type: Date },
    warrantyExpiry: { type: Date },
    status: { type: String, enum: ["active", "maintenance", "retired"], default: "active" },
  },
  { timestamps: true },
);

export const Staff = (models.Staff || model("Staff", staffSchema)) as any;
export const Expense = (models.Expense || model("Expense", expenseSchema)) as any;
export const Bed = (models.Bed || model("Bed", bedSchema)) as any;
export const Asset = (models.Asset || model("Asset", assetSchema)) as any;
