import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Rec = Record<string, any>;
  const modules: Rec[] = [];
  const lessons: Rec[] = [];
  const quizzes: Rec[] = [];
  const progressRecords: Rec[] = [];
  const users: Rec[] = [];

  const attachSave = (doc: Rec) => {
    doc.save = vi.fn(async () => doc);
    return doc;
  };

  /** Helper: creates a chainable query that supports .select().sort().lean() in any order */
  const chainable = (result: any) => {
    const obj: Rec = {};
    const wrap = () => {
      obj.select = vi.fn(() => wrap());
      obj.sort = vi.fn(() => wrap());
      obj.lean = vi.fn(async () => result);
      obj.then = (resolve: any) => Promise.resolve(result).then(resolve);
      return obj;
    };
    return wrap();
  };

  const matchQuery = (doc: Rec, query: Rec): boolean =>
    Object.entries(query).every(([k, v]) => {
      if (v && typeof v === "object" && "$in" in v) return v.$in.includes(String(doc[k]));
      if (v && typeof v === "object" && "$ne" in v) return doc[k] !== v.$ne;
      return doc[k] === v;
    });

  const ModuleModel = {
    find: vi.fn((query: Rec) =>
      chainable(modules.filter((m) => matchQuery(m, query))),
    ),
    findOne: vi.fn((query: Rec) =>
      chainable(modules.find((m) => matchQuery(m, query)) || null),
    ),
  };

  const LessonModel = {
    find: vi.fn((query: Rec) =>
      chainable(lessons.filter((l) => l.moduleId === query.moduleId)),
    ),
    findOne: vi.fn((query: Rec) =>
      chainable(
        lessons.find(
          (l) => String(l._id) === String(query._id) && l.moduleId === query.moduleId,
        ) || null,
      ),
    ),
    countDocuments: vi.fn(async (q: Rec) =>
      lessons.filter((l) => l.moduleId === q.moduleId).length,
    ),
  };

  const QuizModel = {
    findOne: vi.fn((query: Rec) =>
      chainable(quizzes.find((q) => q.moduleId === query.moduleId) || null),
    ),
  };

  const UserProgressModel = {
    find: vi.fn((query: Rec) =>
      chainable(
        progressRecords.filter(
          (p) =>
            p.userId === query.userId &&
            (query.moduleId?.$in
              ? query.moduleId.$in.includes(String(p.moduleId))
              : true),
        ),
      ),
    ),
    findOne: vi.fn((query: Rec) => {
      const match = progressRecords.find(
        (p) => p.userId === query.userId && String(p.moduleId) === String(query.moduleId),
      ) || null;
      if (match) attachSave(match);
      // Support both .lean() chaining and direct await
      const obj: Rec = {};
      obj.lean = vi.fn(async () => match);
      obj.then = (resolve: any) => Promise.resolve(match).then(resolve);
      return obj;
    }),
    countDocuments: vi.fn(async (query: Rec) =>
      progressRecords.filter(
        (p) =>
          p.userId === query.userId &&
          (query.moduleId?.$in
            ? query.moduleId.$in.includes(String(p.moduleId))
            : true) &&
          (query.completedAt?.$ne !== undefined ? p.completedAt != null : true),
      ).length,
    ),
    updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
  };

  const UserModel = {
    findById: vi.fn((id: string) => {
      const user = users.find((u) => u._id === id) || null;
      return chainable(user);
    }),
  };

  const reset = () => {
    modules.length = 0;
    lessons.length = 0;
    quizzes.length = 0;
    progressRecords.length = 0;
    users.length = 0;
    vi.clearAllMocks();
  };

  return {
    modules, lessons, quizzes, progressRecords, users,
    ModuleModel, LessonModel, QuizModel, UserProgressModel, UserModel,
    reset, attachSave,
  };
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
vi.mock("../../models/userProgress.model", () => ({
  getUserProgressModel: () => mocks.UserProgressModel,
}));
vi.mock("../../models/user.model", () => ({
  getUserModel: () => mocks.UserModel,
}));

import { LearningService } from "../../services/learning.service";

describe("LearningService", () => {
  let svc: LearningService;

  beforeEach(() => {
    mocks.reset();
    svc = new LearningService();
  });

  describe("isStageUnlocked", () => {
    it("basic stage is always unlocked", async () => {
      expect(await svc.isStageUnlocked("user-1", "basic")).toBe(true);
    });

    it("technical stage is locked when basic is incomplete", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: [] });
      mocks.modules.push({ _id: "m1", stage: "basic", status: "approved" });

      expect(await svc.isStageUnlocked("user-1", "technical")).toBe(false);
    });

    it("technical stage is unlocked via stageOverrides", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: ["technical"] });

      expect(await svc.isStageUnlocked("user-1", "technical")).toBe(true);
    });

    it("technical stage is unlocked when basic is completed", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: [] });
      mocks.modules.push({ _id: "m1", stage: "basic", status: "approved" });
      mocks.progressRecords.push({
        userId: "user-1",
        moduleId: "m1",
        completedAt: new Date(),
      });

      expect(await svc.isStageUnlocked("user-1", "technical")).toBe(true);
    });
  });

  describe("getStagesOverview", () => {
    it("returns 3 stages with module counts", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: [] });
      mocks.modules.push(
        { _id: "m1", stage: "basic", status: "approved", title: "Basics", order: 0 },
        { _id: "m2", stage: "technical", status: "approved", title: "Tech", order: 0 },
      );

      const stages = await svc.getStagesOverview("user-1");
      expect(stages).toHaveLength(3);
      expect(stages[0].stage).toBe("basic");
      expect(stages[0].totalModules).toBe(1);
      expect(stages[0].unlocked).toBe(true);
      expect(stages[1].stage).toBe("technical");
      expect(stages[1].totalModules).toBe(1);
    });
  });

  describe("getModuleForUser", () => {
    it("returns module with lessons and progress", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: [] });
      mocks.modules.push({
        _id: "m1",
        stage: "basic",
        status: "approved",
        title: "Module 1",
      });
      mocks.lessons.push(
        { _id: "l1", moduleId: "m1", title: "Lesson 1", type: "video", content: "url", order: 0 },
        { _id: "l2", moduleId: "m1", title: "Lesson 2", type: "text", content: "text", order: 1 },
      );
      mocks.quizzes.push({
        _id: "q1",
        moduleId: "m1",
        passingScore: 70,
        questions: [{ questionText: "Q?", options: ["A", "B"], correctOptionIndex: 0 }],
      });

      const mod = await svc.getModuleForUser("user-1", "m1");
      expect(mod.title).toBe("Module 1");
      expect(mod.lessons).toHaveLength(2);
      expect(mod.quiz).toBeTruthy();
      expect(mod.quiz!.questionCount).toBe(1);
      expect(mod.progress.totalLessons).toBe(2);
      expect(mod.progress.completedLessons).toBe(0);
    });

    it("rejects access to locked stage modules", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: [] });
      mocks.modules.push(
        { _id: "m1", stage: "basic", status: "approved" },
        { _id: "m2", stage: "technical", status: "approved" },
      );

      await expect(svc.getModuleForUser("user-1", "m2")).rejects.toThrow("locked");
    });
  });

  describe("completeLesson", () => {
    it("marks a lesson as completed", async () => {
      mocks.modules.push({ _id: "m1", stage: "basic", status: "approved" });
      mocks.lessons.push({ _id: "l1", moduleId: "m1" });

      await svc.completeLesson("user-1", "m1", "l1");
      expect(mocks.UserProgressModel.updateOne).toHaveBeenCalledWith(
        { userId: "user-1", moduleId: "m1" },
        { $addToSet: { completedLessons: "l1" } },
        { upsert: true },
      );
    });

    it("rejects for non-existent lesson", async () => {
      mocks.modules.push({ _id: "m1", stage: "basic", status: "approved" });

      await expect(svc.completeLesson("user-1", "m1", "fake")).rejects.toThrow(
        "Lesson not found",
      );
    });
  });

  describe("getQuizQuestions", () => {
    it("returns questions without correct answers", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: [] });
      mocks.modules.push({ _id: "m1", stage: "basic", status: "approved" });
      mocks.quizzes.push({
        _id: "q1",
        moduleId: "m1",
        passingScore: 70,
        questions: [
          { questionText: "What is NPK?", options: ["Fertilizer", "Pesticide"], correctOptionIndex: 0 },
        ],
      });

      const result = await svc.getQuizQuestions("user-1", "m1");
      expect(result.passingScore).toBe(70);
      expect(result.questions[0].questionText).toBe("What is NPK?");
      expect(result.questions[0].options).toEqual(["Fertilizer", "Pesticide"]);
      expect((result.questions[0] as any).correctOptionIndex).toBeUndefined();
    });
  });

  describe("submitQuiz", () => {
    it("calculates score correctly for passing quiz", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: [] });
      mocks.modules.push({ _id: "m1", stage: "basic", status: "approved" });
      mocks.quizzes.push({
        moduleId: "m1",
        passingScore: 50,
        questions: [
          { questionText: "Q1", options: ["A", "B"], correctOptionIndex: 0 },
          { questionText: "Q2", options: ["A", "B"], correctOptionIndex: 1 },
        ],
      });
      // Simulate existing progress with completed lessons
      mocks.progressRecords.push({
        userId: "user-1",
        moduleId: "m1",
        completedLessons: ["l1"],
        quizAttempts: [],
        completedAt: null,
      });

      const result = await svc.submitQuiz("user-1", "m1", [0, 1]);
      expect(result.score).toBe(100);
      expect(result.passed).toBe(true);
      expect(result.correct).toBe(2);
      expect(result.total).toBe(2);
    });

    it("fails quiz with wrong answers", async () => {
      mocks.users.push({ _id: "user-1", stageOverrides: [] });
      mocks.modules.push({ _id: "m1", stage: "basic", status: "approved" });
      mocks.quizzes.push({
        moduleId: "m1",
        passingScore: 70,
        questions: [
          { questionText: "Q1", options: ["A", "B"], correctOptionIndex: 0 },
          { questionText: "Q2", options: ["A", "B"], correctOptionIndex: 1 },
        ],
      });

      const result = await svc.submitQuiz("user-1", "m1", [1, 0]);
      expect(result.score).toBe(0);
      expect(result.passed).toBe(false);
    });

    it("rejects wrong number of answers", async () => {
      mocks.modules.push({ _id: "m1", stage: "basic", status: "approved" });
      mocks.quizzes.push({
        moduleId: "m1",
        passingScore: 70,
        questions: [
          { questionText: "Q1", options: ["A", "B"], correctOptionIndex: 0 },
        ],
      });

      await expect(svc.submitQuiz("user-1", "m1", [0, 1])).rejects.toThrow(
        "Expected 1 answers",
      );
    });
  });
});
