import { Counter } from "../models/counter.model.js";

export async function nextPatientNumber() {
  const year = new Date().getFullYear();
  const counter = await Counter.findOneAndUpdate(
    { key: `patient-${year}` },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  return `SHL-${year}-${String(counter.value).padStart(5, "0")}`;
}

export async function nextQueueNumber(department: string) {
  const day = new Date().toISOString().slice(0, 10);
  const counter = await Counter.findOneAndUpdate(
    { key: `queue-${day}-${department.toLowerCase()}` },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );
  return counter.value;
}
