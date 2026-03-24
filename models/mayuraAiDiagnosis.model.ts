import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const mayuraAiImageSchema = new Schema(
  {
    url: { type: String, required: true },
    key: { type: String, default: null },
    fileName: { type: String, default: null },
    mimeType: { type: String, default: null },
    size: { type: Number, default: 0 },
  },
  { _id: false },
);

const mayuraAiDiagnosisSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    walletTransactionId: {
      type: Schema.Types.ObjectId,
      ref: "WalletTransaction",
      default: null,
      index: true,
    },
    model: { type: String, required: true, default: "gemini-2.5-flash" },
    coinsCharged: { type: Number, required: true, default: 2 },
    plantName: { type: String, default: null },
    diseaseName: { type: String, default: null },
    isDiseaseDetected: { type: Boolean, default: false },
    confidence: { type: String, default: null },
    summary: { type: String, default: null },
    reasons: { type: [String], default: [] },
    precautions: { type: [String], default: [] },
    fixes: { type: [String], default: [] },
    reportMarkdown: { type: String, required: true },
    images: { type: [mayuraAiImageSchema], default: [] },
    rawResponse: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export type MayuraAiDiagnosisDocument = InferSchemaType<typeof mayuraAiDiagnosisSchema> & {
  _id: string;
};

export function getMayuraAiDiagnosisModel(
  connection?: Connection,
): Model<MayuraAiDiagnosisDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.MayuraAiDiagnosis as Model<MayuraAiDiagnosisDocument>) ||
    db.model<MayuraAiDiagnosisDocument>(
      "MayuraAiDiagnosis",
      mayuraAiDiagnosisSchema,
      "mayura_ai_diagnoses",
    );
}
