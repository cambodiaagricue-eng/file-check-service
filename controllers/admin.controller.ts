import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { env } from "../config/env";
import { getAuditLogModel } from "../models/auditLog.model";
import { getBidModel } from "../models/bid.model";
import { getOnboardingRecordModel } from "../models/onboardingRecord.model";
import { getOtpModel } from "../models/otp.model";
import { getPaymentOrderModel } from "../models/paymentOrder.model";
import { getPoolOrderJoinModel } from "../models/poolOrderJoin.model";
import { getListingModel } from "../models/listing.model";
import { getSessionModel } from "../models/session.model";
import { getUserModel } from "../models/user.model";
import { getWalletModel } from "../models/wallet.model";
import { getWalletTransactionModel } from "../models/walletTransaction.model";
import { ReportingService } from "../services/reporting.service";
import { WalletService } from "../services/wallet.service";
import { impersonateUser, revokeAllUserSessions } from "../services/auth.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

const reportingService = new ReportingService();
const walletService = new WalletService();

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
    kycReview: u.kycReview || null,
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

export async function adminCreateRedeemCodeController(req: Request, res: Response) {
  const actorId = String(req.authUser?.id || "");
  if (!actorId) {
    throw new ApiError(401, "Unauthorized.");
  }

  const amountUsd = Number(req.body?.amountUsd || 0);
  const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
  const redeemCode = await walletService.createRedeemCode(actorId, amountUsd, notes);

  return res.json(new ApiResponse(true, "Redeem code created.", {
    id: String(redeemCode._id),
    code: redeemCode.code,
    amountUsd: Number(redeemCode.amountUsd || 0),
    coins: Number(redeemCode.coins || 0),
    status: redeemCode.status,
    notes: redeemCode.notes || null,
    createdAt: redeemCode.createdAt,
  }));
}

export async function adminListRedeemCodesController(req: Request, res: Response) {
  const result = await reportingService.getAdminRedeemCodes({
    page: Number(req.query?.page || 1),
    limit: Number(req.query?.limit || 50),
    status: typeof req.query?.status === "string"
      ? req.query.status as "created" | "redeemed"
      : undefined,
  });
  return res.json(new ApiResponse(true, "Redeem codes fetched.", result));
}

export async function approveAgentCreatedUserController(req: Request, res: Response) {
  const actorId = String(req.authUser?.id || "");
  const userId = String(req.params.userId || "");
  const User = getUserModel();
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }
  user.agentCreatedPendingApproval = false;
  user.isActive = true;
  user.set("kycReview.status", "approved");
  user.set("kycReview.rejectionReason", null);
  user.set("kycReview.reviewedAt", new Date());
  user.set("kycReview.reviewedByAdminId", actorId || null);
  await user.save();
  return res.json(new ApiResponse(true, "Agent-created user approved.", user));
}

export async function approveUserKycController(req: Request, res: Response) {
  const actorId = String(req.authUser?.id || "");
  const userId = String(req.params.userId || "");
  if (!actorId) {
    throw new ApiError(401, "Unauthorized.");
  }

  const User = getUserModel();
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  user.agentCreatedPendingApproval = false;
  user.isActive = true;
  user.set("kycReview.status", "approved");
  user.set("kycReview.rejectionReason", null);
  user.set("kycReview.reviewedAt", new Date());
  user.set("kycReview.reviewedByAdminId", actorId);
  await user.save();

  return res.json(new ApiResponse(true, "User KYC approved.", user));
}

export async function rejectUserKycController(req: Request, res: Response) {
  const actorId = String(req.authUser?.id || "");
  const userId = String(req.params.userId || "");
  const reason = requireString(req.body?.reason, "reason");
  if (!actorId) {
    throw new ApiError(401, "Unauthorized.");
  }

  const User = getUserModel();
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  user.agentCreatedPendingApproval = false;
  user.isActive = true;
  user.onboardingCompleted = false;
  user.set("onboarding.currentStep", 2);
  user.set("onboarding.steps.step2.completed", false);
  user.set("onboarding.steps.step2.completedAt", null);
  user.set("onboarding.steps.step3.completed", false);
  user.set("onboarding.steps.step3.completedAt", null);
  user.set("kycReview.status", "rejected");
  user.set("kycReview.rejectionReason", reason);
  user.set("kycReview.reviewedAt", new Date());
  user.set("kycReview.reviewedByAdminId", actorId);
  await user.save();

  const OnboardingRecord = getOnboardingRecordModel();
  await OnboardingRecord.findOneAndUpdate(
    { userId: user._id as any },
    {
      $set: {
        currentStep: 2,
        onboardingCompleted: false,
        "steps.step2.completed": false,
        "steps.step2.completedAt": null,
        "steps.step3.completed": false,
        "steps.step3.completedAt": null,
      },
    },
  );

  return res.json(new ApiResponse(true, "User KYC rejected.", user));
}

async function recalculateListingHighestBid(listingId: string) {
  const Bid = getBidModel();
  const Listing = getListingModel();
  const topBid = await Bid.findOne({ listingId: listingId as any, status: "active" })
    .sort({ amountUsd: -1, createdAt: 1 })
    .select("amountUsd bidderId");

  await Listing.findByIdAndUpdate(
    listingId,
    topBid
      ? {
          $set: {
            highestBidUsd: Number(topBid.amountUsd || 0),
            highestBidByUserId: topBid.bidderId || null,
          },
        }
      : {
          $set: {
            highestBidUsd: 0,
            highestBidByUserId: null,
          },
        },
  );
}

export async function adminDeleteUserController(req: Request, res: Response) {
  const actorId = String(req.authUser?.id || "");
  const userId = String(req.params.userId || "");
  if (!actorId) {
    throw new ApiError(401, "Unauthorized.");
  }
  if (!userId) {
    throw new ApiError(400, "userId is required.");
  }

  const User = getUserModel();
  const target = await User.findById(userId);
  if (!target) {
    throw new ApiError(404, "User not found.");
  }
  if (String(target._id) === actorId) {
    throw new ApiError(400, "You cannot disable your own account.");
  }
  if (target.role === "superadmin") {
    throw new ApiError(403, "Superadmin accounts cannot be deleted.");
  }

  const Session = getSessionModel();
  const Wallet = getWalletModel();
  const WalletTransaction = getWalletTransactionModel();
  const PaymentOrder = getPaymentOrderModel();
  const OnboardingRecord = getOnboardingRecordModel();
  const Listing = getListingModel();
  const Bid = getBidModel();
  const PoolOrderJoin = getPoolOrderJoinModel();
  const Otp = getOtpModel();
  const AuditLog = getAuditLogModel();

  const sellerListings = await Listing.find({ sellerId: target._id }).select("_id");
  const sellerListingIds = sellerListings.map((item) => String(item._id));
  const bidderListingIds = (
    await Bid.find({ bidderId: target._id }).select("listingId")
  ).map((item) => String(item.listingId));
  const affectedListingIds = [...new Set(bidderListingIds)];

  await revokeAllUserSessions(String(target._id));
  await Promise.all([
    Session.deleteMany({ userId: target._id as any }),
    Wallet.deleteMany({ userId: target._id as any }),
    WalletTransaction.deleteMany({ userId: target._id as any }),
    PaymentOrder.deleteMany({ userId: target._id as any }),
    OnboardingRecord.deleteMany({ userId: target._id as any }),
    PoolOrderJoin.deleteMany({ buyerId: target._id as any }),
    Otp.deleteMany({ phone: target.phone }),
    AuditLog.deleteMany({
      $or: [
        { "actor.id": String(target._id) },
        { "resource.id": String(target._id) },
      ],
    }),
    User.updateMany(
      { createdByAgentId: target._id as any },
      { $set: { createdByAgentId: null } },
    ),
  ]);

  if (sellerListingIds.length > 0) {
    await Bid.deleteMany({ listingId: { $in: sellerListingIds as any[] } });
    await Listing.deleteMany({ _id: { $in: sellerListingIds as any[] } });
  }

  if (affectedListingIds.length > 0) {
    await Bid.deleteMany({ bidderId: target._id as any });
    for (const listingId of affectedListingIds) {
      if (!sellerListingIds.includes(listingId)) {
        await recalculateListingHighestBid(listingId);
      }
    }
  } else {
    await Bid.deleteMany({ bidderId: target._id as any });
  }

  await User.deleteOne({ _id: target._id as any });

  return res.json(new ApiResponse(true, "User deleted permanently."));
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

  const users = await User.find().sort({ createdAt: -1 }).select(
    "username phone role memberQrCode onboarding profile verification createdByAgentId agentCreatedPendingApproval isActive onboardingCompleted lastLogins createdAt updatedAt kycReview",
  ).lean();

  const userIds = users.map((user: any) => user._id);
  const onboardingRecords = userIds.length > 0
    ? await OnboardingRecord.find({ userId: { $in: userIds as any[] } }).lean()
    : [];
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
    "username phone role memberQrCode onboarding profile verification createdByAgentId agentCreatedPendingApproval isActive onboardingCompleted lastLogins createdAt updatedAt kycReview",
  ).lean();

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const onboardingRecord = await OnboardingRecord.findOne({ userId }).lean();

  return res.json(
    new ApiResponse(true, "User details fetched.", mapAdminUserRow(user, onboardingRecord)),
  );
}

export async function adminListPaymentOrdersController(req: Request, res: Response) {
  const result = await reportingService.getAdminPaymentOrders({
    page: Number(req.query?.page || 1),
    limit: Number(req.query?.limit || 20),
    userId: typeof req.query?.userId === "string" ? req.query.userId : undefined,
    status: typeof req.query?.status === "string"
      ? req.query.status as "pending" | "processing" | "completed" | "failed" | "expired"
      : undefined,
    provider: typeof req.query?.provider === "string"
      ? req.query.provider as "ppcbank_pg"
      : undefined,
  });
  return res.json(new ApiResponse(true, "Payment orders fetched.", result));
}

export async function adminListWalletTransactionsController(req: Request, res: Response) {
  const result = await reportingService.getAdminWalletTransactions({
    page: Number(req.query?.page || 1),
    limit: Number(req.query?.limit || 20),
    userId: typeof req.query?.userId === "string" ? req.query.userId : undefined,
    type: typeof req.query?.type === "string"
      ? req.query.type as "credit" | "debit"
      : undefined,
    source: typeof req.query?.source === "string"
      ? req.query.source as "buy_coins" | "soil_test" | "mayur_gpt" | "pool_order" | "manual"
      : undefined,
  });
  return res.json(new ApiResponse(true, "Wallet transactions fetched.", result));
}

export async function adminRevenueSummaryController(req: Request, res: Response) {
  const result = await reportingService.getAdminRevenueSummary();
  return res.json(new ApiResponse(true, "Admin revenue summary fetched.", result));
}

export async function adminListAuditLogsController(req: Request, res: Response) {
  const successQuery = typeof req.query?.success === "string"
    ? req.query.success.toLowerCase()
    : undefined;
  const result = await reportingService.getAdminAuditLogs({
    page: Number(req.query?.page || 1),
    limit: Number(req.query?.limit || 20),
    action: typeof req.query?.action === "string" ? req.query.action : undefined,
    eventType: typeof req.query?.eventType === "string" ? req.query.eventType : undefined,
    actorId: typeof req.query?.actorId === "string" ? req.query.actorId : undefined,
    actorRole: typeof req.query?.actorRole === "string" ? req.query.actorRole : undefined,
    success: successQuery === undefined
      ? undefined
      : successQuery === "true",
  });
  return res.json(new ApiResponse(true, "Audit logs fetched.", result));
}
