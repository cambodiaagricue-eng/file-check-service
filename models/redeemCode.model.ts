import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const redeemCodeSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
    amountUsd: { type: Number, required: true },
    coins: { type: Number, required: true },
    status: {
      type: String,
      enum: ["created", "redeemed"],
      required: true,
      default: "created",
      index: true,
    },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    redeemedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    redeemedAt: { type: Date, default: null },
    notes: { type: String, default: null },
  },
  { timestamps: true },
);

export type RedeemCodeDocument = InferSchemaType<typeof redeemCodeSchema> & { _id: string };

export function getRedeemCodeModel(connection?: Connection): Model<RedeemCodeDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.RedeemCode as Model<RedeemCodeDocument>) ||
    db.model<RedeemCodeDocument>("RedeemCode", redeemCodeSchema, "redeem_codes");
}
