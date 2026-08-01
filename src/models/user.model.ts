import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;
import { ROLES } from "../types.js";

const userSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    phone: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    roles: [{ type: String, enum: ROLES, required: true }],
    passwordHash: { type: String, required: true, select: false },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended", "locked"],
      default: "active",
      index: true,
    },
    mustChangePassword: { type: Boolean, default: true },
    twoFactorEnabled: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    lastLoginAt: { type: Date },
    refreshTokenHash: { type: String, select: false },
  },
  { timestamps: true },
);

userSchema.index({ roles: 1 });

export const User = (models.User || model("User", userSchema)) as any;
