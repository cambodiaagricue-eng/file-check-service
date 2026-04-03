import { getUserModel } from "../models/user.model";
import { getWalletModel } from "../models/wallet.model";
import { LandVerificationService, parseLandPointInput } from "./landVerification.service";
import { ApiError } from "../utils/ApiError";
import { uploadToS3 } from "../utils/uploadToS3";
import { CAMBODIA_PROVINCES } from "../constants/provinces";
import fs from "fs/promises";

function isImageMimeType(mimeType: string | undefined): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(mimeType || "");
}

function isSupportedDocument(file: Express.Multer.File | undefined): boolean {
  if (!file) {
    return false;
  }
  return isImageMimeType(file.mimetype) || file.mimetype === "application/pdf";
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore missing/locked temp files to avoid masking primary failures.
  }
}

async function uploadAndCleanup(
  file: Express.Multer.File,
  keyPrefix: string,
): Promise<string> {
  try {
    return await uploadToS3(file.path, {
      contentType: file.mimetype,
      keyPrefix,
    });
  } finally {
    await safeUnlink(file.path);
  }
}

function sanitizeProfileInput(data: {
  fullName: string;
  address: string;
  province: string;
  gender: string;
  age: number;
}) {
  const fullName = data.fullName.trim();
  const address = data.address.trim();
  const province = data.province.trim();
  const gender = data.gender.trim().toLowerCase();
  const age = Number(data.age);

  if (!fullName) {
    throw new ApiError(400, "fullName is required.");
  }
  if (!address) {
    throw new ApiError(400, "address is required.");
  }
  if (!province) {
    throw new ApiError(400, "province is required.");
  }
  if (!CAMBODIA_PROVINCES.includes(province as any)) {
    throw new ApiError(400, `Invalid province. Must be one of: ${CAMBODIA_PROVINCES.join(", ")}`);
  }
  if (!["male", "female", "other"].includes(gender)) {
    throw new ApiError(400, "gender must be one of: male, female, other.");
  }
  if (!Number.isInteger(age) || age < 18 || age > 120) {
    throw new ApiError(400, "age must be an integer between 18 and 120.");
  }

  return { fullName, address, province, gender, age };
}

export class OnboardingService {
  private landVerificationService = new LandVerificationService();

  private async completeAllStepsInternal(
    userId: string,
    profileData: { fullName: string; address: string; province: string; gender: string; age: number },
    selfie: Express.Multer.File | undefined,
    govId: Express.Multer.File | undefined,
    landDocuments: Express.Multer.File[] = [],
    landPoint?: {
      latitude: unknown;
      longitude: unknown;
      placeId?: unknown;
      formattedAddress?: unknown;
      drawnShapes?: unknown;
    },
    options?: { skipWalletFunding?: boolean },
  ) {
    try {
      if (!selfie) {
        throw new ApiError(400, "selfie file is required.");
      }
      if (!isImageMimeType(selfie.mimetype)) {
        throw new ApiError(400, "selfie must be an image (jpg/png/webp).");
      }
      if (!govId) {
        throw new ApiError(400, "govId file is required.");
      }
      if (!isSupportedDocument(govId)) {
        throw new ApiError(400, "govId must be an image or PDF.");
      }
      if (!landDocuments.length) {
        throw new ApiError(400, "At least one land document file is required.");
      }
      const invalid = landDocuments.find((file) => !isSupportedDocument(file));
      if (invalid) {
        throw new ApiError(400, "landDocuments must be images or PDFs.");
      }
      if (!options?.skipWalletFunding) {
        await this.assertWalletFunded(userId);
      }

      const cleaned = sanitizeProfileInput(profileData);
      const parsedPoint = parseLandPointInput({
        latitude: landPoint?.latitude,
        longitude: landPoint?.longitude,
        placeId: landPoint?.placeId,
        formattedAddress: landPoint?.formattedAddress,
        drawnShapes: landPoint?.drawnShapes,
      });
      const User = getUserModel();
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, "User not found.");
      }

      user.set("profile", cleaned);

      const selfieUrl = await uploadAndCleanup(selfie, `onboarding/${userId}/selfie`);
      const govIdUrl = await uploadAndCleanup(govId, `onboarding/${userId}/gov-id`);
      const landUrls: string[] = [];
      for (const [index, file] of landDocuments.entries()) {
        const url = await uploadAndCleanup(
          file,
          `onboarding/${userId}/land-documents/${index + 1}`,
        );
        landUrls.push(url);
      }

      user.set("onboarding.steps.step1.completed", true);
      user.set("onboarding.steps.step1.selfiePath", selfieUrl);
      user.set("onboarding.steps.step1.completedAt", new Date());

      user.set("onboarding.steps.step2.completed", true);
      user.set("onboarding.steps.step2.govIdPath", govIdUrl);
      user.set("onboarding.steps.step2.completedAt", new Date());

      user.set("onboarding.steps.step3.landDocumentPaths", landUrls);
      user.set("onboarding.steps.step3.landLocation", parsedPoint);
      user.set("onboarding.steps.step3.completed", true);
      user.set("onboarding.steps.step3.completedAt", new Date());

      user.set("onboarding.currentStep", 4);
      user.set("onboardingCompleted", true);
      user.set("kycReview.status", "pending");
      user.set("kycReview.rejectionReason", null);
      user.set("kycReview.submittedAt", new Date());
      user.set("kycReview.reviewedAt", null);
      user.set("kycReview.reviewedByAdminId", null);
      user.set("landReview.status", "pending");
      user.set("landReview.currentPoint", {
        ...parsedPoint,
        providedBy: "user",
        updatedByUserId: user._id,
        updatedAt: new Date(),
      });
      user.set("landReview.adminSummary", "Land location submitted and pending admin verification.");

      await user.save();
      await this.landVerificationService.submitUserLandPoint(userId, parsedPoint);
      await this.syncOnboardingRecord(userId);

      return this.getStatus(userId);
    } finally {
      const paths = [
        selfie?.path,
        govId?.path,
        ...landDocuments.map((file) => file.path),
      ].filter(Boolean) as string[];
      await Promise.all(paths.map((p) => safeUnlink(p)));
    }
  }

  private async assertWalletFunded(userId: string): Promise<void> {
    const Wallet = getWalletModel();
    const wallet = await Wallet.findOne({ userId: userId as any });
    if (!wallet || Number(wallet.coins || 0) <= 0) {
      throw new ApiError(
        400,
        "Please add money and buy coins before onboarding document upload.",
      );
    }
  }

  async syncOnboardingRecord(userId: string): Promise<void> {
    await this.landVerificationService.syncOnboardingRecord(userId);
  }

  async getStatus(userId: string) {
    const User = getUserModel();
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found.");
    }

    return {
      onboardingCompleted: user.onboardingCompleted,
      currentStep: user.onboarding?.currentStep ?? 1,
      profile: user.profile,
      steps: user.onboarding?.steps,
      kycReview: {
        status: user.kycReview?.status || "not_started",
        rejectionReason: user.kycReview?.rejectionReason || null,
        submittedAt: user.kycReview?.submittedAt || null,
        reviewedAt: user.kycReview?.reviewedAt || null,
      },
      landReview: user.landReview || {
        status: "not_started",
        currentPoint: null,
        border: null,
        adminSummary: null,
        history: [],
      },
    };
  }

  async completeStep1(
    userId: string,
    profileData: { fullName: string; address: string; province: string; gender: string; age: number },
    selfie: Express.Multer.File | undefined,
  ) {
    try {
      if (!selfie) {
        throw new ApiError(400, "selfie file is required.");
      }
      if (!isImageMimeType(selfie.mimetype)) {
        throw new ApiError(400, "selfie must be an image (jpg/png/webp).");
      }

      const cleaned = sanitizeProfileInput(profileData);
      await this.assertWalletFunded(userId);
      const User = getUserModel();
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, "User not found.");
      }

      const selfieUrl = await uploadAndCleanup(selfie, `onboarding/${userId}/selfie`);

      user.set("profile", cleaned);
      user.set("onboarding.steps.step1.completed", true);
      user.set("onboarding.steps.step1.selfiePath", selfieUrl);
      user.set("onboarding.steps.step1.completedAt", new Date());
      if ((user.onboarding?.currentStep ?? 1) < 2) {
        user.set("onboarding.currentStep", 2);
      }
      await user.save();
      await this.syncOnboardingRecord(userId);

      return this.getStatus(userId);
    } finally {
      if (selfie?.path) {
        await safeUnlink(selfie.path);
      }
    }
  }

  async completeStep2(userId: string, govId: Express.Multer.File | undefined) {
    try {
      if (!govId) {
        throw new ApiError(400, "govId file is required.");
      }
      if (!isSupportedDocument(govId)) {
        throw new ApiError(400, "govId must be an image or PDF.");
      }
      await this.assertWalletFunded(userId);

      const User = getUserModel();
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, "User not found.");
      }
      if (!user.onboarding?.steps?.step1?.completed) {
        throw new ApiError(400, "Complete step 1 before step 2.");
      }

      const govIdUrl = await uploadAndCleanup(govId, `onboarding/${userId}/gov-id`);

      user.set("onboarding.steps.step2.completed", true);
      user.set("onboarding.steps.step2.govIdPath", govIdUrl);
      user.set("onboarding.steps.step2.completedAt", new Date());
      if ((user.onboarding?.currentStep ?? 1) < 3) {
        user.set("onboarding.currentStep", 3);
      }
      await user.save();
      await this.syncOnboardingRecord(userId);

      return this.getStatus(userId);
    } finally {
      if (govId?.path) {
        await safeUnlink(govId.path);
      }
    }
  }

  async completeStep3(
    userId: string,
    landDocuments: Express.Multer.File[] = [],
    landPoint?: {
      latitude: unknown;
      longitude: unknown;
      placeId?: unknown;
      formattedAddress?: unknown;
      drawnShapes?: unknown;
    },
  ) {
    try {
      if (!landDocuments.length) {
        throw new ApiError(400, "At least one land document file is required.");
      }
      const invalid = landDocuments.find((file) => !isSupportedDocument(file));
      if (invalid) {
        throw new ApiError(400, "landDocuments must be images or PDFs.");
      }
      await this.assertWalletFunded(userId);

      const parsedPoint = parseLandPointInput({
        latitude: landPoint?.latitude,
        longitude: landPoint?.longitude,
        placeId: landPoint?.placeId,
        formattedAddress: landPoint?.formattedAddress,
        drawnShapes: landPoint?.drawnShapes,
      });
      const User = getUserModel();
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, "User not found.");
      }
      if (!user.onboarding?.steps?.step2?.completed) {
        throw new ApiError(400, "Complete step 2 before step 3.");
      }

      const urls: string[] = [];
      for (const [index, file] of landDocuments.entries()) {
        const url = await uploadAndCleanup(
          file,
          `onboarding/${userId}/land-documents/${index + 1}`,
        );
        urls.push(url);
      }

      user.set("onboarding.steps.step3.landDocumentPaths", urls);
      user.set("onboarding.steps.step3.landLocation", parsedPoint);
      user.set("onboarding.steps.step3.completed", true);
      user.set("onboarding.steps.step3.completedAt", new Date());
      user.set("onboarding.currentStep", 4);
      user.set("onboardingCompleted", true);
      user.set("kycReview.status", "pending");
      user.set("kycReview.rejectionReason", null);
      user.set("kycReview.submittedAt", new Date());
      user.set("kycReview.reviewedAt", null);
      user.set("kycReview.reviewedByAdminId", null);
      user.set("landReview.status", "pending");
      user.set("landReview.currentPoint", {
        ...parsedPoint,
        providedBy: "user",
        updatedByUserId: user._id,
        updatedAt: new Date(),
      });
      user.set("landReview.adminSummary", "Land location submitted and pending admin verification.");
      await user.save();
      await this.landVerificationService.submitUserLandPoint(userId, parsedPoint);
      await this.syncOnboardingRecord(userId);

      return this.getStatus(userId);
    } finally {
      await Promise.all(landDocuments.map((file) => safeUnlink(file.path)));
    }
  }

  async completeAllSteps(
    userId: string,
    profileData: { fullName: string; address: string; province: string; gender: string; age: number },
    selfie: Express.Multer.File | undefined,
    govId: Express.Multer.File | undefined,
    landDocuments: Express.Multer.File[] = [],
    landPoint?: {
      latitude: unknown;
      longitude: unknown;
      placeId?: unknown;
      formattedAddress?: unknown;
      drawnShapes?: unknown;
    },
  ) {
    return this.completeAllStepsInternal(
      userId,
      profileData,
      selfie,
      govId,
      landDocuments,
      landPoint,
    );
  }

  async completeAllStepsByAgent(
    userId: string,
    profileData: { fullName: string; address: string; province: string; gender: string; age: number },
    selfie: Express.Multer.File | undefined,
    govId: Express.Multer.File | undefined,
    landDocuments: Express.Multer.File[] = [],
    landPoint?: {
      latitude: unknown;
      longitude: unknown;
      placeId?: unknown;
      formattedAddress?: unknown;
      drawnShapes?: unknown;
    },
  ) {
    return this.completeAllStepsInternal(
      userId,
      profileData,
      selfie,
      govId,
      landDocuments,
      landPoint,
      { skipWalletFunding: true },
    );
  }
}
