import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const paymentOrderSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["coin_topup"],
      required: true,
      index: true,
    },
    provider: {
      type: String,
      enum: ["ppcbank_pg"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed", "expired"],
      required: true,
      index: true,
      default: "pending",
    },
    amountUsd: { type: Number, required: true, min: 0 },
    coins: { type: Number, required: true, min: 0 },
    currency: {
      type: String,
      enum: ["USD"],
      required: true,
      default: "USD",
    },
    providerPaymentId: { type: String, default: null, index: true },
    virtualAccountNo: { type: String, default: null, index: true },
    billNumber: { type: String, default: null, index: true },
    instructions: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
    raw: { type: Schema.Types.Mixed, default: {} },
    lastCheckedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
  },
  { timestamps: true },
);

paymentOrderSchema.index({ userId: 1, status: 1, createdAt: -1 });

export type PaymentOrderDocument = InferSchemaType<typeof paymentOrderSchema> & {
  _id: string;
};

export function getPaymentOrderModel(
  connection?: Connection,
): Model<PaymentOrderDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.PaymentOrder as Model<PaymentOrderDocument>) ||
    db.model<PaymentOrderDocument>("PaymentOrder", paymentOrderSchema, "payment_orders");
}
