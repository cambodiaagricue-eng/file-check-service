import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { getUserModel } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, `${field} is required.`);
  }
  return value.trim();
}

export async function agentCreateFarmerController(req: Request, res: Response) {
  if (!req.authUser?.id) {
    throw new ApiError(401, "Unauthorized.");
  }
  const username = requireString(req.body?.username, "username").toLowerCase();
  const phone = requireString(req.body?.phone, "phone");
  const password = requireString(req.body?.password, "password");

  const User = getUserModel();
  const exists = await User.findOne({ $or: [{ username }, { phone }] });
  if (exists) {
    throw new ApiError(409, "User already exists.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const farmer = await User.create({
    username,
    phone,
    passwordHash,
    role: "farmer",
    marketplaceMode: "both",
    createdByAgentId: req.authUser.id as any,
    agentCreatedPendingApproval: true,
    isActive: false,
    isVerified: true,
  });
  return res.json(
    new ApiResponse(
      true,
      "Farmer account created by agent. Pending admin approval.",
      farmer,
    ),
  );
}
