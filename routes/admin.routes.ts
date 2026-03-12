import { Router } from "express";
import {
  approveAgentCreatedUserController,
  superadminImpersonateUserController,
  superadminListUsersDocumentsController,
  superadminCreateAdminController,
} from "../controllers/admin.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { withAudit } from "../middleware/auditLog.middleware";

const adminRouter = Router();
adminRouter.use(requireAuth);

adminRouter.post(
  "/create-admin",
  requireRole("superadmin"),
  withAudit("admin_create_admin", superadminCreateAdminController),
);

adminRouter.post(
  "/impersonate/:userId",
  requireRole("superadmin"),
  withAudit("admin_impersonate_user", superadminImpersonateUserController),
);

adminRouter.get(
  "/users-documents",
  requireRole("superadmin"),
  withAudit("admin_users_documents_list", superadminListUsersDocumentsController),
);

adminRouter.post(
  "/approve-agent-user/:userId",
  requireRole("admin", "superadmin"),
  withAudit("admin_approve_agent_user", approveAgentCreatedUserController),
);

export default adminRouter;
