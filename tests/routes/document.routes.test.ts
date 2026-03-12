import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

const checkNameExistsornot = vi.hoisted(() => vi.fn(async () => ({
  documentUrl: "https://example.com/file.pdf",
  aiResult: { namefound: true, expectednamefound: true, "document oneliner summary": "ok" },
})));

vi.mock("../../services/documentService", () => ({
  DocumentService: class MockDocumentService {
    checkNameExistsornot = checkNameExistsornot;
  },
}));
vi.mock("../../middleware/multer.middleware", () => ({
  uploadMiddleware: (req: any, _res: any, next: any) => {
    req.file = { path: "/tmp/fake.pdf" };
    req.authUser = { id: "user-1", username: "u", phone: "+911111111111", role: "buyer", onboardingCompleted: true };
    next();
  },
}));
vi.mock("../../middleware/auditLog.middleware", () => ({
  withAudit: (_action: string, handler: any) => handler,
}));

import documentRoute from "../../controller/documentServiceController";

describe("document routes", () => {
  const app = createTestApp(documentRoute);

  it("verifies name endpoint success", async () => {
    const response = await request(app)
      .post("/verify-name?expectedName=Ravi")
      .send({})
      .expect(200);

    expect(response.body.message).toContain("File uploaded");
    expect(checkNameExistsornot).toHaveBeenCalledWith(
      "user-1",
      "/tmp/fake.pdf",
      "Ravi",
    );
  });
});
