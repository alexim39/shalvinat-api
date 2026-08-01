import type { NextFunction, Request, Response } from "express";
import { AuditLog } from "../models/audit-log.model.js";

const mutatingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function auditTrail(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    if (!req.user || req.path.includes("/health")) {
      return;
    }

    void AuditLog.create({
      actor: req.user.id,
      actorEmail: req.user.email,
      action: mutatingMethods.has(req.method) ? "mutation" : "read",
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      ipAddress: req.ip,
      userAgent: req.header("user-agent"),
      requestId: req.requestId,
      metadata: mutatingMethods.has(req.method)
        ? { bodyKeys: Object.keys(req.body ?? {}) }
        : { query: req.query },
    }).catch(() => undefined);
  });

  next();
}
