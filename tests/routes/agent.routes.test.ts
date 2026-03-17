import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/agent.controller", () => ({
  agentCreateFarmerController: (_: any, res: any) => res.json({ ok: "agent-create" }),
  agentOnboardFarmerController: (_: any, res: any) => res.json({ ok: "agent-onboard" }),
  agentListFarmersController: (_: any, res: any) => res.json({ ok: "agent-farmers" }),
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
vi.mock("../../middleware/onboardingUpload.middleware", () => ({
  uploadOnboardingSubmit: (_req: any, _res: any, next: any) => next(),
}));

import agentRouter from "../../routes/agent.routes";

describe("agent routes", () => {
  const app = createTestApp(agentRouter);

  it("covers agent endpoints", async () => {
    const response = await request(app).post("/create-farmer").send({}).expect(200);
    expect(response.body.ok).toBe("agent-create");
    await request(app).post("/onboard-farmer").send({}).expect(200);
    await request(app).get("/farmers").expect(200);
  });
});
