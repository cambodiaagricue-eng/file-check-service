import type { NextFunction, Request, Response } from "express";
import { getUserModel } from "../models/user.model";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { parseCookieValue } from "../utils/cookie";
import { verifyAccessToken } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        username: string;
        phone: string;
      };
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const cookieToken = parseCookieValue(req.headers.cookie, env.ACCESS_COOKIE_NAME);
  const authHeader = req.header("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const token = cookieToken || bearerToken;

  if (!token) {
    return next(new ApiError(401, "Missing authentication token."));
  }

  const payload = verifyAccessToken(token);

  const User = getUserModel();
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    return next(new ApiError(401, "Invalid session user."));
  }

  req.authUser = {
    id: String(user._id),
    username: user.username,
    phone: user.phone,
  };

  return next();
}
