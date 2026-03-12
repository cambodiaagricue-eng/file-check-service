import type { Request, Response } from "express";
import { PoolOrderService } from "../services/poolOrder.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

const poolOrderService = new PoolOrderService();

function userId(req: Request): string {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }
  return req.authUser.id;
}

export async function createPoolOrderController(req: Request, res: Response) {
  const poolOrder = await poolOrderService.createPoolOrder(userId(req), {
    title: String(req.body?.title || "").trim(),
    description: String(req.body?.description || "").trim(),
    coinsPerUnit: Number(req.body?.coinsPerUnit || 0),
    minParticipants: Number(req.body?.minParticipants || 1),
    maxParticipants: req.body?.maxParticipants
      ? Number(req.body.maxParticipants)
      : undefined,
  });
  return res.json(new ApiResponse(true, "Pool order created.", poolOrder));
}

export async function joinPoolOrderController(req: Request, res: Response) {
  const joined = await poolOrderService.joinPoolOrder(userId(req), {
    poolOrderId: String(req.body?.poolOrderId || "").trim(),
    units: Number(req.body?.units || 1),
    deliveryAddress: String(req.body?.deliveryAddress || "").trim(),
  });
  return res.json(new ApiResponse(true, "Joined pool order.", joined));
}

export async function adminPoolOrdersViewController(_req: Request, res: Response) {
  const rows = await poolOrderService.adminViewPoolOrdersWithAddresses();
  return res.json(new ApiResponse(true, "Pool order joins fetched.", rows));
}
