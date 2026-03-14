import { Router } from "express";
import {
  adminPoolOrdersViewController,
  createPoolOrderController,
  joinPoolOrderController,
} from "../controllers/poolOrder.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireOnboardingCompleted } from "../middleware/onboarding.middleware";
import { requireRole } from "../middleware/role.middleware";
import { withAudit } from "../middleware/auditLog.middleware";

const poolOrderRouter = Router();
poolOrderRouter.use(requireAuth);

poolOrderRouter.post(
  "/create",
  requireRole("admin", "superadmin"),
  withAudit("pool_order_create", createPoolOrderController),
);

poolOrderRouter.post(
  "/join",
  requireOnboardingCompleted,
  withAudit("pool_order_join", joinPoolOrderController),
);

poolOrderRouter.get(
  "/admin/joins",
  requireRole("admin", "superadmin"),
  withAudit("pool_order_admin_view", adminPoolOrdersViewController),
);

export default poolOrderRouter;
