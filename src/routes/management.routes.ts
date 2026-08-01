import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Invoice } from "../models/billing.model.js";
import { Asset, Bed, Expense, Staff } from "../models/management.model.js";
import { User } from "../models/user.model.js";
import { ROLES } from "../types.js";
import { asyncHandler } from "../utils/async-handler.js";
import { escapeRegex } from "../utils/case.js";
import { HttpError, forbidden } from "../utils/http-error.js";
import { getPagination, paginationMeta } from "../utils/pagination.js";

export const managementRouter = Router();

managementRouter.use(requireAuth, requireRoles("manager"));

managementRouter.get(
  "/staff",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const search = String(req.query.search ?? "").trim();
    const role = String(req.query.role ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const query: Record<string, unknown> = {};

    if (role) {
      query.role = role;
    }
    if (status) {
      query.status = status;
    }
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      query.$or = [
        { fullName: pattern },
        { email: pattern },
        { phone: pattern },
        { department: pattern },
        { designation: pattern },
        { professionalRegistrationNumber: pattern },
      ];
    }

    const [staff, total] = await Promise.all([
      Staff.find(query)
        .populate("user", "email status roles")
        .sort({ department: 1, fullName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Staff.countDocuments(query),
    ]);

    res.json({ data: staff, pagination: paginationMeta(total, page, limit) });
  }),
);

const staffSchema = z
  .object({
    fullName: z.string().min(2),
    role: z.enum(ROLES),
    email: z.email().optional(),
    phone: z.string().optional(),
    department: z.string().min(2),
    designation: z.string().optional(),
    qualification: z.string().optional(),
    professionalRegistrationNumber: z.string().optional(),
    employmentType: z.enum(["full_time", "part_time", "contract", "locum"]),
    startDate: z.coerce.date(),
    leaveBalanceDays: z.number().default(0),
    createPlatformUser: z.boolean().default(false),
    password: z.string().min(8).optional(),
    mustChangePassword: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (!data.createPlatformUser) {
      return;
    }

    if (!data.email) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Email is required when platform access is enabled.",
      });
    }

    if (!data.password) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Temporary password is required when platform access is enabled.",
      });
    }
  });

managementRouter.post(
  "/staff",
  validate({ body: staffSchema }),
  asyncHandler(async (req, res) => {
    const {
      createPlatformUser,
      password,
      mustChangePassword,
      email,
      role,
      fullName,
      phone,
      department,
      designation,
      ...staffFields
    } = req.body;

    let userId: unknown;
    if (createPlatformUser) {
      if (role === "director" && !req.user?.roles.includes("director")) {
        throw forbidden("Only a director can create another director platform account.");
      }

      const normalizedEmail = email.toLowerCase();
      const existing = await User.exists({ email: normalizedEmail });
      if (existing) {
        throw new HttpError(409, "A platform user already exists with this email address.");
      }

      const user = await User.create({
        fullName,
        email: normalizedEmail,
        phone,
        department,
        designation,
        roles: [role],
        passwordHash: await bcrypt.hash(password ?? "", env.BCRYPT_ROUNDS),
        status: "active",
        mustChangePassword,
        twoFactorEnabled: false,
      });
      userId = user._id;
    }

    const staff = await Staff.create({
      ...staffFields,
      role,
      fullName,
      phone,
      email: email?.toLowerCase(),
      department,
      designation,
      user: userId,
      platformAccessEnabled: Boolean(userId),
    });
    res.status(201).json({ data: staff });
  }),
);

managementRouter.patch(
  "/staff/:id/status",
  validate({
    body: z.object({
      status: z.enum(["active", "on_leave", "inactive"]),
      disablePlatformAccess: z.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const staff: any = await Staff.findById(req.params.id);
    if (!staff) {
      throw new HttpError(404, "Staff record not found.");
    }

    const isDirector = Boolean(req.user?.roles.includes("director"));
    if ((req.body.status === "inactive" || staff.status === "inactive") && !isDirector) {
      throw forbidden("Only a director can deactivate or reactivate inactive staff.");
    }

    staff.status = req.body.status;
    await staff.save();

    if (staff.user && req.body.status === "inactive" && req.body.disablePlatformAccess) {
      await User.findByIdAndUpdate(staff.user, { status: "inactive" });
      staff.platformAccessEnabled = false;
      await staff.save();
    }

    if (staff.user && req.body.status === "active") {
      await User.findByIdAndUpdate(staff.user, { status: "active" });
      staff.platformAccessEnabled = true;
      await staff.save();
    }

    await staff.populate("user", "email status roles");
    res.json({ data: staff });
  }),
);

managementRouter.get(
  "/expenses",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req, 25, 100);
    const search = String(req.query.search ?? "").trim();
    const category = String(req.query.category ?? "").trim();
    const query: Record<string, unknown> = {};

    if (category) {
      query.category = category;
    }
    if (search) {
      query.description = new RegExp(escapeRegex(search), "i");
    }

    const [expenses, total] = await Promise.all([
      Expense.find(query).sort({ incurredAt: -1 }).skip(skip).limit(limit).lean(),
      Expense.countDocuments(query),
    ]);

    res.json({ data: expenses, pagination: paginationMeta(total, page, limit) });
  }),
);

managementRouter.post(
  "/expenses",
  validate({
    body: z.object({
      category: z.enum([
        "salaries",
        "drugs_consumables",
        "utilities",
        "maintenance",
        "vendor_payment",
        "miscellaneous",
      ]),
      description: z.string().min(2),
      amount: z.number().min(0),
      incurredAt: z.coerce.date(),
      receiptUrl: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const expense = await Expense.create({ ...req.body, recordedBy: req.user?.id });
    res.status(201).json({ data: expense });
  }),
);

managementRouter.get(
  "/beds",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req, 25, 100);
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      query.$or = [{ ward: pattern }, { bedNumber: pattern }, { category: pattern }];
    }

    const [beds, total] = await Promise.all([
      Bed.find(query)
      .populate("currentPatient", "patientNumber firstName lastName")
      .sort({ ward: 1, bedNumber: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Bed.countDocuments(query),
    ]);

    res.json({ data: beds, pagination: paginationMeta(total, page, limit) });
  }),
);

managementRouter.post(
  "/beds",
  validate({
    body: z.object({
      ward: z.string().min(1),
      bedNumber: z.string().min(1),
      category: z.enum(["general", "private", "semi_private", "icu", "maternity", "paediatric"]),
      status: z.enum(["vacant", "occupied", "under_cleaning", "reserved", "maintenance"]).default("vacant"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const bed = await Bed.create(req.body);
    res.status(201).json({ data: bed });
  }),
);

managementRouter.get(
  "/assets",
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req, 25, 100);
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    const query: Record<string, unknown> = {};

    if (status) {
      query.status = status;
    }
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      query.$or = [{ name: pattern }, { category: pattern }, { location: pattern }, { serialNumber: pattern }];
    }

    const [assets, total] = await Promise.all([
      Asset.find(query).sort({ location: 1, name: 1 }).skip(skip).limit(limit).lean(),
      Asset.countDocuments(query),
    ]);

    res.json({ data: assets, pagination: paginationMeta(total, page, limit) });
  }),
);

managementRouter.post(
  "/assets",
  validate({
    body: z.object({
      name: z.string().min(2),
      category: z.string().min(2),
      location: z.string().min(2),
      serialNumber: z.string().optional(),
      purchaseDate: z.coerce.date().optional(),
      warrantyExpiry: z.coerce.date().optional(),
      status: z.enum(["active", "maintenance", "retired"]).default("active"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const asset = await Asset.create(req.body);
    res.status(201).json({ data: asset });
  }),
);

managementRouter.get(
  "/financial-summary",
  asyncHandler(async (_req, res) => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const [revenue, expenses] = await Promise.all([
      Invoice.aggregate([
        { $match: { createdAt: { $gte: start }, status: { $in: ["paid", "partial"] } } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } },
      ]),
      Expense.aggregate([
        { $match: { incurredAt: { $gte: start } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const grossRevenue = revenue[0]?.total ?? 0;
    const totalExpenses = expenses[0]?.total ?? 0;

    res.json({
      data: {
        grossRevenue,
        totalExpenses,
        netPosition: grossRevenue - totalExpenses,
      },
    });
  }),
);
