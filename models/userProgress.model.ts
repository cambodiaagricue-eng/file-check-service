import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const quizAttemptSchema = new Schema(
  {
    score: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    answers: { type: [Number], default: [] },
    attemptedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const userProgressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    moduleId: { type: Schema.Types.ObjectId, ref: "Module", required: true, index: true },
    completedLessons: { type: [Schema.Types.ObjectId], ref: "Lesson", default: [] },
    quizAttempts: { type: [quizAttemptSchema], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

userProgressSchema.index({ userId: 1, moduleId: 1 }, { unique: true });

export type UserProgressDocument = InferSchemaType<typeof userProgressSchema> & { _id: string };

export function getUserProgressModel(connection?: Connection): Model<UserProgressDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.UserProgress as Model<UserProgressDocument>) ||
    db.model<UserProgressDocument>("UserProgress", userProgressSchema, "user_progress");
}
