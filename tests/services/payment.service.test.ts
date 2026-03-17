import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../utils/ApiError";

const mocks = vi.hoisted(() => {
  const pg = {
    generateKhqrPayment: vi.fn(),
    generateDeepLink: vi.fn(),
    checkKhqrStatus: vi.fn(),
  };

  return { pg };
});

vi.mock("../../config/env", () => ({
  env: {
    PPCBANK_ENABLED: "true",
    PPCBANK_PG_BASE_URL: "https://pay.example.com",
    PPCBANK_MERCHANT_NAME: "Merchant",
    PPCBANK_MERCHANT_CODE: "M123",
    PPCBANK_MERCHANT_PASSWORD: "secret",
  },
}));

vi.mock("../../services/ppcbank-pg.service", () => ({
  PpcBankPgService: vi.fn().mockImplementation(function MockPpcBankPgService(this: any) {
    return mocks.pg;
  }),
}));

import { paymentService } from "../../services/payment.service";

describe("paymentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a top-up intent with both payment URL and deep link", async () => {
    mocks.pg.generateKhqrPayment.mockResolvedValue({
      body: { paymentURL: "https://pay.example.com/session" },
    });
    mocks.pg.generateDeepLink.mockResolvedValue({
      body: { deepLinkURL: "ppcbank://pay/session" },
    });

    const result = await paymentService.createTopUpIntent?.({
      userId: "user-1",
      amountUsd: 10,
      currency: "USD",
      metadata: {},
      coins: 10,
      referenceId: "ref-1",
      virtualAccountNo: "",
      billNumber: "BILL123",
      paymentName: "Top-up",
      customerDescription: "desc",
      mobileNumber: "077",
      expiresAt: new Date(),
    });

    expect(result?.status).toBe("pending");
    expect(result?.instructions?.paymentURL).toBe("https://pay.example.com/session");
    expect(result?.instructions?.deepLinkURL).toBe("ppcbank://pay/session");
  });

  it("fails when PPCBank returns neither payment URL nor deep link", async () => {
    mocks.pg.generateKhqrPayment.mockResolvedValue({ body: {} });
    mocks.pg.generateDeepLink.mockResolvedValue({ body: {} });

    await expect(
      paymentService.createTopUpIntent?.({
        userId: "user-1",
        amountUsd: 10,
        currency: "USD",
        metadata: {},
        coins: 10,
        referenceId: "ref-1",
        virtualAccountNo: "",
        billNumber: "BILL123",
        paymentName: "Top-up",
        customerDescription: "desc",
        mobileNumber: "077",
        expiresAt: new Date(),
      }),
    ).rejects.toThrow("PPCBank did not return a payment URL or deep link");
  });

  it("treats underpaid successful-looking status as pending", async () => {
    mocks.pg.checkKhqrStatus.mockResolvedValue({
      body: {
        resultYN: "Y",
        billStatusCode: "01",
        transactionAmount: 5,
        referenceNo: "REF-1",
      },
    });

    const result = await paymentService.confirmTopUp?.({
      userId: "user-1",
      amountUsd: 10,
      currency: "USD",
      metadata: {},
      coins: 10,
      referenceId: "ref-1",
      virtualAccountNo: "",
      billNumber: "BILL123",
      paymentName: "Top-up",
      customerDescription: "desc",
      mobileNumber: "077",
      expiresAt: new Date(),
    });

    expect(result?.status).toBe("pending");
  });

  it("rejects direct charge calls", async () => {
    await expect(
      paymentService.charge({
        userId: "user-1",
        amountUsd: 10,
      }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
