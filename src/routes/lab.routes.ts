import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { LabRequest } from "../models/investigation.model.js";
import { Notification } from "../models/notification.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { notFound, HttpError } from "../utils/http-error.js";
import { makeLabSampleCode } from "../utils/ids.js";
import { upload, canDownloadResult, ALLOWED_UPLOAD_TYPES_DESC } from "../utils/upload.js";

export const labRouter = Router();

labRouter.use(requireAuth);

labRouter.get(
  "/requests",
  requireRoles("laboratory", "doctor"),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "");
    const query = status ? { status } : { status: { $ne: "reviewed" } };
    const requests = await LabRequest.find(query)
      .populate("patient", "patientNumber firstName lastName gender dateOfBirth")
      .populate("doctor", "fullName")
      .sort({ urgency: -1, createdAt: 1 })
      .limit(100)
      .lean();

    res.json({ data: requests });
  }),
);

labRouter.patch(
  "/requests/:id/sample",
  requireRoles("laboratory"),
  validate({
    body: z.object({
      sampleCondition: z.string().default("acceptable"),
      specimenType: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const request = await LabRequest.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        sampleCode: makeLabSampleCode(),
        sampleCollectedAt: new Date(),
        sampleCollectedBy: req.user?.id,
        status: "sample_collected",
      },
      { new: true },
    );
    if (!request) {
      throw notFound("Lab request not found.");
    }

    res.json({ data: request });
  }),
);

labRouter.patch(
  "/requests/:id/reject",
  requireRoles("laboratory"),
  validate({
    body: z.object({
      rejectionReason: z.string().min(2),
    }),
  }),
  asyncHandler(async (req, res) => {
    const request: any = await LabRequest.findByIdAndUpdate(
      req.params.id,
      { rejectionReason: req.body.rejectionReason, status: "rejected" },
      { new: true },
    ).populate("patient", "patientNumber");
    if (!request) {
      throw notFound("Lab request not found.");
    }

    await Notification.create({
      recipient: request.doctor,
      title: "Lab sample rejected",
      message: `${request.patient.patientNumber}: ${req.body.rejectionReason}`,
      severity: "warning",
      link: `/doctor?visit=${request.visit}`,
    });

    res.json({ data: request });
  }),
);

labRouter.patch(
  "/requests/:id/results",
  requireRoles("laboratory"),
  validate({
    body: z.object({
      results: z
        .array(
          z.object({
            analyte: z.string().min(1),
            value: z.string().min(1),
            unit: z.string().optional(),
            referenceRange: z.string().optional(),
            flag: z.enum(["normal", "high", "low", "critical"]).default("normal"),
          }),
        )
        .min(1),
    }),
  }),
  asyncHandler(async (req, res) => {
    const request: any = await LabRequest.findByIdAndUpdate(
      req.params.id,
      { results: req.body.results, status: "processing" },
      { new: true },
    ).populate("patient", "patientNumber");
    if (!request) {
      throw notFound("Lab request not found.");
    }

    if (req.body.results.some((result: any) => result.flag === "critical")) {
      await Notification.create({
        recipient: request.doctor,
        title: "Critical lab value",
        message: `${request.patient.patientNumber} has a critical lab result requiring acknowledgement.`,
        severity: "critical",
        link: `/doctor?visit=${request.visit}`,
      });
    }

    res.json({ data: request });
  }),
);

labRouter.patch(
  "/requests/:id/validate",
  requireRoles("laboratory"),
  asyncHandler(async (req, res) => {
    const request = await LabRequest.findByIdAndUpdate(
      req.params.id,
      {
        technicalValidatedBy: req.user?.id,
        technicalValidatedAt: new Date(),
        status: "validated",
      },
      { new: true },
    );
    if (!request) {
      throw notFound("Lab request not found.");
    }

    res.json({ data: request });
  }),
);

labRouter.patch(
  "/requests/:id/authorize",
  requireRoles("laboratory"),
  asyncHandler(async (req, res) => {
    const request = await LabRequest.findByIdAndUpdate(
      req.params.id,
      {
        authorizedBy: req.user?.id,
        authorizedAt: new Date(),
        status: "authorized",
      },
      { new: true },
    );
    if (!request) {
      throw notFound("Lab request not found.");
    }

    res.json({ data: request });
  }),
);

labRouter.post(
  "/requests/:id/upload",
  requireRoles("laboratory"),
  upload.array("files", 10),
  asyncHandler(async (req, res) => {
    const labRequest: any = await LabRequest.findById(req.params.id);
    if (!labRequest) throw notFound("Lab request not found.");

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      throw new HttpError(400, "No files uploaded.");
    }

    const summary = String(req.body.summary ?? "").trim();
    const released = String(req.body.released ?? "false") === "true";

    const uploadedFiles = files.map((file) => ({
      fileName: file.filename,
      originalName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      storagePath: `uploads/${file.filename}`,
      uploadedBy: req.user?.id,
      uploadedAt: new Date(),
      summary,
      released,
      releasedAt: released ? new Date() : undefined,
    }));

    labRequest.resultFiles = [...(labRequest.resultFiles ?? []), ...uploadedFiles];
    await labRequest.save();

    if (released) {
      await Notification.create({
        recipient: labRequest.doctor,
        title: "Lab results released",
        message: `Lab results have been uploaded and released.`,
        severity: "info",
        link: `/doctor?visit=${labRequest.visit}`,
      });
    }

    const response = labRequest.toObject();
    const isPrivileged = req.user?.roles?.some((r: string) => ["doctor", "director"].includes(r)) ?? false;
    if (!isPrivileged && response.resultFiles) {
      response.resultFiles = response.resultFiles.map((f: any) => ({
        ...f,
        file_downloadable: canDownloadResult(req.user?.roles ?? [], f.uploadedBy?.toString() ?? "", req.user?.id ?? ""),
      }));
    }

    res.json({ data: response, meta: { files_uploaded: files.length, allowed_file_types: ALLOWED_UPLOAD_TYPES_DESC } });
  }),
);

labRouter.get(
  "/requests/:id/files/:fileIndex/download",
  requireRoles("laboratory", "doctor", "director"),
  asyncHandler(async (req, res) => {
    const labRequest: any = await LabRequest.findById(req.params.id);
    if (!labRequest) throw notFound("Lab request not found.");

    const fileIndex = parseInt(String(req.params.fileIndex ?? ""), 10);
    const file = labRequest.resultFiles?.[fileIndex];
    if (!file) throw notFound("File not found.");

    const userRoles: string[] = req.user?.roles ?? [];
    const userId: string = req.user?.id ?? "";
    const uploaderId: string = file.uploadedBy?.toString() ?? "";

    if (!canDownloadResult(userRoles, uploaderId, userId)) {
      return res.status(403).json({ error: { message: "Only doctors, directors, or the original uploader can download result files." } });
    }

    const { createReadStream, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const filePath = join(process.cwd(), file.storagePath);
    if (!existsSync(filePath)) throw notFound("File not found on disk.");

    const ext = file.originalName?.split(".").pop()?.toLowerCase() ?? "";
    const contentTypeMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      pdf: "application/pdf", doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    res.setHeader("Content-Type", contentTypeMap[ext] ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${file.originalName}"`);
    createReadStream(filePath).pipe(res);
  }),
);
