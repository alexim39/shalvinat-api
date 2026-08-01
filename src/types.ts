import type { Types } from "mongoose";

export const ROLES = [
  "reception",
  "nurse",
  "doctor",
  "pharmacy",
  "laboratory",
  "radiology",
  "manager",
  "accountant",
  "accounts_manager",
  "director",
] as const;

export type Role = (typeof ROLES)[number];

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  department?: string;
};

export type ObjectIdLike = Types.ObjectId | string;

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestId?: string;
    }
  }
}
