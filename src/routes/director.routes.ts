import { Router } from "express";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { AuditLog } from "../models/audit-log.model.js";
import { Invoice } from "../models/billing.model.js";
import { ClinicalNote } from "../models/clinical.model.js";
import { LabRequest } from "../models/investigation.model.js";
import { Bed, Expense } from "../models/management.model.js";
import { Patient } from "../models/patient.model.js";
import { InventoryBatch } from "../models/pharmacy.model.js";
import { Visit } from "../models/visit.model.js";
import { asyncHandler } from "../utils/async-handler.js";

export const directorRouter = Router();

directorRouter.use(requireAuth, requireRoles("director"));

directorRouter.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [
      todaysPatients,
      admissions,
      revenue,
      pendingBills,
      beds,
      expenses,
      departmentVolume,
      topDiagnoses,
      pendingLab,
      lowStockBatches,
    ] = await Promise.all([
      Visit.countDocuments({ createdAt: { $gte: today } }),
      Visit.countDocuments({ status: "admitted" }),
      Invoice.aggregate([
        { $match: { createdAt: { $gte: today }, status: { $in: ["paid", "partial"] } } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } },
      ]),
      Invoice.countDocuments({ status: { $in: ["pending", "partial"] } }),
      Bed.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
      Expense.aggregate([
        { $match: { incurredAt: { $gte: monthStart } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Visit.aggregate([
        { $match: { createdAt: { $gte: monthStart } } },
        { $group: { _id: "$department", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ClinicalNote.aggregate([
        { $match: { createdAt: { $gte: monthStart } } },
        { $unwind: "$diagnoses" },
        { $group: { _id: "$diagnoses.description", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      LabRequest.countDocuments({ status: { $in: ["ordered", "sample_collected", "processing"] } }),
      InventoryBatch.find({ quantityOnHand: { $lte: 10 } })
        .populate("drug", "genericName strength reorderLevel")
        .limit(20)
        .lean(),
    ]);

    const totalBeds = beds.reduce((sum: number, bed: any) => sum + bed.count, 0);
    const occupied = beds.find((bed: any) => bed._id === "occupied")?.count ?? 0;

    res.json({
      data: {
        kpis: {
          todaysPatients,
          admissions,
          revenueToday: revenue[0]?.total ?? 0,
          pendingBills,
          bedOccupancyRate: totalBeds ? Math.round((occupied / totalBeds) * 100) : 0,
          expenditureThisMonth: expenses[0]?.total ?? 0,
          pendingLab,
          patientRegistrySize: await Patient.countDocuments(),
        },
        departmentVolume,
        topDiagnoses,
        stockAlerts: lowStockBatches,
      },
    });
  }),
);

directorRouter.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const logs = await AuditLog.find()
      .populate("actor", "fullName roles")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ data: logs });
  }),
);
