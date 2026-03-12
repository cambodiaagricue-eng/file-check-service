import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/marketplace.controller", () => ({
  createListingController: (_: any, res: any) => res.json({ ok: "listing" }),
  placeBidController: (_: any, res: any) => res.json({ ok: "bid" }),
  sellerBidsController: (_: any, res: any) => res.json({ ok: "seller-bids" }),
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
vi.mock("../../middleware/marketplaceUpload.middleware", () => ({
  uploadListingImages: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/auditLog.middleware", () => ({
  withAudit: (_action: string, handler: any) => handler,
}));

import marketplaceRouter from "../../routes/marketplace.routes";

describe("marketplace routes", () => {
  const app = createTestApp(marketplaceRouter);

  it("covers marketplace endpoints", async () => {
    const listing = await request(app).post("/listings").send({}).expect(200);
    expect(listing.body.ok).toBe("listing");
    await request(app).post("/bids").send({}).expect(200);
    await request(app).get("/seller/bids").expect(200);
  });
});
