import { Router } from "express";
import {
  approveAgentCreatedUserController,
  adminUpdateUserLandPointController,
  adminCreateRedeemCodeController,
  adminUploadUserLandBorderController,
  approveUserKycController,
  adminDeleteUserController,
  adminGetUserDetailController,
  adminListAuditLogsController,
  adminListPaymentOrdersController,
  adminListRedeemCodesController,
  adminRevenueSummaryController,
  adminListWalletTransactionsController,
  createAgentController,
  rejectUserKycController,
  superadminImpersonateUserController,
  superadminListUsersDocumentsController,
  superadminCreateAdminController,
} from "../controllers/admin.controller";
import {
  addLessonController,
  createModuleController,
  deleteLessonController,
  getModuleDetailController,
  listModulesController,
  overrideStageController,
  reviewModuleController,
  setQuizController,
  submitModuleForReviewController,
  updateLessonController,
  updateModuleController,
} from "../controllers/adminModule.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireRole } from "../middleware/role.middleware";
import { withAudit } from "../middleware/auditLog.middleware";
import { uploadAdminLandBorder } from "../middleware/adminLandReviewUpload.middleware";

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

adminRouter.post(
  "/users/:userId/delete",
  requireRole("admin", "superadmin"),
  withAudit("admin_delete_user", adminDeleteUserController),
);

adminRouter.get(
  "/redeem-codes",
  requireRole("admin", "superadmin"),
  withAudit("admin_redeem_codes_list", adminListRedeemCodesController),
);

adminRouter.post(
  "/redeem-codes",
  requireRole("admin", "superadmin"),
  withAudit("admin_redeem_code_create", adminCreateRedeemCodeController),
);

adminRouter.get(
  "/payment-orders",
  requireRole("admin", "superadmin"),
  withAudit("admin_payment_orders_list", adminListPaymentOrdersController),
);

adminRouter.get(
  "/revenue-summary",
  requireRole("admin", "superadmin"),
  withAudit("admin_revenue_summary", adminRevenueSummaryController),
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

adminRouter.post(
  "/users/:userId/land-point",
  requireRole("admin", "superadmin"),
  withAudit("admin_update_land_point", adminUpdateUserLandPointController),
);

adminRouter.post(
  "/users/:userId/land-border",
  requireRole("admin", "superadmin"),
  uploadAdminLandBorder,
  withAudit("admin_upload_land_border", adminUploadUserLandBorderController),
);

adminRouter.post(
  "/users/:userId/approve-kyc",
  requireRole("admin", "superadmin"),
  withAudit("admin_approve_user_kyc", approveUserKycController),
);

adminRouter.post(
  "/users/:userId/reject-kyc",
  requireRole("admin", "superadmin"),
  withAudit("admin_reject_user_kyc", rejectUserKycController),
);

// Module management routes
adminRouter.get(
  "/modules",
  requireRole("admin", "superadmin"),
  withAudit("admin_list_modules", listModulesController),
);

adminRouter.get(
  "/modules/:moduleId",
  requireRole("admin", "superadmin"),
  withAudit("admin_get_module", getModuleDetailController),
);

adminRouter.post(
  "/modules",
  requireRole("admin", "superadmin"),
  withAudit("admin_create_module", createModuleController),
);

adminRouter.patch(
  "/modules/:moduleId",
  requireRole("admin", "superadmin"),
  withAudit("admin_update_module", updateModuleController),
);

adminRouter.post(
  "/modules/:moduleId/submit",
  requireRole("admin", "superadmin"),
  withAudit("admin_submit_module_review", submitModuleForReviewController),
);

adminRouter.post(
  "/modules/:moduleId/review",
  requireRole("admin", "superadmin"),
  withAudit("admin_review_module", reviewModuleController),
);

adminRouter.post(
  "/modules/:moduleId/lessons",
  requireRole("admin", "superadmin"),
  withAudit("admin_add_lesson", addLessonController),
);

adminRouter.patch(
  "/modules/:moduleId/lessons/:lessonId",
  requireRole("admin", "superadmin"),
  withAudit("admin_update_lesson", updateLessonController),
);

adminRouter.delete(
  "/modules/:moduleId/lessons/:lessonId",
  requireRole("admin", "superadmin"),
  withAudit("admin_delete_lesson", deleteLessonController),
);

adminRouter.put(
  "/modules/:moduleId/quiz",
  requireRole("admin", "superadmin"),
  withAudit("admin_set_quiz", setQuizController),
);

adminRouter.post(
  "/users/:userId/override-stage",
  requireRole("superadmin"),
  withAudit("admin_override_stage", overrideStageController),
);

export default adminRouter;
