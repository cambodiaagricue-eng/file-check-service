import fs from "fs/promises";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { getFileDataFromLocalFile } from "../utils/getNameonDocs";
import { uploadToS3 } from "../utils/uploadToS3";
import { env } from "../config/env";

const MAX_DOCUMENT_VERIFY_ATTEMPTS = 3;

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeName(value: string) {
  return normalizeName(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

function isExpectedNameMatch(expectedName: string, aiResult: {
  expectednamefound: boolean;
  "document oneliner summary": string;
}) {
  if (aiResult.expectednamefound) {
    return true;
  }

  const expectedNormalized = normalizeName(expectedName);
  const summaryNormalized = normalizeName(aiResult["document oneliner summary"] || "");
  if (!expectedNormalized || !summaryNormalized) {
    return false;
  }

  if (summaryNormalized.includes(expectedNormalized)) {
    return true;
  }

  const expectedTokens = tokenizeName(expectedName);
  const summaryTokens = new Set(tokenizeName(aiResult["document oneliner summary"] || ""));

  if (expectedTokens.length < 2) {
    return false;
  }

  const matchedTokens = expectedTokens.filter((token) => summaryTokens.has(token));
  return matchedTokens.length >= Math.max(2, expectedTokens.length - 1);
}

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

      const isValid = isExpectedNameMatch(resolvedExpectedName, aiResult);
      user.set("verification.lastDocumentVerificationAt", new Date());
      user.set(
        "verification.lastDocumentSummary",
        String(aiResult["document oneliner summary"] || "").trim() || null,
      );

      if (isValid) {
        user.set("verification.documentNameVerified", true);
        user.set("verification.documentVerificationFailedCount", 0);
      } else {
        const failed = Number(user.verification?.documentVerificationFailedCount || 0) + 1;
        user.set("verification.documentVerificationFailedCount", failed);

        if (failed >= MAX_DOCUMENT_VERIFY_ATTEMPTS && env.NODE_ENV !== "development") {
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
