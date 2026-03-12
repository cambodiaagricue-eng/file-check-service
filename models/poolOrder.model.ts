import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const poolOrderSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    coinsPerUnit: { type: Number, required: true, min: 1 },
    minParticipants: { type: Number, required: true, min: 1 },
    maxParticipants: { type: Number, default: null },
    isOpen: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

export type PoolOrderDocument = InferSchemaType<typeof poolOrderSchema> & { _id: string };

export function getPoolOrderModel(connection?: Connection): Model<PoolOrderDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.PoolOrder as Model<PoolOrderDocument>) ||
    db.model<PoolOrderDocument>("PoolOrder", poolOrderSchema, "pool_orders");
}
