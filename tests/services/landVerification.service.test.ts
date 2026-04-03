import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type RecordValue = Record<string, any>;

  const users = new Map<string, RecordValue>();
  const onboardingRecords = new Map<string, RecordValue>();
  const uploadToS3 = vi.fn(async (_path: string, options?: { keyPrefix?: string }) =>
    `https://bucket.example/${options?.keyPrefix || "uploads"}/border-file`,
  );
  const unlink = vi.fn(async () => undefined);

  const setPath = (obj: RecordValue, path: string, value: unknown) => {
    const parts = path.split(".");
    let current = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      current[parts[i]] ??= {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  };

  const createUserDoc = (payload?: Partial<RecordValue>) => {
    const doc: RecordValue = {
      _id: "user-1",
      role: "farmer",
      onboardingCompleted: true,
      agentCreatedPendingApproval: false,
      profile: {},
      onboarding: {
        currentStep: 4,
        steps: {
          step1: { completed: true, selfiePath: "selfie-url", completedAt: new Date() },
          step2: { completed: true, govIdPath: "govid-url", completedAt: new Date() },
          step3: {
            completed: true,
            landDocumentPaths: ["land-doc-1"],
            landLocation: null,
            completedAt: new Date(),
          },
        },
      },
      kycReview: {
        status: "pending",
        rejectionReason: null,
        submittedAt: new Date(),
        reviewedAt: null,
        reviewedByAdminId: null,
      },
      landReview: {
        status: "not_started",
        currentPoint: null,
        border: null,
        adminSummary: null,
        history: [],
      },
      set(path: string, value: unknown) {
        setPath(doc, path, value);
      },
      save: vi.fn(async () => doc),
      ...payload,
    };
    users.set(String(doc._id), doc);
    return doc;
  };

  const UserModel = {
    findById: vi.fn(async (id: string) => users.get(String(id)) || null),
  };

  const OnboardingRecordModel = {
    findOneAndUpdate: vi.fn(async (query: RecordValue, update: RecordValue) => {
      const key = String(query.userId);
      onboardingRecords.set(key, {
        ...(onboardingRecords.get(key) || {}),
        ...(update.$set || {}),
      });
      return onboardingRecords.get(key);
    }),
  };

  const reset = () => {
    users.clear();
    onboardingRecords.clear();
    vi.clearAllMocks();
  };

  return {
    users,
    onboardingRecords,
    createUserDoc,
    UserModel,
    OnboardingRecordModel,
    uploadToS3,
    unlink,
    reset,
  };
});

vi.mock("../../models/user.model", () => ({
  getUserModel: () => mocks.UserModel,
}));

vi.mock("../../models/onboardingRecord.model", () => ({
  getOnboardingRecordModel: () => mocks.OnboardingRecordModel,
}));

vi.mock("../../utils/uploadToS3", () => ({
  uploadToS3: mocks.uploadToS3,
}));

vi.mock("fs/promises", () => ({
  default: {
    unlink: mocks.unlink,
  },
  unlink: mocks.unlink,
}));

import { LandVerificationService, buildGoogleMapsUrl } from "../../services/landVerification.service";

describe("LandVerificationService", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("stores the submitted Google Maps point and syncs onboarding history", async () => {
    const user = mocks.createUserDoc();
    const service = new LandVerificationService();

    await service.submitUserLandPoint(String(user._id), {
      latitude: "11.562108",
      longitude: "104.888535",
      placeId: "google-place-1",
      formattedAddress: "Phnom Penh, Cambodia",
      drawnShapes: [
        {
          kind: "polygon",
          path: [
            { lat: 11.562108, lng: 104.888535 },
            { lat: 11.5622, lng: 104.8886 },
          ],
        },
      ],
    });

    expect(user.onboarding.steps.step3.landLocation.latitude).toBe(11.562108);
    expect(user.landReview.status).toBe("pending");
    expect(user.landReview.currentPoint.googleMapsUrl).toBe(
      buildGoogleMapsUrl(11.562108, 104.888535, "google-place-1"),
    );
    expect(user.landReview.currentPoint.drawnShapes).toHaveLength(1);
    expect(user.landReview.history).toHaveLength(1);
    expect(user.landReview.history[0].action).toBe("submitted");

    const record = mocks.onboardingRecords.get(String(user._id));
    expect(record?.steps.step3.landLocation.formattedAddress).toBe("Phnom Penh, Cambodia");
    expect(record?.steps.step3.landLocation.drawnShapes).toHaveLength(1);
    expect(record?.landReview.status).toBe("pending");
  });

  it("lets admin update point and approve with summary even without a border upload", async () => {
    const user = mocks.createUserDoc({
      _id: "user-approve",
      landReview: {
        status: "pending",
        currentPoint: null,
        border: null,
        adminSummary: null,
        history: [],
      },
    });
    const service = new LandVerificationService();

    await service.adminUpdatePoint(
      String(user._id),
      { id: "admin-1", role: "admin" },
      {
        latitude: 11.9,
        longitude: 104.9,
        formattedAddress: "Adjusted point",
        drawnShapes: [
          {
            kind: "rectangle",
            bounds: {
              north: 11.91,
              south: 11.89,
              east: 104.91,
              west: 104.89,
            },
          },
        ],
      },
      "Adjusted based on land documents.",
    );

    await service.approveLandReview(
      String(user._id),
      { id: "admin-1", role: "admin" },
      "Land verified and approved.",
    );

    expect(user.landReview.currentPoint.providedBy).toBe("admin");
    expect(user.landReview.currentPoint.drawnShapes).toHaveLength(1);
    expect(user.landReview.border).toBeNull();
    expect(user.landReview.status).toBe("approved");
    expect(user.kycReview.status).toBe("approved");
    expect(user.landReview.adminSummary).toBe("Land verified and approved.");
    expect(user.landReview.history.map((item: any) => item.action)).toEqual([
      "point_updated",
      "approved",
    ]);
    expect(user.landReview.history[0].point.drawnShapes).toHaveLength(1);

    const record = mocks.onboardingRecords.get(String(user._id));
    expect(record?.steps.step3.landLocation.drawnShapes).toHaveLength(1);
    expect(record?.landReview.currentPoint.drawnShapes).toHaveLength(1);
    expect(mocks.uploadToS3).not.toHaveBeenCalled();
    expect(mocks.unlink).not.toHaveBeenCalled();
  });

  it("rejects land verification and moves the user back to onboarding step 3 with history", async () => {
    const user = mocks.createUserDoc({
      _id: "user-reject",
      landReview: {
        status: "pending",
        currentPoint: {
          latitude: 11.1,
          longitude: 104.1,
          placeId: null,
          formattedAddress: "Original point",
          googleMapsUrl: buildGoogleMapsUrl(11.1, 104.1, null),
          providedBy: "user",
          updatedByUserId: "user-reject",
          updatedAt: new Date(),
        },
        border: null,
        adminSummary: null,
        history: [],
      },
    });
    const service = new LandVerificationService();

    await service.rejectLandReview(
      String(user._id),
      { id: "admin-2", role: "admin" },
      "Coordinates do not match the land papers.",
      "Please resubmit the map pin closer to the parcel shown in the documents.",
    );

    expect(user.onboarding.currentStep).toBe(3);
    expect(user.onboarding.steps.step3.completed).toBe(false);
    expect(user.onboarding.steps.step2.completed).toBe(true);
    expect(user.onboardingCompleted).toBe(false);
    expect(user.landReview.status).toBe("rejected");
    expect(user.kycReview.status).toBe("rejected");
    expect(user.kycReview.rejectionReason).toBe("Coordinates do not match the land papers.");
    expect(user.landReview.history).toHaveLength(1);
    expect(user.landReview.history[0].reason).toBe("Coordinates do not match the land papers.");
  });
});
