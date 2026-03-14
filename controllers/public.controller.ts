import type { Request, Response } from "express";
import { ApiResponse } from "../utils/ApiResponse";
import { PublicDataService } from "../services/publicData.service";
import { ApiError } from "../utils/ApiError";

const publicDataService = new PublicDataService();

export async function recordLandingVisitController(req: Request, res: Response) {
  const visitorId =
    typeof req.body?.visitorId === "string" ? req.body.visitorId.trim() : undefined;

  const result = publicDataService.recordLandingVisit(visitorId);
  return res.json(new ApiResponse(true, "Landing visit recorded.", result));
}

export async function marketPricesController(_req: Request, res: Response) {
  const prices = await publicDataService.getMarketPrices();
  return res.json(new ApiResponse(true, "Market prices fetched.", { prices }));
}

export async function dailyNewsController(_req: Request, res: Response) {
  const items = await publicDataService.getDailyNews();
  return res.json(new ApiResponse(true, "Daily news fetched.", { items }));
}

export async function cambodiaFarmerStatsController(_req: Request, res: Response) {
  const stats = publicDataService.getCambodiaFarmerStats();
  return res.json(new ApiResponse(true, "Cambodia farmer stats fetched.", stats));
}

export async function weatherController(req: Request, res: Response) {
  const location =
    typeof req.query?.location === "string" ? req.query.location.trim() : undefined;

  const weather = await publicDataService.getWeather(location);
  return res.json(new ApiResponse(true, "Weather fetched.", weather));
}

export async function memberProfileByQrController(req: Request, res: Response) {
  const memberQrCode =
    typeof req.params?.memberQrCode === "string" ? req.params.memberQrCode.trim() : "";

  if (!memberQrCode) {
    throw new ApiError(400, "memberQrCode is required.");
  }

  const profile = await publicDataService.getMemberProfileByQr(memberQrCode);
  if (!profile) {
    throw new ApiError(404, "Member profile not found.");
  }

  return res.json(new ApiResponse(true, "Member profile fetched.", profile));
}
