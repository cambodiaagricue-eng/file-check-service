import type { NextFunction, Request, Response } from "express";

const errorHandler = async (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (err instanceof Error) {
    res.status(500).json({ error: err.message });
  } else {
    next();
  }
};

export default errorHandler;
