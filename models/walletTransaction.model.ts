import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const walletTransactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: true,
      index: true,
    },
    source: {
      type: String,
      enum: ["buy_coins", "redeem_code", "soil_test", "mayur_gpt", "mayura_ai", "pool_order", "peer_transfer", "manual"],
      required: true,
      index: true,
    },
    usdAmount: { type: Number, default: 0 },
    coinsDelta: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    paymentOrderId: {
      type: Schema.Types.ObjectId,
      ref: "PaymentOrder",
      default: undefined,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

walletTransactionSchema.index(
  { paymentOrderId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      paymentOrderId: { $exists: true, $type: "objectId" },
    },
  },
);

export type WalletTransactionDocument = InferSchemaType<typeof walletTransactionSchema> & {
  _id: string;
};

export function getWalletTransactionModel(
  connection?: Connection,
): Model<WalletTransactionDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.WalletTransaction as Model<WalletTransactionDocument>) ||
    db.model<WalletTransactionDocument>(
      "WalletTransaction",
      walletTransactionSchema,
      "wallet_transactions",
    );
}
