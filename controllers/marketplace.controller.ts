import type { Request, Response } from "express";
import { MarketplaceService } from "../services/marketplace.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

const marketplaceService = new MarketplaceService();

function userId(req: Request): string {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }
  return req.authUser.id;
}

export async function createListingController(req: Request, res: Response) {
  const images = Array.isArray(req.files) ? req.files : [];
  const listing = await marketplaceService.createListing(userId(req), {
    title: String(req.body?.title || "").trim(),
    description: String(req.body?.description || "").trim(),
    basePriceUsd: Number(req.body?.basePriceUsd || 0),
    quantity: Number(req.body?.quantity || 1),
    images,
  });
  return res.json(new ApiResponse(true, "Listing created.", listing));
}

export async function listListingsController(req: Request, res: Response) {
  const sellerId = typeof req.query?.sellerId === "string" ? req.query.sellerId.trim() : undefined;
  const mine = String(req.query?.mine || "").trim().toLowerCase() === "true";

  const data = await marketplaceService.listListings({
    viewerId: userId(req),
    sellerId: mine ? userId(req) : sellerId,
  });

  return res.json(new ApiResponse(true, "Marketplace listings fetched.", data));
}

export async function placeBidController(req: Request, res: Response) {
  const result = await marketplaceService.placeBid(userId(req), {
    listingId: String(req.body?.listingId || "").trim(),
    amountUsd: Number(req.body?.amountUsd || 0),
  });
  return res.json(new ApiResponse(true, "Bid placed.", result));
}

export async function sellerBidsController(req: Request, res: Response) {
  const data = await marketplaceService.listSellerBids(userId(req));
  return res.json(new ApiResponse(true, "Seller bids fetched.", data));
}
