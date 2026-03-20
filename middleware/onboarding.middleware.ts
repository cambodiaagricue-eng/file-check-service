import type { NextFunction, Request, Response } from "express";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";

export async function requireOnboardingCompleted(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!req.authUser?.id) {
    return next(new ApiError(401, "Unauthorized."));
  }

  const User = getUserModel();
  const user = await User.findById(req.authUser.id);
  if (!user) {
    return next(new ApiError(401, "User not found."));
  }
  if (["admin", "superadmin"].includes(String(user.role))) {
    return next();
  }

  if (!user.onboardingCompleted) {
    return next(
      new ApiError(403, "Onboarding not completed.", {
        onboardingCompleted: false,
        currentStep: user.onboarding?.currentStep ?? 1,
      }),
    );
  }

  if (user.kycReview?.status !== "approved") {
    return next(
      new ApiError(403, "KYC review is not approved yet.", {
        onboardingCompleted: true,
        currentStep: user.onboarding?.currentStep ?? 1,
        kycReviewStatus: user.kycReview?.status || "not_started",
        kycRejectionReason: user.kycReview?.rejectionReason || null,
      }),
    );
  }

  return next();
}
