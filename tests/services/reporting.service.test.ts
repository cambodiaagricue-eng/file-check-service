import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const items: any[] = [];

  const DiagnosisModel = {
    find: vi.fn((_query: Record<string, unknown>) => ({
      sort: vi.fn(() => ({
        skip: vi.fn(() => ({
          limit: vi.fn(() => ({
            lean: vi.fn(async () => items),
          })),
        })),
      })),
    })),
    countDocuments: vi.fn(async () => items.length),
  };

  const reset = () => {
    items.length = 0;
    vi.clearAllMocks();
  };

  return {
    items,
    DiagnosisModel,
    reset,
  };
});

vi.mock("../../models/mayuraAiDiagnosis.model", () => ({
  getMayuraAiDiagnosisModel: () => mocks.DiagnosisModel,
}));

vi.mock("../../models/auditLog.model", () => ({
  getAuditLogModel: () => ({}),
}));
vi.mock("../../models/paymentOrder.model", () => ({
  getPaymentOrderModel: () => ({}),
}));
vi.mock("../../models/redeemCode.model", () => ({
  getRedeemCodeModel: () => ({}),
}));
vi.mock("../../models/user.model", () => ({
  getUserModel: () => ({}),
}));
vi.mock("../../models/walletTransaction.model", () => ({
  getWalletTransactionModel: () => ({}),
}));

import { ReportingService } from "../../services/reporting.service";

describe("ReportingService Mayura AI history", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("returns mapped history items with images and markdown report", async () => {
    mocks.items.push({
      _id: "diagnosis-1",
      model: "gemini-2.5-flash",
      coinsCharged: 2,
      plantName: "ស្រូវ",
      diseaseName: "ជំងឺស្លឹក",
      isDiseaseDetected: true,
      confidence: "ខ្ពស់",
      summary: "រកឃើញជំងឺ",
      reasons: ["សំណើម"],
      precautions: ["ពិនិត្យទឹក"],
      fixes: ["ព្យាបាលសមស្រប"],
      reportMarkdown: "# របាយការណ៍ MayuraAI",
      images: [
        {
          url: "https://bucket.example/mayura-ai/leaf-1.jpg",
          key: "mayura-ai/leaf-1.jpg",
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const service = new ReportingService();
    const result = await service.getMayuraAiHistory({
      userId: "user-a",
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].coinsCharged).toBe(2);
    expect(result.items[0].images[0].url).toContain("leaf-1.jpg");
    expect(result.items[0].reportMarkdown).toContain("MayuraAI");
    expect(result.pagination.total).toBe(1);
  });
});
