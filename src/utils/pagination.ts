import type { Request } from "express";

export function getPagination(req: Request, defaultLimit = 25, maxLimit = 100) {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? defaultLimit), 1), maxLimit);
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

export function paginationMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}
