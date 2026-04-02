import { Schema, type Connection, type InferSchemaType, type Model } from "mongoose";
import { getMainDbConnection } from "../db/maindb";

const questionSchema = new Schema(
  {
    questionText: { type: String, required: true },
    options: { type: [String], required: true },
    correctOptionIndex: { type: Number, required: true },
  },
  { _id: false },
);

const quizSchema = new Schema(
  {
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: "Module",
      required: true,
      unique: true,
      index: true,
    },
    passingScore: { type: Number, required: true, min: 0, max: 100 },
    questions: { type: [questionSchema], default: [] },
  },
  { timestamps: true },
);

export type QuizDocument = InferSchemaType<typeof quizSchema> & { _id: string };

export function getQuizModel(connection?: Connection): Model<QuizDocument> {
  const db = connection ?? getMainDbConnection();
  return (db.models.Quiz as Model<QuizDocument>) ||
    db.model<QuizDocument>("Quiz", quizSchema, "quizzes");
}
