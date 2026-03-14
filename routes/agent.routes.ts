import { Router } from "express";
import {
  agentCreateFarmerController,
  agentOnboardFarmerController,
} from "../controllers/agent.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { withAudit } from "../middleware/auditLog.middleware";
import { uploadOnboardingSubmit } from "../middleware/onboardingUpload.middleware";

const agentRouter = Router();
agentRouter.use(requireAuth, requireRole("agent", "admin", "superadmin"));

agentRouter.post(
  "/create-farmer",
  withAudit("agent_create_farmer", agentCreateFarmerController),
);

agentRouter.post(
  "/onboard-farmer",
  uploadOnboardingSubmit,
  withAudit("agent_onboard_farmer", agentOnboardFarmerController),
);

export default agentRouter;
