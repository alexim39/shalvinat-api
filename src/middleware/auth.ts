import type { NextFunction, Request, Response } from "express";
import { User } from "../models/user.model.js";
import type { Role } from "../types.js";
import { forbidden, HttpError } from "../utils/http-error.js";
import { verifyAccessToken } from "../utils/tokens.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");

  if (!header?.startsWith("Bearer ")) {
    return next(new HttpError(401, "Missing bearer token."));
  }

  try {
    const user = verifyAccessToken(header.slice("Bearer ".length));
    const exists = await User.exists({ _id: user.id, status: "active" });

    if (!exists) {
      return next(new HttpError(401, "User account is inactive or unavailable."));
    }

    req.user = user;
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired token."));
  }
}

export function requireRoles(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, "Authentication required."));
    }

    if (req.user.roles.includes("director") || roles.some((role) => req.user?.roles.includes(role))) {
      return next();
    }

    return next(forbidden());
  };
}
