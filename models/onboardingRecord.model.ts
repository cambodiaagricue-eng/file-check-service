import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

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
      province: { type: String, default: null },
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
    currentStep: { type: Number, default: 1 },
    onboardingCompleted: { type: Boolean, default: false },
    landReview: {
      status: { type: String, default: "not_started" },
      currentPoint: {
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
        uploadedAt: { type: Date, default: null },
        notes: { type: String, default: null },
      },
      adminSummary: { type: String, default: null },
      history: { type: [Schema.Types.Mixed], default: [] },
    },
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
