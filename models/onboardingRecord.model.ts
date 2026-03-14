import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const onboardingRecordSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    profile: {
      fullName: { type: String, default: null },
      address: { type: String, default: null },
      gender: { type: String, default: null },
      age: { type: Number, default: null },
    },
    steps: {
      step1: {
        completed: { type: Boolean, default: false },
        selfieUrl: { type: String, default: null },
        completedAt: { type: Date, default: null },
      },
      step2: {
        completed: { type: Boolean, default: false },
        govIdUrl: { type: String, default: null },
        completedAt: { type: Date, default: null },
      },
      step3: {
        completed: { type: Boolean, default: false },
        landDocumentUrls: { type: [String], default: [] },
        completedAt: { type: Date, default: null },
      },
    },
    currentStep: { type: Number, default: 1 },
    onboardingCompleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

export type OnboardingRecordDocument = InferSchemaType<typeof onboardingRecordSchema> & {
  _id: string;
};

export function getOnboardingRecordModel(
  connection?: Connection,
): Model<OnboardingRecordDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.OnboardingRecord as Model<OnboardingRecordDocument>) ||
    db.model<OnboardingRecordDocument>(
      "OnboardingRecord",
      onboardingRecordSchema,
      "onboarding_records",
    );
}
