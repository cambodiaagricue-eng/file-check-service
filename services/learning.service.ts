import { ApiError } from "../utils/ApiError";
import { getModuleModel } from "../models/module.model";
import { getLessonModel } from "../models/lesson.model";
import { getQuizModel } from "../models/quiz.model";
import { getUserProgressModel } from "../models/userProgress.model";
import { getUserModel } from "../models/user.model";
import { STAGES, type Stage, prerequisiteStage, STAGE_LABELS } from "../constants/stages";

export class LearningService {
  /** Check if a user has completed all approved modules in a stage. */
  async isStageCompleted(userId: string, stage: Stage): Promise<boolean> {
    const Module = getModuleModel();
    const UserProgress = getUserProgressModel();

    const approvedModules = await Module.find({ stage, status: "approved" }).select("_id").lean();
    if (approvedModules.length === 0) return false;

    const moduleIds = approvedModules.map((m) => String(m._id));
    const completedCount = await UserProgress.countDocuments({
      userId,
      moduleId: { $in: moduleIds },
      completedAt: { $ne: null },
    });

    return completedCount >= moduleIds.length;
  }

  /** Check if a stage is unlocked for a user. */
  async isStageUnlocked(userId: string, stage: Stage): Promise<boolean> {
    if (stage === "basic") return true;

    const User = getUserModel();
    const user = await User.findById(userId).select("stageOverrides").lean();
    if (user?.stageOverrides?.includes(stage)) return true;

    const prereq = prerequisiteStage(stage);
    if (!prereq) return true;

    return this.isStageCompleted(userId, prereq);
  }

  /** Get all stages with progress summary for a user. */
  async getStagesOverview(userId: string) {
    const Module = getModuleModel();
    const UserProgress = getUserProgressModel();

    const result = [];

    for (const stage of STAGES) {
      const approvedModules = await Module.find({ stage, status: "approved" })
        .select("_id title description thumbnailUrl order")
        .sort({ order: 1 })
        .lean();

      const moduleIds = approvedModules.map((m) => String(m._id));

      const progressRecords = await UserProgress.find({
        userId,
        moduleId: { $in: moduleIds },
      }).lean();

      const completedCount = progressRecords.filter((p) => p.completedAt !== null).length;
      const unlocked = await this.isStageUnlocked(userId, stage);

      result.push({
        stage,
        label: STAGE_LABELS[stage],
        unlocked,
        totalModules: approvedModules.length,
        completedModules: completedCount,
        modules: approvedModules.map((m) => {
          const progress = progressRecords.find((p) => String(p.moduleId) === String(m._id));
          return {
            ...m,
            completed: progress?.completedAt !== null && progress?.completedAt !== undefined,
          };
        }),
      });
    }

    return result;
  }

  /** Get a module's full content (lessons + quiz meta) for a user. */
  async getModuleForUser(userId: string, moduleId: string) {
    const Module = getModuleModel();
    const Lesson = getLessonModel();
    const Quiz = getQuizModel();
    const UserProgress = getUserProgressModel();

    const mod = await Module.findOne({ _id: moduleId, status: "approved" }).lean();
    if (!mod) throw new ApiError(404, "Module not found or not published.");

    const unlocked = await this.isStageUnlocked(userId, mod.stage as Stage);
    if (!unlocked) throw new ApiError(403, "This stage is locked. Complete the previous stage first.");

    const lessons = await Lesson.find({ moduleId }).sort({ order: 1 }).lean();
    const quiz = await Quiz.findOne({ moduleId }).lean();
    const progress = await UserProgress.findOne({ userId, moduleId }).lean();

    return {
      ...mod,
      lessons: lessons.map((l) => ({
        ...l,
        completed: progress?.completedLessons?.some((cl) => String(cl) === String(l._id)) ?? false,
      })),
      quiz: quiz
        ? { _id: quiz._id, passingScore: quiz.passingScore, questionCount: quiz.questions.length }
        : null,
      progress: {
        completedLessons: progress?.completedLessons?.length ?? 0,
        totalLessons: lessons.length,
        quizPassed: progress?.quizAttempts?.some((a) => a.passed) ?? false,
        completed: progress?.completedAt !== null && progress?.completedAt !== undefined,
      },
    };
  }

  /** Mark a lesson as completed. */
  async completeLesson(userId: string, moduleId: string, lessonId: string): Promise<void> {
    const Module = getModuleModel();
    const Lesson = getLessonModel();
    const UserProgress = getUserProgressModel();

    const mod = await Module.findOne({ _id: moduleId, status: "approved" }).lean();
    if (!mod) throw new ApiError(404, "Module not found.");

    const unlocked = await this.isStageUnlocked(userId, mod.stage as Stage);
    if (!unlocked) throw new ApiError(403, "Stage is locked.");

    const lesson = await Lesson.findOne({ _id: lessonId, moduleId }).lean();
    if (!lesson) throw new ApiError(404, "Lesson not found.");

    await UserProgress.updateOne(
      { userId, moduleId },
      { $addToSet: { completedLessons: lessonId } },
      { upsert: true },
    );
  }

  /** Get quiz questions for a module (without correct answers). */
  async getQuizQuestions(userId: string, moduleId: string) {
    const Module = getModuleModel();
    const Quiz = getQuizModel();

    const mod = await Module.findOne({ _id: moduleId, status: "approved" }).lean();
    if (!mod) throw new ApiError(404, "Module not found or not published.");

    const unlocked = await this.isStageUnlocked(userId, mod.stage as Stage);
    if (!unlocked) throw new ApiError(403, "This stage is locked. Complete the previous stage first.");

    const quiz = await Quiz.findOne({ moduleId }).lean();
    if (!quiz) throw new ApiError(404, "No quiz found for this module.");

    return {
      passingScore: quiz.passingScore,
      questions: quiz.questions.map((q) => ({
        questionText: q.questionText,
        options: q.options,
      })),
    };
  }

  /** Submit quiz answers and return score. If all lessons done + quiz passed → module completed. */
  async submitQuiz(userId: string, moduleId: string, answers: number[]) {
    const Module = getModuleModel();
    const Lesson = getLessonModel();
    const Quiz = getQuizModel();
    const UserProgress = getUserProgressModel();

    const mod = await Module.findOne({ _id: moduleId, status: "approved" }).lean();
    if (!mod) throw new ApiError(404, "Module not found.");

    const unlocked = await this.isStageUnlocked(userId, mod.stage as Stage);
    if (!unlocked) throw new ApiError(403, "Stage is locked.");

    const quiz = await Quiz.findOne({ moduleId }).lean();
    if (!quiz) throw new ApiError(404, "No quiz found for this module.");

    if (answers.length !== quiz.questions.length) {
      throw new ApiError(400, `Expected ${quiz.questions.length} answers, got ${answers.length}.`);
    }

    let correct = 0;
    for (let i = 0; i < quiz.questions.length; i++) {
      if (answers[i] === quiz.questions[i]!.correctOptionIndex) correct++;
    }

    const score = Math.round((correct / quiz.questions.length) * 100);
    const passed = score >= quiz.passingScore;

    const attempt = { score, passed, answers, attemptedAt: new Date() };

    await UserProgress.updateOne(
      { userId, moduleId },
      { $push: { quizAttempts: attempt } },
      { upsert: true },
    );

    // If quiz passed, check if all lessons are also done and mark module complete
    if (passed) {
      const progress = await UserProgress.findOne({ userId, moduleId });
      const totalLessons = await Lesson.countDocuments({ moduleId });

      if (progress && progress.completedLessons.length >= totalLessons && !progress.completedAt) {
        progress.completedAt = new Date();
        await progress.save();
      }
    }

    return { score, passed, passingScore: quiz.passingScore, correct, total: quiz.questions.length };
  }
}
