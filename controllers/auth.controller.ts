import type { Request, Response } from "express";
import { env } from "../config/env";
import { PHONE_COUNTRY_OPTIONS } from "../config/phoneWhitelist";
import {
  login,
  logout,
  refreshAuthTokens,
  requestAccountVerification,
  requestPasswordReset,
  resetPassword,
  signup,
  verifyAccount,
} from "../services/auth.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { parseCookieValue } from "../utils/cookie";
import { getUserModel } from "../models/user.model";

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${fieldName} is required.`);
  }
  return value.trim();
}

function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
  res.cookie(env.ACCESS_COOKIE_NAME, tokens.accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60 * 1000,
    path: "/",
  });
  res.cookie(env.REFRESH_COOKIE_NAME, tokens.refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookies(res: Response) {
  const options = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
    path: "/",
  };
  res.clearCookie(env.ACCESS_COOKIE_NAME, options);
  res.clearCookie(env.REFRESH_COOKIE_NAME, options);
}

export async function signupController(req: Request, res: Response) {
  const username = requireString(req.body?.username, "username");
  const phone = requireString(req.body?.phone, "phone");
  const password = requireString(req.body?.password, "password");
  const location =
    typeof req.body?.location === "string" && req.body.location.trim()
      ? req.body.location.trim()
      : "unknown";
  const result = await signup(username, phone, password, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
    location,
  });
  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });

  return res.status(201).json(
    new ApiResponse(true, "Signup successful. OTP sent for account verification.", {
      token: result.accessToken,
      refreshToken: result.refreshToken,
      username: result.user.username,
      phone: result.user.phone,
      password,
      verified: result.user.isVerified,
    }),
  );
}

export async function requestVerifyController(req: Request, res: Response) {
  const phone = requireString(req.body?.phone, "phone");
  await requestAccountVerification(phone);
  return res.json(new ApiResponse(true, "Verification OTP sent."));
}

export async function confirmVerifyController(req: Request, res: Response) {
  const phone = requireString(req.body?.phone, "phone");
  const code = requireString(req.body?.code, "code");
  await verifyAccount(phone, code);
  return res.json(new ApiResponse(true, "Account verified successfully."));
}

export async function loginController(req: Request, res: Response) {
  const username = requireString(req.body?.username, "username");
  const password = requireString(req.body?.password, "password");
  const location = requireString(req.body?.location, "location");
  const result = await login(username, password, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
    location,
  });
  setAuthCookies(res, {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  });
  return res.json(new ApiResponse(true, "Login successful.", result));
}

export async function refreshTokenController(req: Request, res: Response) {
  const refreshToken = parseCookieValue(req.headers.cookie, env.REFRESH_COOKIE_NAME);
  if (!refreshToken) {
    throw new ApiError(401, "Missing refresh token cookie.");
  }

  const tokens = await refreshAuthTokens(refreshToken, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });

  setAuthCookies(res, tokens);
  return res.json(new ApiResponse(true, "Token refreshed."));
}

export async function requestResetPasswordController(req: Request, res: Response) {
  const phone = requireString(req.body?.phone, "phone");
  await requestPasswordReset(phone);
  return res.json(new ApiResponse(true, "Password reset OTP sent."));
}

export async function confirmResetPasswordController(req: Request, res: Response) {
  const phone = requireString(req.body?.phone, "phone");
  const code = requireString(req.body?.code, "code");
  const newPassword = requireString(req.body?.newPassword, "newPassword");
  await resetPassword(phone, code, newPassword);
  return res.json(new ApiResponse(true, "Password reset successful."));
}

export async function meController(req: Request, res: Response) {
  return res.json(
    new ApiResponse(true, "Authenticated user profile.", {
      user: req.authUser,
    }),
  );
}

export async function updateProfileController(req: Request, res: Response) {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }

  const User = getUserModel();
  const user = await User.findById(req.authUser.id);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const usernameRaw = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
  const fullName = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  const address = typeof req.body?.address === "string" ? req.body.address.trim() : "";
  const gender = typeof req.body?.gender === "string" ? req.body.gender.trim().toLowerCase() : "";
  const age = Number(req.body?.age);

  if (!/^[a-z0-9_]{3,30}$/.test(usernameRaw)) {
    throw new ApiError(
      400,
      "Username must be 3-30 chars and contain only letters, numbers, underscore.",
    );
  }
  if (!fullName) {
    throw new ApiError(400, "fullName is required.");
  }
  if (!address) {
    throw new ApiError(400, "address is required.");
  }
  if (!["male", "female", "other"].includes(gender)) {
    throw new ApiError(400, "gender must be one of: male, female, other.");
  }
  if (!Number.isInteger(age) || age < 18 || age > 120) {
    throw new ApiError(400, "age must be an integer between 18 and 120.");
  }

  const usernameTaken = await User.findOne({
    username: usernameRaw,
    _id: { $ne: user._id },
  });
  if (usernameTaken) {
    throw new ApiError(409, "Username is already taken.");
  }

  user.username = usernameRaw;
  user.set("profile.fullName", fullName);
  user.set("profile.address", address);
  user.set("profile.gender", gender);
  user.set("profile.age", age);
  await user.save();

  req.authUser.username = user.username;

  return res.json(
    new ApiResponse(true, "Profile updated successfully.", {
      user: {
        id: String(user._id),
        username: user.username,
        phone: user.phone,
        role: String(user.role || "farmer"),
        memberQrCode: String(user.memberQrCode || ""),
        onboardingCompleted: Boolean(user.onboardingCompleted),
        kycReviewStatus: user.kycReview?.status || "not_started",
        kycRejectionReason: user.kycReview?.rejectionReason || null,
      },
      profile: {
        fullName: user.profile?.fullName || null,
        address: user.profile?.address || null,
        gender: user.profile?.gender || null,
        age: user.profile?.age ?? null,
      },
    }),
  );
}

export async function whitelistedPhoneCountriesController(
  _req: Request,
  res: Response,
) {
  return res.json(
    new ApiResponse(true, "Whitelisted phone country codes", {
      countries: PHONE_COUNTRY_OPTIONS,
    }),
  );
}

export async function logoutController(_req: Request, res: Response) {
  const refreshToken = parseCookieValue(_req.headers.cookie, env.REFRESH_COOKIE_NAME);
  if (refreshToken) {
    await logout(refreshToken);
  }

  clearAuthCookies(res);
  return res.json(new ApiResponse(true, "Logout successful."));
}

export async function setMarketplaceModeController(req: Request, res: Response) {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }
  const mode = String(req.body?.mode || "").trim().toLowerCase();
  if (!["buyer", "seller", "both"].includes(mode)) {
    throw new ApiError(400, "mode must be buyer, seller, or both.");
  }

  const User = getUserModel();
  const user = await User.findById(req.authUser.id);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }
  user.marketplaceMode = mode as any;

  // Marketplace mode is a user preference, not a platform role split.
  if (["buyer", "seller"].includes(String(user.role))) {
    user.role = "farmer" as any;
  }
  await user.save();

  return res.json(
    new ApiResponse(true, "Marketplace mode updated.", {
      mode: user.marketplaceMode,
      role: user.role,
    }),
  );
}
