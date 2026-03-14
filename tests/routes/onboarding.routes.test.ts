import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/onboarding.controller", () => ({
  onboardingStatusController: (_: any, res: any) => res.json({ ok: "status" }),
  completeOnboardingSubmitController: (_: any, res: any) => res.json({ ok: "submit" }),
  completeOnboardingStep1Controller: (_: any, res: any) => res.json({ ok: "step1" }),
  completeOnboardingStep2Controller: (_: any, res: any) => res.json({ ok: "step2" }),
  completeOnboardingStep3Controller: (_: any, res: any) => res.json({ ok: "step3" }),
}));
vi.mock("../../middleware/auth.middleware", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/onboardingUpload.middleware", () => ({
  uploadOnboardingSubmit: (_req: any, _res: any, next: any) => next(),
  uploadSelfie: (_req: any, _res: any, next: any) => next(),
  uploadGovId: (_req: any, _res: any, next: any) => next(),
  uploadLandDocuments: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/auditLog.middleware", () => ({
  withAudit: (_action: string, handler: any) => handler,
}));

import onboardingRouter from "../../routes/onboarding.routes";

describe("onboarding routes", () => {
  const app = createTestApp(onboardingRouter);

  it("covers all onboarding endpoints", async () => {
    await request(app).get("/status").expect(200);
    await request(app).post("/submit").expect(200);
    await request(app).post("/step-1").expect(200);
    await request(app).post("/step-2").expect(200);
    const step3 = await request(app).post("/step-3").expect(200);
    expect(step3.body.ok).toBe("step3");
  });
});
