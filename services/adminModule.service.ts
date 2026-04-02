import { ApiError } from "../utils/ApiError";
import { getModuleModel } from "../models/module.model";
import { getLessonModel } from "../models/lesson.model";
import { getQuizModel } from "../models/quiz.model";
import { STAGES, type Stage } from "../constants/stages";

export class AdminModuleService {
  /** Create a new module in draft status. */
  async createModule(adminId: string, data: {
    title: string;
    description: string;
    stage: string;
    thumbnailUrl?: string;
  }) {
    const Module = getModuleModel();

    const stage = data.stage as Stage;
    if (!STAGES.includes(stage)) {
      throw new ApiError(400, `Invalid stage. Must be one of: ${STAGES.join(", ")}`);
    }

    const title = data.title?.trim();
    if (!title) throw new ApiError(400, "title is required.");
    const description = data.description?.trim();
    if (!description) throw new ApiError(400, "description is required.");

    const maxOrder = await Module.findOne({ stage }).sort({ order: -1 }).select("order").lean();
    const order = (maxOrder?.order ?? -1) + 1;

    const mod = await Module.create({
      title,
      description,
      thumbnailUrl: data.thumbnailUrl?.trim() || null,
      stage,
      order,
      status: "draft",
      createdBy: adminId,
    });

    return mod;
  }

  /** Update a draft or rejected module. */
  async updateModule(adminId: string, moduleId: string, data: {
    title?: string;
    description?: string;
    thumbnailUrl?: string;
    order?: number;
  }) {
    const Module = getModuleModel();
    const mod = await Module.findById(moduleId);
    if (!mod) throw new ApiError(404, "Module not found.");
    if (mod.status !== "draft" && mod.status !== "rejected") {
      throw new ApiError(400, "Only draft or rejected modules can be edited.");
    }
    if (String(mod.createdBy) !== adminId) {
      throw new ApiError(403, "Only the creator can edit this module.");
    }

    if (data.title?.trim()) mod.title = data.title.trim();
    if (data.description?.trim()) mod.description = data.description.trim();
    if (data.thumbnailUrl !== undefined) mod.thumbnailUrl = data.thumbnailUrl?.trim() || null;
    if (data.order !== undefined) mod.order = data.order;

    mod.status = "draft";
    mod.reviewNote = null;
    await mod.save();
    return mod;
  }

  /** Submit a draft module for review. */
  async submitForReview(adminId: string, moduleId: string) {
    const Module = getModuleModel();
    const Lesson = getLessonModel();
    const Quiz = getQuizModel();

    const mod = await Module.findById(moduleId);
    if (!mod) throw new ApiError(404, "Module not found.");
    if (String(mod.createdBy) !== adminId) {
      throw new ApiError(403, "Only the creator can submit for review.");
    }
    if (mod.status !== "draft" && mod.status !== "rejected") {
      throw new ApiError(400, "Only draft or rejected modules can be submitted for review.");
    }

    const lessonCount = await Lesson.countDocuments({ moduleId });
    if (lessonCount === 0) {
      throw new ApiError(400, "Module must have at least one lesson before submitting.");
    }

    const quiz = await Quiz.findOne({ moduleId });
    if (!quiz || quiz.questions.length === 0) {
      throw new ApiError(400, "Module must have a quiz with at least one question before submitting.");
    }

    mod.status = "pending_review";
    await mod.save();
    return mod;
  }

  /** Checker approves or rejects a module. */
  async reviewModule(checkerId: string, moduleId: string, action: "approve" | "reject", note?: string) {
    const Module = getModuleModel();
    const mod = await Module.findById(moduleId);
    if (!mod) throw new ApiError(404, "Module not found.");
    if (mod.status !== "pending_review") {
      throw new ApiError(400, "Module is not pending review.");
    }
    if (String(mod.createdBy) === checkerId) {
      throw new ApiError(403, "The creator cannot review their own module.");
    }

    mod.reviewedBy = checkerId as any;

    if (action === "approve") {
      mod.status = "approved";
      mod.publishedAt = new Date();
      mod.reviewNote = null;
    } else {
      mod.status = "rejected";
      mod.reviewNote = note?.trim() || "No reason provided.";
    }

    await mod.save();
    return mod;
  }

  /** List modules, optionally filtered by stage and status. */
  async listModules(filters: { stage?: string; status?: string }) {
    const Module = getModuleModel();
    const query: Record<string, string> = {};
    if (filters.stage && STAGES.includes(filters.stage as Stage)) query.stage = filters.stage;
    if (filters.status) query.status = filters.status;
    return Module.find(query).sort({ stage: 1, order: 1 }).lean();
  }

  /** Get a single module with its lessons and quiz. */
  async getModuleDetail(moduleId: string) {
    const Module = getModuleModel();
    const Lesson = getLessonModel();
    const Quiz = getQuizModel();

    const mod = await Module.findById(moduleId).lean();
    if (!mod) throw new ApiError(404, "Module not found.");

    const lessons = await Lesson.find({ moduleId }).sort({ order: 1 }).lean();
    const quiz = await Quiz.findOne({ moduleId }).lean();

    return { ...mod, lessons, quiz };
  }

  // ── Lesson CRUD ──

  async addLesson(adminId: string, moduleId: string, data: {
    title: string; type: string; content: string;
  }) {
    const Module = getModuleModel();
    const Lesson = getLessonModel();
    const mod = await Module.findById(moduleId);
    if (!mod) throw new ApiError(404, "Module not found.");
    if (mod.status !== "draft" && mod.status !== "rejected") {
      throw new ApiError(400, "Lessons can only be added to draft or rejected modules.");
    }

    const title = data.title?.trim();
    if (!title) throw new ApiError(400, "Lesson title is required.");
    const type = data.type?.trim();
    if (!["video", "text"].includes(type)) throw new ApiError(400, "Lesson type must be video or text.");
    const content = data.content?.trim();
    if (!content) throw new ApiError(400, "Lesson content is required.");

    const maxOrder = await Lesson.findOne({ moduleId }).sort({ order: -1 }).select("order").lean();
    const order = (maxOrder?.order ?? -1) + 1;

    return Lesson.create({ moduleId, title, type, content, order });
  }

  async updateLesson(adminId: string, moduleId: string, lessonId: string, data: {
    title?: string; type?: string; content?: string; order?: number;
  }) {
    const Module = getModuleModel();
    const Lesson = getLessonModel();
    const mod = await Module.findById(moduleId);
    if (!mod) throw new ApiError(404, "Module not found.");
    if (mod.status !== "draft" && mod.status !== "rejected") {
      throw new ApiError(400, "Lessons can only be edited in draft or rejected modules.");
    }

    const lesson = await Lesson.findOne({ _id: lessonId, moduleId });
    if (!lesson) throw new ApiError(404, "Lesson not found.");

    if (data.title?.trim()) lesson.title = data.title.trim();
    if (data.type && ["video", "text"].includes(data.type)) lesson.type = data.type as "video" | "text";
    if (data.content?.trim()) lesson.content = data.content.trim();
    if (data.order !== undefined) lesson.order = data.order;

    await lesson.save();
    return lesson;
  }

  async deleteLesson(adminId: string, moduleId: string, lessonId: string) {
    const Module = getModuleModel();
    const Lesson = getLessonModel();
    const mod = await Module.findById(moduleId);
    if (!mod) throw new ApiError(404, "Module not found.");
    if (mod.status !== "draft" && mod.status !== "rejected") {
      throw new ApiError(400, "Lessons can only be deleted from draft or rejected modules.");
    }

    const result = await Lesson.deleteOne({ _id: lessonId, moduleId });
    if (result.deletedCount === 0) throw new ApiError(404, "Lesson not found.");
  }

  // ── Quiz CRUD ──

  async setQuiz(adminId: string, moduleId: string, data: {
    passingScore: number;
    questions: Array<{ questionText: string; options: string[]; correctOptionIndex: number }>;
  }) {
    const Module = getModuleModel();
    const Quiz = getQuizModel();
    const mod = await Module.findById(moduleId);
    if (!mod) throw new ApiError(404, "Module not found.");
    if (mod.status !== "draft" && mod.status !== "rejected") {
      throw new ApiError(400, "Quiz can only be set on draft or rejected modules.");
    }

    if (!data.passingScore || data.passingScore < 1 || data.passingScore > 100) {
      throw new ApiError(400, "passingScore must be between 1 and 100.");
    }
    if (!data.questions || data.questions.length === 0) {
      throw new ApiError(400, "Quiz must have at least one question.");
    }
    for (const q of data.questions) {
      if (!q.questionText?.trim()) throw new ApiError(400, "Each question must have questionText.");
      if (!q.options || q.options.length < 2) throw new ApiError(400, "Each question must have at least 2 options.");
      if (q.correctOptionIndex < 0 || q.correctOptionIndex >= q.options.length) {
        throw new ApiError(400, "correctOptionIndex must be a valid option index.");
      }
    }

    const quiz = await Quiz.findOneAndUpdate(
      { moduleId },
      { moduleId, passingScore: data.passingScore, questions: data.questions },
      { upsert: true, returnDocument: "after" },
    );
    return quiz;
  }
}
