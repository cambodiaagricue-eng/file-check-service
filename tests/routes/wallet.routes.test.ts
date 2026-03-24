import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/createTestApp";

vi.mock("../../controllers/wallet.controller", () => ({
  getWalletController: (_: any, res: any) => res.json({ ok: "wallet" }),
  getWalletTransactionsController: (_: any, res: any) => res.json({ ok: "wallet-transactions" }),
  getTransferRecipientController: (_: any, res: any) => res.json({ ok: "transfer-recipient" }),
  transferCoinsController: (_: any, res: any) => res.json({ ok: "transfer" }),
  buyCoinsController: (_: any, res: any) => res.json({ ok: "buy" }),
  redeemCodeController: (_: any, res: any) => res.json({ ok: "redeem-code" }),
  getActiveCoinPurchaseController: (_: any, res: any) => res.json({ ok: "buy-active" }),
  getCoinPurchaseStatusController: (_: any, res: any) => res.json({ ok: "buy-status" }),
  confirmCoinPurchaseController: (_: any, res: any) => res.json({ ok: "buy-confirm" }),
  cancelCoinPurchaseController: (_: any, res: any) => res.json({ ok: "buy-cancel" }),
  soilTestController: (_: any, res: any) => res.json({ ok: "soil" }),
  mayurGptController: (_: any, res: any) => res.json({ ok: "gpt" }),
  mayurGptChatController: (_: any, res: any) => res.json({ ok: "gpt-chat" }),
  mayurGptVoiceController: (_: any, res: any) => res.json({ ok: "gpt-voice" }),
  mayurGptVoiceTranscriptController: (_: any, res: any) => res.json({ ok: "gpt-voice-transcript" }),
  mayuraAiDiagnoseController: (_: any, res: any) => res.json({ ok: "mayura-ai-diagnose" }),
  getMayuraAiHistoryController: (_: any, res: any) => res.json({ ok: "mayura-ai-history" }),
}));
vi.mock("../../middleware/auth.middleware", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/onboarding.middleware", () => ({
  requireOnboardingCompleted: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("../../middleware/auditLog.middleware", () => ({
  withAudit: (_action: string, handler: any) => handler,
}));
vi.mock("../../lib/mayuraGptMulter", () => ({
  mayuraGptUpload: {
    single: () => (_req: any, _res: any, next: any) => next(),
  },
}));
vi.mock("../../lib/mayuraAiMulter", () => ({
  mayuraAiUpload: {
    array: () => (_req: any, _res: any, next: any) => next(),
  },
}));

import walletRouter from "../../routes/wallet.routes";

describe("wallet routes", () => {
  const app = createTestApp(walletRouter);

  it("covers wallet endpoints", async () => {
    const wallet = await request(app).get("/").expect(200);
    expect(wallet.body.ok).toBe("wallet");
    await request(app).get("/transactions").expect(200);
    await request(app).post("/buy-coins").send({}).expect(200);
    await request(app).get("/buy-coins/active").expect(200);
    await request(app).get("/buy-coins/order-123").expect(200);
    await request(app).post("/buy-coins/order-123/confirm").send({}).expect(200);
    await request(app).post("/buy-coins/order-123/cancel").send({}).expect(200);
    await request(app).post("/soil-test").send({}).expect(200);
    await request(app).post("/mayur-gpt").send({}).expect(200);
    await request(app).post("/mayur-gpt/chat").send({}).expect(200);
    await request(app).post("/mayur-gpt/voice").send({}).expect(200);
    await request(app).post("/mayur-gpt/voice-transcript").send({}).expect(200);
    await request(app).post("/mayura-ai/diagnose").send({}).expect(200);
    await request(app).get("/mayura-ai/history").expect(200);
  });
});
