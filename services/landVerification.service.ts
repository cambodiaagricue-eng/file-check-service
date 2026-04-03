import fs from "fs/promises";
import { getOnboardingRecordModel } from "../models/onboardingRecord.model";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { uploadToS3 } from "../utils/uploadToS3";

type PointInput = {
  latitude: unknown;
  longitude: unknown;
  placeId?: unknown;
  formattedAddress?: unknown;
  drawnShapes?: unknown;
};

type DrawnShape =
  | { kind: "polygon"; path: Array<{ lat: number; lng: number }> }
  | { kind: "polyline"; path: Array<{ lat: number; lng: number }> }
  | { kind: "rectangle"; bounds: { north: number; south: number; east: number; west: number } };

type ReviewActor = {
  id: string;
  role: string;
};

type BorderSnapshot = {
  fileUrl: string | null;
  fileName: string | null;
  contentType: string | null;
};

type PointSnapshot = {
  latitude: number;
  longitude: number;
  placeId: string | null;
  formattedAddress: string | null;
  googleMapsUrl: string;
  drawnShapes: DrawnShape[];
};

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asRequiredString(value: unknown, field: string): string {
  const parsed = asOptionalString(value);
  if (!parsed) {
    throw new ApiError(400, `${field} is required.`);
  }
  return parsed;
}

function parseCoordinate(value: unknown, field: string, min: number, max: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new ApiError(400, `${field} must be a valid number between ${min} and ${max}.`);
  }
  return Number(numeric.toFixed(7));
}

async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore temp-file cleanup failures.
  }
}

export function buildGoogleMapsUrl(latitude: number, longitude: number, placeId?: string | null) {
  const query = `${latitude},${longitude}`;
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(placeId)}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function parseLandPointInput(input: PointInput): PointSnapshot {
  const latitude = parseCoordinate(input.latitude, "latitude", -90, 90);
  const longitude = parseCoordinate(input.longitude, "longitude", -180, 180);
  const placeId = asOptionalString(input.placeId);
  const formattedAddress = asOptionalString(input.formattedAddress);

  return {
    latitude,
    longitude,
    placeId,
    formattedAddress,
    googleMapsUrl: buildGoogleMapsUrl(latitude, longitude, placeId),
    drawnShapes: parseDrawnShapes(input.drawnShapes),
  };
}

function parseDrawnShapes(value: unknown): DrawnShape[] {
  const parsed = typeof value === "string"
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          throw new ApiError(400, "drawnShapes must be valid JSON.");
        }
      })()
    : value;

  if (parsed == null) {
    return [];
  }
  if (!Array.isArray(parsed)) {
    throw new ApiError(400, "drawnShapes must be an array.");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new ApiError(400, `drawnShapes[${index}] must be an object.`);
    }

    const kind = (item as { kind?: unknown }).kind;
    if (kind === "polygon" || kind === "polyline") {
      const path = (item as { path?: unknown }).path;
      if (!Array.isArray(path) || path.length === 0) {
        throw new ApiError(400, `drawnShapes[${index}].path is required.`);
      }
      return {
        kind,
        path: path.map((point, pointIndex) => {
          if (!point || typeof point !== "object") {
            throw new ApiError(400, `drawnShapes[${index}].path[${pointIndex}] must be an object.`);
          }
          return {
            lat: parseCoordinate((point as { lat?: unknown }).lat, "drawn shape latitude", -90, 90),
            lng: parseCoordinate((point as { lng?: unknown }).lng, "drawn shape longitude", -180, 180),
          };
        }),
      } satisfies DrawnShape;
    }

    if (kind === "rectangle") {
      const bounds = (item as { bounds?: unknown }).bounds;
      if (!bounds || typeof bounds !== "object") {
        throw new ApiError(400, `drawnShapes[${index}].bounds is required.`);
      }
      return {
        kind,
        bounds: {
          north: parseCoordinate((bounds as { north?: unknown }).north, "rectangle north", -90, 90),
          south: parseCoordinate((bounds as { south?: unknown }).south, "rectangle south", -90, 90),
          east: parseCoordinate((bounds as { east?: unknown }).east, "rectangle east", -180, 180),
          west: parseCoordinate((bounds as { west?: unknown }).west, "rectangle west", -180, 180),
        },
      } satisfies DrawnShape;
    }

    throw new ApiError(400, `drawnShapes[${index}].kind is invalid.`);
  });
}

function toBorderSnapshot(border: any): BorderSnapshot {
  return {
    fileUrl: border?.fileUrl || null,
    fileName: border?.fileName || null,
    contentType: border?.contentType || null,
  };
}

function appendHistory(
  user: any,
  entry: {
    action: "submitted" | "point_updated" | "border_uploaded" | "approved" | "rejected";
    status: "pending" | "approved" | "rejected";
    summary?: string | null;
    reason?: string | null;
    actorId?: string | null;
    actorRole?: string | null;
  },
) {
  const history = Array.isArray(user.landReview?.history) ? [...user.landReview.history] : [];
  history.push({
    action: entry.action,
    status: entry.status,
    summary: entry.summary || null,
    reason: entry.reason || null,
    point: user.landReview?.currentPoint
      ? {
          latitude: user.landReview.currentPoint.latitude ?? null,
          longitude: user.landReview.currentPoint.longitude ?? null,
          placeId: user.landReview.currentPoint.placeId ?? null,
          formattedAddress: user.landReview.currentPoint.formattedAddress ?? null,
          googleMapsUrl: user.landReview.currentPoint.googleMapsUrl ?? null,
          drawnShapes: user.landReview.currentPoint.drawnShapes ?? [],
        }
      : null,
    border: toBorderSnapshot(user.landReview?.border),
    actorId: entry.actorId || null,
    actorRole: entry.actorRole || null,
    createdAt: new Date(),
  });
  user.set("landReview.history", history.slice(-25));
}

export class LandVerificationService {
  async syncOnboardingRecord(userId: string): Promise<void> {
    const User = getUserModel();
    const OnboardingRecord = getOnboardingRecordModel();
    const user = await User.findById(userId);
    if (!user) {
      return;
    }

    await OnboardingRecord.findOneAndUpdate(
      { userId: user._id as any },
      {
        $set: {
          userId: user._id,
          profile: user.profile,
          steps: {
            step1: {
              completed: Boolean(user.onboarding?.steps?.step1?.completed),
              selfieUrl: user.onboarding?.steps?.step1?.selfiePath ?? null,
              completedAt: user.onboarding?.steps?.step1?.completedAt ?? null,
            },
            step2: {
              completed: Boolean(user.onboarding?.steps?.step2?.completed),
              govIdUrl: user.onboarding?.steps?.step2?.govIdPath ?? null,
              completedAt: user.onboarding?.steps?.step2?.completedAt ?? null,
            },
            step3: {
              completed: Boolean(user.onboarding?.steps?.step3?.completed),
              landDocumentUrls: user.onboarding?.steps?.step3?.landDocumentPaths ?? [],
              landLocation: user.onboarding?.steps?.step3?.landLocation ?? null,
              completedAt: user.onboarding?.steps?.step3?.completedAt ?? null,
            },
          },
          currentStep: user.onboarding?.currentStep ?? 1,
          onboardingCompleted: Boolean(user.onboardingCompleted),
          landReview: user.landReview ?? {
            status: "not_started",
            currentPoint: null,
            border: null,
            adminSummary: null,
            history: [],
          },
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );
  }

  async submitUserLandPoint(userId: string, pointInput: PointInput) {
    const User = getUserModel();
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found.");
    }

    const point = parseLandPointInput(pointInput);
    const now = new Date();
    user.set("onboarding.steps.step3.landLocation", point);
    user.set("landReview.status", "pending");
    user.set("landReview.currentPoint", {
      ...point,
      providedBy: "user",
      updatedByUserId: user._id,
      updatedAt: now,
    });
    user.set("landReview.adminSummary", "Land location submitted and pending admin verification.");
    appendHistory(user, {
      action: "submitted",
      status: "pending",
      summary: "Land location submitted for admin verification.",
      actorId: String(user._id),
      actorRole: String(user.role || "farmer"),
    });
    await user.save();
    await this.syncOnboardingRecord(String(user._id));
    return user;
  }

  async adminUpdatePoint(userId: string, actor: ReviewActor, pointInput: PointInput, summary?: unknown) {
    const User = getUserModel();
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found.");
    }

    const point = parseLandPointInput(pointInput);
    const adminSummary =
      asOptionalString(summary) || "Land coordinates updated by admin during verification.";
    const now = new Date();

    user.set("onboarding.steps.step3.landLocation", point);
    user.set("landReview.status", "pending");
    user.set("landReview.currentPoint", {
      ...point,
      providedBy: "admin",
      updatedByUserId: actor.id,
      updatedAt: now,
    });
    user.set("landReview.adminSummary", adminSummary);
    user.set("kycReview.status", "pending");
    user.set("kycReview.rejectionReason", null);
    user.set("kycReview.reviewedAt", null);
    user.set("kycReview.reviewedByAdminId", null);
    appendHistory(user, {
      action: "point_updated",
      status: "pending",
      summary: adminSummary,
      actorId: actor.id,
      actorRole: actor.role,
    });
    await user.save();
    await this.syncOnboardingRecord(String(user._id));
    return user;
  }

  async adminUploadBorder(
    userId: string,
    actor: ReviewActor,
    file: Express.Multer.File | undefined,
    notes?: unknown,
  ) {
    try {
      if (!file) {
        throw new ApiError(400, "borderFile is required.");
      }

      const User = getUserModel();
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, "User not found.");
      }

      const url = await uploadToS3(file.path, {
        contentType: file.mimetype,
        keyPrefix: `land-borders/${userId}`,
      });
      const noteText = asOptionalString(notes);
      const uploadedAt = new Date();

      user.set("landReview.border", {
        fileUrl: url,
        fileName: file.originalname,
        contentType: file.mimetype,
        uploadedAt,
        uploadedByAdminId: actor.id,
        notes: noteText,
      });
      if (!user.landReview?.status || user.landReview.status === "not_started") {
        user.set("landReview.status", "pending");
      }
      if (noteText) {
        user.set("landReview.adminSummary", noteText);
      }
      appendHistory(user, {
        action: "border_uploaded",
        status: "pending",
        summary: noteText || "Land border file uploaded by admin.",
        actorId: actor.id,
        actorRole: actor.role,
      });
      await user.save();
      await this.syncOnboardingRecord(String(user._id));
      return user;
    } finally {
      if (file?.path) {
        await safeUnlink(file.path);
      }
    }
  }

  async approveLandReview(userId: string, actor: ReviewActor, summary?: unknown) {
    const User = getUserModel();
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found.");
    }
    if (!user.landReview?.currentPoint?.googleMapsUrl) {
      throw new ApiError(400, "Land coordinates must be submitted before approval.");
    }

    const adminSummary =
      asOptionalString(summary) || "Land location verified by admin.";
    user.agentCreatedPendingApproval = false;
    user.isActive = true;
    user.onboardingCompleted = true;
    user.set("landReview.status", "approved");
    user.set("landReview.adminSummary", adminSummary);
    user.set("kycReview.status", "approved");
    user.set("kycReview.rejectionReason", null);
    user.set("kycReview.reviewedAt", new Date());
    user.set("kycReview.reviewedByAdminId", actor.id);
    appendHistory(user, {
      action: "approved",
      status: "approved",
      summary: adminSummary,
      actorId: actor.id,
      actorRole: actor.role,
    });
    await user.save();
    await this.syncOnboardingRecord(String(user._id));
    return user;
  }

  async rejectLandReview(
    userId: string,
    actor: ReviewActor,
    reason: unknown,
    summary?: unknown,
  ) {
    const User = getUserModel();
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found.");
    }

    const rejectionReason = asRequiredString(reason, "reason");
    const adminSummary =
      asOptionalString(summary) || `Land verification rejected: ${rejectionReason}`;

    user.agentCreatedPendingApproval = false;
    user.isActive = true;
    user.onboardingCompleted = false;
    user.set("onboarding.currentStep", 3);
    user.set("onboarding.steps.step3.completed", false);
    user.set("onboarding.steps.step3.completedAt", null);
    user.set("landReview.status", "rejected");
    user.set("landReview.adminSummary", adminSummary);
    user.set("kycReview.status", "rejected");
    user.set("kycReview.rejectionReason", rejectionReason);
    user.set("kycReview.reviewedAt", new Date());
    user.set("kycReview.reviewedByAdminId", actor.id);
    appendHistory(user, {
      action: "rejected",
      status: "rejected",
      summary: adminSummary,
      reason: rejectionReason,
      actorId: actor.id,
      actorRole: actor.role,
    });
    await user.save();
    await this.syncOnboardingRecord(String(user._id));
    return user;
  }
}
