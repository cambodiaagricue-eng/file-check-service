import { Router } from "express";
import {
  completeOnboardingSubmitController,
  completeOnboardingStep1Controller,
  completeOnboardingStep2Controller,
  completeOnboardingStep3Controller,
  onboardingStatusController,
} from "../controllers/onboarding.controller";
import { requireAuth } from "../middleware/auth.middleware";
import {
  uploadGovId,
  uploadLandDocuments,
  uploadOnboardingSubmit,
  uploadSelfie,
} from "../middleware/onboardingUpload.middleware";
import { withAudit } from "../middleware/auditLog.middleware";

const onboardingRouter = Router();

onboardingRouter.use(requireAuth);

onboardingRouter.get(
  "/status",
  withAudit("onboarding_status", onboardingStatusController),
);

onboardingRouter.post(
  "/submit",
  uploadOnboardingSubmit,
  withAudit("onboarding_submit", completeOnboardingSubmitController),
);

onboardingRouter.post(
  "/step-1",
  uploadSelfie,
  withAudit("onboarding_step_1", completeOnboardingStep1Controller),
);

onboardingRouter.post(
  "/step-2",
  uploadGovId,
  withAudit("onboarding_step_2", completeOnboardingStep2Controller),
);

onboardingRouter.post(
  "/step-3",
  uploadLandDocuments,
  withAudit("onboarding_step_3", completeOnboardingStep3Controller),
);

export default onboardingRouter;
