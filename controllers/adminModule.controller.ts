import type { Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { AdminModuleService } from "../services/adminModule.service";
import { STAGES } from "../constants/stages";

const adminModuleService = new AdminModuleService();

function requireAdminId(req: Request): string {
  const adminId = req.authUser?.id;
  if (!adminId) {
    throw new ApiError(401, "Unauthorized");
  }
  return adminId;
}

export async function createModuleController(req: Request, res: Response) {
  const adminId = requireAdminId(req);
  const { title, description, stage, thumbnailUrl } = req.body;
  const mod = await adminModuleService.createModule(adminId, { title, description, stage, thumbnailUrl });
  return res.json(new ApiResponse(true, "Module created.", mod));
}

export async function updateModuleController(req: Request, res: Response) {
  const adminId = requireAdminId(req);
  const moduleId = String(req.params.moduleId || "");
  const { title, description, thumbnailUrl, order } = req.body;
  const mod = await adminModuleService.updateModule(adminId, moduleId, { title, description, thumbnailUrl, order });
  return res.json(new ApiResponse(true, "Module updated.", mod));
}

export async function submitModuleForReviewController(req: Request, res: Response) {
  const adminId = requireAdminId(req);
  const moduleId = String(req.params.moduleId || "");
  const mod = await adminModuleService.submitForReview(adminId, moduleId);
  return res.json(new ApiResponse(true, "Module submitted for review.", mod));
}

export async function reviewModuleController(req: Request, res: Response) {
  const adminId = requireAdminId(req);
  const moduleId = String(req.params.moduleId || "");
  const { action, note } = req.body;
  if (action !== "approve" && action !== "reject") {
    throw new ApiError(400, "action must be 'approve' or 'reject'.");
  }
  const mod = await adminModuleService.reviewModule(adminId, moduleId, action, note);
  return res.json(new ApiResponse(true, `Module ${action}d.`, mod));
}

export async function listModulesController(req: Request, res: Response) {
  const stage = typeof req.query.stage === "string" ? req.query.stage : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const modules = await adminModuleService.listModules({ stage, status });
  return res.json(new ApiResponse(true, "Modules listed.", modules));
}

export async function getModuleDetailController(req: Request, res: Response) {
  const moduleId = String(req.params.moduleId || "");
  const mod = await adminModuleService.getModuleDetail(moduleId);
  return res.json(new ApiResponse(true, "Module detail fetched.", mod));
}

export async function addLessonController(req: Request, res: Response) {
  const adminId = requireAdminId(req);
  const moduleId = String(req.params.moduleId || "");
  const { title, type, content } = req.body;
  const lesson = await adminModuleService.addLesson(adminId, moduleId, { title, type, content });
  return res.json(new ApiResponse(true, "Lesson added.", lesson));
}

export async function updateLessonController(req: Request, res: Response) {
  const adminId = requireAdminId(req);
  const moduleId = String(req.params.moduleId || "");
  const lessonId = String(req.params.lessonId || "");
  const { title, type, content, order } = req.body;
  const lesson = await adminModuleService.updateLesson(adminId, moduleId, lessonId, { title, type, content, order });
  return res.json(new ApiResponse(true, "Lesson updated.", lesson));
}

export async function deleteLessonController(req: Request, res: Response) {
  const adminId = requireAdminId(req);
  const moduleId = String(req.params.moduleId || "");
  const lessonId = String(req.params.lessonId || "");
  await adminModuleService.deleteLesson(adminId, moduleId, lessonId);
  return res.json(new ApiResponse(true, "Lesson deleted."));
}

export async function setQuizController(req: Request, res: Response) {
  const adminId = requireAdminId(req);
  const moduleId = String(req.params.moduleId || "");
  const { passingScore, questions } = req.body;
  const quiz = await adminModuleService.setQuiz(adminId, moduleId, { passingScore, questions });
  return res.json(new ApiResponse(true, "Quiz set.", quiz));
}

export async function overrideStageController(req: Request, res: Response) {
  requireAdminId(req);
  const userId = String(req.params.userId || "");
  const { stage } = req.body;

  if (!STAGES.includes(stage)) {
    throw new ApiError(400, `Invalid stage. Must be one of: ${STAGES.join(", ")}`);
  }

  const User = (await import("../models/user.model")).getUserModel();
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  await User.updateOne(
    { _id: userId },
    { $addToSet: { stageOverrides: stage } },
  );

  return res.json(new ApiResponse(true, `Stage '${stage}' override applied for user.`));
}
