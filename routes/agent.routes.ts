import { Router } from "express";
import { agentCreateFarmerController } from "../controllers/agent.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { withAudit } from "../middleware/auditLog.middleware";

const agentRouter = Router();
agentRouter.use(requireAuth, requireRole("agent", "admin", "superadmin"));

agentRouter.post(
  "/create-farmer",
  withAudit("agent_create_farmer", agentCreateFarmerController),
);

export default agentRouter;
