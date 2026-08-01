import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  PaymentEntry,
  Receivable,
  HmoClaim,
  Voucher,
  ApprovalRequest,
} from "../models/accounting.model.js";
import { Invoice } from "../models/billing.model.js";
import { Visit } from "../models/visit.model.js";
import { Patient } from "../models/patient.model.js";
import { Notification } from "../models/notification.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { escapeRegex } from "../utils/case.js";
import { HttpError, forbidden, notFound } from "../utils/http-error.js";
import { makeReceiptNumber } from "../utils/ids.js";
import { getPagination, paginationMeta } from "../utils/pagination.js";
import type { Role } from "../types.js";

export const accountingRouter = Router();
const accountingRoles: Role[] = ["accountant", "accounts_manager"];

accountingRouter.use(requireAuth);

const ACC_THRESHOLD = 100_000;

function requiresSupervisor(amount: number) {
  return amount > ACC_THRESHOLD;
}

// ── Payments ───────────────────────────────────────────────

const createPaymentSchema = z.object({
  visit: z.string().optional(),
  patient: z.string().min(1),
  invoice: z.string().optional(),
  amount: z.number().positive(),
  method: z.enum(["cash", "pos", "bank_transfer", "hmo", "nhia", "online"]),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

accountingRouter.post(
  "/payments",
  requireRoles(...accountingRoles),
  validate({ body: createPaymentSchema }),
  asyncHandler(async (req, res) => {
    const needsSupervisor = requiresSupervisor(req.body.amount);
    const status = needsSupervisor ? "pending" : "authorized";
    const payment: any = await PaymentEntry.create({
      ...req.body,
      receiptNumber: makeReceiptNumber(),
      type: "payment",
      status,
      receivedBy: req.user?.id,
      paymentDate: new Date(),
    });

    if (needsSupervisor) {
      await ApprovalRequest.create({
        requestType: "payment_reversal",
        referenceId: payment._id,
        referenceModel: "PaymentEntry",
        amount: req.body.amount,
        requestedBy: req.user?.id,
        approverRole: "director",
        status: "pending",
        reason: `Large payment requires supervisor authorization (NGN ${req.body.amount.toLocaleString()})`,
      });
      await Notification.create({
        role: "director",
        title: "Payment Requires Authorization",
        message: `Payment of NGN ${req.body.amount.toLocaleString()} by ${req.user?.fullName} needs director approval.`,
        severity: "warning",
        link: "/accounting",
      });
    }

    if (req.body.invoice) {
      const invoice: any = await Invoice.findById(req.body.invoice);
      if (invoice && invoice.status !== "void") {
        invoice.payments.push({
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference,
          collectedBy: payment.receivedBy,
          collectedAt: payment.paymentDate,
        });
        invoice.amountPaid += payment.amount;
        invoice.balance = Math.max(invoice.total - invoice.amountPaid, 0);
        invoice.status = invoice.balance === 0 ? "paid" : "partial";
        await invoice.save();

        if (invoice.visit) {
          await Visit.findByIdAndUpdate(invoice.visit, {
            "billing.amountPaid": invoice.amountPaid,
            "billing.balance": invoice.balance,
            paymentStatus: invoice.status === "paid" ? "paid" : "partial",
          });
        }
      }
    }

    res.status(201).json({
      data: payment,
      authorization_required: needsSupervisor,
    });
  }),
);

const reversePaymentSchema = z.object({
  reason: z.string().min(5),
  amount: z.number().positive().optional(),
});

accountingRouter.post(
  "/payments/:id/reverse",
  requireRoles(...accountingRoles),
  validate({ body: reversePaymentSchema }),
  asyncHandler(async (req, res) => {
    const payment: any = await PaymentEntry.findById(req.params.id);
    if (!payment) throw notFound("Payment not found.");
    if (payment.status === "reversed") {
      throw new HttpError(409, "Payment is already reversed.");
    }

    const reversalAmount = req.body.amount ?? payment.amount;
    const needsSupervisor = requiresSupervisor(reversalAmount);

    if (needsSupervisor) {
      payment.status = "pending";
      await payment.save();

      await ApprovalRequest.create({
        requestType: "payment_reversal",
        referenceId: payment._id,
        referenceModel: "PaymentEntry",
        amount: reversalAmount,
        requestedBy: req.user?.id,
        approverRole: "director",
        status: "pending",
        reason: req.body.reason,
      });

      await Notification.create({
        role: "director",
        title: "Payment Reversal Requires Authorization",
        message: `Reversal of NGN ${reversalAmount.toLocaleString()} by ${req.user?.fullName} needs director approval.`,
        severity: "warning",
        link: "/accounting",
      });

      return res.json({ data: payment, authorization_required: true });
    }

    const reversal: any = await PaymentEntry.create({
      receiptNumber: makeReceiptNumber(),
      visit: payment.visit,
      patient: payment.patient,
      invoice: payment.invoice,
      amount: -reversalAmount,
      method: payment.method,
      reference: payment.reference,
      type: req.body.amount ? "partial_reversal" : "full_reversal",
      status: "authorized",
      receivedBy: req.user?.id,
      authorizedBy: req.user?.id,
      authorizedAt: new Date(),
      paymentDate: new Date(),
      reversalReason: req.body.reason,
    });

    payment.status = "reversed";
    payment.reversalReason = req.body.reason;
    await payment.save();

    if (payment.invoice) {
      const invoice: any = await Invoice.findById(payment.invoice);
      if (invoice && invoice.status !== "void") {
        invoice.amountPaid = Math.max(invoice.amountPaid - reversalAmount, 0);
        invoice.balance = Math.max(invoice.total - invoice.amountPaid, 0);
        invoice.status = invoice.balance === 0 ? "paid" : invoice.amountPaid > 0 ? "partial" : "pending";
        await invoice.save();

        if (invoice.visit) {
          await Visit.findByIdAndUpdate(invoice.visit, {
            "billing.amountPaid": invoice.amountPaid,
            "billing.balance": invoice.balance,
            paymentStatus: invoice.status === "paid" ? "paid" : invoice.amountPaid > 0 ? "partial" : "pending",
          });
        }
      }
    }

    res.json({ data: reversal, authorization_required: false });
  }),
);

accountingRouter.get(
  "/payments",
  requireRoles(...accountingRoles, "manager"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const status = String(req.query.status ?? "");
    const query: Record<string, unknown> = status ? { status } : {};
    const search = String(req.query.search ?? "").trim();
    if (search) {
      query.receiptNumber = new RegExp(escapeRegex(search), "i");
    }

    const [payments, total] = await Promise.all([
      PaymentEntry.find(query)
        .populate("patient", "patientNumber firstName lastName")
        .populate("receivedBy", "fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      PaymentEntry.countDocuments(query),
    ]);

    res.json({ data: payments, pagination: paginationMeta(total, page, limit) });
  }),
);

// ── Invoice Management (Accounting) ────────────────────────

const editInvoiceSchema = z.object({
  items: z
    .array(
      z.object({
        description: z.string().min(2),
        department: z.string().optional(),
        quantity: z.number().min(1).default(1),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1)
    .optional(),
  discount: z.number().min(0).optional(),
  payerType: z.enum(["self", "hmo", "nhia", "company"]).optional(),
  reason: z.string().min(5),
});

accountingRouter.patch(
  "/invoices/:id",
  requireRoles(...accountingRoles),
  validate({ body: editInvoiceSchema }),
  asyncHandler(async (req, res) => {
    const invoice: any = await Invoice.findById(req.params.id);
    if (!invoice) throw notFound("Invoice not found.");
    if (invoice.status === "paid" || invoice.status === "void") {
      throw new HttpError(409, "Cannot edit a paid or void invoice.");
    }

    const oldValues = invoice.toObject();
    const changes: Record<string, unknown> = {};

    if (req.body.items) {
      const items = req.body.items.map((item: any) => ({
        ...item,
        amount: item.quantity * item.unitPrice,
      }));
      const subtotal = items.reduce((sum: number, item: any) => sum + item.amount, 0);
      const discount = req.body.discount ?? invoice.discount;
      const total = Math.max(subtotal - discount, 0);

      invoice.items = items;
      invoice.subtotal = subtotal;
      invoice.discount = discount;
      invoice.total = total;

      const newBalance = Math.max(total - invoice.amountPaid, 0);
      invoice.balance = newBalance;
      invoice.status = newBalance === 0 ? "paid" : invoice.amountPaid > 0 ? "partial" : "pending";

      changes.items = req.body.items;
      changes.subtotal = subtotal;
      changes.discount = discount;
      changes.total = total;
    }

    if (req.body.payerType) {
      invoice.payerType = req.body.payerType;
      changes.payerType = req.body.payerType;
    }

    invoice.updatedBy = req.user?.id;
    invoice.editHistory = invoice.editHistory || [];
    invoice.editHistory.push({
      editedBy: req.user?.id,
      editedAt: new Date(),
      changes: { before: oldValues, after: changes },
    });

    await invoice.save();

    if (req.body.reason) {
      await ApprovalRequest.create({
        requestType: "invoice_edit",
        referenceId: invoice._id,
        referenceModel: "Invoice",
        amount: invoice.total,
        requestedBy: req.user?.id,
        approverRole: "manager",
        status: "approved",
        reason: req.body.reason,
        approvedBy: req.user?.id,
        approvedAt: new Date(),
      });
    }

    if (invoice.visit) {
      await Visit.findByIdAndUpdate(invoice.visit, {
        "billing.totalInvoice": invoice.total,
        "billing.balance": invoice.balance,
        paymentStatus: invoice.status === "paid" ? "paid" : invoice.amountPaid > 0 ? "partial" : "pending",
      });
    }

    res.json({ data: invoice });
  }),
);

accountingRouter.post(
  "/invoices/:id/void",
  requireRoles(...accountingRoles),
  validate({ body: z.object({ reason: z.string().min(5) }) }),
  asyncHandler(async (req, res) => {
    const invoice: any = await Invoice.findById(req.params.id);
    if (!invoice) throw notFound("Invoice not found.");
    if (invoice.status === "void") throw new HttpError(409, "Invoice is already void.");
    if (invoice.status === "paid") {
      throw new HttpError(409, "Cannot void a fully paid invoice. Reverse payments first.");
    }

    invoice.status = "void";
    invoice.voidedBy = req.user?.id;
    invoice.voidedAt = new Date();
    invoice.voidReason = req.body.reason;
    await invoice.save();

    if (invoice.visit) {
      await Visit.findByIdAndUpdate(invoice.visit, {
        "billing.totalInvoice": 0,
        "billing.balance": 0,
        paymentStatus: "deferred",
      });
    }

    await Notification.create({
      role: "manager",
      title: "Invoice Voided",
      message: `Invoice ${invoice.invoiceNumber} was voided by ${req.user?.fullName}. Reason: ${req.body.reason}`,
      severity: "warning",
      link: "/accounting",
    });

    res.json({ data: invoice });
  }),
);

// ── Receivables ────────────────────────────────────────────

accountingRouter.get(
  "/receivables",
  requireRoles(...accountingRoles, "manager"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const bucket = String(req.query.bucket ?? "");
    const query: Record<string, unknown> = bucket ? { agingBucket: bucket } : {};

    const [receivables, total] = await Promise.all([
      Receivable.find(query)
        .populate("patient", "patientNumber firstName lastName phone")
        .populate("invoice", "invoiceNumber total balance status")
        .sort({ amountOutstanding: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Receivable.countDocuments(query),
    ]);

    res.json({ data: receivables, pagination: paginationMeta(total, page, limit) });
  }),
);

accountingRouter.get(
  "/receivables/aging",
  requireRoles(...accountingRoles, "manager", "director"),
  asyncHandler(async (_req, res) => {
    const aging = await Receivable.aggregate([
      { $match: { amountOutstanding: { $gt: 0 } } },
      {
        $group: {
          _id: "$agingBucket",
          count: { $sum: 1 },
          totalOutstanding: { $sum: "$amountOutstanding" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({ data: aging });
  }),
);

// ── HMO Claims ─────────────────────────────────────────────

const createClaimSchema = z.object({
  patient: z.string().min(1),
  visit: z.string().min(1),
  hmoProvider: z.string().min(1),
  hmoPlan: z.string().optional(),
  invoice: z.string().optional(),
  claimedAmount: z.number().positive(),
  notes: z.string().optional(),
});

accountingRouter.post(
  "/claims",
  requireRoles(...accountingRoles),
  validate({ body: createClaimSchema }),
  asyncHandler(async (req, res) => {
    const claimNumber = `HMC-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    const claim = await HmoClaim.create({
      ...req.body,
      claimNumber,
      status: "draft",
      submittedBy: req.user?.id,
    });

    res.status(201).json({ data: claim });
  }),
);

accountingRouter.patch(
  "/claims/:id/submit",
  requireRoles(...accountingRoles),
  asyncHandler(async (req, res) => {
    const claim: any = await HmoClaim.findById(req.params.id);
    if (!claim) throw notFound("Claim not found.");
    if (claim.status !== "draft") throw new HttpError(409, "Only draft claims can be submitted.");

    claim.status = "submitted";
    claim.submissionDate = new Date();
    await claim.save();

    await Notification.create({
      role: "manager",
      title: "HMO Claim Ready for Review",
      message: `Claim ${claim.claimNumber} for NGN ${claim.claimedAmount.toLocaleString()} has been submitted by ${req.user?.fullName}.`,
      severity: "info",
      link: "/accounting",
    });

    res.json({ data: claim });
  }),
);

accountingRouter.get(
  "/claims",
  requireRoles(...accountingRoles, "manager", "director"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const status = String(req.query.status ?? "");
    const query: Record<string, unknown> = status ? { status } : {};

    const [claims, total] = await Promise.all([
      HmoClaim.find(query)
        .populate("patient", "patientNumber firstName lastName")
        .populate("submittedBy", "fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      HmoClaim.countDocuments(query),
    ]);

    res.json({ data: claims, pagination: paginationMeta(total, page, limit) });
  }),
);

// ── Vouchers ───────────────────────────────────────────────

const createVoucherSchema = z.object({
  type: z.enum(["petty_cash", "vendor_payment", "refund"]),
  payee: z.string().min(1),
  amount: z.number().positive(),
  category: z.string().optional(),
  description: z.string().min(5),
  receiptAttachmentUrl: z.string().optional(),
  notes: z.string().optional(),
});

accountingRouter.post(
  "/vouchers",
  requireRoles(...accountingRoles),
  validate({ body: createVoucherSchema }),
  asyncHandler(async (req, res) => {
    const voucherNumber = `VCH-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    const voucher = await Voucher.create({
      ...req.body,
      voucherNumber,
      status: "pending",
      preparedBy: req.user?.id,
    });

    await Notification.create({
      role: "manager",
      title: "Payment Voucher for Approval",
      message: `Voucher ${voucherNumber} for NGN ${req.body.amount.toLocaleString()} (${req.body.type}) needs approval.`,
      severity: "info",
      link: "/accounting",
    });

    res.status(201).json({ data: voucher });
  }),
);

accountingRouter.get(
  "/vouchers",
  requireRoles(...accountingRoles, "manager", "director"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const status = String(req.query.status ?? "");
    const type = String(req.query.type ?? "");
    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const [vouchers, total] = await Promise.all([
      Voucher.find(query)
        .populate("preparedBy", "fullName")
        .populate("approvedBy", "fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Voucher.countDocuments(query),
    ]);

    res.json({ data: vouchers, pagination: paginationMeta(total, page, limit) });
  }),
);

// ── Approval Requests ──────────────────────────────────────

accountingRouter.get(
  "/approvals",
  requireRoles("manager", "director"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const status = String(req.query.status ?? "pending");

    const query: Record<string, unknown> = { status };
    const [approvals, total] = await Promise.all([
      ApprovalRequest.find(query)
        .populate("requestedBy", "fullName email")
        .populate("approvedBy", "fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ApprovalRequest.countDocuments(query),
    ]);

    res.json({ data: approvals, pagination: paginationMeta(total, page, limit) });
  }),
);

accountingRouter.patch(
  "/approvals/:id",
  requireRoles("manager", "director"),
  validate({ body: z.object({ status: z.enum(["approved", "rejected"]), notes: z.string().optional() }) }),
  asyncHandler(async (req, res) => {
    const approval: any = await ApprovalRequest.findById(req.params.id);
    if (!approval) throw notFound("Approval request not found.");
    if (approval.status !== "pending") throw new HttpError(409, "Request already processed.");

    approval.status = req.body.status;
    approval.approvedBy = req.user?.id;
    approval.approvedAt = new Date();
    if (req.body.notes) approval.notes = req.body.notes;
    await approval.save();

    if (req.body.status === "approved") {
      if (approval.referenceModel === "PaymentEntry") {
        await PaymentEntry.findByIdAndUpdate(approval.referenceId, {
          status: "authorized",
          supervisorAuthorizerId: req.user?.id,
          supervisorAuthorizedAt: new Date(),
        });
      }
    }

    res.json({ data: approval });
  }),
);

// ── Financial Reports ──────────────────────────────────────

accountingRouter.get(
  "/reports/daily-collections",
  requireRoles(...accountingRoles, "manager", "director"),
  asyncHandler(async (_req, res) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const result = await PaymentEntry.aggregate([
      { $match: { paymentDate: { $gte: start }, status: "authorized", type: "payment" } },
      {
        $group: {
          _id: "$method",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({ data: result });
  }),
);

accountingRouter.get(
  "/reports/revenue-by-department",
  requireRoles(...accountingRoles, "manager", "director"),
  asyncHandler(async (req, res) => {
    const startParam = String(req.query.start ?? "");
    const endParam = String(req.query.end ?? "");
    const start = startParam ? new Date(startParam) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const end = endParam ? new Date(endParam) : new Date();

    const result = await Invoice.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ["void", "draft"] } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.department",
          revenue: { $sum: "$items.amount" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    res.json({ data: result });
  }),
);

accountingRouter.get(
  "/reports/pnl-summary",
  requireRoles(...accountingRoles, "manager", "director"),
  asyncHandler(async (req, res) => {
    const startParam = String(req.query.start ?? "");
    const endParam = String(req.query.end ?? "");
    const start = startParam ? new Date(startParam) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const end = endParam ? new Date(endParam) : new Date();

    const [revenueResult, expenseResult, receivablesResult] = await Promise.all([
      Invoice.aggregate([
        { $match: { createdAt: { $gte: start, $lte: end }, status: { $nin: ["void", "draft"] } } },
        { $group: { _id: null, totalRevenue: { $sum: "$total" }, collected: { $sum: "$amountPaid" } } },
      ]),
      PaymentEntry.aggregate([
        { $match: { paymentDate: { $gte: start, $lte: end }, status: "authorized", type: { $ne: "payment" } } },
        { $group: { _id: null, totalExpenses: { $sum: { $abs: "$amount" } } } },
      ]),
      Receivable.aggregate([
        { $match: { amountOutstanding: { $gt: 0 } } },
        { $group: { _id: null, totalOutstanding: { $sum: "$amountOutstanding" } } },
      ]),
    ]);

    const revenue = revenueResult[0] ?? { totalRevenue: 0, collected: 0 };
    const expenses = expenseResult[0]?.totalExpenses ?? 0;
    const outstanding = receivablesResult[0]?.totalOutstanding ?? 0;

    res.json({
      data: {
        totalRevenue: revenue.totalRevenue,
        collected: revenue.collected,
        outstandingReceivables: outstanding,
        expenses,
        netPosition: revenue.collected - expenses,
        period: { start, end },
      },
    });
  }),
);

// ── Patient Billing History (accounting view, no clinical data) ──

accountingRouter.get(
  "/patients/:patientId/billing-history",
  requireRoles(...accountingRoles),
  asyncHandler(async (req, res) => {
    const patient: any = await Patient.findById(req.params.patientId)
      .select("patientNumber firstName lastName phone category hmo")
      .lean();
    if (!patient) throw notFound("Patient not found.");

    const [invoices, payments] = await Promise.all([
      Invoice.find({ patient: req.params.patientId })
        .sort({ createdAt: -1 })
        .lean(),
      PaymentEntry.find({ patient: req.params.patientId })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    res.json({
      data: {
        patient,
        invoices,
        payments,
        outstandingBalance: invoices.reduce(
          (sum: number, inv: any) => sum + (inv.status !== "void" ? inv.balance : 0),
          0,
        ),
      },
    });
  }),
);
