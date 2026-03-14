import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "./ApiError";

export type AccessTokenPayload = {
  sub: string;
  username: string;
  phone: string;
  impersonatedBy?: string;
  type: "access";
};

export type RefreshTokenPayload = {
  sub: string;
  type: "refresh";
  jti: string;
};

function signToken(
  payload: object,
  secret: string,
  options: SignOptions,
): string {
  return jwt.sign(payload, secret, options);
}

function verifyToken<T extends JwtPayload>(token: string, secret: string): T {
  try {
    return jwt.verify(token, secret) as T;
  } catch {
    throw new ApiError(401, "Invalid or expired token.");
  }
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "type">): string {
  return signToken(
    { ...payload, type: "access" },
    env.ACCESS_TOKEN_SECRET,
    { expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m` },
  );
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "type">): string {
  return signToken(
    { ...payload, type: "refresh" },
    env.REFRESH_TOKEN_SECRET,
    { expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = verifyToken<AccessTokenPayload & JwtPayload>(
    token,
    env.ACCESS_TOKEN_SECRET,
  );
  if (payload.type !== "access" || !payload.sub) {
    throw new ApiError(401, "Invalid access token.");
  }
  return payload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = verifyToken<RefreshTokenPayload & JwtPayload>(
    token,
    env.REFRESH_TOKEN_SECRET,
  );
  if (payload.type !== "refresh" || !payload.sub || !payload.jti) {
    throw new ApiError(401, "Invalid refresh token.");
  }
  return payload;
}
