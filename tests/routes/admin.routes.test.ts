import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/admin.controller", () => ({
  superadminCreateAdminController: (_: any, res: any) => res.json({ ok: "create-admin" }),
  createAgentController: (_: any, res: any) => res.json({ ok: "create-agent" }),
  superadminImpersonateUserController: (_: any, res: any) => res.json({ ok: "impersonate" }),
  superadminListUsersDocumentsController: (_: any, res: any) => res.json({ ok: "users-docs" }),
  adminGetUserDetailController: (_: any, res: any) => res.json({ ok: "user-detail" }),
  adminDeleteUserController: (_: any, res: any) => res.json({ ok: "delete-user" }),
  adminListRedeemCodesController: (_: any, res: any) => res.json({ ok: "redeem-codes" }),
  adminCreateRedeemCodeController: (_: any, res: any) => res.json({ ok: "create-redeem-code" }),
  adminListPaymentOrdersController: (_: any, res: any) => res.json({ ok: "payment-orders" }),
  adminRevenueSummaryController: (_: any, res: any) => res.json({ ok: "revenue-summary" }),
  adminListWalletTransactionsController: (_: any, res: any) => res.json({ ok: "wallet-transactions" }),
  adminListAuditLogsController: (_: any, res: any) => res.json({ ok: "audit-logs" }),
  adminUpdateUserLandPointController: (_: any, res: any) => res.json({ ok: "land-point" }),
  adminUploadUserLandBorderController: (_: any, res: any) => res.json({ ok: "land-border" }),
  approveAgentCreatedUserController: (_: any, res: any) => res.json({ ok: "approve" }),
  approveUserKycController: (_: any, res: any) => res.json({ ok: "approve-kyc" }),
  rejectUserKycController: (_: any, res: any) => res.json({ ok: "reject-kyc" }),
}));
vi.mock("../../middleware/auth.middleware", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/role.middleware", () => ({
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/auditLog.middleware", () => ({
  withAudit: (_action: string, handler: any) => handler,
}));
vi.mock("../../middleware/adminLandReviewUpload.middleware", () => ({
  uploadAdminLandBorder: (_req: any, _res: any, next: any) => next(),
}));

import adminRouter from "../../routes/admin.routes";

describe("admin routes", () => {
  const app = createTestApp(adminRouter);

  it("covers admin endpoints", async () => {
    const createAdmin = await request(app).post("/create-admin").send({}).expect(200);
    expect(createAdmin.body.ok).toBe("create-admin");
    await request(app).post("/create-agent").send({}).expect(200);
    await request(app).post("/impersonate/507f191e810c19729de860ea").send({}).expect(200);
    await request(app).get("/users-documents").expect(200);
    await request(app).get("/users/507f191e810c19729de860ea").expect(200);
    await request(app).post("/users/507f191e810c19729de860ea/delete").send({}).expect(200);
    await request(app).get("/redeem-codes").expect(200);
    await request(app).post("/redeem-codes").send({}).expect(200);
    await request(app).get("/payment-orders").expect(200);
    await request(app).get("/revenue-summary").expect(200);
    await request(app).get("/wallet-transactions").expect(200);
    await request(app).get("/audit-logs").expect(200);
    await request(app).post("/approve-agent-user/507f191e810c19729de860ea").send({}).expect(200);
    await request(app).post("/users/507f191e810c19729de860ea/land-point").send({}).expect(200);
    await request(app).post("/users/507f191e810c19729de860ea/land-border").send({}).expect(200);
    await request(app).post("/users/507f191e810c19729de860ea/approve-kyc").send({}).expect(200);
    await request(app).post("/users/507f191e810c19729de860ea/reject-kyc").send({}).expect(200);
  });
});
