import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const prescriptionSchema = new Schema(
  {
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    drug: { type: Schema.Types.ObjectId, ref: "Drug" },
    drugName: { type: String, required: true, trim: true },
    brandName: { type: String, trim: true },
    dose: { type: String, required: true, trim: true },
    frequency: { type: String, required: true, trim: true },
    route: { type: String, required: true, trim: true },
    duration: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    specialInstructions: { type: String, trim: true },
    interactionFlags: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["pending", "dispensed", "partially_dispensed", "cancelled"],
      default: "pending",
      index: true,
    },
    dispensedBy: { type: Schema.Types.ObjectId, ref: "User" },
    dispensedAt: { type: Date },
  },
  { timestamps: true },
);

const drugSchema = new Schema(
  {
    genericName: { type: String, required: true, trim: true, index: true },
    brandNames: [{ type: String, trim: true }],
    strength: { type: String, required: true, trim: true },
    dosageForm: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["controlled", "prescription", "otc", "consumable"],
      default: "prescription",
      index: true,
    },
    storageRequirements: { type: String, trim: true },
    reorderLevel: { type: Number, default: 10, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const inventoryBatchSchema = new Schema(
  {
    drug: { type: Schema.Types.ObjectId, ref: "Drug", required: true, index: true },
    batchNumber: { type: String, required: true, trim: true },
    location: { type: String, default: "main_pharmacy", trim: true },
    quantityOnHand: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    expiryDate: { type: Date, required: true, index: true },
    supplier: { type: String, trim: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const dispenseRecordSchema = new Schema(
  {
    prescription: { type: Schema.Types.ObjectId, ref: "Prescription", required: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "InventoryBatch" },
    quantityDispensed: { type: Number, required: true, min: 1 },
    counsellingNotes: { type: String, trim: true },
    dispensedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export const Prescription = (models.Prescription || model("Prescription", prescriptionSchema)) as any;
export const Drug = (models.Drug || model("Drug", drugSchema)) as any;
export const InventoryBatch = (models.InventoryBatch || model("InventoryBatch", inventoryBatchSchema)) as any;
export const DispenseRecord = (models.DispenseRecord || model("DispenseRecord", dispenseRecordSchema)) as any;

const inventoryItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    sku: { type: String, trim: true, unique: true, sparse: true },
    drug: { type: Schema.Types.ObjectId, ref: "Drug" },
    category: {
      type: String,
      enum: ["drug", "consumable", "surgical", "equipment", "reagent", "other"],
      default: "drug",
      index: true,
    },
    unitOfMeasure: { type: String, trim: true, default: "unit" },
    isControlled: { type: Boolean, default: false, index: true },
    reorderLevel: { type: Number, default: 10, min: 0 },
    reorderPoint: { type: Number, default: 5, min: 0 },
    storageCondition: { type: String, trim: true },
    minOrderQty: { type: Number, default: 1, min: 1 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const extendedBatchSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    batchNumber: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true, index: true },
    costPrice: { type: Number, default: 0, min: 0 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    supplier: { type: String, trim: true },
    locationId: { type: Schema.Types.ObjectId, ref: "InventoryLocation", index: true },
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User" },
    quarantineStatus: {
      type: String,
      enum: ["active", "quarantined", "expired", "discarded"],
      default: "active",
    },
  },
  { timestamps: true },
);

const inventoryLocationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["main_pharmacy", "ward_store", "outpatient_pharmacy", "emergency_store"],
      required: true,
      index: true,
    },
    ward: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const stockMovementSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "InventoryBatch" },
    quantity: { type: Number, required: true },
    fromLocation: { type: Schema.Types.ObjectId, ref: "InventoryLocation" },
    toLocation: { type: Schema.Types.ObjectId, ref: "InventoryLocation" },
    movementType: {
      type: String,
      enum: ["receipt", "dispense", "transfer", "adjustment", "return", "expiry_write_off"],
      required: true,
      index: true,
    },
    referenceId: { type: String, trim: true },
    referenceModel: { type: String, trim: true },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

const purchaseOrderSchema = new Schema(
  {
    poNumber: { type: String, required: true, unique: true },
    supplier: { type: String, required: true, trim: true },
    expectedDeliveryDate: { type: Date },
    items: [
      {
        item: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
        quantity: { type: Number, required: true, min: 1 },
        unitCost: { type: Number, default: 0 },
      },
    ],
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "ordered", "partially_received", "received", "cancelled"],
      default: "draft",
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

const grnSchema = new Schema(
  {
    grnNumber: { type: String, required: true, unique: true },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", index: true },
    supplier: { type: String, required: true, trim: true },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    items: [
      {
        item: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
        quantityReceived: { type: Number, required: true, min: 0 },
        batchNumber: { type: String, required: true },
        expiryDate: { type: Date, required: true },
        unitCost: { type: Number, required: true, min: 0 },
        locationId: { type: Schema.Types.ObjectId, ref: "InventoryLocation" },
      },
    ],
    status: {
      type: String,
      enum: ["draft", "verified", "invoice_matched", "paid"],
      default: "draft",
      index: true,
    },
    invoiceMatchedBy: { type: Schema.Types.ObjectId, ref: "User" },
    invoiceMatchedAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

const controlledSubstanceRegisterSchema = new Schema(
  {
    item: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true, index: true },
    batch: { type: Schema.Types.ObjectId, ref: "InventoryBatch", required: true },
    shift: { type: String, trim: true },
    balanceBefore: { type: Number, required: true, min: 0 },
    quantityDispensed: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    dispensedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    coSignatory: { type: Schema.Types.ObjectId, ref: "User", required: true },
    prescription: { type: Schema.Types.ObjectId, ref: "Prescription" },
    patient: { type: Schema.Types.ObjectId, ref: "Patient" },
    discrepancy: { type: Boolean, default: false },
    discrepancyReason: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

export const InventoryItem = (models.InventoryItem || model("InventoryItem", inventoryItemSchema)) as any;
export const ExtendedBatch = (models.ExtendedBatch || model("ExtendedBatch", extendedBatchSchema)) as any;
export const InventoryLocation = (models.InventoryLocation || model("InventoryLocation", inventoryLocationSchema)) as any;
export const StockMovement = (models.StockMovement || model("StockMovement", stockMovementSchema)) as any;
export const PurchaseOrder = (models.PurchaseOrder || model("PurchaseOrder", purchaseOrderSchema)) as any;
export const GoodsReceivedNote = (models.GoodsReceivedNote || model("GoodsReceivedNote", grnSchema)) as any;
export const ControlledSubstanceRegister = (models.ControlledSubstanceRegister || model("ControlledSubstanceRegister", controlledSubstanceRegisterSchema)) as any;

