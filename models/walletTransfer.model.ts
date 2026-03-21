import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const walletTransferSchema = new Schema(
  {
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    recipientMemberQrCode: { type: String, required: true, index: true },
    coins: { type: Number, required: true },
    usdAmount: { type: Number, required: true },
    note: { type: String, default: null },
  },
  { timestamps: true },
);

export type WalletTransferDocument = InferSchemaType<typeof walletTransferSchema> & { _id: string };

export function getWalletTransferModel(connection?: Connection): Model<WalletTransferDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.WalletTransfer as Model<WalletTransferDocument>) ||
    db.model<WalletTransferDocument>("WalletTransfer", walletTransferSchema, "wallet_transfers");
}
