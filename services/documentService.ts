import fs from "fs/promises";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { getFileDataFromLocalFile } from "../utils/getNameonDocs";
import { uploadToS3 } from "../utils/uploadToS3";

const MAX_DOCUMENT_VERIFY_ATTEMPTS = 3;

export class DocumentService {
  async checkNameExistsornot(
    userId: string,
    filepath: string,
    expectedname?: string,
  ) {
    const User = getUserModel();
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found.");
    }
    if (user.isLoginBlocked) {
      throw new ApiError(
        403,
        user.loginBlockedReason || "Account is blocked. Please contact admin.",
      );
    }

    const profileFullName = String(user.profile?.fullName || "").trim();
    if (!profileFullName) {
      throw new ApiError(
        400,
        "User profile full name is missing. Complete onboarding step 1 first.",
      );
    }

    const resolvedExpectedName = String(expectedname || profileFullName).trim();
    try {
      if (user.verification?.documentNameVerified) {
        user.set("verification.lastDocumentVerificationAt", new Date());
        await user.save();
        return {
          documentUrl: null,
          aiResult: null,
          expectedNameUsed: profileFullName,
          validation: {
            valid: true,
            failedAttempts: Number(user.verification?.documentVerificationFailedCount || 0),
            maxFailedAttempts: MAX_DOCUMENT_VERIFY_ATTEMPTS,
            isLoginBlocked: Boolean(user.isLoginBlocked),
            message: "Document already verified. No re-verification required.",
          },
        };
      }

      const aiResult = await getFileDataFromLocalFile(
        resolvedExpectedName,
        filepath,
        "application/pdf",
      );
      const documentUrl = await uploadToS3(filepath, {
        contentType: "application/pdf",
        keyPrefix: "documents",
      });

      const isValid = Boolean(aiResult.expectednamefound);
      user.set("verification.lastDocumentVerificationAt", new Date());

      if (isValid) {
        user.set("verification.documentNameVerified", true);
        user.set("verification.documentVerificationFailedCount", 0);
      } else {
        const failed = Number(user.verification?.documentVerificationFailedCount || 0) + 1;
        user.set("verification.documentVerificationFailedCount", failed);

        if (failed >= MAX_DOCUMENT_VERIFY_ATTEMPTS) {
          user.set("isLoginBlocked", true);
          user.set(
            "loginBlockedReason",
            "Document verification failed 3 times. Please contact admin.",
          );
        }
      }

      await user.save();

      return {
        documentUrl,
        aiResult,
        expectedNameUsed: resolvedExpectedName,
        validation: {
          valid: isValid,
          failedAttempts: Number(user.verification?.documentVerificationFailedCount || 0),
          maxFailedAttempts: MAX_DOCUMENT_VERIFY_ATTEMPTS,
          isLoginBlocked: Boolean(user.isLoginBlocked),
          message: isValid
            ? "Document name verification passed."
            : user.isLoginBlocked
              ? "Document verification failed. Account blocked. Please contact admin."
              : "Document verification failed. Please retry with a valid document.",
        },
      };
    } finally {
      try {
        await fs.unlink(filepath);
      } catch {
        // Best-effort cleanup for temporary upload file.
      }
    }
  }
}
