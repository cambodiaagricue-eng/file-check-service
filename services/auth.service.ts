import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { env } from "../config/env";
import { PHONE_PREFIX_WHITELIST } from "../config/phoneWhitelist";
import { getSessionModel } from "../models/session.model";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { verifyRefreshToken, signAccessToken, signRefreshToken } from "../utils/jwt";
import { digestToken } from "../utils/token";
import { requestOtp, verifyOtp } from "./otp.service";

type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    username: string;
    phone: string;
    role: string;
    memberQrCode: string;
    isVerified: boolean;
    lastLogins: Array<{ location: string; loggedAt: Date }>;
  };
};

type RequestMeta = {
  ip?: string;
  userAgent?: string;
  location?: string;
};

function toLastLogins(value: unknown): Array<{ location: string; loggedAt: Date }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => ({
      location: String((entry as any)?.location || "unknown"),
      loggedAt: new Date((entry as any)?.loggedAt || new Date()),
    }))
    .slice(0, 3);
}

function normalizeUsername(username: string): string {
  const cleaned = username.trim().toLowerCase();
  const valid = /^[a-z0-9_]{3,30}$/;
  if (!valid.test(cleaned)) {
    throw new ApiError(
      400,
      "Username must be 3-30 chars and contain only letters, numbers, underscore.",
    );
  }
  return cleaned;
}

function normalizePhone(phone: string): string {
  const cleaned = phone.trim();
  const e164 = /^\+[1-9]\d{7,14}$/;
  if (!e164.test(cleaned)) {
    throw new ApiError(400, "Phone must be in E.164 format, e.g. +919876543210");
  }

  const isWhitelisted = PHONE_PREFIX_WHITELIST.some((prefix) => cleaned.startsWith(prefix));
  if (!isWhitelisted) {
    throw new ApiError(400, "Only +91 (India) and +855 (Cambodia) are allowed.");
  }
  return cleaned;
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters long.");
  }
}

async function issueTokenPair(
  user: { _id: string; username: string; phone: string; impersonatedBy?: string },
  requestMeta?: RequestMeta,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenId = randomUUID();
  const accessToken = signAccessToken({
    sub: String(user._id),
    username: user.username,
    phone: user.phone,
    impersonatedBy: user.impersonatedBy,
  });
  const refreshToken = signRefreshToken({
    sub: String(user._id),
    jti: tokenId,
  });

  const Session = getSessionModel();
  const refreshTokenHash = digestToken(refreshToken);
  await Session.create({
    userId: user._id as any,
    tokenId,
    refreshTokenHash,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    ip: requestMeta?.ip,
    userAgent: requestMeta?.userAgent,
  });

  return { accessToken, refreshToken };
}

async function revokeRefreshToken(refreshToken: string): Promise<void> {
  const Session = getSessionModel();
  const refreshTokenHash = digestToken(refreshToken);
  await Session.updateOne(
    { refreshTokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function signup(
  usernameRaw: string,
  phoneRaw: string,
  password: string,
  requestMeta?: RequestMeta,
): Promise<AuthResult> {
  const username = normalizeUsername(usernameRaw);
  const phone = normalizePhone(phoneRaw);
  validatePassword(password);

  const User = getUserModel();
  const existing = await User.findOne({ $or: [{ phone }, { username }] });
  if (existing) {
    throw new ApiError(409, "Account already exists with this username or number.");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    username,
    phone,
    passwordHash,
    isVerified: false,
    isActive: true,
  });

  await requestOtp(phone, "verify_account");
  const { accessToken, refreshToken } = await issueTokenPair(user, requestMeta);

  return {
    accessToken,
    refreshToken,
    user: {
      id: String(user._id),
      username: user.username,
      phone: user.phone,
      role: String(user.role || "farmer"),
      memberQrCode: String(user.memberQrCode || ""),
      isVerified: user.isVerified,
      lastLogins: toLastLogins(user.lastLogins),
    },
  };
}

export async function requestAccountVerification(phoneRaw: string): Promise<void> {
  const phone = normalizePhone(phoneRaw);
  const User = getUserModel();
  const user = await User.findOne({ phone });
  if (!user) {
    throw new ApiError(404, "Account not found.");
  }
  if (user.isVerified) {
    throw new ApiError(400, "Account is already verified.");
  }
  await requestOtp(phone, "verify_account");
}

export async function verifyAccount(phoneRaw: string, code: string): Promise<void> {
  const phone = normalizePhone(phoneRaw);
  await verifyOtp(phone, "verify_account", code);

  const User = getUserModel();
  const user = await User.findOne({ phone });
  if (!user) {
    throw new ApiError(404, "Account not found.");
  }

  user.isVerified = true;
  await user.save();
}

export async function login(
  usernameRaw: string,
  password: string,
  requestMeta?: RequestMeta,
): Promise<AuthResult> {
  const username = normalizeUsername(usernameRaw);
  const User = getUserModel();
  const user = await User.findOne({ username });
  if (!user) {
    throw new ApiError(401, "Invalid credentials.");
  }
  if (!user.isActive) {
    throw new ApiError(403, "Account is disabled.");
  }
  if (user.isLoginBlocked) {
    throw new ApiError(
      403,
      user.loginBlockedReason || "Account blocked. Please contact admin.",
    );
  }
  if (!user.isVerified) {
    throw new ApiError(403, "Verify your account before logging in.");
  }

  const passOk = await bcrypt.compare(password, user.passwordHash);
  if (!passOk) {
    throw new ApiError(401, "Invalid credentials.");
  }

  const loginLocation = requestMeta?.location?.trim() || "unknown";
  const loginEntry = { location: loginLocation, loggedAt: new Date() };
  const currentLogins = toLastLogins(user.lastLogins);
  user.set("lastLogins", [loginEntry, ...currentLogins].slice(0, 3));
  await user.save();

  const { accessToken, refreshToken } = await issueTokenPair(user, requestMeta);

  return {
    accessToken,
    refreshToken,
    user: {
      id: String(user._id),
      username: user.username,
      phone: user.phone,
      role: String(user.role || "farmer"),
      memberQrCode: String(user.memberQrCode || ""),
      isVerified: user.isVerified,
      lastLogins: toLastLogins(user.lastLogins),
    },
  };
}

export async function refreshAuthTokens(
  refreshToken: string,
  requestMeta?: RequestMeta,
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = verifyRefreshToken(refreshToken);
  const Session = getSessionModel();
  const refreshTokenHash = digestToken(refreshToken);
  const session = await Session.findOne({
    tokenId: payload.jti,
    refreshTokenHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  });
  if (!session) {
    throw new ApiError(401, "Invalid refresh token.");
  }

  const User = getUserModel();
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    throw new ApiError(401, "Invalid session user.");
  }
  if (user.isLoginBlocked) {
    throw new ApiError(
      403,
      user.loginBlockedReason || "Account blocked. Please contact admin.",
    );
  }

  // Rotate refresh token: revoke old, issue new.
  session.revokedAt = new Date();
  await session.save();

  return issueTokenPair(
    {
      _id: String(user._id),
      username: user.username,
      phone: user.phone,
    },
    requestMeta,
  );
}

export async function requestPasswordReset(phoneRaw: string): Promise<void> {
  const phone = normalizePhone(phoneRaw);
  const User = getUserModel();
  const user = await User.findOne({ phone });
  if (!user) {
    throw new ApiError(404, "Account not found.");
  }
  await requestOtp(phone, "reset_password");
}

export async function resetPassword(
  phoneRaw: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const phone = normalizePhone(phoneRaw);
  validatePassword(newPassword);
  await verifyOtp(phone, "reset_password", code);

  const User = getUserModel();
  const user = await User.findOne({ phone });
  if (!user) {
    throw new ApiError(404, "Account not found.");
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  const Session = getSessionModel();
  await Session.updateMany(
    { userId: user._id as any, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function logout(refreshToken: string): Promise<void> {
  await revokeRefreshToken(refreshToken);
}

export async function impersonateUser(
  superadminId: string,
  targetUserId: string,
  requestMeta?: RequestMeta,
) {
  const User = getUserModel();
  const actor = await User.findById(superadminId);
  if (!actor || actor.role !== "superadmin") {
    throw new ApiError(403, "Only superadmin can impersonate users.");
  }

  const target = await User.findById(targetUserId);
  if (!target) {
    throw new ApiError(404, "Target user not found.");
  }

  const { accessToken, refreshToken } = await issueTokenPair(
    {
      _id: String(target._id),
      username: target.username,
      phone: target.phone,
      impersonatedBy: String(actor._id),
    },
    requestMeta,
  );

  return {
    accessToken,
    refreshToken,
    impersonatedUser: {
      id: String(target._id),
      username: target.username,
      phone: target.phone,
      role: target.role,
    },
  };
}
