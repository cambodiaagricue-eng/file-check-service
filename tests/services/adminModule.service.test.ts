import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Rec = Record<string, any>;
  let nextId = 1;
  const modules: Rec[] = [];
  const lessons: Rec[] = [];
  const quizzes: Rec[] = [];

  const makeId = () => `mod-${nextId++}`;

  const attachSave = (doc: Rec) => {
    doc.save = vi.fn(async () => doc);
    return doc;
  };

  const ModuleModel = {
    create: vi.fn(async (data: Rec) => {
      const doc = attachSave({ _id: makeId(), ...data });
      modules.push(doc);
      return doc;
    }),
    findById: vi.fn((id: string) => {
      const doc = modules.find((m) => m._id === id) || null;
      if (doc) attachSave(doc);
      return doc;
    }),
    findOne: vi.fn((query: Rec) => ({
      sort: vi.fn(() => ({
        select: vi.fn(() => ({
          lean: vi.fn(async () => {
            const match = modules.find((m) =>
              Object.entries(query).every(([k, v]) => m[k] === v),
            );
            return match || null;
          }),
        })),
      })),
      lean: vi.fn(async () => {
        const match = modules.find((m) =>
          Object.entries(query).every(([k, v]) => m[k] === v),
        );
        return match || null;
      }),
    })),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        lean: vi.fn(async () => modules),
      })),
    })),
  };

  const LessonModel = {
    countDocuments: vi.fn(async (q: Rec) =>
      lessons.filter((l) => l.moduleId === q.moduleId).length,
    ),
    findOne: vi.fn((q: Rec) => ({
      sort: vi.fn(() => ({
        select: vi.fn(() => ({
          lean: vi.fn(async () => null),
        })),
      })),
    })),
    create: vi.fn(async (data: Rec) => {
      const doc = attachSave({ _id: makeId(), ...data });
      lessons.push(doc);
      return doc;
    }),
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        lean: vi.fn(async () => lessons),
      })),
    })),
    deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
  };

  const QuizModel = {
    findOne: vi.fn((q: Rec) => {
      const match = quizzes.find((qz) => qz.moduleId === q.moduleId) || null;
      return {
        lean: vi.fn(async () => match),
      };
    }),
    findOneAndUpdate: vi.fn(async (_q: Rec, data: Rec) => {
      const doc = attachSave({ _id: makeId(), ...data });
      quizzes.push(doc);
      return doc;
    }),
  };

  const reset = () => {
    modules.length = 0;
    lessons.length = 0;
    quizzes.length = 0;
    nextId = 1;
    vi.clearAllMocks();
  };

  return { modules, lessons, quizzes, ModuleModel, LessonModel, QuizModel, reset, attachSave };
});

vi.mock("../../models/module.model", () => ({
  getModuleModel: () => mocks.ModuleModel,
}));
vi.mock("../../models/lesson.model", () => ({
  getLessonModel: () => mocks.LessonModel,
}));
vi.mock("../../models/quiz.model", () => ({
  getQuizModel: () => mocks.QuizModel,
}));

import { AdminModuleService } from "../../services/adminModule.service";

describe("AdminModuleService", () => {
  let svc: AdminModuleService;

  beforeEach(() => {
    mocks.reset();
    svc = new AdminModuleService();
  });

  describe("createModule", () => {
    it("creates a module in draft status", async () => {
      const mod = await svc.createModule("admin-1", {
        title: "Intro to Farming",
        description: "Learn basics",
        stage: "basic",
      });

      expect(mod.title).toBe("Intro to Farming");
      expect(mod.status).toBe("draft");
      expect(mod.stage).toBe("basic");
      expect(mod.createdBy).toBe("admin-1");
    });

    it("rejects invalid stage", async () => {
      await expect(
        svc.createModule("admin-1", {
          title: "Bad",
          description: "Bad",
          stage: "invalid",
        }),
      ).rejects.toThrow("Invalid stage");
    });
  });

  describe("submitForReview", () => {
    it("rejects if no lessons exist", async () => {
      const mod = await svc.createModule("admin-1", {
        title: "Empty Module",
        description: "No content",
        stage: "basic",
      });

      await expect(svc.submitForReview("admin-1", mod._id)).rejects.toThrow(
        "at least one lesson",
      );
    });
  });

  describe("reviewModule — maker-checker", () => {
    it("rejects self-review (creator cannot approve own module)", async () => {
      mocks.modules.push(
        mocks.attachSave({
          _id: "mod-review",
          status: "pending_review",
          createdBy: "admin-1",
        }),
      );

      await expect(
        svc.reviewModule("admin-1", "mod-review", "approve"),
      ).rejects.toThrow("creator cannot review");
    });

    it("allows a different admin to approve", async () => {
      mocks.modules.push(
        mocks.attachSave({
          _id: "mod-review2",
          status: "pending_review",
          createdBy: "admin-1",
        }),
      );

      const result = await svc.reviewModule("admin-2", "mod-review2", "approve");
      expect(result.status).toBe("approved");
      expect(result.publishedAt).toBeTruthy();
    });

    it("sets reviewNote on reject", async () => {
      mocks.modules.push(
        mocks.attachSave({
          _id: "mod-review3",
          status: "pending_review",
          createdBy: "admin-1",
        }),
      );

      const result = await svc.reviewModule(
        "admin-2",
        "mod-review3",
        "reject",
        "Needs more content",
      );
      expect(result.status).toBe("rejected");
      expect(result.reviewNote).toBe("Needs more content");
    });
  });

  describe("addLesson", () => {
    it("creates a lesson for a draft module", async () => {
      mocks.modules.push(
        mocks.attachSave({ _id: "mod-lesson", status: "draft", createdBy: "admin-1" }),
      );

      const lesson = await svc.addLesson("admin-1", "mod-lesson", {
        title: "Lesson 1",
        type: "video",
        content: "https://youtube.com/watch?v=abc",
      });

      expect(lesson.title).toBe("Lesson 1");
      expect(lesson.type).toBe("video");
    });

    it("rejects adding lesson to approved module", async () => {
      mocks.modules.push(
        mocks.attachSave({ _id: "mod-approved", status: "approved" }),
      );

      await expect(
        svc.addLesson("admin-1", "mod-approved", {
          title: "Too late",
          type: "text",
          content: "Content",
        }),
      ).rejects.toThrow("draft or rejected");
    });
  });

  describe("setQuiz", () => {
    it("validates questions have at least 2 options", async () => {
      mocks.modules.push(
        mocks.attachSave({ _id: "mod-quiz", status: "draft" }),
      );

      await expect(
        svc.setQuiz("admin-1", "mod-quiz", {
          passingScore: 70,
          questions: [
            { questionText: "Q1?", options: ["Only one"], correctOptionIndex: 0 },
          ],
        }),
      ).rejects.toThrow("at least 2 options");
    });

    it("saves valid quiz", async () => {
      mocks.modules.push(
        mocks.attachSave({ _id: "mod-quiz2", status: "draft" }),
      );

      const quiz = await svc.setQuiz("admin-1", "mod-quiz2", {
        passingScore: 70,
        questions: [
          { questionText: "What is soil?", options: ["Dirt", "Rock"], correctOptionIndex: 0 },
        ],
      });

      expect(quiz.passingScore).toBe(70);
      expect(quiz.questions.length).toBe(1);
    });
  });
});
