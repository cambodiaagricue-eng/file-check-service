import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const lessonSchema = new Schema(
  {
    moduleId: { type: Schema.Types.ObjectId, ref: "Module", required: true, index: true },
    title: { type: String, required: true },
    type: {
      type: String,
      enum: ["video", "text"],
      required: true,
    },
    content: { type: String, required: true },
    order: { type: Number, required: true },
  },
  { timestamps: true },
);

lessonSchema.index({ moduleId: 1, order: 1 });

export type LessonDocument = InferSchemaType<typeof lessonSchema> & { _id: string };

export function getLessonModel(connection?: Connection): Model<LessonDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Lesson as Model<LessonDocument>) ||
    db.model<LessonDocument>("Lesson", lessonSchema, "lessons");
}
