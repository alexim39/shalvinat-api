import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ClinicalNote } from "../models/clinical.model.js";
import { LabRequest, ImagingRequest } from "../models/investigation.model.js";
import { Notification } from "../models/notification.model.js";
import {
  FluidBalance,
  MedicationAdministration,
  NursingNote,
  TriageRecord,
  VitalSign,
} from "../models/nursing.model.js";
import { Patient } from "../models/patient.model.js";
import { Prescription } from "../models/pharmacy.model.js";
import { Visit } from "../models/visit.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { notFound } from "../utils/http-error.js";
import { encryptText, decryptText } from "../utils/secure-fields.js";

export const clinicalRouter = Router();

clinicalRouter.use(requireAuth);

async function loadVisit(visitId: string) {
  const visit: any = await Visit.findById(visitId).populate("patient");
  if (!visit) {
    throw notFound("Visit not found.");
  }
  return visit;
}

clinicalRouter.get(
  "/worklist",
  requireRoles("doctor"),
  asyncHandler(async (_req, res) => {
    const visits = await Visit.find({ status: { $in: ["triaged", "with_doctor", "investigations"] } })
      .populate("patient", "patientNumber firstName lastName gender dateOfBirth allergies alerts")
      .sort({ triageLevel: 1, queueNumber: 1, checkInTime: 1 })
      .limit(100)
      .lean();

    res.json({ data: visits });
  }),
);

clinicalRouter.get(
  "/visits/:visitId/context",
  requireRoles("doctor"),
  asyncHandler(async (req, res) => {
    const visitId = String(req.params.visitId);
    const visit = await Visit.findById(visitId)
      .populate("patient")
      .populate("assignedDoctor", "fullName")
      .lean();
    if (!visit) {
      throw notFound("Visit not found.");
    }

    const [
      triageRecords,
      vitals,
      nursingNotes,
      medicationAdministrations,
      fluidBalances,
      clinicalNotes,
      prescriptions,
      labRequests,
      imagingRequests,
    ] =
      await Promise.all([
        TriageRecord.find({ visit: visitId }).populate("recordedBy", "fullName").sort({ createdAt: -1 }).lean(),
        VitalSign.find({ visit: visitId }).sort({ createdAt: -1 }).lean(),
        NursingNote.find({ visit: visitId }).populate("recordedBy", "fullName").sort({ createdAt: -1 }).lean(),
        MedicationAdministration.find({ visit: visitId })
          .populate("prescription", "drugName dose frequency route")
          .populate("administeredBy", "fullName")
          .sort({ administeredAt: -1 })
          .lean(),
        FluidBalance.find({ visit: visitId }).populate("recordedBy", "fullName").sort({ createdAt: -1 }).lean(),
        ClinicalNote.find({ visit: visitId }).sort({ createdAt: -1 }).lean(),
        Prescription.find({ visit: visitId }).sort({ createdAt: -1 }).lean(),
        LabRequest.find({ visit: visitId }).sort({ createdAt: -1 }).lean(),
        ImagingRequest.find({ visit: visitId }).sort({ createdAt: -1 }).lean(),
      ]);

    res.json({
      data: {
        visit,
        triageRecords,
        vitals,
        nursingNotes,
        medicationAdministrations,
        fluidBalances,
        clinicalNotes: clinicalNotes.map((note: any) => ({
          ...note,
          assessment: decryptText(note.assessmentEncrypted),
          assessmentEncrypted: undefined,
        })),
        prescriptions,
        labRequests,
        imagingRequests,
      },
    });
  }),
);

clinicalRouter.post(
  "/visits/:visitId/soap",
  requireRoles("doctor"),
  validate({
    body: z.object({
      subjective: z.string().min(2),
      objective: z.string().min(2),
      assessment: z.string().min(2),
      diagnoses: z
        .array(
          z.object({
            code: z.string().optional(),
            description: z.string().min(2),
            type: z.enum(["primary", "secondary", "differential"]).default("primary"),
          }),
        )
        .default([]),
      plan: z.string().min(2),
      reviewOfSystems: z.string().optional(),
      physicalExam: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const note = await ClinicalNote.create({
      ...req.body,
      assessment: undefined,
      assessmentEncrypted: encryptText(req.body.assessment),
      visit: visit._id,
      patient: visit.patient._id,
      doctor: req.user?.id,
    });

    await Visit.findByIdAndUpdate(visit._id, { status: "with_doctor", assignedDoctor: req.user?.id });

    res.status(201).json({
      data: {
        ...note.toObject(),
        assessment: req.body.assessment,
        assessmentEncrypted: undefined,
      },
    });
  }),
);

clinicalRouter.post(
  "/visits/:visitId/prescriptions",
  requireRoles("doctor"),
  validate({
    body: z.object({
      drug: z.string().optional(),
      drugName: z.string().min(2),
      brandName: z.string().optional(),
      dose: z.string().min(1),
      frequency: z.string().min(1),
      route: z.string().min(1),
      duration: z.string().min(1),
      quantity: z.number().min(1),
      specialInstructions: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const patient = await Patient.findById(visit.patient._id).lean();
    const allergies = ((patient as any)?.allergies ?? []) as string[];
    const interactionFlags = allergies.some((allergy) =>
      req.body.drugName.toLowerCase().includes(allergy.toLowerCase()),
    )
      ? [`Possible allergy match: ${req.body.drugName}`]
      : [];

    const prescription = await Prescription.create({
      ...req.body,
      interactionFlags,
      visit: visit._id,
      patient: visit.patient._id,
      doctor: req.user?.id,
    });

    await Visit.findByIdAndUpdate(visit._id, { status: "pharmacy" });
    await Notification.create({
      role: "pharmacy",
      title: "New electronic prescription",
      message: `${visit.patient.patientNumber} has a pending prescription.`,
      severity: interactionFlags.length ? "warning" : "info",
      link: `/pharmacy?prescription=${prescription._id}`,
    });

    res.status(201).json({ data: prescription });
  }),
);

clinicalRouter.post(
  "/visits/:visitId/lab-requests",
  requireRoles("doctor"),
  validate({
    body: z.object({
      tests: z.array(z.string().min(1)).min(1),
      discipline: z.enum(["haematology", "chemistry", "microbiology", "serology", "urinalysis", "histology"]),
      urgency: z.enum(["routine", "urgent", "stat"]).default("routine"),
      specimenType: z.string().optional(),
      clinicalNotes: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const request = await LabRequest.create({
      ...req.body,
      visit: visit._id,
      patient: visit.patient._id,
      doctor: req.user?.id,
    });

    await Visit.findByIdAndUpdate(visit._id, { status: "investigations" });
    await Notification.create({
      role: "laboratory",
      title: "New lab request",
      message: `${visit.patient.patientNumber}: ${req.body.tests.join(", ")}`,
      severity: req.body.urgency === "stat" ? "critical" : "info",
      link: `/lab?request=${request._id}`,
    });

    res.status(201).json({ data: request });
  }),
);

clinicalRouter.post(
  "/visits/:visitId/imaging-requests",
  requireRoles("doctor"),
  validate({
    body: z.object({
      modality: z.enum(["xray", "ultrasound", "ecg", "echocardiography"]),
      bodyRegion: z.string().min(2),
      clinicalIndication: z.string().min(2),
      urgency: z.enum(["routine", "urgent", "stat"]).default("routine"),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const request = await ImagingRequest.create({
      ...req.body,
      visit: visit._id,
      patient: visit.patient._id,
      doctor: req.user?.id,
    });

    await Visit.findByIdAndUpdate(visit._id, { status: "investigations" });
    await Notification.create({
      role: "radiology",
      title: "New imaging request",
      message: `${visit.patient.patientNumber}: ${req.body.modality} ${req.body.bodyRegion}`,
      severity: req.body.urgency === "stat" ? "critical" : "info",
      link: `/radiology?request=${request._id}`,
    });

    res.status(201).json({ data: request });
  }),
);

clinicalRouter.post(
  "/visits/:visitId/admission",
  requireRoles("doctor"),
  validate({
    body: z.object({
      ward: z.string().min(2),
      bed: z.string().optional(),
      admittingDiagnosis: z.string().min(2),
      managementPlan: z.string().min(2),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const updated = await Visit.findByIdAndUpdate(
      visit._id,
      {
        visitType: "ipd",
        status: "admitted",
        admission: { ...req.body, admittedAt: new Date() },
      },
      { new: true },
    );

    res.json({ data: updated });
  }),
);

clinicalRouter.patch(
  "/visits/:visitId/patient-status",
  requireRoles("doctor"),
  validate({
    body: z.object({
      patientCurrentStatus: z.enum(["active_inpatient", "ready_for_discharge", "discharged", "deceased", "transferred"]),
      reason: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));

    const clinicalNote: any = await ClinicalNote.findOneAndUpdate(
      { visit: visit._id, doctor: req.user?.id },
      {
        patientCurrentStatus: req.body.patientCurrentStatus,
        doctorStatusTimestamp: new Date(),
        doctorStatusReason: req.body.reason,
      },
      { new: true, upsert: true },
    );

    if (req.body.patientCurrentStatus === "discharged") {
      await Visit.findByIdAndUpdate(visit._id, {
        status: "discharged",
        "admission.dischargedAt": new Date(),
        "admission.dischargeSummary": req.body.reason,
      });

      if (visit.admission?.bed) {
        const { Bed } = await import("../models/management.model.js");
        await Bed.findByIdAndUpdate(visit.admission.bed, {
          status: "under_cleaning",
          currentPatient: undefined,
          currentVisit: undefined,
          admittingDoctor: undefined,
          admittedAt: undefined,
        });
      }

      await Notification.create({
        role: "reception",
        title: "Patient Discharged",
        message: `${visit.patient?.patientNumber} has been discharged. Process final billing.`,
        severity: "info",
        link: `/reception?visit=${visit._id}`,
      });
    }

    res.json({ data: clinicalNote });
  }),
);

clinicalRouter.post(
  "/visits/:visitId/discharge",
  requireRoles("doctor"),
  validate({
    body: z.object({
      dischargeSummary: z.string().min(2),
      finalDiagnosis: z.string().optional(),
      followUpDate: z.coerce.date().optional(),
      dischargeCondition: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const visit = await loadVisit(String(req.params.visitId));
    const updated = await Visit.findByIdAndUpdate(
      visit._id,
      {
        status: "discharged",
        "admission.dischargedAt": new Date(),
        "admission.dischargeSummary": req.body.dischargeSummary,
      },
      { new: true },
    );

    res.json({ data: updated });
  }),
);
