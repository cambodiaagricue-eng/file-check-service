import type { NextFunction, Request, Response } from "express";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";

export function requireRole(...roles: Array<string>) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser?.id) {
      return next(new ApiError(401, "Unauthorized."));
    }
    const User = getUserModel();
    const user = await User.findById(req.authUser.id);
    if (!user) {
      return next(new ApiError(401, "User not found."));
    }
    if (!roles.includes(String(user.role))) {
      return next(new ApiError(403, "Insufficient role permissions."));
    }
    return next();
  };
}
