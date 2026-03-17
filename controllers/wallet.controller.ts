import type { Request, Response } from "express";
import { WalletService } from "../services/wallet.service";
import { MayuraGptService } from "../services/mayuraGpt.service";
import { ReportingService } from "../services/reporting.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

const walletService = new WalletService();
const mayuraGptService = new MayuraGptService();
const reportingService = new ReportingService();

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

export async function getWalletTransactionsController(req: Request, res: Response) {
  const result = await reportingService.getUserWalletTransactions({
    userId: userId(req),
    page: Number(req.query?.page || 1),
    limit: Number(req.query?.limit || 20),
    type: typeof req.query?.type === "string"
      ? req.query.type as "credit" | "debit"
      : undefined,
    source: typeof req.query?.source === "string"
      ? req.query.source as "buy_coins" | "soil_test" | "mayur_gpt" | "pool_order" | "manual"
      : undefined,
  });
  return res.json(new ApiResponse(true, "Wallet transactions fetched.", result));
}

export async function buyCoinsController(req: Request, res: Response) {
  const amountUsd = Number(req.body?.amountUsd || 10);
  const result = await walletService.buyCoins(userId(req), amountUsd);
  const message = result.payment?.status === "pending"
    ? "Coin purchase initiated. Complete the PPCBank payment and then confirm it to receive coins."
    : "Coins purchased successfully.";
  return res.json(new ApiResponse(true, message, result));
}

export async function getActiveCoinPurchaseController(req: Request, res: Response) {
  const result = await walletService.getActiveCoinPurchase(userId(req));
  return res.json(new ApiResponse(true, "Active coin purchase fetched.", result));
}

export async function confirmCoinPurchaseController(req: Request, res: Response) {
  const orderId = String(req.params?.orderId || "").trim();
  if (!orderId) {
    throw new ApiError(400, "orderId is required.");
  }

  const result = await walletService.confirmCoinPurchase(userId(req), orderId);
  return res.json(new ApiResponse(true, "Coin purchase confirmed.", result));
}

export async function getCoinPurchaseStatusController(req: Request, res: Response) {
  const orderId = String(req.params?.orderId || "").trim();
  if (!orderId) {
    throw new ApiError(400, "orderId is required.");
  }

  const result = await walletService.getCoinPurchaseStatus(userId(req), orderId);
  return res.json(new ApiResponse(true, "Coin purchase status fetched.", result));
}

export async function cancelCoinPurchaseController(req: Request, res: Response) {
  const orderId = String(req.params?.orderId || "").trim();
  if (!orderId) {
    throw new ApiError(400, "orderId is required.");
  }

  const result = await walletService.cancelCoinPurchase(userId(req), orderId);
  return res.json(new ApiResponse(true, "Coin purchase cancelled.", result));
}

export async function soilTestController(req: Request, res: Response) {
  const wallet = await walletService.chargeSoilTest(userId(req));
  return res.json(new ApiResponse(true, "Soil test charged 10 coins.", wallet));
}

export async function mayurGptController(req: Request, res: Response) {
  const wallet = await walletService.chargeMayurGpt(userId(req));
  return res.json(new ApiResponse(true, "Mayur GPT usage charged.", wallet));
}

export async function mayurGptChatController(req: Request, res: Response) {
  const currentUserId = userId(req);
  const prompt = String(req.body?.prompt || "").trim();
  const shouldCharge = Boolean(req.body?.shouldCharge);
  if (!prompt) {
    throw new ApiError(400, "Prompt is required.");
  }

  await walletService.assertMayurGptAvailable(currentUserId);
  const result = await mayuraGptService.askText(prompt);
  const wallet = shouldCharge
    ? await walletService.chargeMayurGptUsage(currentUserId, {
        mode: "text",
        languageCode: result.languageCode,
      })
    : await walletService.getOrCreateWallet(currentUserId);

  return res.json(
    new ApiResponse(true, "Mayura GPT response generated.", {
      transcript: result.transcript,
      responseText: result.responseText,
      languageCode: result.languageCode,
      charged: shouldCharge,
      wallet,
    }),
  );
}

export async function mayurGptVoiceController(req: Request, res: Response) {
  const currentUserId = userId(req);
  const file = req.file;
  const shouldCharge = String(req.body?.shouldCharge || "").toLowerCase() === "true";
  if (!file?.path || !file.mimetype) {
    throw new ApiError(400, "Voice clip is required.");
  }

  await walletService.assertMayurGptAvailable(currentUserId);
  const result = await mayuraGptService.askVoice(file.path, file.mimetype);
  const wallet = shouldCharge
    ? await walletService.chargeMayurGptUsage(currentUserId, {
        mode: "voice",
        languageCode: result.languageCode,
      })
    : await walletService.getOrCreateWallet(currentUserId);

  return res.json(
    new ApiResponse(true, "Mayura GPT voice response generated.", {
      transcript: result.transcript,
      responseText: result.responseText,
      languageCode: result.languageCode,
      charged: shouldCharge,
      wallet,
    }),
  );
}

export async function mayurGptVoiceTranscriptController(req: Request, res: Response) {
  const file = req.file;
  if (!file?.path || !file.mimetype) {
    throw new ApiError(400, "Voice clip is required.");
  }

  const result = await mayuraGptService.transcribeVoice(file.path, file.mimetype);

  return res.json(
    new ApiResponse(true, "Mayura GPT voice transcript generated.", {
      transcript: result.transcript,
      languageCode: result.languageCode,
    }),
  );
}
