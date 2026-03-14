import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const poolOrderJoinSchema = new Schema(
  {
    poolOrderId: { type: Schema.Types.ObjectId, ref: "PoolOrder", required: true, index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    units: { type: Number, required: true, min: 1 },
    coinsCharged: { type: Number, required: true, min: 1 },
    deliveryAddress: { type: String, required: true },
  },
  { timestamps: true },
);

poolOrderJoinSchema.index({ poolOrderId: 1, buyerId: 1 }, { unique: true });

export type PoolOrderJoinDocument = InferSchemaType<typeof poolOrderJoinSchema> & {
  _id: string;
};

export function getPoolOrderJoinModel(connection?: Connection): Model<PoolOrderJoinDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.PoolOrderJoin as Model<PoolOrderJoinDocument>) ||
    db.model<PoolOrderJoinDocument>("PoolOrderJoin", poolOrderJoinSchema, "pool_order_joins");
}
