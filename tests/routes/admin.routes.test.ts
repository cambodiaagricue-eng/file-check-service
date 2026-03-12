import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/admin.controller", () => ({
  superadminCreateAdminController: (_: any, res: any) => res.json({ ok: "create-admin" }),
  superadminImpersonateUserController: (_: any, res: any) => res.json({ ok: "impersonate" }),
  superadminListUsersDocumentsController: (_: any, res: any) => res.json({ ok: "users-docs" }),
  approveAgentCreatedUserController: (_: any, res: any) => res.json({ ok: "approve" }),
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

import adminRouter from "../../routes/admin.routes";

describe("admin routes", () => {
  const app = createTestApp(adminRouter);

  it("covers admin endpoints", async () => {
    const createAdmin = await request(app).post("/create-admin").send({}).expect(200);
    expect(createAdmin.body.ok).toBe("create-admin");
    await request(app).post("/impersonate/507f191e810c19729de860ea").send({}).expect(200);
    await request(app).get("/users-documents").expect(200);
    await request(app).post("/approve-agent-user/507f191e810c19729de860ea").send({}).expect(200);
  });
});
