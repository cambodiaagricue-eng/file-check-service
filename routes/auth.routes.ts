import { Router } from "express";
import {
  confirmResetPasswordController,
  confirmVerifyController,
  loginController,
  logoutController,
  meController,
  refreshTokenController,
  requestResetPasswordController,
  requestVerifyController,
  setMarketplaceModeController,
  signupController,
  whitelistedPhoneCountriesController,
} from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { withAudit } from "../middleware/auditLog.middleware";

const authRouter = Router();

authRouter.post(
  "/signup",
  withAudit("auth_signup", signupController),
);

authRouter.post(
  "/verify-account/request",
  withAudit("auth_verify_request", requestVerifyController),
);

authRouter.post(
  "/verify-account/confirm",
  withAudit("auth_verify_confirm", confirmVerifyController),
);

authRouter.post(
  "/login",
  withAudit("auth_login", loginController),
);

authRouter.post(
  "/refresh-token",
  withAudit("auth_refresh_token", refreshTokenController),
);

authRouter.post(
  "/reset-password/request",
  withAudit("auth_reset_password_request", requestResetPasswordController),
);

authRouter.post(
  "/reset-password/confirm",
  withAudit("auth_reset_password_confirm", confirmResetPasswordController),
);

authRouter.get(
  "/phone-country-codes",
  withAudit("auth_phone_country_codes", whitelistedPhoneCountriesController),
);

authRouter.get(
  "/me",
  requireAuth,
  withAudit("auth_me", meController),
);

authRouter.post(
  "/marketplace-mode",
  requireAuth,
  withAudit("auth_set_marketplace_mode", setMarketplaceModeController),
);

authRouter.post(
  "/logout",
  withAudit("auth_logout", logoutController),
);

export default authRouter;
