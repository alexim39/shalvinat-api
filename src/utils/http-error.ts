export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function forbidden(message = "You do not have permission to perform this action.") {
  return new HttpError(403, message);
}

export function notFound(message = "Record not found.") {
  return new HttpError(404, message);
}
