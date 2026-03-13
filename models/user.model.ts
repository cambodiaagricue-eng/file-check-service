import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";
import { randomUUID } from "crypto";

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
    },
    onboardingCompleted: { type: Boolean, default: false, index: true },
    profile: {
      fullName: { type: String, default: null },
      address: { type: String, default: null },
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
