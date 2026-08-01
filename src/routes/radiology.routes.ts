import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { ImagingRequest } from "../models/investigation.model.js";
import { Notification } from "../models/notification.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { notFound, HttpError } from "../utils/http-error.js";
import { upload, canDownloadResult } from "../utils/upload.js";

export const radiologyRouter = Router();

radiologyRouter.use(requireAuth);

radiologyRouter.get(
  "/requests",
  requireRoles("radiology", "doctor"),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "");
    const query = status ? { status } : { status: { $ne: "reviewed" } };
    const requests = await ImagingRequest.find(query)
      .populate("patient", "patientNumber firstName lastName gender dateOfBirth")
      .populate("doctor", "fullName")
      .sort({ urgency: -1, createdAt: 1 })
      .limit(100)
      .lean();

    res.json({ data: requests });
  }),
);

radiologyRouter.patch(
  "/requests/:id/procedure",
  requireRoles("radiology"),
  validate({
    body: z.object({
      assignedTechnician: z.string().optional(),
      suite: z.string().optional(),
      radiationDose: z.string().optional(),
      preparationNotes: z.string().optional(),
      performedAt: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const request = await ImagingRequest.findByIdAndUpdate(
      req.params.id,
      { ...req.body, assignedTechnician: req.body.assignedTechnician ?? req.user?.id, status: "performed" },
      { new: true },
    );
    if (!request) {
      throw notFound("Imaging request not found.");
    }

    res.json({ data: request });
  }),
);

radiologyRouter.patch(
  "/requests/:id/report",
  requireRoles("radiology"),
  validate({
    body: z.object({
      imageUrls: z.array(z.string()).default([]),
      reportText: z.string().optional(),
      reportUrl: z.string().optional(),
      urgentFinding: z.boolean().default(false),
    }),
  }),
  asyncHandler(async (req, res) => {
    const request: any = await ImagingRequest.findByIdAndUpdate(
      req.params.id,
      { ...req.body, status: "reported" },
      { new: true },
    ).populate("patient", "patientNumber");
    if (!request) {
      throw notFound("Imaging request not found.");
    }

    if (req.body.urgentFinding) {
      await Notification.create({
        recipient: request.doctor,
        title: "Urgent imaging finding",
        message: `${request.patient.patientNumber} has an urgent radiology report.`,
        severity: "critical",
        link: `/doctor?visit=${request.visit}`,
      });
    }

    res.json({ data: request });
  }),
);

radiologyRouter.post(
  "/requests/:id/upload",
  requireRoles("radiology"),
  upload.array("files", 10),
  asyncHandler(async (req, res) => {
    const imagingRequest: any = await ImagingRequest.findById(req.params.id);
    if (!imagingRequest) throw notFound("Imaging request not found.");

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

    imagingRequest.resultFiles = [...(imagingRequest.resultFiles ?? []), ...uploadedFiles];
    await imagingRequest.save();

    if (released) {
      await Notification.create({
        recipient: imagingRequest.doctor,
        title: "Imaging results released",
        message: `Imaging results have been uploaded and released.`,
        severity: "info",
        link: `/doctor?visit=${imagingRequest.visit}`,
      });
    }

    const response = imagingRequest.toObject();
    const isPrivileged = req.user?.roles?.some((r: string) => ["doctor", "director"].includes(r)) ?? false;
    if (!isPrivileged && response.resultFiles) {
      response.resultFiles = response.resultFiles.map((f: any) => ({
        ...f,
        file_downloadable: canDownloadResult(req.user?.roles ?? [], f.uploadedBy?.toString() ?? "", req.user?.id ?? ""),
      }));
    }

    res.json({ data: response, meta: { files_uploaded: files.length } });
  }),
);

radiologyRouter.get(
  "/requests/:id/files/:fileIndex/download",
  requireRoles("radiology", "doctor", "director"),
  asyncHandler(async (req, res) => {
    const imagingRequest: any = await ImagingRequest.findById(req.params.id);
    if (!imagingRequest) throw notFound("Imaging request not found.");

    const fileIndex = parseInt(String(req.params.fileIndex ?? ""), 10);
    const file = imagingRequest.resultFiles?.[fileIndex];
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
