import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/agent.controller", () => ({
  agentCreateFarmerController: (_: any, res: any) => res.json({ ok: "agent-create" }),
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

import agentRouter from "../../routes/agent.routes";

describe("agent routes", () => {
  const app = createTestApp(agentRouter);

  it("covers agent endpoints", async () => {
    const response = await request(app).post("/create-farmer").send({}).expect(200);
    expect(response.body.ok).toBe("agent-create");
  });
});
