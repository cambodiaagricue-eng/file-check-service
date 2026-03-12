import fs from "fs/promises";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { getFileData } from "../utils/getNameonDocs";
import { uploadToS3 } from "../utils/uploadToS3";

const MAX_EXPECTED_NAME_CHANGES = 3;

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export class DocumentService {
  async checkNameExistsornot(userId: string, filepath: string, expectedname: string) {
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

    const normalizedExpected = normalizeName(expectedname);
    const normalizedProfile = normalizeName(profileFullName);

    const currentHistory = Array.isArray(user.verification?.expectedNameHistory)
      ? user.verification.expectedNameHistory
      : [];

    if (normalizedExpected !== normalizedProfile) {
      const alreadyExists = currentHistory.includes(normalizedExpected);
      if (!alreadyExists) {
        if (currentHistory.length >= MAX_EXPECTED_NAME_CHANGES) {
          user.set("isLoginBlocked", true);
          user.set(
            "loginBlockedReason",
            "Expected name change limit exceeded. Please contact admin.",
          );
          await user.save();
          throw new ApiError(
            403,
            "Expected name change limit exceeded. Please contact admin.",
          );
        }

        user.set("verification.expectedNameHistory", [
          ...currentHistory,
          normalizedExpected,
        ]);
        user.set(
          "verification.expectedNameChangeCount",
          currentHistory.length + 1,
        );
      }
    }

    try {
      const documentUrl = await uploadToS3(filepath, {
        contentType: "application/pdf",
        keyPrefix: "documents",
      });
      const aiResult = await getFileData(expectedname, documentUrl);

      const isValid = Boolean(aiResult.expectednamefound);
      user.set("verification.lastDocumentVerificationAt", new Date());

      if (isValid) {
        user.set("verification.documentNameVerified", true);
      } else {
        const failed = Number(user.verification?.documentVerificationFailedCount || 0) + 1;
        user.set("verification.documentVerificationFailedCount", failed);

        const usedChanges = Number(user.verification?.expectedNameChangeCount || 0);
        if (usedChanges >= MAX_EXPECTED_NAME_CHANGES) {
          user.set("isLoginBlocked", true);
          user.set(
            "loginBlockedReason",
            "Document verification failed. Please contact admin.",
          );
        }
      }

      await user.save();

      return {
        documentUrl,
        aiResult,
        validation: {
          valid: isValid,
          expectedNameChangeCount: Number(user.verification?.expectedNameChangeCount || 0),
          maxExpectedNameChanges: MAX_EXPECTED_NAME_CHANGES,
          isLoginBlocked: Boolean(user.isLoginBlocked),
          message: isValid
            ? "Document name verification passed."
            : user.isLoginBlocked
              ? "Document verification failed. Account blocked. Please contact admin."
              : "Document verification failed. Try with a valid expected name.",
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
