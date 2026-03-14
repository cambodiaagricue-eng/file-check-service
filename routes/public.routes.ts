import { Router } from "express";
import {
  cambodiaFarmerStatsController,
  dailyNewsController,
  marketPricesController,
  memberProfileByQrController,
  recordLandingVisitController,
  weatherController,
} from "../controllers/public.controller";

const publicRouter = Router();

publicRouter.post("/landing/visit", recordLandingVisitController);
publicRouter.get("/news/daily", dailyNewsController);
publicRouter.get("/cambodia/farmer-stats", cambodiaFarmerStatsController);
publicRouter.get("/market/prices", marketPricesController);
publicRouter.get("/weather", weatherController);
publicRouter.get("/member/:memberQrCode", memberProfileByQrController);

export default publicRouter;
