import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const invoiceItemSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    receiptNumber: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ["cash", "pos", "hmo", "nhia", "bank_transfer", "online"],
      required: true,
    },
    reference: { type: String, trim: true },
    collectedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    collectedAt: { type: Date, default: Date.now },
    reversedAt: { type: Date },
    reversalReason: { type: String, trim: true },
  },
  { _id: true },
);

const invoiceSchema = new Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    visit: { type: Schema.Types.ObjectId, ref: "Visit", index: true },
    items: [invoiceItemSchema],
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["draft", "pending", "partial", "paid", "void"],
      default: "pending",
      index: true,
    },
    payerType: { type: String, enum: ["self", "hmo", "nhia", "company"], default: "self" },
    payments: [paymentSchema],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    voidedAt: { type: Date },
    voidReason: { type: String, trim: true },
    supervisorAuthorizerId: { type: Schema.Types.ObjectId, ref: "User" },
    supervisorAuthorizedAt: { type: Date },
    editHistory: [
      {
        editedBy: { type: Schema.Types.ObjectId, ref: "User" },
        editedAt: { type: Date },
        changes: { type: Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true },
);

export const Invoice = (models.Invoice || model("Invoice", invoiceSchema)) as any;
