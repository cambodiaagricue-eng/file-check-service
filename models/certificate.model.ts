import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";
import { STAGES } from "../constants/stages";

const certificateSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    stage: {
      type: String,
      enum: [...STAGES],
      required: true,
      index: true,
    },
    certificateId: { type: String, required: true, unique: true, index: true },
    pdfUrl: { type: String, required: true },
    issuedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

certificateSchema.index({ userId: 1, stage: 1 }, { unique: true });

export type CertificateDocument = InferSchemaType<typeof certificateSchema> & { _id: string };

export function getCertificateModel(connection?: Connection): Model<CertificateDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Certificate as Model<CertificateDocument>) ||
    db.model<CertificateDocument>("Certificate", certificateSchema, "certificates");
}
