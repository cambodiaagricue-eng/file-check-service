import { Router } from "express";
import {
  buyCoinsController,
  getWalletController,
  mayurGptController,
  soilTestController,
} from "../controllers/wallet.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireOnboardingCompleted } from "../middleware/onboarding.middleware";
import { withAudit } from "../middleware/auditLog.middleware";

const walletRouter = Router();
walletRouter.use(requireAuth);

walletRouter.get(
  "/",
  withAudit("wallet_get", getWalletController),
);

// User can add money before onboarding completion.
walletRouter.post(
  "/buy-coins",
  withAudit("wallet_buy_coins", buyCoinsController),
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

export default walletRouter;
