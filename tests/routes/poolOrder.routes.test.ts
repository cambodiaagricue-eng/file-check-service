import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/poolOrder.controller", () => ({
  createPoolOrderController: (_: any, res: any) => res.json({ ok: "create" }),
  joinPoolOrderController: (_: any, res: any) => res.json({ ok: "join" }),
  adminPoolOrdersViewController: (_: any, res: any) => res.json({ ok: "view" }),
}));
vi.mock("../../middleware/auth.middleware", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/onboarding.middleware", () => ({
  requireOnboardingCompleted: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/role.middleware", () => ({
  requireRole: (..._roles: string[]) => (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/auditLog.middleware", () => ({
  withAudit: (_action: string, handler: any) => handler,
}));

import poolOrderRouter from "../../routes/poolOrder.routes";

describe("pool order routes", () => {
  const app = createTestApp(poolOrderRouter);

  it("covers pool order endpoints", async () => {
    await request(app).post("/create").send({}).expect(200);
    await request(app).post("/join").send({}).expect(200);
    await request(app).get("/admin/joins").expect(200);
  });
});
