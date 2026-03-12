import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    phone: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    isVerified: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    lastLogins: {
      type: [
        {
          location: { type: String, required: true },
          loggedAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

export type UserDocument = InferSchemaType<typeof userSchema> & { _id: string };

export function getUserModel(connection?: Connection): Model<UserDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.User as Model<UserDocument>) ||
    db.model<UserDocument>("User", userSchema, "users");
}
