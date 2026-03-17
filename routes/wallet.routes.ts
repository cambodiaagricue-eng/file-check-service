import { Router } from "express";
import {
  getActiveCoinPurchaseController,
  buyCoinsController,
  cancelCoinPurchaseController,
  confirmCoinPurchaseController,
  getCoinPurchaseStatusController,
  getWalletController,
  getWalletTransactionsController,
  mayurGptChatController,
  mayurGptController,
  mayurGptVoiceController,
  mayurGptVoiceTranscriptController,
  soilTestController,
} from "../controllers/wallet.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireOnboardingCompleted } from "../middleware/onboarding.middleware";
import { withAudit } from "../middleware/auditLog.middleware";
import { mayuraGptUpload } from "../lib/mayuraGptMulter";

const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get(
  "/",
  withAudit("wallet_get", getWalletController),
);

walletRouter.get(
  "/transactions",
  withAudit("wallet_transactions_list", getWalletTransactionsController),
);

// User can add money before onboarding completion.
walletRouter.post(
  "/buy-coins",
  withAudit("wallet_buy_coins", buyCoinsController),
);

walletRouter.get(
  "/buy-coins/active",
  withAudit("wallet_buy_coins_active", getActiveCoinPurchaseController),
);

walletRouter.get(
  "/buy-coins/:orderId",
  withAudit("wallet_buy_coins_status", getCoinPurchaseStatusController),
);

walletRouter.post(
  "/buy-coins/:orderId/confirm",
  withAudit("wallet_buy_coins_confirm", confirmCoinPurchaseController),
);

walletRouter.post(
  "/buy-coins/:orderId/cancel",
  withAudit("wallet_buy_coins_cancel", cancelCoinPurchaseController),
);

walletRouter.post(
  "/soil-test",
  requireOnboardingCompleted,
  withAudit("wallet_soil_test", soilTestController),
);

walletRouter.post(
  "/mayur-gpt",
  requireOnboardingCompleted,
  withAudit("wallet_mayur_gpt", mayurGptController),
);

walletRouter.post(
  "/mayur-gpt/chat",
  requireOnboardingCompleted,
  withAudit("wallet_mayur_gpt_chat", mayurGptChatController),
);

walletRouter.post(
  "/mayur-gpt/voice",
  requireOnboardingCompleted,
  mayuraGptUpload.single("audio"),
  withAudit("wallet_mayur_gpt_voice", mayurGptVoiceController),
);

walletRouter.post(
  "/mayur-gpt/voice-transcript",
  requireOnboardingCompleted,
  mayuraGptUpload.single("audio"),
  withAudit("wallet_mayur_gpt_voice_transcript", mayurGptVoiceTranscriptController),
);

export default walletRouter;
