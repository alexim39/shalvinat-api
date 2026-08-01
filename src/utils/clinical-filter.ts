import type { Role } from "../types.js";

const CLINICAL_READ_ROLES: Role[] = ["doctor", "director", "nurse"];
const CLINICAL_RESTRICTED_ROLES: Role[] = ["pharmacy", "laboratory", "radiology", "reception", "accountant", "accounts_manager", "manager"];

export function shouldRedactClinicalData(roles: Role[]): boolean {
  if (roles.includes("director")) return false;
  if (roles.includes("doctor")) return false;
  if (roles.includes("nurse")) return false;
  return true;
}

export function redactClinicalNote(note: Record<string, unknown>): Record<string, unknown> {
  const { assessmentEncrypted, assessment, diagnoses, reviewOfSystems, physicalExam, plan, subjective, ...rest } = note as any;
  return {
    ...rest,
    diagnoses: undefined,
    assessment: undefined,
    assessmentEncrypted: undefined,
    subjective: "[redacted]",
    plan: "[redacted]",
    reviewOfSystems: undefined,
    physicalExam: undefined,
  };
}

export function filterClinicalDataForRole<T extends Record<string, unknown>>(
  data: T,
  roles: Role[],
): T {
  if (!shouldRedactClinicalData(roles)) return data;

  const filtered = { ...data };

  if (Array.isArray((filtered as any).clinicalNotes)) {
    (filtered as any).clinicalNotes = (filtered as any).clinicalNotes.map(redactClinicalNote);
  }

  if ((filtered as any).clinicalNote) {
    (filtered as any).clinicalNote = redactClinicalNote((filtered as any).clinicalNote);
  }

  return filtered;
}
