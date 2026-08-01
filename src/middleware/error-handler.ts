import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const statusCode = error instanceof HttpError ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error.";
  const details = error instanceof HttpError ? error.details : undefined;

  res.status(statusCode).json({
    error: {
      message,
      details,
      requestId: req.requestId,
      stack: env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.stack : undefined,
    },
  });
}
