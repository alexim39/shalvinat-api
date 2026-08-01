import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Appointment } from "../models/appointment.model.js";
import { Visit } from "../models/visit.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { makeVisitNumber } from "../utils/ids.js";
import { notFound } from "../utils/http-error.js";
import { nextQueueNumber } from "../utils/sequences.js";

export const visitRouter = Router();

visitRouter.use(requireAuth);

const createVisitSchema = z.object({
  patient: z.string().min(1),
  visitType: z.enum(["opd", "ipd", "emergency", "antenatal", "immunisation"]),
  department: z.string().min(2),
  assignedDoctor: z.string().optional(),
  paymentStatus: z.enum(["pending", "partial", "paid", "hmo", "deferred"]).optional(),
});

const appointmentSchema = z.object({
  patient: z.string().min(1),
  department: z.string().min(2),
  doctor: z.string().optional(),
  type: z.enum(["walk_in", "scheduled_opd", "specialist", "antenatal", "immunisation", "follow_up"]),
  startsAt: z.coerce.date(),
  reason: z.string().optional(),
});

visitRouter.get(
  "/queue",
  requireRoles("reception", "nurse", "doctor"),
  asyncHandler(async (req, res) => {
    const department = String(req.query.department ?? "");
    const status = String(req.query.status ?? "");
    const query: Record<string, unknown> = {
      status: { $in: ["registered", "queued", "triaged", "with_doctor", "investigations", "pharmacy"] },
    };

    if (department) {
      query.department = department;
    }
    if (status) {
      query.status = status;
    }

    const visits = await Visit.find(query)
      .populate("patient", "patientNumber firstName lastName gender dateOfBirth allergies alerts")
      .populate("assignedDoctor", "fullName")
      .sort({ triageLevel: 1, queueNumber: 1, checkInTime: 1 })
      .limit(100)
      .lean();

    res.json({ data: visits });
  }),
);

visitRouter.post(
  "/",
  requireRoles("reception", "nurse"),
  validate({ body: createVisitSchema }),
  asyncHandler(async (req, res) => {
    const paymentStatus = req.body.visitType === "emergency" ? "deferred" : req.body.paymentStatus ?? "pending";
    const visit = await Visit.create({
      ...req.body,
      visitNumber: makeVisitNumber(),
      queueNumber: await nextQueueNumber(req.body.department),
      status: "queued",
      paymentStatus,
      createdBy: req.user?.id,
    });

    res.status(201).json({ data: visit });
  }),
);

visitRouter.patch(
  "/:id/status",
  requireRoles("reception", "nurse", "doctor", "pharmacy", "laboratory", "radiology"),
  validate({
    body: z.object({
      status: z.enum([
        "registered",
        "queued",
        "triaged",
        "with_doctor",
        "investigations",
        "pharmacy",
        "admitted",
        "discharged",
        "deceased",
      ]),
      paymentStatus: z.enum(["pending", "partial", "paid", "hmo", "deferred"]).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await Visit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!visit) {
      throw notFound("Visit not found.");
    }

    res.json({ data: visit });
  }),
);

visitRouter.post(
  "/appointments",
  requireRoles("reception"),
  validate({ body: appointmentSchema }),
  asyncHandler(async (req, res) => {
    const appointment = await Appointment.create({ ...req.body, createdBy: req.user?.id });
    res.status(201).json({ data: appointment });
  }),
);

visitRouter.get(
  "/appointments/today",
  requireRoles("reception", "nurse", "doctor"),
  asyncHandler(async (_req, res) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const appointments = await Appointment.find({ startsAt: { $gte: start, $lt: end } })
      .populate("patient", "patientNumber firstName lastName phone")
      .populate("doctor", "fullName")
      .sort({ startsAt: 1 })
      .lean();

    res.json({ data: appointments });
  }),
);
