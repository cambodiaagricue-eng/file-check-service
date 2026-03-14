import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { getOnboardingRecordModel } from "../models/onboardingRecord.model";
import { getUserModel } from "../models/user.model";
import { impersonateUser } from "../services/auth.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

function normalizeS3Url(url: string | null | undefined) {
  if (!url) {
    return url ?? null;
  }

  const bucketName = env.AWS_BUCKET_NAME;
  const bucketRegion = env.AWS_BUCKET_REGION || env.AWS_REGION;

  if (!bucketName || !bucketRegion) {
    return url;
  }

  const escapedBucket = bucketName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bucketPattern = new RegExp(
    `^https://${escapedBucket}\\.s3\\.[^.]+\\.amazonaws\\.com/`,
    "i",
  );

  return url.replace(
    bucketPattern,
    `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/`,
  );
}

function mapAdminUserRow(u: any, record: any) {
  return {
    userId: String(u._id),
    username: u.username,
    phone: u.phone,
    role: u.role,
    memberQrCode: u.memberQrCode,
    createdByAgentId: u.createdByAgentId,
    agentCreatedPendingApproval: u.agentCreatedPendingApproval,
    isActive: u.isActive,
    onboardingCompleted: u.onboardingCompleted,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastLogins: u.lastLogins || [],
    profile: u.profile,
    onboardingFromUser: u.onboarding
      ? {
          ...u.onboarding,
          steps: {
            ...u.onboarding.steps,
            step1: u.onboarding.steps?.step1
              ? {
                  ...u.onboarding.steps.step1,
                  selfiePath: normalizeS3Url(u.onboarding.steps.step1.selfiePath),
                }
              : u.onboarding.steps?.step1,
            step2: u.onboarding.steps?.step2
              ? {
                  ...u.onboarding.steps.step2,
                  govIdPath: normalizeS3Url(u.onboarding.steps.step2.govIdPath),
                }
              : u.onboarding.steps?.step2,
            step3: u.onboarding.steps?.step3
              ? {
                  ...u.onboarding.steps.step3,
                  landDocumentPaths: (u.onboarding.steps.step3.landDocumentPaths || []).map(
                    (path: string) => normalizeS3Url(path) || "",
                  ),
                }
              : u.onboarding.steps?.step3,
          },
        }
      : u.onboarding,
    onboardingRecord: record || null,
    verification: u.verification,
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${field} is required.`);
  }
  return value.trim();
}

export async function superadminCreateAdminController(req: Request, res: Response) {
  const username = requireString(req.body?.username, "username").toLowerCase();
  const phone = requireString(req.body?.phone, "phone");
  const password = requireString(req.body?.password, "password");

  const User = getUserModel();
  const exists = await User.findOne({ $or: [{ username }, { phone }] });
  if (exists) {
    throw new ApiError(409, "User already exists.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    username,
    phone,
    passwordHash,
    role: "admin",
    isVerified: true,
    isActive: true,
  });

  return res.json(new ApiResponse(true, "Admin created.", user));
}

export async function createAgentController(req: Request, res: Response) {
  const username = requireString(req.body?.username, "username").toLowerCase();
  const phone = requireString(req.body?.phone, "phone");
  const password = requireString(req.body?.password, "password");

  const User = getUserModel();
  const exists = await User.findOne({ $or: [{ username }, { phone }] });
  if (exists) {
    throw new ApiError(409, "User already exists.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    username,
    phone,
    passwordHash,
    role: "agent",
    isVerified: true,
    isActive: true,
  });

  return res.json(new ApiResponse(true, "Agent created.", user));
}

export async function approveAgentCreatedUserController(req: Request, res: Response) {
  const userId = String(req.params.userId || "");
  const User = getUserModel();
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }
  user.agentCreatedPendingApproval = false;
  user.isActive = true;
  await user.save();
  return res.json(new ApiResponse(true, "Agent-created user approved.", user));
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

export async function superadminImpersonateUserController(req: Request, res: Response) {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }
  const targetUserId = String(req.params.userId || "");
  if (!targetUserId) {
    throw new ApiError(400, "userId is required.");
  }

  const result = await impersonateUser(req.authUser.id, targetUserId, {
    ip: req.ip,
    userAgent: req.get("user-agent") || undefined,
  });
  setAuthCookies(res, result);

  return res.json(
    new ApiResponse(true, "Impersonation started.", {
      impersonatedUser: result.impersonatedUser,
    }),
  );
}

export async function superadminListUsersDocumentsController(_req: Request, res: Response) {
  const User = getUserModel();
  const OnboardingRecord = getOnboardingRecordModel();

  const users = await User.find().select(
    "username phone role memberQrCode onboarding profile verification createdByAgentId agentCreatedPendingApproval isActive onboardingCompleted lastLogins createdAt updatedAt",
  );

  const onboardingRecords = await OnboardingRecord.find();
  const onboardingMap = new Map(
    onboardingRecords.map((r) => [String(r.userId), r]),
  );

  const rows = users.map((u) => mapAdminUserRow(u, onboardingMap.get(String(u._id))));

  return res.json(new ApiResponse(true, "Users and documents listed.", rows));
}

export async function adminGetUserDetailController(req: Request, res: Response) {
  const userId = String(req.params.userId || "");
  if (!userId) {
    throw new ApiError(400, "userId is required.");
  }

  const User = getUserModel();
  const OnboardingRecord = getOnboardingRecordModel();

  const user = await User.findById(userId).select(
    "username phone role memberQrCode onboarding profile verification createdByAgentId agentCreatedPendingApproval isActive onboardingCompleted lastLogins createdAt updatedAt",
  );

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const onboardingRecord = await OnboardingRecord.findOne({ userId });

  return res.json(
    new ApiResponse(true, "User details fetched.", mapAdminUserRow(user, onboardingRecord)),
  );
}
