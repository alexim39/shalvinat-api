import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Staff } from "../models/management.model.js";
import { SystemSetting } from "../models/system-setting.model.js";
import { User } from "../models/user.model.js";
import { ROLES } from "../types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { escapeRegex } from "../utils/case.js";
import { notFound } from "../utils/http-error.js";
import { getPagination, paginationMeta } from "../utils/pagination.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRoles("director"));

const userSchema = z.object({
  fullName: z.string().min(2),
  email: z.email(),
  phone: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  roles: z.array(z.enum(ROLES)).min(1),
  password: z.string().min(8).optional(),
  status: z.enum(["active", "inactive", "suspended", "locked"]).default("active"),
  mustChangePassword: z.boolean().default(true),
  twoFactorEnabled: z.boolean().default(false),
  createStaffRecord: z.boolean().default(false),
  employmentType: z.enum(["full_time", "part_time", "contract", "locum"]).optional(),
  startDate: z.coerce.date().optional(),
  leaveBalanceDays: z.number().optional(),
  qualification: z.string().optional(),
  professionalRegistrationNumber: z.string().optional(),
});

adminRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const search = String(req.query.search ?? "").trim();
    const role = String(req.query.role ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const query: Record<string, unknown> = {};

    if (role) {
      query.roles = role;
    }
    if (status) {
      query.status = status;
    }
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      query.$or = [{ fullName: pattern }, { email: pattern }, { phone: pattern }, { department: pattern }];
    }

    const [users, total] = await Promise.all([
      User.find(query).sort({ fullName: 1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(query),
    ]);

    res.json({ data: users, pagination: paginationMeta(total, page, limit) });
  }),
);

adminRouter.post(
  "/users",
  validate({ body: userSchema.extend({ password: z.string().min(8) }) }),
  asyncHandler(async (req, res) => {
    const {
      password,
      createStaffRecord,
      employmentType,
      startDate,
      leaveBalanceDays,
      qualification,
      professionalRegistrationNumber,
      ...userBody
    } = req.body;

    const user = await User.create({
      ...userBody,
      email: userBody.email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    });

    if (createStaffRecord) {
      await Staff.findOneAndUpdate(
        { user: user._id },
        {
          user: user._id,
          fullName: user.fullName,
          role: user.roles[0],
          email: user.email,
          phone: user.phone,
          department: user.department || "Administration",
          designation: user.designation,
          qualification,
          professionalRegistrationNumber,
          employmentType: employmentType ?? "full_time",
          startDate: startDate ?? new Date(),
          leaveBalanceDays: leaveBalanceDays ?? 0,
          platformAccessEnabled: true,
          status: user.status === "active" ? "active" : "inactive",
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    }

    res.status(201).json({ data: user });
  }),
);

adminRouter.patch(
  "/users/:id",
  validate({ body: userSchema.partial() }),
  asyncHandler(async (req, res) => {
    const {
      password,
      createStaffRecord,
      employmentType,
      startDate,
      leaveBalanceDays,
      qualification,
      professionalRegistrationNumber,
      ...userUpdate
    } = req.body;
    const update: Record<string, unknown> = { ...userUpdate };

    if (userUpdate.email) {
      update.email = userUpdate.email.toLowerCase();
    }

    if (password) {
      update.passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
    }

    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!user) {
      throw notFound("User not found.");
    }

    if (createStaffRecord) {
      await Staff.findOneAndUpdate(
        { user: user._id },
        {
          user: user._id,
          fullName: user.fullName,
          role: user.roles[0],
          email: user.email,
          phone: user.phone,
          department: user.department || "Administration",
          designation: user.designation,
          qualification,
          professionalRegistrationNumber,
          employmentType: employmentType ?? "full_time",
          startDate: startDate ?? new Date(),
          leaveBalanceDays: leaveBalanceDays ?? 0,
          platformAccessEnabled: true,
          status: user.status === "active" ? "active" : "inactive",
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    }

    res.json({ data: user });
  }),
);

adminRouter.patch(
  "/users/:id/unlock",
  asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: "active", failedLoginAttempts: 0, $unset: { lockedUntil: "" } },
      { new: true },
    );
    if (!user) {
      throw notFound("User not found.");
    }

    res.json({ data: user });
  }),
);

adminRouter.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const settings = await SystemSetting.find().sort({ key: 1 }).lean();
    res.json({ data: settings });
  }),
);

adminRouter.put(
  "/settings/:key",
  validate({ body: z.object({ value: z.unknown() }) }),
  asyncHandler(async (req, res) => {
    const setting = await SystemSetting.findOneAndUpdate(
      { key: req.params.key },
      { value: req.body.value, updatedBy: req.user?.id },
      { new: true, upsert: true },
    );

    res.json({ data: setting });
  }),
);
