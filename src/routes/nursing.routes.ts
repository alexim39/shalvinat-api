import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Notification } from "../models/notification.model.js";
import {
  FluidBalance,
  MedicationAdministration,
  NursingNote,
  TriageRecord,
  VitalSign,
} from "../models/nursing.model.js";
import { Visit } from "../models/visit.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { calculateBmi, detectVitalFlags } from "../utils/clinical-calculators.js";
import { notFound } from "../utils/http-error.js";

export const nursingRouter = Router();

nursingRouter.use(requireAuth);

async function loadVisit(visitId: string) {
  const visit: any = await Visit.findById(visitId).populate("patient", "patientNumber firstName lastName allergies alerts");
  if (!visit) {
    throw notFound("Visit not found.");
  }
  return visit;
}

nursingRouter.get(
  "/worklist",
  requireRoles("nurse"),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "");
    const query: Record<string, unknown> = status
      ? { status }
      : { status: { $in: ["queued", "triaged", "admitted"] } };

    const visits = await Visit.find(query)
      .populate("patient", "patientNumber firstName lastName gender dateOfBirth allergies alerts")
      .populate("assignedDoctor", "fullName")
      .sort({ queueNumber: 1, checkInTime: 1 })
      .limit(100)
      .lean();

    res.json({ data: visits });
  }),
);

nursingRouter.post(
  "/visits/:visitId/triage",
  requireRoles("nurse"),
  validate({
    body: z.object({
      category: z.enum(["resuscitation", "emergent", "urgent", "less_urgent", "non_urgent"]),
      presentingComplaint: z.string().min(2),
      notes: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const escalated = ["resuscitation", "emergent"].includes(req.body.category);

    const triage = await TriageRecord.create({
      ...req.body,
      escalated,
      visit: visit._id,
      patient: visit.patient._id,
      recordedBy: req.user?.id,
    });

    await Visit.findByIdAndUpdate(visit._id, {
      status: "triaged",
      triageLevel: req.body.category,
    });

    if (escalated) {
      await Notification.create({
        role: "doctor",
        title: "Emergency triage escalation",
        message: `${visit.patient.patientNumber} requires immediate doctor review.`,
        severity: "critical",
        link: `/doctor?visit=${visit._id}`,
      });
    }

    res.status(201).json({ data: triage });
  }),
);

nursingRouter.post(
  "/visits/:visitId/vitals",
  requireRoles("nurse"),
  validate({
    body: z.object({
      systolicBp: z.number().optional(),
      diastolicBp: z.number().optional(),
      pulse: z.number().optional(),
      temperatureC: z.number().optional(),
      respiratoryRate: z.number().optional(),
      spo2: z.number().optional(),
      randomBloodGlucose: z.number().optional(),
      weightKg: z.number().optional(),
      heightCm: z.number().optional(),
      painScore: z.number().min(0).max(10).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const bmi = calculateBmi(req.body.weightKg, req.body.heightCm);
    const flags = detectVitalFlags(req.body);

    const vitals = await VitalSign.create({
      ...req.body,
      bmi,
      flags,
      visit: visit._id,
      patient: visit.patient._id,
      recordedBy: req.user?.id,
    });

    if (flags.length) {
      await Notification.create({
        role: "doctor",
        title: "Critical vitals flagged",
        message: `${visit.patient.patientNumber}: ${flags.join(", ")}`,
        severity: "critical",
        link: `/doctor?visit=${visit._id}`,
      });
    }

    res.status(201).json({ data: vitals });
  }),
);

nursingRouter.post(
  "/visits/:visitId/notes",
  requireRoles("nurse"),
  validate({
    body: z.object({
      assessment: z.string().min(2),
      diagnoses: z.array(z.string()).default([]),
      goals: z.array(z.string()).default([]),
      interventions: z.array(z.string()).default([]),
      shiftHandover: z.string().optional(),
      fallRiskScore: z.number().optional(),
      pressureUlcerRiskScore: z.number().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const note = await NursingNote.create({
      ...req.body,
      visit: visit._id,
      patient: visit.patient._id,
      recordedBy: req.user?.id,
    });

    res.status(201).json({ data: note });
  }),
);

nursingRouter.post(
  "/visits/:visitId/mar",
  requireRoles("nurse"),
  validate({
    body: z.object({
      prescription: z.string().min(1),
      doseGiven: z.string().min(1),
      route: z.string().min(1),
      administeredAt: z.coerce.date(),
      status: z.enum(["given", "missed", "refused", "held"]).default("given"),
      reason: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const record = await MedicationAdministration.create({
      ...req.body,
      visit: visit._id,
      patient: visit.patient._id,
      administeredBy: req.user?.id,
    });

    res.status(201).json({ data: record });
  }),
);

nursingRouter.post(
  "/visits/:visitId/fluid-balance",
  requireRoles("nurse"),
  validate({
    body: z.object({
      inputMl: z.number().min(0).default(0),
      outputMl: z.number().min(0).default(0),
      source: z.string().optional(),
      route: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const record = await FluidBalance.create({
      ...req.body,
      balanceMl: req.body.inputMl - req.body.outputMl,
      visit: visit._id,
      patient: visit.patient._id,
      recordedBy: req.user?.id,
    });

    res.status(201).json({ data: record });
  }),
);
