import { Router } from "express";
import {
  approveAgentCreatedUserController,
  adminGetUserDetailController,
  adminListAuditLogsController,
  adminListPaymentOrdersController,
  adminListWalletTransactionsController,
  createAgentController,
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
  "/create-agent",
  requireRole("admin", "superadmin"),
  withAudit("admin_create_agent", createAgentController),
);

adminRouter.post(
  "/impersonate/:userId",
  requireRole("superadmin"),
  withAudit("admin_impersonate_user", superadminImpersonateUserController),
);

adminRouter.get(
  "/users-documents",
  requireRole("admin", "superadmin"),
  withAudit("admin_users_documents_list", superadminListUsersDocumentsController),
);

adminRouter.get(
  "/users/:userId",
  requireRole("admin", "superadmin"),
  withAudit("admin_user_detail", adminGetUserDetailController),
);

adminRouter.get(
  "/payment-orders",
  requireRole("admin", "superadmin"),
  withAudit("admin_payment_orders_list", adminListPaymentOrdersController),
);

adminRouter.get(
  "/wallet-transactions",
  requireRole("admin", "superadmin"),
  withAudit("admin_wallet_transactions_list", adminListWalletTransactionsController),
);

adminRouter.get(
  "/audit-logs",
  requireRole("admin", "superadmin"),
  withAudit("admin_audit_logs_list", adminListAuditLogsController),
);

adminRouter.post(
  "/approve-agent-user/:userId",
  requireRole("admin", "superadmin"),
  withAudit("admin_approve_agent_user", approveAgentCreatedUserController),
);

export default adminRouter;
