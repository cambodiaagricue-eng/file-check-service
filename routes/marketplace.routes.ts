import { Router } from "express";
import {
  createListingController,
  placeBidController,
  sellerBidsController,
} from "../controllers/marketplace.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { requireOnboardingCompleted } from "../middleware/onboarding.middleware";
import { requireRole } from "../middleware/role.middleware";
import { withAudit } from "../middleware/auditLog.middleware";
import { uploadListingImages } from "../middleware/marketplaceUpload.middleware";

const marketplaceRouter = Router();
marketplaceRouter.use(requireAuth, requireOnboardingCompleted);

marketplaceRouter.post(
  "/listings",
  requireRole("seller", "admin", "superadmin"),
  uploadListingImages,
  withAudit("marketplace_create_listing", createListingController),
);

marketplaceRouter.post(
  "/bids",
  requireRole("buyer", "farmer", "admin", "superadmin"),
  withAudit("marketplace_place_bid", placeBidController),
);

marketplaceRouter.get(
  "/seller/bids",
  requireRole("seller", "admin", "superadmin"),
  withAudit("marketplace_seller_bids", sellerBidsController),
);

export default marketplaceRouter;
