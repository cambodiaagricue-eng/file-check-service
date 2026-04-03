import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";
import { randomUUID } from "crypto";

const drawnShapeSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ["polygon", "polyline", "rectangle"],
      required: true,
    },
    path: {
      type: [
        {
          lat: { type: Number, required: true },
          lng: { type: Number, required: true },
        },
      ],
      default: undefined,
    },
    bounds: {
      north: { type: Number, default: null },
      south: { type: Number, default: null },
      east: { type: Number, default: null },
      west: { type: Number, default: null },
    },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    phone: { type: String, required: true, unique: true, index: true },
    role: {
      type: String,
      enum: ["farmer", "buyer", "seller", "agent", "admin", "superadmin"],
      default: "farmer",
      index: true,
    },
    marketplaceMode: {
      type: String,
      enum: ["buyer", "seller", "both"],
      default: "both",
    },
    memberQrCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `MAYURA-${randomUUID()}`,
    },
    createdByAgentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    agentCreatedPendingApproval: { type: Boolean, default: false, index: true },
    passwordHash: { type: String, required: true },
    isVerified: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isLoginBlocked: { type: Boolean, default: false, index: true },
    loginBlockedReason: { type: String, default: null },
    verification: {
      expectedNameChangeCount: { type: Number, default: 0 },
      expectedNameHistory: { type: [String], default: [] },
      documentNameVerified: { type: Boolean, default: false },
      documentVerificationFailedCount: { type: Number, default: 0 },
      lastDocumentVerificationAt: { type: Date, default: null },
      lastDocumentSummary: { type: String, default: null },
    },
    kycReview: {
      status: {
        type: String,
        enum: ["not_started", "pending", "approved", "rejected"],
        default: "not_started",
        index: true,
      },
      rejectionReason: { type: String, default: null },
      submittedAt: { type: Date, default: null },
      reviewedAt: { type: Date, default: null },
      reviewedByAdminId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    landReview: {
      status: {
        type: String,
        enum: ["not_started", "pending", "approved", "rejected"],
        default: "not_started",
        index: true,
      },
      currentPoint: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null },
        placeId: { type: String, default: null },
        formattedAddress: { type: String, default: null },
        googleMapsUrl: { type: String, default: null },
        drawnShapes: { type: [drawnShapeSchema], default: [] },
        providedBy: {
          type: String,
          enum: ["user", "admin"],
          default: null,
        },
        updatedByUserId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        updatedAt: { type: Date, default: null },
      },
      border: {
        fileUrl: { type: String, default: null },
        fileName: { type: String, default: null },
        contentType: { type: String, default: null },
        uploadedAt: { type: Date, default: null },
        uploadedByAdminId: {
          type: Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        notes: { type: String, default: null },
      },
      adminSummary: { type: String, default: null },
      history: {
        type: [
          {
            action: {
              type: String,
              enum: [
                "submitted",
                "point_updated",
                "border_uploaded",
                "approved",
                "rejected",
              ],
              required: true,
            },
            status: {
              type: String,
              enum: ["pending", "approved", "rejected"],
              required: true,
            },
            summary: { type: String, default: null },
            reason: { type: String, default: null },
            point: {
              latitude: { type: Number, default: null },
              longitude: { type: Number, default: null },
              placeId: { type: String, default: null },
              formattedAddress: { type: String, default: null },
              googleMapsUrl: { type: String, default: null },
              drawnShapes: { type: [drawnShapeSchema], default: [] },
            },
            border: {
              fileUrl: { type: String, default: null },
              fileName: { type: String, default: null },
              contentType: { type: String, default: null },
            },
            actorId: {
              type: Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            actorRole: { type: String, default: null },
            createdAt: { type: Date, default: Date.now },
          },
        ],
        default: [],
      },
    },
    onboardingCompleted: { type: Boolean, default: false, index: true },
    profile: {
      fullName: { type: String, default: null },
      address: { type: String, default: null },
      province: { type: String, default: null },
      gender: { type: String, default: null },
      age: { type: Number, default: null },
    },
    onboarding: {
      currentStep: { type: Number, default: 1 },
      steps: {
        step1: {
          completed: { type: Boolean, default: false },
          selfiePath: { type: String, default: null },
          completedAt: { type: Date, default: null },
        },
        step2: {
          completed: { type: Boolean, default: false },
          govIdPath: { type: String, default: null },
          completedAt: { type: Date, default: null },
        },
        step3: {
          completed: { type: Boolean, default: false },
          landDocumentPaths: { type: [String], default: [] },
          landLocation: {
            latitude: { type: Number, default: null },
            longitude: { type: Number, default: null },
            placeId: { type: String, default: null },
            formattedAddress: { type: String, default: null },
            googleMapsUrl: { type: String, default: null },
            drawnShapes: { type: [drawnShapeSchema], default: [] },
          },
          completedAt: { type: Date, default: null },
        },
      },
    },
    lastLogins: {
      type: [
        {
          location: { type: String, required: true },
          loggedAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
    stageOverrides: { type: [String], default: [] },
  },
  {
    timestamps: true,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: string };

export function getUserModel(connection?: Connection): Model<UserDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.User as Model<UserDocument>) ||
    db.model<UserDocument>("User", userSchema, "users");
}
