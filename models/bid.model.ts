import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const bidSchema = new Schema(
  {
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    bidderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amountUsd: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["active", "outbid", "won", "lost"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true },
);

export type BidDocument = InferSchemaType<typeof bidSchema> & { _id: string };

export function getBidModel(connection?: Connection): Model<BidDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Bid as Model<BidDocument>) ||
    db.model<BidDocument>("Bid", bidSchema, "bids");
}
