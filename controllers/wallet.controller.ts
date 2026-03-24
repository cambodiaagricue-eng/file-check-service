import type { Request, Response } from "express";
import { WalletService } from "../services/wallet.service";
import { MayuraGptService } from "../services/mayuraGpt.service";
import { MayuraAiService } from "../services/mayuraAi.service";
import { ReportingService } from "../services/reporting.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import fs from "fs/promises";

const walletService = new WalletService();
const mayuraGptService = new MayuraGptService();
const mayuraAiService = new MayuraAiService();
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
      ? req.query.source as "buy_coins" | "redeem_code" | "soil_test" | "mayur_gpt" | "mayura_ai" | "pool_order" | "peer_transfer" | "manual"
      : undefined,
  });
  return res.json(new ApiResponse(true, "Wallet transactions fetched.", result));
}

export async function getMayuraAiHistoryController(req: Request, res: Response) {
  const result = await reportingService.getMayuraAiHistory({
    userId: userId(req),
    page: Number(req.query?.page || 1),
    limit: Number(req.query?.limit || 20),
  });

  return res.json(new ApiResponse(true, "Mayura AI history fetched.", result));
}

export async function buyCoinsController(req: Request, res: Response) {
  const amountUsd = Number(req.body?.amountUsd || 10);
  const result = await walletService.buyCoins(userId(req), amountUsd);
  const message = result.payment?.status === "pending"
    ? "Coin purchase initiated. Complete the PPCBank payment and then confirm it to receive coins."
    : "Coins purchased successfully.";
  return res.json(new ApiResponse(true, message, result));
}

export async function redeemCodeController(req: Request, res: Response) {
  const code = String(req.body?.code || "").trim();
  if (!code) {
    throw new ApiError(400, "code is required.");
  }

  const result = await walletService.redeemCode(userId(req), code);
  return res.json(new ApiResponse(true, "Redeem code applied successfully.", result));
}

export async function getActiveCoinPurchaseController(req: Request, res: Response) {
  const result = await walletService.getActiveCoinPurchase(userId(req));
  return res.json(new ApiResponse(true, "Active coin purchase fetched.", result));
}

export async function getTransferRecipientController(req: Request, res: Response) {
  const memberQrCode = String(req.params?.memberQrCode || "").trim();
  if (!memberQrCode) {
    throw new ApiError(400, "memberQrCode is required.");
  }

  const result = await walletService.getTransferRecipientPreview(memberQrCode, userId(req));
  return res.json(new ApiResponse(true, "Transfer recipient fetched.", result));
}

export async function transferCoinsController(req: Request, res: Response) {
  const memberQrCode = String(req.body?.memberQrCode || "").trim();
  const coins = Number(req.body?.coins || 0);
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  if (!memberQrCode) {
    throw new ApiError(400, "memberQrCode is required.");
  }

  const result = await walletService.transferCoins(userId(req), memberQrCode, coins, note);
  return res.json(new ApiResponse(true, "Coins transferred successfully.", result));
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

export async function mayuraAiDiagnoseController(req: Request, res: Response) {
  const currentUserId = userId(req);
  const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
  const language = req.body?.language === "en" ? "en" : "kh";
  if (!files.length) {
    throw new ApiError(400, "At least one plant image is required.");
  }

  try {
    const diagnosis = await mayuraAiService.analyzePlantDisease(
      files.map((file) => ({
        path: file.path,
        mimeType: file.mimetype,
        originalName: file.originalname,
        size: file.size,
      })),
      language,
    );

    const result = await walletService.createMayuraAiDiagnosis(currentUserId, {
      diagnosis,
      images: files.map((file) => ({
        path: file.path,
        mimeType: file.mimetype,
        originalName: file.originalname,
        size: file.size,
      })),
    });

    return res.json(
      new ApiResponse(true, "Mayura AI report generated.", {
        diagnosis: result.diagnosis,
        wallet: result.wallet,
      }),
    );
  } catch (error) {
    await Promise.all(
      files.map(async (file) => {
        try {
          await fs.unlink(file.path);
        } catch {
          // Best-effort local cleanup.
        }
      }),
    );
    throw error;
  }
}
