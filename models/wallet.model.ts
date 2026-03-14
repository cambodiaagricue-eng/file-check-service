import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const walletSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    coins: { type: Number, default: 0, min: 0 },
    usdBalance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export type WalletDocument = InferSchemaType<typeof walletSchema> & { _id: string };

export function getWalletModel(connection?: Connection): Model<WalletDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Wallet as Model<WalletDocument>) ||
    db.model<WalletDocument>("Wallet", walletSchema, "wallets");
}
