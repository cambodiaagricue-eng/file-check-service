import type { Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { LearningService } from "../services/learning.service";
import { CertificateService } from "../services/certificate.service";
import type { Stage } from "../constants/stages";

const learningService = new LearningService();
const certificateService = new CertificateService();

function requireUserId(req: Request): string {
  const userId = req.authUser?.id;
  if (!userId) {
    throw new ApiError(401, "Unauthorized");
  }
  return userId;
}

export async function getStagesController(req: Request, res: Response) {
  const userId = requireUserId(req);
  const stages = await learningService.getStagesOverview(userId);
  return res.json(new ApiResponse(true, "Stages overview fetched.", stages));
}

export async function getModuleController(req: Request, res: Response) {
  const userId = requireUserId(req);
  const moduleId = String(req.params.moduleId || "");
  const mod = await learningService.getModuleForUser(userId, moduleId);
  return res.json(new ApiResponse(true, "Module fetched.", mod));
}

export async function completeLessonController(req: Request, res: Response) {
  const userId = requireUserId(req);
  const moduleId = String(req.params.moduleId || "");
  const lessonId = String(req.params.lessonId || "");
  await learningService.completeLesson(userId, moduleId, lessonId);
  return res.json(new ApiResponse(true, "Lesson marked as completed."));
}

export async function submitQuizController(req: Request, res: Response) {
  const userId = requireUserId(req);
  const moduleId = String(req.params.moduleId || "");
  const result = await learningService.submitQuiz(userId, moduleId, req.body.answers);

  let certificate: { certificateId: string; pdfUrl: string } | null = null;

  if (result.passed) {
    const Module = (await import("../models/module.model")).getModuleModel();
    const mod = await Module.findById(moduleId).lean();
    if (mod) {
      const stageCompleted = await learningService.isStageCompleted(userId, mod.stage as Stage);
      if (stageCompleted) {
        certificate = await certificateService.issueCertificate(userId, mod.stage as Stage);
      }
    }
  }

  return res.json(new ApiResponse(true, "Quiz submitted.", { ...result, certificate }));
}

export async function getQuizQuestionsController(req: Request, res: Response) {
  const userId = requireUserId(req);
  const moduleId = String(req.params.moduleId || "");
  const quiz = await learningService.getQuizQuestions(userId, moduleId);
  return res.json(new ApiResponse(true, "Quiz questions fetched.", quiz));
}

export async function getUserCertificatesController(req: Request, res: Response) {
  const userId = requireUserId(req);
  const certificates = await certificateService.getUserCertificates(userId);
  return res.json(new ApiResponse(true, "Certificates fetched.", certificates));
}

export async function downloadCertificateController(req: Request, res: Response) {
  const userId = requireUserId(req);
  const certificateId = String(req.params.certificateId || "");
  const Certificate = (await import("../models/certificate.model")).getCertificateModel();
  const cert = await Certificate.findOne({ userId, certificateId }).lean();
  if (!cert) {
    throw new ApiError(404, "Certificate not found.");
  }
  return res.json(new ApiResponse(true, "Certificate download URL fetched.", { pdfUrl: cert.pdfUrl }));
}

export async function publicCertificatesController(req: Request, res: Response) {
  const memberQrCode = String(req.params.memberQrCode || "");
  const certificates = await certificateService.getCertificatesByQrCode(memberQrCode);
  return res.json(new ApiResponse(true, "Public certificates fetched.", certificates));
}
