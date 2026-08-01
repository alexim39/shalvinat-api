import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Invoice } from "../models/billing.model.js";
import { Visit } from "../models/visit.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { escapeRegex } from "../utils/case.js";
import { HttpError, notFound } from "../utils/http-error.js";
import { makeInvoiceNumber, makeReceiptNumber } from "../utils/ids.js";
import { getPagination, paginationMeta } from "../utils/pagination.js";

export const billingRouter = Router();

billingRouter.use(requireAuth);

const invoiceSchema = z.object({
  patient: z.string().min(1),
  visit: z.string().optional(),
  payerType: z.enum(["self", "hmo", "nhia", "company"]).default("self"),
  discount: z.number().min(0).default(0),
  items: z
    .array(
      z.object({
        description: z.string().min(2),
        department: z.string().optional(),
        quantity: z.number().min(1).default(1),
        unitPrice: z.number().min(0),
      }),
    )
    .min(1),
});

billingRouter.post(
  "/invoices",
  requireRoles("reception"),
  validate({ body: invoiceSchema }),
  asyncHandler(async (req, res) => {
    const items = req.body.items.map((item: any) => ({
      ...item,
      amount: item.quantity * item.unitPrice,
    }));
    const subtotal = items.reduce((sum: number, item: any) => sum + item.amount, 0);
    const total = Math.max(subtotal - req.body.discount, 0);

    const invoice = await Invoice.create({
      ...req.body,
      invoiceNumber: makeInvoiceNumber(),
      items,
      subtotal,
      total,
      balance: total,
      createdBy: req.user?.id,
    });

    if (req.body.visit) {
      await Visit.findByIdAndUpdate(req.body.visit, {
        "billing.totalInvoice": total,
        "billing.balance": total,
        paymentStatus: total === 0 ? "paid" : "pending",
      });
    }

    res.status(201).json({ data: invoice });
  }),
);

billingRouter.post(
  "/invoices/:id/payments",
  requireRoles("reception"),
  validate({
    body: z.object({
      amount: z.number().positive(),
      method: z.enum(["cash", "pos", "hmo", "nhia", "bank_transfer", "online"]),
      reference: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const invoice: any = await Invoice.findById(req.params.id);
    if (!invoice) {
      throw notFound("Invoice not found.");
    }
    if (invoice.status === "void") {
      throw new HttpError(409, "Cannot collect payment on a void invoice.");
    }

    invoice.payments.push({
      ...req.body,
      receiptNumber: makeReceiptNumber(),
      collectedBy: req.user?.id,
    });
    invoice.amountPaid += req.body.amount;
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

    res.json({ data: invoice });
  }),
);

billingRouter.get(
  "/invoices",
  requireRoles("reception", "manager", "accountant", "accounts_manager"),
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req);
    const status = String(req.query.status ?? "");
    const search = String(req.query.search ?? "").trim();
    const query: Record<string, unknown> = status ? { status } : {};

    if (search) {
      query.invoiceNumber = new RegExp(escapeRegex(search), "i");
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate("patient", "patientNumber firstName lastName phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Invoice.countDocuments(query),
    ]);

    res.json({ data: invoices, pagination: paginationMeta(total, page, limit) });
  }),
);

billingRouter.get(
  "/summary",
  requireRoles("manager", "accountant", "accounts_manager"),
  asyncHandler(async (_req, res) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const [todayRevenue, pendingBills] = await Promise.all([
      Invoice.aggregate([
        { $match: { createdAt: { $gte: start }, status: { $in: ["partial", "paid"] } } },
        { $group: { _id: null, total: { $sum: "$amountPaid" } } },
      ]),
      Invoice.countDocuments({ status: { $in: ["pending", "partial"] } }),
    ]);

    res.json({
      data: {
        todayRevenue: todayRevenue[0]?.total ?? 0,
        pendingBills,
      },
    });
  }),
);
