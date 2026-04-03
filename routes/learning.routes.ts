import { Router } from "express";
import {
  completeLessonController,
  downloadCertificateController,
  getModuleController,
  getQuizQuestionsController,
  getStagesController,
  getUserCertificatesController,
  publicCertificatesController,
  submitQuizController,
} from "../controllers/learning.controller";
import { requireAuth } from "../middleware/auth.middleware";

export const learningRouter = Router();
learningRouter.use(requireAuth);
learningRouter.get("/stages", getStagesController);
learningRouter.get("/modules/:moduleId", getModuleController);
learningRouter.get("/modules/:moduleId/quiz", getQuizQuestionsController);
learningRouter.post("/modules/:moduleId/lessons/:lessonId/complete", completeLessonController);
learningRouter.post("/modules/:moduleId/quiz/submit", submitQuizController);
learningRouter.get("/certificates", getUserCertificatesController);
learningRouter.get("/certificates/:certificateId/download", downloadCertificateController);

export const publicLearningRouter = Router();
publicLearningRouter.get("/member/:memberQrCode/certificates", publicCertificatesController);
