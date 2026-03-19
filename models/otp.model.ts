import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

export const otpPurposes = ["verify_account", "reset_password"] as const;
export type OtpPurpose = (typeof otpPurposes)[number];

const otpSchema = new Schema(
  {
    phone: { type: String, required: true, index: true },
    purpose: { type: String, enum: otpPurposes, required: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    requestId: { type: String, default: null },
    deliveryStatus: { type: String, default: null },
    consumedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
  },
);

export type OtpDocument = InferSchemaType<typeof otpSchema> & { _id: string };

export function getOtpModel(connection?: Connection): Model<OtpDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Otp as Model<OtpDocument>) ||
    db.model<OtpDocument>("Otp", otpSchema, "otp_codes");
}
