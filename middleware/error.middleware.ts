import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  const message = err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({
    success: false,
    message,
  });
}
