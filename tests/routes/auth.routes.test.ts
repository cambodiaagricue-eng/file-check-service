import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/auth.controller", () => ({
  signupController: (_: any, res: any) => res.status(201).json({ ok: "signup" }),
  requestVerifyController: (_: any, res: any) => res.json({ ok: "verify-request" }),
  confirmVerifyController: (_: any, res: any) => res.json({ ok: "verify-confirm" }),
  loginController: (_: any, res: any) => res.json({ ok: "login" }),
  refreshTokenController: (_: any, res: any) => res.json({ ok: "refresh" }),
  requestResetPasswordController: (_: any, res: any) => res.json({ ok: "reset-request" }),
  confirmResetPasswordController: (_: any, res: any) => res.json({ ok: "reset-confirm" }),
  whitelistedPhoneCountriesController: (_: any, res: any) => res.json({ ok: "codes" }),
  meController: (_: any, res: any) => res.json({ ok: "me" }),
  logoutController: (_: any, res: any) => res.json({ ok: "logout" }),
  setMarketplaceModeController: (_: any, res: any) => res.json({ ok: "mode" }),
}));
vi.mock("../../middleware/auth.middleware", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/auditLog.middleware", () => ({
  withAudit: (_action: string, handler: any) => handler,
}));

import authRouter from "../../routes/auth.routes";

describe("auth routes", () => {
  const app = createTestApp(authRouter);

  it("covers all auth endpoints", async () => {
    const signup = await request(app).post("/signup").send({}).expect(201);
    expect(signup.body.ok).toBe("signup");
    await request(app).post("/verify-account/request").send({}).expect(200);
    await request(app).post("/verify-account/confirm").send({}).expect(200);
    await request(app).post("/login").send({}).expect(200);
    await request(app).post("/refresh-token").send({}).expect(200);
    await request(app).post("/reset-password/request").send({}).expect(200);
    await request(app).post("/reset-password/confirm").send({}).expect(200);
    await request(app).get("/phone-country-codes").expect(200);
    await request(app).get("/me").expect(200);
    await request(app).post("/marketplace-mode").send({}).expect(200);
    await request(app).post("/logout").send({}).expect(200);
  });
});
