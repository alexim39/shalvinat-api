import type { NextFunction, Request, Response } from "express";
import { nanoid } from "nanoid";

export function requestContext(req: Request, res: Response, next: NextFunction) {
  req.requestId = req.header("x-request-id") || nanoid(12);
  res.setHeader("x-request-id", req.requestId);
  next();
}
