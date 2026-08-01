import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { HttpError } from "../utils/http-error.js";

type Schemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result: Record<string, unknown> = {};

    for (const [key, schema] of Object.entries(schemas)) {
      if (!schema) {
        continue;
      }

      const parsed = schema.safeParse(req[key as keyof Request]);
      if (!parsed.success) {
        return next(new HttpError(422, "Validation failed.", parsed.error.flatten()));
      }

      result[key] = parsed.data;
    }

    if (result.body) {
      req.body = result.body;
    }
    if (result.query) {
      req.query = result.query as Request["query"];
    }
    if (result.params) {
      req.params = result.params as Request["params"];
    }

    return next();
  };
}
