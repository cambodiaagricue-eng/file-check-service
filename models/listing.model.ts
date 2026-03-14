import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const listingSchema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    imageUrls: { type: [String], default: [] },
    basePriceUsd: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    isActive: { type: Boolean, default: true, index: true },
    highestBidUsd: { type: Number, default: 0, min: 0 },
    highestBidByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

export type ListingDocument = InferSchemaType<typeof listingSchema> & { _id: string };

export function getListingModel(connection?: Connection): Model<ListingDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Listing as Model<ListingDocument>) ||
    db.model<ListingDocument>("Listing", listingSchema, "listings");
}
