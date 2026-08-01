import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Bed } from "../models/management.model.js";
import { Visit } from "../models/visit.model.js";
import { Notification } from "../models/notification.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { escapeRegex } from "../utils/case.js";
import { HttpError, forbidden, notFound } from "../utils/http-error.js";
import { getPagination, paginationMeta } from "../utils/pagination.js";

export const bedRouter = Router();

bedRouter.use(requireAuth);

bedRouter.get(
  "/",
  requireRoles("nurse", "doctor", "manager", "accountant", "accounts_manager", "reception"),
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
        .populate("currentPatient", "patientNumber firstName lastName photoUrl")
        .populate("admittingDoctor", "fullName")
        .populate("reservedBy", "fullName")
        .sort({ ward: 1, bedNumber: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Bed.countDocuments(query),
    ]);

    res.json({ data: beds, pagination: paginationMeta(total, page, limit) });
  }),
);

const allocateBedSchema = z.object({
  visit_id: z.string().min(1),
  bed_id: z.string().min(1),
  reason: z.string().min(2).optional(),
});

bedRouter.post(
  "/allocate",
  requireRoles("doctor"),
  validate({ body: allocateBedSchema }),
  asyncHandler(async (req, res) => {
    const bed: any = await Bed.findById(req.body.bed_id);
    if (!bed) throw notFound("Bed not found.");

    if (bed.status !== "vacant") {
      throw new HttpError(409, `Bed is not available. Current status: ${bed.status}.`);
    }

    const visit: any = await Visit.findById(req.body.visit_id)
      .populate("patient", "firstName lastName");
    if (!visit) throw notFound("Visit not found.");

    const now = new Date();
    bed.status = "occupied";
    bed.currentPatient = visit.patient?._id ?? visit.patient;
    bed.currentVisit = visit._id;
    bed.admittingDoctor = req.user?.id;
    bed.admittedAt = now;
    bed.reservedBy = undefined;
    bed.reservationExpiresAt = undefined;
    await bed.save();

    if (!visit.admission) {
      visit.admission = {};
    }
    visit.admission.ward = bed.ward;
    visit.admission.bed = bed._id;
    visit.admission.admittedAt = now;
    visit.status = "admitted";
    visit.visitType = "ipd";
    await visit.save();

    await Notification.create({
      role: "nurse",
      title: "Patient Admitted",
      message: `${visit.patient?.firstName ?? "Patient"} ${visit.patient?.lastName ?? ""} admitted to ${bed.ward} bed ${bed.bedNumber} by Dr. ${req.user?.fullName}.`,
      severity: "info",
      link: `/nursing?visit=${visit._id}`,
    });

    res.json({ data: bed });
  }),
);

const reserveBedSchema = z.object({
  visit_id: z.string().min(1),
  bed_id: z.string().min(1),
});

bedRouter.post(
  "/reserve",
  requireRoles("reception", "nurse"),
  validate({ body: reserveBedSchema }),
  asyncHandler(async (req, res) => {
    const bed: any = await Bed.findById(req.body.bed_id);
    if (!bed) throw notFound("Bed not found.");

    if (bed.status !== "vacant") {
      throw new HttpError(409, `Bed is not available for reservation. Current status: ${bed.status}.`);
    }

    const visit: any = await Visit.findById(req.body.visit_id);
    if (!visit) throw notFound("Visit not found.");

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    bed.status = "reserved";
    bed.currentVisit = visit._id;
    bed.reservedBy = req.user?.id;
    bed.reservationExpiresAt = expiresAt;
    await bed.save();

    res.json({
      data: bed,
      meta: { reservation_expires_at: expiresAt.toISOString(), expiry_window: "1 hour" },
    });
  }),
);
