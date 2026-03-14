import type { Request, Response } from "express";
import { WalletService } from "../services/wallet.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

const walletService = new WalletService();

function userId(req: Request): string {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }
  return req.authUser.id;
}

export async function getWalletController(req: Request, res: Response) {
  const wallet = await walletService.getOrCreateWallet(userId(req));
  return res.json(new ApiResponse(true, "Wallet fetched.", wallet));
}

export async function buyCoinsController(req: Request, res: Response) {
  const amountUsd = Number(req.body?.amountUsd || 0);
  const result = await walletService.buyCoins(userId(req), amountUsd);
  return res.json(new ApiResponse(true, "Coins purchased successfully.", result));
}

export async function soilTestController(req: Request, res: Response) {
  const wallet = await walletService.chargeSoilTest(userId(req));
  return res.json(new ApiResponse(true, "Soil test charged 10 coins.", wallet));
}

export async function mayurGptController(req: Request, res: Response) {
  const wallet = await walletService.chargeMayurGpt(userId(req));
  return res.json(new ApiResponse(true, "Mayur GPT usage charged.", wallet));
}
