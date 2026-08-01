import { nanoid } from "nanoid";

export function makeVisitNumber() {
  return `VIS-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
}

export function makeInvoiceNumber() {
  return `INV-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
}

export function makeLabSampleCode() {
  return `LAB-${nanoid(10).toUpperCase()}`;
}

export function makeReceiptNumber() {
  return `RCT-${new Date().getFullYear()}-${nanoid(8).toUpperCase()}`;
}
