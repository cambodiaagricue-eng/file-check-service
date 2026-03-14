import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    impersonatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    refreshTokenHash: { type: String, required: true, unique: true, index: true },
    tokenId: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null, index: true },
    replacedByTokenId: { type: String, default: null },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: true,
  },
);

export type SessionDocument = InferSchemaType<typeof sessionSchema> & { _id: string };

export function getSessionModel(connection?: Connection): Model<SessionDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Session as Model<SessionDocument>) ||
    db.model<SessionDocument>("Session", sessionSchema, "sessions");
}
