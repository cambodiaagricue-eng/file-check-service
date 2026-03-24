import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type RecordValue = Record<string, any>;

  let nextId = 1;
  const wallets: RecordValue[] = [];
  const orders: RecordValue[] = [];
  const transactions: RecordValue[] = [];
  const diagnoses: RecordValue[] = [];
  const deleteManyFromS3 = vi.fn(async () => undefined);
  const uploadToS3WithMetadata = vi.fn(async (filepath: string) => ({
    url: `https://bucket.example/${filepath.split("\\").pop()}`,
    key: `mayura-ai/${filepath.split("\\").pop()}`,
  }));

  const makeId = () => `mock-id-${nextId++}`;

  const getPath = (obj: RecordValue, path: string) =>
    path.split(".").reduce((acc: any, key) => acc?.[key], obj);

  const setPath = (obj: RecordValue, path: string, value: unknown) => {
    const parts = path.split(".");
    let current: any = obj;
    for (let i = 0; i < parts.length - 1; i += 1) {
      current[parts[i]] ??= {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  };

  const matches = (doc: RecordValue, query: RecordValue) =>
    Object.entries(query).every(([key, value]) => {
      const current = getPath(doc, key);
      if (value && typeof value === "object" && "$in" in value) {
        return value.$in.includes(current);
      }
      if (value && typeof value === "object" && "$lt" in value) {
        return current != null && new Date(current).getTime() < new Date(value.$lt).getTime();
      }
      return String(current) === String(value);
    });

  const sortDescByCreatedAt = <T extends RecordValue>(items: T[]) =>
    [...items].sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );

  const attachSave = <T extends RecordValue>(doc: T) => {
    doc.save = vi.fn(async () => doc);
    return doc;
  };

  const WalletModel = {
    findOne: vi.fn((query: RecordValue) => {
      const result = wallets.find((item) => matches(item, query)) || null;
      return {
        session: vi.fn(async () => result),
        then: (resolve: any) => resolve(result),
      } as any;
    }),
    create: vi.fn(async (input: any, options?: any) => {
      const createOne = (payload: RecordValue) =>
        attachSave({
          _id: makeId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
        });

      if (Array.isArray(input)) {
        const docs = input.map(createOne);
        wallets.push(...docs);
        return docs;
      }
      const doc = createOne(input);
      wallets.push(doc);
      return doc;
    }),
  };

  const PaymentOrderModel = {
    findOne: vi.fn((query: RecordValue) => {
      let items = orders.filter((item) => matches(item, query));
      return {
        sort: vi.fn(async () => sortDescByCreatedAt(items)[0] || null),
        then: (resolve: any) => resolve(items[0] || null),
      } as any;
    }),
    create: vi.fn(async (payload: RecordValue) => {
      const doc = attachSave({
        _id: makeId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...payload,
      });
      orders.push(doc);
      return doc;
    }),
    findOneAndUpdate: vi.fn(async (query: RecordValue, update: RecordValue) => {
      const doc = orders.find((item) => matches(item, query));
      if (!doc) {
        return null;
      }
      if (update.$set) {
        for (const [key, value] of Object.entries(update.$set)) {
          setPath(doc, key, value);
        }
      }
      doc.updatedAt = new Date();
      return doc;
    }),
    updateMany: vi.fn(async (query: RecordValue, update: RecordValue) => {
      const matched = orders.filter((item) => matches(item, query));
      for (const doc of matched) {
        if (update.$set) {
          for (const [key, value] of Object.entries(update.$set)) {
            setPath(doc, key, value);
          }
        }
        doc.updatedAt = new Date();
      }
      return {
        matchedCount: matched.length,
        modifiedCount: matched.length,
      };
    }),
  };

  const WalletTransactionModel = {
    findOne: vi.fn((query: RecordValue) => {
      const result = transactions.find((item) => matches(item, query)) || null;
      return {
        session: vi.fn(async () => result),
        then: (resolve: any) => resolve(result),
      } as any;
    }),
    create: vi.fn(async (input: any) => {
      const createOne = (payload: RecordValue) =>
        attachSave({
          _id: makeId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
        });

      if (Array.isArray(input)) {
        const docs = input.map(createOne);
        transactions.push(...docs);
        return docs;
      }
      const doc = createOne(input);
      transactions.push(doc);
      return doc;
    }),
  };

  const MayuraAiDiagnosisModel = {
    find: vi.fn((query: RecordValue) => {
      let items = diagnoses.filter((item) => matches(item, query));
      return {
        sort: vi.fn(() => ({
          skip: vi.fn(() => ({
            limit: vi.fn(async () => sortDescByCreatedAt(items)),
          })),
        })),
      } as any;
    }),
    countDocuments: vi.fn(async (query: RecordValue) => diagnoses.filter((item) => matches(item, query)).length),
    create: vi.fn(async (input: any) => {
      const createOne = (payload: RecordValue) =>
        attachSave({
          _id: makeId(),
          createdAt: new Date(),
          updatedAt: new Date(),
          ...payload,
        });

      if (Array.isArray(input)) {
        const docs = input.map(createOne);
        diagnoses.push(...docs);
        return docs;
      }
      const doc = createOne(input);
      diagnoses.push(doc);
      return doc;
    }),
  };

  const paymentService = {
    getProvider: vi.fn(() => "ppcbank_pg" as const),
    charge: vi.fn(),
    createTopUpIntent: vi.fn(),
    confirmTopUp: vi.fn(),
  };

  const session = {
    withTransaction: vi.fn(async (callback: () => Promise<void>) => {
      await callback();
    }),
    endSession: vi.fn(async () => undefined),
  };

  const reset = () => {
    wallets.length = 0;
    orders.length = 0;
    transactions.length = 0;
    diagnoses.length = 0;
    nextId = 1;
    vi.clearAllMocks();
  };

  return {
    wallets,
    orders,
    transactions,
    diagnoses,
    attachSave,
    WalletModel,
    PaymentOrderModel,
    WalletTransactionModel,
    MayuraAiDiagnosisModel,
    paymentService,
    session,
    deleteManyFromS3,
    uploadToS3WithMetadata,
    reset,
  };
});

vi.mock("../../models/wallet.model", () => ({
  getWalletModel: () => mocks.WalletModel,
}));

vi.mock("../../models/paymentOrder.model", () => ({
  getPaymentOrderModel: () => mocks.PaymentOrderModel,
}));

vi.mock("../../models/walletTransaction.model", () => ({
  getWalletTransactionModel: () => mocks.WalletTransactionModel,
}));

vi.mock("../../models/mayuraAiDiagnosis.model", () => ({
  getMayuraAiDiagnosisModel: () => mocks.MayuraAiDiagnosisModel,
}));

vi.mock("../../models/user.model", () => ({
  getUserModel: () => ({
    findById: vi.fn(async () => null),
  }),
}));

vi.mock("../../services/payment.service", () => ({
  paymentService: mocks.paymentService,
}));

vi.mock("../../db/maindb", () => ({
  getMainDbConnection: () => ({
    startSession: vi.fn(async () => mocks.session),
  }),
}));

vi.mock("../../utils/uploadToS3", () => ({
  uploadToS3WithMetadata: mocks.uploadToS3WithMetadata,
  deleteManyFromS3: mocks.deleteManyFromS3,
}));

vi.mock("fs/promises", () => ({
  default: {
    unlink: vi.fn(async () => undefined),
  },
}));

import { WalletService } from "../../services/wallet.service";

describe("WalletService payment flow", () => {
  beforeEach(() => {
    mocks.reset();
  });

  it("creates independent pending orders for different users", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });

    const first = await service.buyCoins("user-a", 10);
    mocks.paymentService.createTopUpIntent.mockResolvedValueOnce({
      success: true,
      status: "pending",
      paymentId: "bill-002",
      provider: "ppcbank_pg",
      amountUsd: 15,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/2",
      },
    });
    const second = await service.buyCoins("user-b", 15);

    expect(first.order._id).not.toBe(second.order._id);
    expect(first.order.billNumber).not.toBe(second.order.billNumber);
    expect(mocks.orders).toHaveLength(2);
  });

  it("blocks a second active top-up for the same user", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });

    await service.buyCoins("user-a", 10);

    await expect(service.buyCoins("user-a", 20)).rejects.toThrow(
      "You already have a pending coin purchase.",
    );
  });

  it("auto-expires stale pending orders before creating a new top-up", async () => {
    const service = new WalletService();
    mocks.orders.push(mocks.attachSave({
      _id: "old-order",
      userId: "user-a",
      type: "coin_topup",
      provider: "ppcbank_pg",
      status: "pending",
      amountUsd: 10,
      coins: 10,
      currency: "USD",
      expiresAt: new Date(Date.now() - 60_000),
      createdAt: new Date(Date.now() - 120_000),
      updatedAt: new Date(Date.now() - 120_000),
    }));
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-002",
      provider: "ppcbank_pg",
      amountUsd: 20,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/2",
      },
    });

    const result = await service.buyCoins("user-a", 20);

    expect(mocks.orders[0].status).toBe("expired");
    expect(result.order._id).not.toBe("old-order");
    expect(mocks.orders).toHaveLength(2);
  });

  it("returns pending on unpaid confirmation and restores the order state", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);

    mocks.paymentService.confirmTopUp.mockResolvedValue({
      success: false,
      status: "pending",
      paymentId: purchase.order.billNumber,
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      raw: {
        status: {
          body: {
            resultYN: "N",
            billStatusCode: "",
          },
        },
      },
    });

    await expect(service.confirmCoinPurchase("user-a", purchase.order._id)).rejects.toThrow(
      "Payment is not completed yet.",
    );
    expect(mocks.orders[0].status).toBe("pending");
  });

  it("marks cancelled payments as failed", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);

    mocks.paymentService.confirmTopUp.mockResolvedValue({
      success: false,
      status: "pending",
      paymentId: purchase.order.billNumber,
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      raw: {
        status: {
          body: {
            resultYN: "N",
            billStatusCode: "04",
          },
        },
      },
    });

    await expect(service.confirmCoinPurchase("user-a", purchase.order._id)).rejects.toThrow(
      "Payment was cancelled in PPCBank.",
    );
    expect(mocks.orders[0].status).toBe("failed");
  });

  it("marks refunded payments as failed", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);

    mocks.paymentService.confirmTopUp.mockResolvedValue({
      success: false,
      status: "pending",
      paymentId: purchase.order.billNumber,
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      raw: {
        status: {
          body: {
            resultYN: "N",
            billStatusCode: "05",
          },
        },
      },
    });

    await expect(service.confirmCoinPurchase("user-a", purchase.order._id)).rejects.toThrow(
      "Payment was refunded in PPCBank.",
    );
    expect(mocks.orders[0].status).toBe("failed");
  });

  it("marks expired orders and rejects confirmation", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);
    mocks.orders[0].expiresAt = new Date(Date.now() - 60_000);

    await expect(service.confirmCoinPurchase("user-a", purchase.order._id)).rejects.toThrow(
      "Payment order has expired.",
    );
    expect(mocks.orders[0].status).toBe("expired");
  });

  it("returns payment status details for the website", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);

    const result = await service.getCoinPurchaseStatus("user-a", purchase.order._id);

    expect(result.order._id).toBe(purchase.order._id);
    expect(result.canCancel).toBe(true);
    expect(result.canRetry).toBe(false);
    expect(result.isTerminal).toBe(false);
  });

  it("returns the latest active coin purchase for the website", async () => {
    const service = new WalletService();
    mocks.orders.push(
      mocks.attachSave({
        _id: "older-order",
        userId: "user-a",
        type: "coin_topup",
        provider: "ppcbank_pg",
        status: "pending",
        amountUsd: 10,
        coins: 10,
        currency: "USD",
        createdAt: new Date(Date.now() - 120_000),
        updatedAt: new Date(Date.now() - 120_000),
      }),
      mocks.attachSave({
        _id: "newer-order",
        userId: "user-a",
        type: "coin_topup",
        provider: "ppcbank_pg",
        status: "pending",
        amountUsd: 20,
        coins: 20,
        currency: "USD",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const result = await service.getActiveCoinPurchase("user-a");

    expect(result.order?._id).toBe("newer-order");
  });

  it("credits wallet exactly once after successful confirmation", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);

    mocks.paymentService.confirmTopUp.mockResolvedValue({
      success: true,
      status: "completed",
      paymentId: "ref-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      raw: {
        status: {
          body: {
            resultYN: "Y",
            billStatusCode: "01",
            referenceNo: "ref-001",
          },
        },
      },
    });

    const firstConfirm = await service.confirmCoinPurchase("user-a", purchase.order._id);
    const secondConfirm = await service.confirmCoinPurchase("user-a", purchase.order._id);

    expect(firstConfirm.wallet.coins).toBe(10);
    expect(secondConfirm.alreadyCompleted).toBe(true);
    expect(mocks.transactions).toHaveLength(1);
    expect(mocks.transactions[0].paymentOrderId).toBe(purchase.order._id);
  });

  it("allows a new top-up after a prior order failed", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);
    mocks.orders[0].status = "failed";

    mocks.paymentService.createTopUpIntent.mockResolvedValueOnce({
      success: true,
      status: "pending",
      paymentId: "bill-002",
      provider: "ppcbank_pg",
      amountUsd: 20,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/2",
      },
    });
    const second = await service.buyCoins("user-a", 20);

    expect(second.order._id).not.toBe(purchase.order._id);
    expect(mocks.orders).toHaveLength(2);
  });

  it("returns already completed when a completed order is reconfirmed", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);
    mocks.orders[0].status = "completed";

    const result = await service.confirmCoinPurchase("user-a", purchase.order._id);

    expect(result.alreadyCompleted).toBe(true);
    expect(result.order.status).toBe("completed");
  });

  it("prevents duplicate credit when a transaction already exists for the payment order", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);
    mocks.transactions.push({
      _id: "existing-tx",
      paymentOrderId: purchase.order._id,
      userId: "user-a",
      source: "buy_coins",
      balanceAfter: 0,
      coinsDelta: 10,
      usdAmount: 10,
    });

    mocks.paymentService.confirmTopUp.mockResolvedValue({
      success: true,
      status: "completed",
      paymentId: "ref-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      raw: {
        status: {
          body: {
            resultYN: "Y",
            billStatusCode: "01",
            referenceNo: "ref-001",
          },
        },
      },
    });

    const result = await service.confirmCoinPurchase("user-a", purchase.order._id);

    expect(result.wallet.coins).toBe(0);
    expect(mocks.transactions).toHaveLength(1);
  });

  it("cancels a pending order so the user can retry", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);

    const result = await service.cancelCoinPurchase("user-a", purchase.order._id);

    expect(result.alreadyClosed).toBe(false);
    expect(result.order.status).toBe("expired");
    expect(result.order.failureReason).toContain("cancelled");
  });

  it("rejects cancelling a completed order", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);
    mocks.orders[0].status = "completed";

    await expect(service.cancelCoinPurchase("user-a", purchase.order._id)).rejects.toThrow(
      "Completed payments cannot be cancelled.",
    );
  });

  it("rejects concurrent confirmation when the order is already processing", async () => {
    const service = new WalletService();
    mocks.paymentService.createTopUpIntent.mockResolvedValue({
      success: true,
      status: "pending",
      paymentId: "bill-001",
      provider: "ppcbank_pg",
      amountUsd: 10,
      currency: "USD",
      instructions: {
        paymentURL: "https://pay.example/1",
      },
    });
    const purchase = await service.buyCoins("user-a", 10);
    mocks.orders[0].status = "processing";

    await expect(service.confirmCoinPurchase("user-a", purchase.order._id)).rejects.toThrow(
      "already being confirmed",
    );
  });

  it("stores Mayura AI diagnosis and charges exactly 2 coins in one transaction", async () => {
    const service = new WalletService();
    mocks.wallets.push(mocks.attachSave({
      _id: "wallet-1",
      userId: "user-a",
      coins: 5,
      usdBalance: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.createMayuraAiDiagnosis("user-a", {
      diagnosis: {
        plantName: "ស្រូវ",
        diseaseName: "ជំងឺស្លឹក",
        isDiseaseDetected: true,
        confidence: "ខ្ពស់",
        summary: "រកឃើញជំងឺលើស្លឹកស្រូវ។",
        reasons: ["សំណើមខ្ពស់"],
        precautions: ["កុំឲ្យទឹកជាប់យូរ"],
        fixes: ["ប្រើវិធីគ្រប់គ្រងសមស្រប"],
        reportMarkdown: "# របាយការណ៍ MayuraAI",
      },
      images: [
        {
          path: "C:\\tmp\\leaf-1.jpg",
          mimeType: "image/jpeg",
          originalName: "leaf-1.jpg",
          size: 1234,
        },
      ],
    });

    expect(result.wallet.coins).toBe(3);
    expect(mocks.transactions).toHaveLength(1);
    expect(mocks.transactions[0].source).toBe("mayura_ai");
    expect(mocks.transactions[0].coinsDelta).toBe(-2);
    expect(mocks.diagnoses).toHaveLength(1);
    expect(mocks.diagnoses[0].walletTransactionId).toBe(mocks.transactions[0]._id);
    expect(mocks.diagnoses[0].images[0].url).toContain("leaf-1.jpg");
  });

  it("fails Mayura AI diagnosis before charging when coins are insufficient", async () => {
    const service = new WalletService();
    mocks.wallets.push(mocks.attachSave({
      _id: "wallet-1",
      userId: "user-a",
      coins: 1,
      usdBalance: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await expect(service.createMayuraAiDiagnosis("user-a", {
      diagnosis: {
        plantName: "ស្រូវ",
        diseaseName: "",
        isDiseaseDetected: false,
        confidence: "ទាប",
        summary: "មិនច្បាស់",
        reasons: [],
        precautions: [],
        fixes: [],
        reportMarkdown: "# របាយការណ៍ MayuraAI",
      },
      images: [
        {
          path: "C:\\tmp\\leaf-1.jpg",
          mimeType: "image/jpeg",
          originalName: "leaf-1.jpg",
          size: 1234,
        },
      ],
    })).rejects.toThrow("Insufficient coins.");

    expect(mocks.transactions).toHaveLength(0);
    expect(mocks.diagnoses).toHaveLength(0);
  });

  it("falls back to non-transactional Mayura AI diagnosis when Mongo transactions are unavailable", async () => {
    const service = new WalletService();
    mocks.wallets.push(mocks.attachSave({
      _id: "wallet-1",
      userId: "user-a",
      coins: 5,
      usdBalance: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mocks.session.withTransaction.mockRejectedValueOnce(
      new Error("Transaction numbers are only allowed on a replica set member or mongos"),
    );

    const result = await service.createMayuraAiDiagnosis("user-a", {
      diagnosis: {
        plantName: "ស្រូវ",
        diseaseName: "ជំងឺស្លឹក",
        isDiseaseDetected: true,
        confidence: "ខ្ពស់",
        summary: "រកឃើញជំងឺលើស្លឹកស្រូវ។",
        reasons: ["សំណើមខ្ពស់"],
        precautions: ["កុំឲ្យទឹកជាប់យូរ"],
        fixes: ["ប្រើវិធីគ្រប់គ្រងសមស្រប"],
        reportMarkdown: "# របាយការណ៍ MayuraAI",
      },
      images: [
        {
          path: "C:\\tmp\\leaf-1.jpg",
          mimeType: "image/jpeg",
          originalName: "leaf-1.jpg",
          size: 1234,
        },
      ],
    });

    expect(result.wallet.coins).toBe(3);
    expect(mocks.transactions).toHaveLength(1);
    expect(mocks.diagnoses).toHaveLength(1);
    expect(mocks.deleteManyFromS3).not.toHaveBeenCalled();
  });

  it("cleans up uploaded S3 images when Mayura AI persistence fails", async () => {
    const service = new WalletService();
    mocks.wallets.push(mocks.attachSave({
      _id: "wallet-1",
      userId: "user-a",
      coins: 5,
      usdBalance: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mocks.MayuraAiDiagnosisModel.create.mockRejectedValueOnce(new Error("diagnosis write failed"));

    await expect(service.createMayuraAiDiagnosis("user-a", {
      diagnosis: {
        plantName: "ស្រូវ",
        diseaseName: "ជំងឺស្លឹក",
        isDiseaseDetected: true,
        confidence: "ខ្ពស់",
        summary: "រកឃើញជំងឺលើស្លឹកស្រូវ។",
        reasons: ["សំណើមខ្ពស់"],
        precautions: ["កុំឲ្យទឹកជាប់យូរ"],
        fixes: ["ប្រើវិធីគ្រប់គ្រងសមស្រប"],
        reportMarkdown: "# របាយការណ៍ MayuraAI",
      },
      images: [
        {
          path: "C:\\tmp\\leaf-1.jpg",
          mimeType: "image/jpeg",
          originalName: "leaf-1.jpg",
          size: 1234,
        },
      ],
    })).rejects.toThrow("diagnosis write failed");

    expect(mocks.deleteManyFromS3).toHaveBeenCalledWith(["mayura-ai/leaf-1.jpg"]);
  });
});
