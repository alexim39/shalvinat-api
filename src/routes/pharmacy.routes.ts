import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { Notification } from "../models/notification.model.js";
import { DispenseRecord, Drug, InventoryBatch, Prescription, InventoryItem, ExtendedBatch, InventoryLocation, StockMovement, PurchaseOrder, GoodsReceivedNote, ControlledSubstanceRegister } from "../models/pharmacy.model.js";
import { asyncHandler } from "../utils/async-handler.js";
import { HttpError, notFound } from "../utils/http-error.js";

export const pharmacyRouter = Router();

pharmacyRouter.use(requireAuth);

pharmacyRouter.get(
  "/prescriptions",
  requireRoles("pharmacy"),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "pending");
    const prescriptions = await Prescription.find(status ? { status } : {})
      .populate("patient", "patientNumber firstName lastName allergies")
      .populate("doctor", "fullName")
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    res.json({ data: prescriptions });
  }),
);

pharmacyRouter.post(
  "/prescriptions/:id/dispense",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      batch: z.string().optional(),
      quantityDispensed: z.number().min(1),
      counsellingNotes: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const prescription: any = await Prescription.findById(req.params.id);
    if (!prescription) {
      throw notFound("Prescription not found.");
    }

    if (req.body.batch) {
      const batch: any = await InventoryBatch.findById(req.body.batch);
      if (!batch) {
        throw notFound("Inventory batch not found.");
      }
      if (batch.quantityOnHand < req.body.quantityDispensed) {
        throw new HttpError(409, "Insufficient stock for this batch.");
      }
      batch.quantityOnHand -= req.body.quantityDispensed;
      await batch.save();

      const drug: any = await Drug.findById(batch.drug);
      if (drug && batch.quantityOnHand <= drug.reorderLevel) {
        await Notification.create({
          role: "manager",
          title: "Drug reorder alert",
          message: `${drug.genericName} is at or below reorder level.`,
          severity: "warning",
          link: "/pharmacy/inventory",
        });
      }
    }

    const record = await DispenseRecord.create({
      ...req.body,
      prescription: prescription._id,
      patient: prescription.patient,
      dispensedBy: req.user?.id,
    });

    prescription.status =
      req.body.quantityDispensed >= prescription.quantity ? "dispensed" : "partially_dispensed";
    prescription.dispensedBy = req.user?.id;
    prescription.dispensedAt = new Date();
    await prescription.save();

    res.status(201).json({ data: { prescription, record } });
  }),
);

pharmacyRouter.get(
  "/drugs",
  requireRoles("pharmacy", "manager"),
  asyncHandler(async (req, res) => {
    const search = String(req.query.search ?? "");
    const query = search ? { genericName: new RegExp(search, "i") } : {};
    const drugs = await Drug.find(query).sort({ genericName: 1 }).limit(100).lean();
    res.json({ data: drugs });
  }),
);

pharmacyRouter.post(
  "/drugs",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      genericName: z.string().min(2),
      brandNames: z.array(z.string()).default([]),
      strength: z.string().min(1),
      dosageForm: z.string().min(1),
      category: z.enum(["controlled", "prescription", "otc", "consumable"]).default("prescription"),
      storageRequirements: z.string().optional(),
      reorderLevel: z.number().min(0).default(10),
      active: z.boolean().default(true),
    }),
  }),
  asyncHandler(async (req, res) => {
    const drug = await Drug.create(req.body);
    res.status(201).json({ data: drug });
  }),
);

pharmacyRouter.get(
  "/inventory",
  requireRoles("pharmacy", "manager"),
  asyncHandler(async (_req, res) => {
    const batches = await InventoryBatch.find()
      .populate("drug", "genericName strength dosageForm reorderLevel category")
      .sort({ expiryDate: 1 })
      .limit(200)
      .lean();

    res.json({ data: batches });
  }),
);

pharmacyRouter.post(
  "/inventory",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      drug: z.string().min(1),
      batchNumber: z.string().min(1),
      location: z.string().default("main_pharmacy"),
      quantityOnHand: z.number().min(0),
      unitCost: z.number().min(0).default(0),
      sellingPrice: z.number().min(0).default(0),
      expiryDate: z.coerce.date(),
      supplier: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const batch = await InventoryBatch.create({ ...req.body, receivedBy: req.user?.id });
    res.status(201).json({ data: batch });
  }),
);

pharmacyRouter.get(
  "/stock-alerts",
  requireRoles("pharmacy", "manager"),
  asyncHandler(async (_req, res) => {
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const [nearExpiry, batches] = await Promise.all([
      InventoryBatch.find({ expiryDate: { $lte: thirtyDays }, quantityOnHand: { $gt: 0 } })
        .populate("drug", "genericName strength")
        .lean(),
      InventoryBatch.find({ quantityOnHand: { $gt: 0 } }).populate("drug").lean(),
    ]);

    const lowStock = batches.filter((batch: any) => batch.quantityOnHand <= batch.drug?.reorderLevel);
    res.json({ data: { nearExpiry, lowStock } });
  }),
);

// ── Inventory Items ───────────────────────────────────────

pharmacyRouter.get(
  "/inventory-items",
  requireRoles("pharmacy", "manager"),
  asyncHandler(async (req, res) => {
    const category = String(req.query.category ?? "");
    const query: Record<string, unknown> = { active: true };
    if (category) query.category = category;
    const items = await InventoryItem.find(query)
      .populate("drug", "genericName strength")
      .sort({ name: 1 })
      .lean();
    res.json({ data: items });
  }),
);

pharmacyRouter.post(
  "/inventory-items",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      name: z.string().min(2),
      sku: z.string().optional(),
      category: z.enum(["drug", "consumable", "surgical", "equipment", "reagent", "other"]).default("consumable"),
      unitOfMeasure: z.string().default("unit"),
      isControlled: z.boolean().default(false),
      reorderLevel: z.number().min(0).default(10),
      reorderPoint: z.number().min(0).default(5),
      storageCondition: z.string().optional(),
      minOrderQty: z.number().min(1).default(1),
    }),
  }),
  asyncHandler(async (req, res) => {
    const item = await InventoryItem.create(req.body);
    res.status(201).json({ data: item });
  }),
);

// ── Stock Movements ───────────────────────────────────────

pharmacyRouter.get(
  "/stock-movements",
  requireRoles("pharmacy", "manager"),
  asyncHandler(async (req, res) => {
    const movements = await StockMovement.find({})
      .populate("item", "name sku")
      .populate("performedBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ data: movements });
  }),
);

pharmacyRouter.post(
  "/stock-movements",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      item: z.string().min(1),
      batch: z.string().optional(),
      quantity: z.number(),
      fromLocation: z.string().optional(),
      toLocation: z.string().optional(),
      movementType: z.enum(["receipt", "dispense", "transfer", "adjustment", "return", "expiry_write_off"]),
      referenceId: z.string().optional(),
      note: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const movement = await StockMovement.create({
      ...req.body,
      performedBy: req.user?.id,
      notes: req.body.note,
    });

    if (req.body.batch && (req.body.movementType === "dispense" || req.body.movementType === "transfer")) {
      const batch: any = await ExtendedBatch.findById(req.body.batch);
      if (batch) {
        batch.quantity = Math.max((batch.quantity || 0) - Math.abs(req.body.quantity), 0);
        if (batch.quantity === 0) batch.quarantineStatus = "discarded";
        await batch.save();
      }
    }

    if (req.body.movementType === "receipt" && req.body.toLocation && req.body.batch) {
      const batch: any = await ExtendedBatch.findById(req.body.batch);
      if (batch) {
        batch.quantity += Math.abs(req.body.quantity);
        await batch.save();
      }
    }

    res.status(201).json({ data: movement });
  }),
);

// ── Inventory Locations ───────────────────────────────────

pharmacyRouter.get(
  "/locations",
  requireRoles("pharmacy", "manager"),
  asyncHandler(async (_req, res) => {
    const locations = await InventoryLocation.find({ active: true }).sort({ name: 1 }).lean();
    res.json({ data: locations });
  }),
);

pharmacyRouter.post(
  "/locations",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      name: z.string().min(2),
      type: z.enum(["main_pharmacy", "ward_store", "outpatient_pharmacy", "emergency_store"]),
      ward: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const location = await InventoryLocation.create(req.body);
    res.status(201).json({ data: location });
  }),
);

// ── Purchase Orders ───────────────────────────────────────

pharmacyRouter.get(
  "/purchase-orders",
  requireRoles("pharmacy", "manager", "accountant", "accounts_manager"),
  asyncHandler(async (req, res) => {
    const status = String(req.query.status ?? "");
    const query: Record<string, unknown> = status ? { status } : {};
    const orders = await PurchaseOrder.find(query)
      .populate("items.item", "name sku")
      .populate("createdBy", "fullName")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ data: orders });
  }),
);

pharmacyRouter.post(
  "/purchase-orders",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      supplier: z.string().min(2),
      expectedDeliveryDate: z.coerce.date().optional(),
      items: z.array(z.object({
        item: z.string().min(1),
        quantity: z.number().min(1),
        unitCost: z.number().min(0).default(0),
      })).min(1),
      notes: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const poNumber = `PO-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    const order = await PurchaseOrder.create({
      ...req.body,
      poNumber,
      status: "draft",
      createdBy: req.user?.id,
    });
    res.status(201).json({ data: order });
  }),
);

pharmacyRouter.patch(
  "/purchase-orders/:id/approve",
  requireRoles("pharmacy", "manager"),
  asyncHandler(async (req, res) => {
    const order: any = await PurchaseOrder.findById(req.params.id);
    if (!order) throw notFound("Purchase order not found.");
    if (order.status !== "draft") throw new HttpError(409, "Only draft orders can be approved.");
    order.status = "approved";
    order.approvedBy = req.user?.id;
    await order.save();
    res.json({ data: order });
  }),
);

// ── Goods Received Notes ──────────────────────────────────

pharmacyRouter.post(
  "/grn",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      purchaseOrder: z.string().optional(),
      supplier: z.string().min(2),
      items: z.array(z.object({
        item: z.string().min(1),
        quantityReceived: z.number().min(0),
        batchNumber: z.string().min(1),
        expiryDate: z.coerce.date(),
        unitCost: z.number().min(0),
        locationId: z.string().optional(),
      })).min(1),
      notes: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const grnNumber = `GRN-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    const grn = await GoodsReceivedNote.create({
      ...req.body,
      grnNumber,
      status: "draft",
      receivedBy: req.user?.id,
    });

    for (const grnItem of req.body.items) {
      await ExtendedBatch.create({
        item: grnItem.item,
        batchNumber: grnItem.batchNumber,
        quantity: grnItem.quantityReceived,
        expiryDate: grnItem.expiryDate,
        costPrice: grnItem.unitCost,
        supplier: req.body.supplier,
        locationId: grnItem.locationId,
        receivedAt: new Date(),
        receivedBy: req.user?.id,
      });

      await StockMovement.create({
        item: grnItem.item,
        quantity: grnItem.quantityReceived,
        toLocation: grnItem.locationId,
        movementType: "receipt",
        referenceId: grn._id,
        referenceModel: "GoodsReceivedNote",
        performedBy: req.user?.id,
      });
    }

    if (req.body.purchaseOrder) {
      await PurchaseOrder.findByIdAndUpdate(req.body.purchaseOrder, { status: "partially_received" });
    }

    res.status(201).json({ data: grn });
  }),
);

pharmacyRouter.patch(
  "/grn/:id/invoice-match",
  requireRoles("accountant", "accounts_manager"),
  asyncHandler(async (req, res) => {
    const grn: any = await GoodsReceivedNote.findById(req.params.id);
    if (!grn) throw notFound("GRN not found.");
    if (grn.status !== "verified") throw new HttpError(409, "GRN must be verified before invoice matching.");
    grn.status = "invoice_matched";
    grn.invoiceMatchedBy = req.user?.id;
    grn.invoiceMatchedAt = new Date();
    await grn.save();
    res.json({ data: grn });
  }),
);

// ── Controlled Substances ─────────────────────────────────

pharmacyRouter.post(
  "/controlled-substance-dispense",
  requireRoles("pharmacy"),
  validate({
    body: z.object({
      item: z.string().min(1),
      batch: z.string().min(1),
      quantityDispensed: z.number().min(1),
      coSignatory: z.string().min(1),
      prescription: z.string().optional(),
      patient: z.string().optional(),
      shift: z.string().optional(),
      notes: z.string().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const batch: any = await ExtendedBatch.findById(req.body.batch);
    if (!batch) throw notFound("Batch not found.");

    const balanceBefore = batch.quantity;
    const balanceAfter = balanceBefore - req.body.quantityDispensed;

    if (balanceAfter < 0) {
      throw new HttpError(409, "Insufficient stock for controlled substance.");
    }

    const entry = await ControlledSubstanceRegister.create({
      ...req.body,
      balanceBefore,
      balanceAfter,
      dispensedBy: req.user?.id,
      discrepancy: false,
    });

    batch.quantity = balanceAfter;
    await batch.save();

    await StockMovement.create({
      item: req.body.item,
      batch: req.body.batch,
      quantity: -req.body.quantityDispensed,
      movementType: "dispense",
      referenceId: String(entry._id),
      referenceModel: "ControlledSubstanceRegister",
      performedBy: req.user?.id,
    });

    res.status(201).json({ data: entry });
  }),
);

pharmacyRouter.get(
  "/controlled-substance-register",
  requireRoles("pharmacy", "manager"),
  asyncHandler(async (req, res) => {
    const entries = await ControlledSubstanceRegister.find({})
      .populate("item", "name")
      .populate("dispensedBy", "fullName")
      .populate("coSignatory", "fullName")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ data: entries });
  }),
);
