import mongoose, { model, Schema } from "mongoose";

const { models } = mongoose;

const paymentEntrySchema = new Schema(
  {
    receiptNumber: { type: String, required: true, unique: true },
    visit: { type: Schema.Types.ObjectId, ref: "Visit", index: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice", index: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
      type: String,
      enum: ["cash", "pos", "bank_transfer", "hmo", "nhia", "online"],
      required: true,
    },
    reference: { type: String, trim: true },
    type: {
      type: String,
      enum: ["payment", "partial_reversal", "full_reversal", "refund"],
      default: "payment",
    },
    status: {
      type: String,
      enum: ["pending", "authorized", "reversed", "rejected"],
      default: "pending",
      index: true,
    },
    receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    authorizedBy: { type: Schema.Types.ObjectId, ref: "User" },
    authorizedAt: { type: Date },
    supervisorAuthorizerId: { type: Schema.Types.ObjectId, ref: "User" },
    supervisorAuthorizedAt: { type: Date },
    paymentDate: { type: Date, default: Date.now },
    reversalReason: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

const receivableSchema = new Schema(
  {
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice", required: true, index: true },
    amountOutstanding: { type: Number, required: true, min: 0 },
    daysOutstanding: { type: Number, default: 0 },
    agingBucket: {
      type: String,
      enum: ["0_30", "31_60", "61_90", "91_plus"],
      default: "0_30",
    },
    lastPaymentDate: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

const hmoClaimSchema = new Schema(
  {
    claimNumber: { type: String, required: true, unique: true },
    patient: { type: Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    visit: { type: Schema.Types.ObjectId, ref: "Visit", required: true },
    hmoProvider: { type: String, required: true, trim: true },
    hmoPlan: { type: String, trim: true },
    invoice: { type: Schema.Types.ObjectId, ref: "Invoice", index: true },
    claimedAmount: { type: Number, required: true, min: 0 },
    approvedAmount: { type: Number, min: 0 },
    status: {
      type: String,
      enum: ["draft", "submitted", "pending", "approved", "partially_approved", "rejected", "paid"],
      default: "draft",
      index: true,
    },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    rejectionReason: { type: String, trim: true },
    submissionDate: { type: Date },
    responseDate: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

const voucherSchema = new Schema(
  {
    voucherNumber: { type: String, required: true, unique: true },
    type: { type: String, enum: ["petty_cash", "vendor_payment", "refund"], required: true },
    payee: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    receiptAttachmentUrl: { type: String, trim: true },
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "paid", "rejected", "cancelled"],
      default: "draft",
      index: true,
    },
    preparedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    paymentDate: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

const approvalRequestSchema = new Schema(
  {
    requestType: {
      type: String,
      enum: ["payment_reversal", "refund", "invoice_edit", "claim_submission", "voucher_approval", "grn_payment"],
      required: true,
    },
    referenceId: { type: String, required: true },
    referenceModel: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    approverRole: { type: String, enum: ["manager", "director"], required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reason: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true },
);

paymentEntrySchema.index({ status: 1, createdAt: -1 });
paymentEntrySchema.index({ patient: 1, createdAt: -1 });
receivableSchema.index({ agingBucket: 1 });
receivableSchema.index({ patient: 1 });
hmoClaimSchema.index({ status: 1 });
hmoClaimSchema.index({ hmoProvider: 1 });
voucherSchema.index({ status: 1, type: 1 });
approvalRequestSchema.index({ status: 1, approverRole: 1 });

export const PaymentEntry = (models.PaymentEntry || model("PaymentEntry", paymentEntrySchema)) as any;
export const Receivable = (models.Receivable || model("Receivable", receivableSchema)) as any;
export const HmoClaim = (models.HmoClaim || model("HmoClaim", hmoClaimSchema)) as any;
export const Voucher = (models.Voucher || model("Voucher", voucherSchema)) as any;
export const ApprovalRequest = (models.ApprovalRequest || model("ApprovalRequest", approvalRequestSchema)) as any;
