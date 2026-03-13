import { Router } from "express";
import {
  cambodiaFarmerStatsController,
  dailyNewsController,
  marketPricesController,
  recordLandingVisitController,
} from "../controllers/public.controller";

const publicRouter = Router();

publicRouter.post("/landing/visit", recordLandingVisitController);
publicRouter.get("/news/daily", dailyNewsController);
publicRouter.get("/cambodia/farmer-stats", cambodiaFarmerStatsController);
publicRouter.get("/market/prices", marketPricesController);

export default publicRouter;
