import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";
import { STAGES } from "../constants/stages";

const moduleSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    thumbnailUrl: { type: String, default: null },
    stage: {
      type: String,
      enum: [...STAGES],
      required: true,
      index: true,
    },
    order: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "pending_review", "approved", "rejected"],
      default: "draft",
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewNote: { type: String, default: null },
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

moduleSchema.index({ stage: 1, order: 1 });

export type ModuleDocument = InferSchemaType<typeof moduleSchema> & { _id: string };

export function getModuleModel(connection?: Connection): Model<ModuleDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Module as Model<ModuleDocument>) ||
    db.model<ModuleDocument>("Module", moduleSchema, "modules");
}
